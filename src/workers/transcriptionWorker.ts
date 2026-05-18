import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline, env } from '@xenova/transformers';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { WaveFile } from 'wavefile';
import { getJobs, saveJobs, updateJob, Job } from '../lib/queue';

const execFileAsync = promisify(execFile);

// Enable Xenova offline/caching properties
env.allowLocalModels = false;
env.useBrowserCache = false;

const COOKIES_PATH = process.env.YTDLP_COOKIES_PATH || process.env.COOKIES_PATH || '/var/www/viralauthoritypro/cookies/youtube.txt';
const winYtDlp = 'yt-dlp';
const winFfmpeg = 'ffmpeg';

type Segment = { start: number; end: number; text: string };
type WhisperChunk = { text?: string; timestamp?: [number, number] | number[] };
type WhisperOutput = { text?: string; chunks?: WhisperChunk[] };
type TranscriberWorker = (audio: Float32Array, options: Record<string, unknown>) => Promise<WhisperOutput>;
type OpenAIVerboseTranscription = { text?: string; segments?: Segment[] };

let transcriberWorker: TranscriberWorker | null = null;

// Discover binaries robustly
function getBinaryPaths() {
  const envYtDlp = process.env.YT_DLP_PATH;
  const envFfmpeg = process.env.FFMPEG_PATH;
  
  const ytDlpPath = (envYtDlp && fs.existsSync(envYtDlp)) 
    ? path.normalize(envYtDlp) 
    : winYtDlp;
    
  const ffmpegPath = (envFfmpeg && fs.existsSync(envFfmpeg)) 
    ? path.normalize(envFfmpeg) 
    : winFfmpeg;

  const ffprobePath = process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)
    ? path.normalize(process.env.FFPROBE_PATH)
    : ffmpegPath.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');

  return { ytDlpPath, ffmpegPath, ffprobePath };
}

function getTempDir() {
  const projectTemp = path.join(os.tmpdir(), 'viralauthoritypro-transcribe');
  if (!fs.existsSync(projectTemp)) {
    fs.mkdirSync(projectTemp, { recursive: true });
  }
  return projectTemp;
}

function cleanupFiles(paths: string[]) {
  paths.forEach(filePath => {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        console.warn(`[Worker Cleanup] Failed to delete: ${filePath}`, error);
      }
    }
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Fallo critico en el motor de transcripcion.';
}

// Highly robust yt-dlp downloader with all anti-bot flags
async function downloadAudioWithFallback(
  url: string,
  tempFilePath: string,
  ytDlpPath: string,
  ffmpegPath: string
): Promise<void> {
  const cleanUrl = url.trim();
  const cookiesEnabled = fs.existsSync(COOKIES_PATH);
  const proxyUrl = process.env.YTDLP_PROXY_URL || process.env.PROXY_URL;
  
  const baseArgs = [
    cleanUrl,
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '128K',
    '--postprocessor-args', '-ar 16000 -ac 1',
    '-o', tempFilePath.replace('.mp3', ''),
    '--no-playlist',
    '--no-warnings',
    '--extractor-retries', '3',
    '--fragment-retries', '3',
    '--retry-sleep', '3',
    '--socket-timeout', '30',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    '--add-header', 'Accept-Language: es-ES,es;q=0.9,en;q=0.8',
    '--js-runtimes', 'node'
  ];

  if (ffmpegPath && ffmpegPath !== 'ffmpeg' && ffmpegPath !== 'ffmpeg.exe') {
    baseArgs.push('--ffmpeg-location', ffmpegPath);
  }

  if (cookiesEnabled) {
    baseArgs.push('--cookies', COOKIES_PATH);
  }

  if (proxyUrl) {
    baseArgs.push('--proxy', proxyUrl);
  }

  // Attempt 1: bestaudio
  try {
    const args1 = [...baseArgs, '-f', 'bestaudio/best'];
    console.log(`[Worker YTDLP] Attempting audio-only download...`);
    await execFileAsync(ytDlpPath, args1, { 
      timeout: 240_000, 
      maxBuffer: 1024 * 1024 * 8, 
      windowsHide: true 
    });
    return;
  } catch (err1: any) {
    const errText = err1.stderr || err1.message || '';
    if (
      errText.includes('Sign in to confirm you’re not a bot') ||
      errText.includes('HTTP Error 429') ||
      errText.includes('Too Many Requests') ||
      errText.includes('The request is blocked') ||
      errText.includes('unable to download webpage') ||
      errText.includes('temporarily blocked')
    ) {
      throw new Error('YOUTUBE_RATE_LIMITED');
    }
  }

  // Attempt 2: fallback format
  try {
    const args2 = [...baseArgs, '-f', 'best'];
    console.log(`[Worker YTDLP Fallback] Attempting best multiplex format download...`);
    await execFileAsync(ytDlpPath, args2, { 
      timeout: 240_000, 
      maxBuffer: 1024 * 1024 * 8, 
      windowsHide: true 
    });
  } catch (err2: any) {
    const errText = err2.stderr || err2.message || '';
    if (
      errText.includes('Sign in to confirm you’re not a bot') ||
      errText.includes('HTTP Error 429') ||
      errText.includes('Too Many Requests') ||
      errText.includes('The request is blocked') ||
      errText.includes('unable to download webpage') ||
      errText.includes('temporarily blocked')
    ) {
      throw new Error('YOUTUBE_RATE_LIMITED');
    }
    throw err2;
  }
}

