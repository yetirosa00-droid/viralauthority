import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createJob, findCachedTranscription, checkRateLimit, runAutoCleanup } from '@/lib/queue';
import { detectPlatform } from '@/lib/platforms';

export const runtime = 'nodejs';

// SSRF Protection Helper
function isSsrfSafe(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    
    // Explicit local/private hostnames
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '[::1]' ||
      hostname === 'localhost.localdomain'
    ) {
      return false;
    }
    
    // Private IPv4 ranges
    const privateIpRegexes = [
      /^10\.\d+\.\d+\.\d+$/,
      /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/,
      /^192\.168\.\d+\.\d+$/,
      /^169\.254\.\d+\.\d+$/
    ];
    
    if (privateIpRegexes.some(regex => regex.test(hostname))) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  // Run temporary file cleanup background task
  try {
    runAutoCleanup();
  } catch {}

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown-ip';

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Formulario inválido o vacío' }, { status: 400 });
    }

    const url = formData.get('url') as string;
    const file = formData.get('file') as File;
    const targetLanguage = (formData.get('targetLanguage') as string) || 'auto';
    const userId = formData.get('userId') as string;

    if (!url && !file) {
      return NextResponse.json({ error: 'Por favor, proporciona un enlace de video o sube un archivo.' }, { status: 400 });
    }

    // Rate Limit Checks
    const rateLimit = checkRateLimit(ip, userId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: rateLimit.reason
        },
        { status: 429 }
      );
    }

    // A. Direct File Upload Path
    if (file) {
      // Validate File extension/format security
      const allowedExtensions = ['.mp4', '.mov', '.mp3', '.wav', '.m4a'];
      const fileExt = path.extname(file.name).toLowerCase();
      if (!allowedExtensions.includes(fileExt)) {
        return NextResponse.json(
          { error: 'Formato no compatible. Sube MP4, MOV, MP3, WAV o M4A.' },
          { status: 400 }
        );
      }

      // Validate File size limits (Free: 50MB, Premium: 500MB)
      const isPremiumUser = !!userId;
      const maxSize = isPremiumUser ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
      if (file.size > maxSize) {
        const sizeLabel = isPremiumUser ? '500MB' : '50MB';
        return NextResponse.json(
          { error: `El archivo excede el límite de tamaño de ${sizeLabel} para usuarios ${isPremiumUser ? 'Premium' : 'Gratis'}.` },
          { status: 400 }
        );
      }

      // Safe storage path selection
      const prodStorage = '/var/www/viralauthoritypro/storage/uploads';
      const storageDir = fs.existsSync('/var/www/viralauthoritypro') 
        ? prodStorage 
        : path.join(process.cwd(), 'storage', 'uploads');

      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }

      // Sanitize file name to prevent directory traversal
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${sanitizedName}`;
      const savedFilePath = path.join(storageDir, uniqueFileName);

      const arrayBuffer = await file.arrayBuffer();
      fs.writeFileSync(savedFilePath, Buffer.from(arrayBuffer));

      // Create queued job
      const newJob = createJob({
        filePath: savedFilePath,
        fileName: file.name,
        ipAddress: ip,
        userId: userId,
        targetLanguage: targetLanguage
      });

      console.log(`[Queue] Queued file upload job ${newJob.id} for processing.`);

      return NextResponse.json({
        success: true,
        jobId: newJob.id,
        status: 'pending'
      });
    }

    // B. URL Link Path
    if (url) {
      // Validate SSRF security
      if (!isSsrfSafe(url)) {
        return NextResponse.json({ error: 'La URL proporcionada no es segura o apunta a un recurso privado.' }, { status: 400 });
      }

      // Validate supported platforms
      const platform = detectPlatform(url);
      if (platform === 'unknown') {
        return NextResponse.json({ error: 'Este enlace todavía no está soportado para transcripción. Verifica la URL.' }, { status: 400 });
      }

      // Dynamic cache lookup
      const cached = findCachedTranscription(url);
      if (cached && cached.resultText) {
        console.log(`[Cache Hit] Serving completed transcription for: ${url}`);
        
        // Fast create pre-completed job in DB
        const newJob = createJob({
          url: url,
          ipAddress: ip,
          userId: userId,
          targetLanguage: targetLanguage
        });
        
        // Update to completed instantly
        const { updateJob } = await import('@/lib/queue');
        updateJob(newJob.id, {
          status: 'completed',
          progress: 100,
          resultText: cached.resultText,
          improvedText: cached.improvedText,
          segments: cached.segments,
          duration: cached.duration
        });

        return NextResponse.json({
          success: true,
          jobId: newJob.id,
          status: 'completed'
        });
      }

      // Create new queued job
      const newJob = createJob({
        url: url,
        ipAddress: ip,
        userId: userId,
        targetLanguage: targetLanguage
      });

      console.log(`[Queue] Queued URL download job ${newJob.id} for processing.`);

      return NextResponse.json({
        success: true,
        jobId: newJob.id,
        status: 'pending'
      });
    }

  } catch (error: any) {
    console.error('Transcription Queue Endpoint Error:', error);
    return NextResponse.json(
      { error: error.message || 'Fallo al agregar el trabajo a la cola.' },
      { status: 500 }
    );
  }
}
