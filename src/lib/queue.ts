import fs from 'fs';
import path from 'path';

export interface Job {
  id: string;
  url?: string;
  platform?: string;
  videoId?: string;
  filePath?: string;
  fileName?: string;
  duration?: number;
  status: 'pending' | 'processing' | 'downloading' | 'extracting_audio' | 'transcribing' | 'completed' | 'failed' | 'blocked_by_platform';
  progress: number;
  resultText?: string;
  improvedText?: string;
  segments?: any[];
  errorMessage?: string;
  ipAddress: string;
  userId?: string;
  targetLanguage?: string;
  createdAt: number;
  updatedAt: number;
}

// Dynamically determine storage directories
const getStorageDir = (): string => {
  const prodDir = '/var/www/viralauthoritypro/storage';
  if (fs.existsSync('/var/www/viralauthoritypro')) {
    if (!fs.existsSync(prodDir)) {
      fs.mkdirSync(prodDir, { recursive: true, mode: 0o700 });
      fs.mkdirSync(path.join(prodDir, 'uploads'), { recursive: true, mode: 0o700 });
      fs.mkdirSync(path.join(prodDir, 'results'), { recursive: true, mode: 0o700 });
    }
    return prodDir;
  }
  
  // Local fallback
  const localDir = path.join(process.cwd(), 'storage');
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
    fs.mkdirSync(path.join(localDir, 'uploads'), { recursive: true });
    fs.mkdirSync(path.join(localDir, 'results'), { recursive: true });
  }
  return localDir;
};

const getDbPath = (): string => {
  return path.join(getStorageDir(), 'queue.json');
};

// Safe atomic load/save operations
export const getJobs = (): Job[] => {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    return [];
  }
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data) as Job[];
  } catch (error) {
    console.error("QueueDB Load Error:", error);
    return [];
  }
};

export const saveJobs = (jobs: Job[]): void => {
  const dbPath = getDbPath();
  const tempPath = `${dbPath}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(jobs, null, 2), 'utf8');
    fs.renameSync(tempPath, dbPath);
  } catch (error) {
    console.error("QueueDB Save Error:", error);
  }
};

// Queue and utility methods
export const getJob = (id: string): Job | undefined => {
  const jobs = getJobs();
  return jobs.find(j => j.id === id);
};

export const createJob = (params: {
  url?: string;
  filePath?: string;
  fileName?: string;
  ipAddress: string;
  userId?: string;
  targetLanguage?: string;
}): Job => {
  const jobs = getJobs();
  const newJob: Job = {
    id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    url: params.url,
    filePath: params.filePath,
    fileName: params.fileName,
    status: 'pending',
    progress: 0,
    ipAddress: params.ipAddress,
    userId: params.userId,
    targetLanguage: params.targetLanguage || 'auto',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  if (params.url) {
    // Parse platform and video ID
    const url = params.url.toLowerCase();
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      newJob.platform = 'youtube';
      const regExp = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
      const match = params.url.match(regExp);
      if (match && match[1].length === 11) {
        newJob.videoId = match[1];
      }
    }
  }
  
  jobs.push(newJob);
  saveJobs(jobs);
  return newJob;
};

export const updateJob = (id: string, updates: Partial<Job>): Job => {
  const jobs = getJobs();
  const index = jobs.findIndex(j => j.id === id);
  if (index === -1) {
    throw new Error(`Job ${id} not found`);
  }
  
  const updatedJob = {
    ...jobs[index],
    ...updates,
    updatedAt: Date.now()
  };
  jobs[index] = updatedJob;
  saveJobs(jobs);
  return updatedJob;
};

// Dynamic search in completed transcriptions cache (last 7 days)
export const findCachedTranscription = (urlOrVideoId: string): Partial<Job> | null => {
  const jobs = getJobs();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  
  const cache = jobs.find(j => {
    if (j.status !== 'completed' || j.createdAt < sevenDaysAgo) return false;
    if (j.url && j.url === urlOrVideoId) return true;
    if (j.videoId && j.videoId === urlOrVideoId) return true;
    return false;
  });
  
  if (cache && cache.resultText) {
    return {
      resultText: cache.resultText,
      improvedText: cache.improvedText,
      segments: cache.segments,
      duration: cache.duration
    };
  }
  return null;
};

// Rate Limits (Free/Premium)
export const checkRateLimit = (ipAddress: string, userId?: string): { allowed: boolean; reason?: string } => {
  const jobs = getJobs();
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  
  // Premium checks
  if (userId) {
    const userJobs = jobs.filter(j => j.userId === userId && j.createdAt > oneDayAgo);
    if (userJobs.length >= 100) {
      return { allowed: false, reason: "Has alcanzado el límite diario para cuentas Premium (100 transcripciones al día)." };
    }
    return { allowed: true };
  }
  
  // Free User checks (IP based)
  const ipJobs = jobs.filter(j => j.ipAddress === ipAddress && j.createdAt > oneDayAgo);
  if (ipJobs.length >= 5) {
    return { allowed: false, reason: "Has alcanzado el límite gratuito de 5 transcripciones por día. Por favor inicia sesión o actualiza a Premium para continuar." };
  }
  
  return { allowed: true };
};

// Auto cleanup helper
export const runAutoCleanup = (): void => {
  const storageDir = getStorageDir();
  const uploadsDir = path.join(storageDir, 'uploads');
  const maxAgeMs = 3 * 60 * 60 * 1000; // Keep uploads for at most 3 hours
  
  if (!fs.existsSync(uploadsDir)) return;
  
  try {
    const files = fs.readdirSync(uploadsDir);
    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      const stat = fs.statSync(filePath);
      if (Date.now() - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        console.log(`[Auto Cleanup] Deleted old upload file: ${file}`);
      }
    });
  } catch (error) {
    console.error("[Auto Cleanup] Error:", error);
  }
};