// Whisper transcript formatting
function formatTranscription(output: WhisperOutput): { text: string, segments: Segment[] } {
  const chunks = output.chunks || [];
  if (chunks.length === 0) return { text: output.text || '', segments: [] };

  let formatted = '';
  const segments: Segment[] = [];
  let lastEndTime = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let chunkText = (chunk.text || '').trim();
    if (!chunkText) continue;

    const startTime = Array.isArray(chunk.timestamp) ? chunk.timestamp[0] : 0;
    const endTime = Array.isArray(chunk.timestamp) ? chunk.timestamp[1] : startTime + 5;

    segments.push({
      start: startTime,
      end: endTime,
      text: chunkText
    });

    const isNewParagraph = formatted.length > 0 && (startTime - lastEndTime > 1.2);

    if (isNewParagraph) {
      if (!/[.!?]$/.test(formatted.trim())) formatted = formatted.trim() + '.';
      formatted += '\n\n';
    } else if (formatted.length > 0 && !formatted.endsWith('\n\n') && !formatted.endsWith(' ')) {
      formatted += ' ';
    }

    const trimmedFormatted = formatted.trim();
    const shouldCapitalize = trimmedFormatted.length === 0 ||
                             trimmedFormatted.endsWith('\n\n') ||
                             /[.!?]$/.test(trimmedFormatted);

    if (shouldCapitalize) {
      chunkText = chunkText.charAt(0).toUpperCase() + chunkText.slice(1);
    } else {
      chunkText = chunkText.charAt(0).toLowerCase() + chunkText.slice(1);
    }

    formatted += chunkText;
    lastEndTime = endTime;
  }

  formatted = formatted.trim();
  if (formatted && !/[.!?]$/.test(formatted)) formatted += '.';

  return { text: formatted, segments };
}

// Gemini transcript storytelling enhancer
async function improveTranscript(text: string): Promise<string> {
  const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (geminiKey && text.trim()) {
    try {
      console.log('[Worker Gemini] Improving transcription storytelling...');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `Convierte este texto transcrito en un guion viral narrativo (storytelling), manteniendo su significado e idea original.

REGLAS ESTRICTAS:
- Usa frases muy cortas.
- Estructura por bloques visuales.
- Agrega pausas dramáticas (...).
- Genera ritmo, tensión y suspenso.
- No resumas la historia, cuenta lo mismo pero con impacto emocional.
- Estilo: TikTok / YouTube Shorts.
- Debe tener lectura fluida ideal para una voz IA narradora.
- Añade un "hook" (gancho) inicial si es necesario.

Texto original:
${text}`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const refined = response.text().trim();
      if (refined) return refined;
    } catch (err) {
      console.error('[Worker Gemini Error] Improvement failed, using fallback', err);
    }
  }

  // Fallback (Limpieza Básica)
  let cleaned = text.trim();
  if (cleaned.length > 0 && !/[.!?]$/.test(cleaned)) {
    cleaned += '.';
  }
  cleaned = cleaned.replace(/\s+/g, ' ');
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  cleaned = cleaned.replace(/([.!?]\s+)([a-z])/g, (match, p1, p2) => p1 + p2.toUpperCase());
  return cleaned;
}

function getLanguageCode(lang: string): string {
  const map: Record<string, string> = {
    'English': 'en',
    'Spanish': 'es',
    'French': 'fr',
    'German': 'de',
    'Italian': 'it',
    'Portuguese': 'pt'
  };
  return map[lang] || 'en';
}

// The core worker loop task processing pipeline
async function processJob(job: Job) {
  const tempFilesToCleanup: string[] = [];
  const { ytDlpPath, ffmpegPath, ffprobePath } = getBinaryPaths();
  const tempDir = getTempDir();
  const audioOutputPath = path.join(tempDir, `vyt_worker_${job.id}_${Date.now()}.mp3`);
  tempFilesToCleanup.push(audioOutputPath);

  try {
    updateJob(job.id, { status: 'processing', progress: 5 });

    if (job.filePath) {
      // File upload pipeline
      console.log(`[Worker Job ${job.id}] Extracting audio from uploaded file: ${job.fileName}`);
      updateJob(job.id, { status: 'extracting_audio', progress: 15 });
      
      await execFileAsync(ffmpegPath, [
        '-y',
        '-i', job.filePath,
        '-vn',
        '-ar', '16000',
        '-ac', '1',
        '-b:a', '128k',
        audioOutputPath,
      ], { timeout: 240_000, maxBuffer: 1024 * 1024 * 8, windowsHide: true });
      
      // Calculate real duration
      try {
        const { stdout } = await execFileAsync(ffprobePath, [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          job.filePath,
        ], { timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true });
        const duration = parseFloat(stdout);
        updateJob(job.id, { duration });
      } catch (e) {
        console.warn(`[Worker ffprobe Warning] Duration fetch failed`, e);
      }
      
    } else if (job.url) {
      // YouTube/URL download pipeline
      console.log(`[Worker Job ${job.id}] Downloading audio from URL: ${job.url}`);
      updateJob(job.id, { status: 'downloading', progress: 20 });
      
      // Fetch duration first
      try {
        const cookiesEnabled = fs.existsSync(COOKIES_PATH);
        const proxyUrl = process.env.YTDLP_PROXY_URL || process.env.PROXY_URL;
        const args = [
          job.url,
          '--dump-single-json',
          '--no-playlist',
          '--skip-download',
          '--no-warnings',
          '--extractor-retries', '3',
          '--fragment-retries', '3',
          '--retry-sleep', '3',
          '--socket-timeout', '30',
          '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          '--add-header', 'Accept-Language: es-ES,es;q=0.9,en;q=0.8',
          '--js-runtimes', 'node'
        ];
        if (cookiesEnabled) args.push('--cookies', COOKIES_PATH);
        if (proxyUrl) args.push('--proxy', proxyUrl);
        
        const { stdout } = await execFileAsync(ytDlpPath, args, { timeout: 45_000, maxBuffer: 1024 * 1024 * 8, windowsHide: true });
        const info = JSON.parse(stdout);
        const duration = typeof info.duration === 'number' ? info.duration : 0;
        updateJob(job.id, { duration });
      } catch (e) {
        console.warn(`[Worker YTDLP Warning] Duration fetch failed`, e);
      }
      
      updateJob(job.id, { progress: 40 });
      await downloadAudioWithFallback(job.url, audioOutputPath, ytDlpPath, ffmpegPath);
      updateJob(job.id, { progress: 60 });
    }

    if (!fs.existsSync(audioOutputPath)) {
      throw new Error('Error crítico: No se pudo extraer el audio del recurso.');
    }

    // Transcription Step
    updateJob(job.id, { status: 'transcribing', progress: 70 });
    
    let resultText = '';
    let segments: Segment[] = [];
    let usingOpenAI = false;

    // 1. OpenAI Whisper API (Priority)
    const openAIApiKey = process.env.OPENAI_API_KEY;
    if (openAIApiKey) {
      try {
        console.log(`[Worker OpenAI] Running Whisper-1 API...`);
        const openai = new OpenAI({ apiKey: openAIApiKey });
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(audioOutputPath),
          model: 'whisper-1',
          language: job.targetLanguage && job.targetLanguage !== 'auto' ? getLanguageCode(job.targetLanguage) : undefined,
          response_format: 'verbose_json'
        });

        const verbose = transcription as OpenAIVerboseTranscription;
        resultText = (verbose.text || '').trim();
        segments = (verbose.segments || []).map(s => ({
          start: s.start,
          end: s.end,
          text: s.text.trim()
        }));
        usingOpenAI = true;
      } catch (e) {
        console.error(`[Worker OpenAI Error] Whisper API failed, falling back to local Whisper-tiny`, e);
      }
    }

    // 2. Fallback to Local Whisper-tiny model
    if (!usingOpenAI) {
      console.log(`[Worker Local Whisper] Loading Whisper-tiny model...`);
      const wavPath = audioOutputPath.replace('.mp3', '.wav');
      tempFilesToCleanup.push(wavPath);
      
      await execFileAsync(ffmpegPath, [
        '-y',
        '-i', audioOutputPath,
        '-ar', '16000',
        '-ac', '1',
        '-c:a', 'pcm_s16le',
        wavPath,
      ], { timeout: 180_000, maxBuffer: 1024 * 1024 * 8, windowsHide: true });
      
      const wavBuffer = fs.readFileSync(wavPath);
      const wav = new WaveFile(wavBuffer);
      wav.toBitDepth('32f');
      wav.toSampleRate(16000);
      const audioData = wav.getSamples(false, Float32Array);

      if (!transcriberWorker) {
        transcriberWorker = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny') as TranscriberWorker;
      }

      console.log(`[Worker Local Whisper] Running inference...`);
      const output = await transcriberWorker(Array.isArray(audioData) ? audioData[0] : audioData, {
        chunk_length_s: 30,
        stride_length_s: 5,
        repetition_penalty: 1.2,
        no_repeat_ngram_size: 4,
        return_timestamps: true,
      });

      const formatted = formatTranscription(output);
      resultText = formatted.text;
      segments = formatted.segments;
    }

    if (!resultText) {
      throw new Error('No se pudo generar la transcripción del audio.');
    }

    // Storytelling refinement
    updateJob(job.id, { progress: 85 });
    const improvedText = await improveTranscript(resultText);

    // Save final success state
    updateJob(job.id, {
      status: 'completed',
      progress: 100,
      resultText,
      improvedText,
      segments
    });
    
    console.log(`[Worker Job Success] Job ${job.id} completed!`);

  } catch (error: any) {
    console.error(`[Worker Job Error] Job ${job.id} failed:`, error);
    const message = getErrorMessage(error);
    
    if (message === 'YOUTUBE_RATE_LIMITED') {
      updateJob(job.id, {
        status: 'blocked_by_platform',
        errorMessage: 'Esta plataforma bloqueó temporalmente el procesamiento de este enlace. Puedes intentar más tarde o subir tu archivo de audio/video directamente para transcribirlo al instante.'
      });
    } else {
      updateJob(job.id, {
        status: 'failed',
        errorMessage: message
      });
    }
  } finally {
    // Delete any generated temp files
    cleanupFiles(tempFilesToCleanup);
    
    // Also cleanup job uploaded source file to preserve VPS disk space
    if (job.filePath && fs.existsSync(job.filePath)) {
      try {
        fs.unlinkSync(job.filePath);
        console.log(`[Worker Cleanup] Cleaned up uploaded source file: ${job.filePath}`);
      } catch (e) {
        console.warn(`[Worker Cleanup Warning] Uploaded source file delete failed`, e);
      }
    }
  }
}

// Continuous worker polling loop
async function runWorker() {
  console.log(`🚀 [ViralAuthority Worker] Transcription Worker Daemon successfully started.`);
  
  while (true) {
    try {
      const jobs = getJobs();
      const pendingJob = jobs.find(j => j.status === 'pending');
      
      if (pendingJob) {
        console.log(`[Worker Queue] Found pending job: ${pendingJob.id}`);
        await processJob(pendingJob);
      }
    } catch (e) {
      console.error(`[Worker Queue Loop Error]`, e);
    }
    
    // Wait 2 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// Start worker
runWorker().catch(err => {
  console.error('[Worker Fatal Failure]', err);
});
