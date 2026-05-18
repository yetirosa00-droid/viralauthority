import { NextResponse } from "next/server";
import { pipeline, env } from "@xenova/transformers";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { WaveFile } from "wavefile";
import OpenAI from "openai";
import { detectPlatform } from "@/lib/platforms";

export const runtime = "nodejs";
export const maxDuration = 360; // 6 minutes

const execFileAsync = promisify(execFile);

// Discover binaries robustly
function discoverBinary(name: string, fallback: string) {
  // Try environment variable first
  if (process.env[`${name.toUpperCase()}_PATH`]) {
    return process.env[`${name.toUpperCase()}_PATH`] as string;
  }
  
  // Try to use 'which' or 'where' to find it in PATH
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    // This is synchronous for discovery at module level if needed, but we'll do it in a helper
  } catch (e) {}

  return fallback;
}

const winYtDlp = "yt-dlp";
const winFfmpeg = "ffmpeg";

env.allowLocalModels = false;
env.useBrowserCache = false;

const COOKIES_PATH = process.env.YTDLP_COOKIES_PATH || process.env.COOKIES_PATH || path.join(process.cwd(), "backend", "cookies.txt");

// In-memory cache to prevent spamming YouTube and backend API
const durationCache = new Map<string, { duration: number, timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

// Basic IP/Rate Limiting track in-memory
const ipRequestLog = new Map<string, number[]>();
const MAX_REQ_PER_WINDOW = 5;
const WINDOW_MS = 60 * 1000; // 1 minute

type Segment = { start: number; end: number; text: string };
type WhisperChunk = { text?: string; timestamp?: [number, number] | number[] };
type WhisperOutput = { text?: string; chunks?: WhisperChunk[] };
type TranscriberWorker = (audio: Float32Array, options: Record<string, unknown>) => Promise<WhisperOutput>;
type OpenAIVerboseTranscription = { text?: string; segments?: Segment[] };

let transcriberWorker: TranscriberWorker | null = null;

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
    : ffmpegPath.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");

  return { ytDlpPath, ffmpegPath, ffprobePath };
}

function getTempDir() {
  const projectTemp = path.join(/*turbopackIgnore: true*/ os.tmpdir(), "viralauthoritypro-transcribe");
  try {
    fs.mkdirSync(projectTemp, { recursive: true });
    return projectTemp;
  } catch {
    return os.tmpdir();
  }
}

function cleanupFiles(paths: string[]) {
  for (const filePath of paths) {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        console.warn("[ViralAuthority PRO PREMIUM AI] Cleanup failed:", filePath, error);
      }
    }
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Fallo critico en el motor de transcripcion.";
}

async function getRemoteDuration(url: string, ytDlpPath: string): Promise<number> {
  const cleanUrl = url.trim();
  const now = Date.now();
  
  // Cache check
  const cached = durationCache.get(cleanUrl);
  if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
    console.log(`[YTDLP CACHE] Hit for duration: ${cleanUrl} -> ${cached.duration}s`);
    return cached.duration;
  }

  const cookiesEnabled = fs.existsSync(COOKIES_PATH);
  const args = [
    cleanUrl,
    "--dump-single-json",
    "--no-playlist",
    "--skip-download",
    "--no-warnings",
    "--extractor-retries", "3",
    "--fragment-retries", "3",
    "--retry-sleep", "3",
    "--socket-timeout", "30",
    "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "--add-header", "Accept-Language: es-ES,es;q=0.9,en;q=0.8",
    "--js-runtimes", "node"
  ];
  
  if (cookiesEnabled) {
    args.push("--cookies", COOKIES_PATH);
  }

  console.log("[YTDLP] URL:", cleanUrl);
  console.log("[YTDLP] yt-dlp path:", ytDlpPath);
  console.log("[YTDLP] cookies enabled:", cookiesEnabled);
  console.log("[YTDLP] cookies path:", COOKIES_PATH);
  console.log("[YTDLP] command args:", args);

  try {
    const { stdout } = await execFileAsync(
      ytDlpPath,
      args,
      { timeout: 45_000, maxBuffer: 1024 * 1024 * 8, windowsHide: true },
    );
  
    const info = JSON.parse(stdout);
    const duration = typeof info.duration === "number" ? info.duration : 0;
    
    // Store in cache
    durationCache.set(cleanUrl, { duration, timestamp: now });
    return duration;
  } catch (error: any) {
    console.error("[YTDLP ERROR] code:", error.code);
    console.error("[YTDLP ERROR] stderr:", error.stderr || error.message);
    
    const stderr = error.stderr || error.message || "";
    if (
      stderr.includes("Sign in to confirm you’re not a bot") ||
      stderr.includes("HTTP Error 429") ||
      stderr.includes("Too Many Requests") ||
      stderr.includes("The request is blocked") ||
      stderr.includes("unable to download webpage") ||
      stderr.includes("temporarily blocked")
    ) {
      throw new Error("YOUTUBE_RATE_LIMITED");
    }
    throw error;
  }
}

function formatTranscription(output: WhisperOutput): { text: string, segments: Segment[] } {
  const chunks = output.chunks || [];
  if (chunks.length === 0) return { text: output.text || "", segments: [] };

  let formatted = "";
  const segments: Segment[] = [];
  let lastEndTime = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let chunkText = (chunk.text || "").trim();
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
      if (!/[.!?]$/.test(formatted.trim())) formatted = formatted.trim() + ".";
      formatted += "\n\n";
    } else if (formatted.length > 0 && !formatted.endsWith("\n\n") && !formatted.endsWith(" ")) {
      formatted += " ";
    }

    const trimmedFormatted = formatted.trim();
    const shouldCapitalize = trimmedFormatted.length === 0 ||
                             trimmedFormatted.endsWith("\n\n") ||
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
  if (formatted && !/[.!?]$/.test(formatted)) formatted += ".";

  return { text: formatted, segments };
}

async function improveTranscript(text: string): Promise<string> {
  const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (geminiKey && text.trim()) {
    try {
      console.log("[ViralAuthority PRO PREMIUM AI] Mejorando transcripción con Gemini...");
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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
      console.error("[ViralAuthority PRO PREMIUM AI] Error en Gemini al mejorar, usando fallback", err);
    }
  }

  // Fallback (Limpieza Básica)
  console.log("[ViralAuthority PRO PREMIUM AI] Aplicando Fallback de limpieza básica...");
  let cleaned = text.trim();
  if (cleaned.length > 0 && !/[.!?]$/.test(cleaned)) {
    cleaned += ".";
  }
  // Remove redundant spaces
  cleaned = cleaned.replace(/\s+/g, ' ');
  // Capitalize first letter of string
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  // Capitalize after periods
  cleaned = cleaned.replace(/([.!?]\s+)([a-z])/g, (match, p1, p2) => p1 + p2.toUpperCase());
  return cleaned;
}

async function downloadAudioWithFallback(
  url: string,
  tempFilePath: string,
  ytDlpPath: string,
  ffmpegPath: string
): Promise<void> {
  const cleanUrl = url.trim();
  const cookiesEnabled = fs.existsSync(COOKIES_PATH);
  
  // Base robust arguments
  const baseArgs = [
    cleanUrl,
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "128K",
    "--postprocessor-args", "-ar 16000 -ac 1",
    "-o", tempFilePath.replace(".mp3", ""),
    "--no-playlist",
    "--no-warnings",
    "--extractor-retries", "3",
    "--fragment-retries", "3",
    "--retry-sleep", "3",
    "--socket-timeout", "30",
    "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "--add-header", "Accept-Language: es-ES,es;q=0.9,en;q=0.8",
    "--js-runtimes", "node"
  ];

  if (ffmpegPath && ffmpegPath !== 'ffmpeg' && ffmpegPath !== 'ffmpeg.exe') {
    baseArgs.push("--ffmpeg-location", ffmpegPath);
  }

  console.log("[YTDLP DOWNLOAD] URL:", cleanUrl);
  console.log("[YTDLP DOWNLOAD] output path:", tempFilePath);
  console.log("[YTDLP DOWNLOAD] cookies enabled:", cookiesEnabled);

  // Attempt 1: Normal download with full formatting
  try {
    const args1 = [...baseArgs, "-f", "bestaudio/best"];
    if (cookiesEnabled) args1.push("--cookies", COOKIES_PATH);
    
    console.log("[YTDLP DOWNLOAD ATTEMPT 1] args:", args1);
    await execFileAsync(ytDlpPath, args1, { 
      timeout: 240_000, 
      maxBuffer: 1024 * 1024 * 8, 
      windowsHide: true 
    });
    return;
  } catch (err1: any) {
    console.warn("[YTDLP DOWNLOAD ATTEMPT 1 FAILED]:", err1.stderr || err1.message);
    const errText = err1.stderr || err1.message || "";
    if (
      errText.includes("Sign in to confirm you’re not a bot") ||
      errText.includes("HTTP Error 429") ||
      errText.includes("Too Many Requests") ||
      errText.includes("The request is blocked") ||
      errText.includes("unable to download webpage") ||
      errText.includes("temporarily blocked")
    ) {
      throw new Error("YOUTUBE_RATE_LIMITED");
    }
  }

  // Attempt 2: Simpler format fallback
  try {
    const args2 = [...baseArgs, "-f", "best"];
    if (cookiesEnabled) args2.push("--cookies", COOKIES_PATH);
    
    console.log("[YTDLP DOWNLOAD ATTEMPT 2 (Fallback)] args:", args2);
    await execFileAsync(ytDlpPath, args2, { 
      timeout: 240_000, 
      maxBuffer: 1024 * 1024 * 8, 
      windowsHide: true 
    });
    return;
  } catch (err2: any) {
    console.error("[YTDLP DOWNLOAD ATTEMPT 2 FAILED]:", err2.stderr || err2.message);
    const errText = err2.stderr || err2.message || "";
    if (
      errText.includes("Sign in to confirm you’re not a bot") ||
      errText.includes("HTTP Error 429") ||
      errText.includes("Too Many Requests") ||
      errText.includes("The request is blocked") ||
      errText.includes("unable to download webpage") ||
      errText.includes("temporarily blocked")
    ) {
      throw new Error("YOUTUBE_RATE_LIMITED");
    }
    throw err2;
  }
}

export async function POST(request: Request) {
  let tempFilePath = "";
  const tempFilesToCleanup: string[] = [];

  // Enforce Basic IP Rate Limiting
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown-ip";
  const now = Date.now();
  const timestamps = ipRequestLog.get(ip) || [];
  const recentTimestamps = timestamps.filter(t => now - t < WINDOW_MS);
  recentTimestamps.push(now);
  ipRequestLog.set(ip, recentTimestamps);

  if (recentTimestamps.length > MAX_REQ_PER_WINDOW) {
    return NextResponse.json(
      {
        success: false,
        error: "RATE_LIMIT_EXCEEDED",
        message: "Has realizado demasiadas solicitudes en poco tiempo. Por favor, espera un minuto antes de intentar de nuevo."
      },
      { status: 429 }
    );
  }

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Formulario invalido o vacio" }, { status: 400 });
    }

    const url = formData.get("url") as string;
    const file = formData.get("file") as File;
    const targetLanguage = (formData.get("targetLanguage") as string) || "auto";
    const userId = formData.get("userId") as string;

    console.log(`[ViralAuthority PRO PREMIUM AI] RECIBIDO - Modo: ${file ? 'Archivo' : 'URL'}, Idioma: ${targetLanguage}, User: ${userId || 'Guest'}`);

    if (!url && !file) {
      return NextResponse.json({ error: "Please provide a Video URL or upload a File" }, { status: 400 });
    }

    const { ytDlpPath, ffmpegPath, ffprobePath } = getBinaryPaths();
    const tempDir = getTempDir();

    // Validate URL if provided
    if (url) {
      const platform = detectPlatform(url);
      if (platform === 'unknown') {
        return NextResponse.json({ error: "Este enlace todavía no está soportado para transcripción. Verifica la URL." }, { status: 400 });
      }
      console.log(`[ViralAuthority PRO PREMIUM AI] Platform Detected: ${platform}`);
    }

    // Extract to MP3 to ensure compatibility with OpenAI's 25MB limit (WAV is too large)
    tempFilePath = path.join(tempDir, `vyt_audio_${Date.now()}.mp3`);
    tempFilesToCleanup.push(tempFilePath);

    if (file) {
      console.log(`[ViralAuthority PRO PREMIUM AI] Processing Upload: ${file.name} (${file.size} bytes)`);

      const inputTempPath = path.join(tempDir, `vyt_input_${Date.now()}_${file.name.replace(/[^a-z0-9.]/gi, '_')}`);
      tempFilesToCleanup.push(inputTempPath);
      const arrayBuffer = await file.arrayBuffer();
      fs.writeFileSync(inputTempPath, Buffer.from(arrayBuffer));

      console.log(`[ViralAuthority PRO PREMIUM AI] Extracting audio...`);
      try {
        // Extract to MP3 128k (Fast and small)
        await execFileAsync(ffmpegPath, [
          "-y",
          "-i", inputTempPath,
          "-vn",
          "-ar", "16000",
          "-ac", "1",
          "-b:a", "128k",
          tempFilePath,
        ], { timeout: 240_000, maxBuffer: 1024 * 1024 * 8, windowsHide: true });

        try {
          const { stdout } = await execFileAsync(ffprobePath, [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            inputTempPath,
          ], { timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true });
          const duration = parseFloat(stdout);
          if (duration > 600 && !userId) {
            throw new Error("El archivo excede el límite de 10 minutos (Premium).");
          }
        } catch (e: unknown) {
          const message = getErrorMessage(e);
          console.warn("[ViralAuthority PRO PREMIUM AI] Duration check failed, continuing...", message);
          if (message.includes("Premium")) throw e;
        }

        cleanupFiles([inputTempPath]);
      } catch (fErr: unknown) {
        cleanupFiles([inputTempPath]);
        throw fErr;
      }
    } else {
      console.log(`[ViralAuthority PRO PREMIUM AI] Download Start: ${url}`);
      try {
        const duration = await getRemoteDuration(url, ytDlpPath);
        if (duration && duration > 600 && !userId) {
           throw new Error("Video exceeds limit. Upgrade to ViralAuthority PRO PREMIUM.");
        }
      } catch (e: unknown) {
        const message = getErrorMessage(e);
        console.warn("[ViralAuthority PRO PREMIUM AI] URL info check failed, continuing...", message);
        if (message.includes("Upgrade") || message.includes("Premium") || message === "YOUTUBE_RATE_LIMITED") throw e;
      }

      await downloadAudioWithFallback(url, tempFilePath, ytDlpPath, ffmpegPath);
    }


    if (!fs.existsSync(tempFilePath)) {
      throw new Error("Error crítico: No se generó el flujo de audio para la IA.");
    }

    let superChargedText = "";
    let segments: Segment[] = [];
    let usingOpenAI = false;

    // 1. Try OpenAI API (Priority)
    const openAIApiKey = process.env.OPENAI_API_KEY;
    if (openAIApiKey) {
      try {
        console.log("[ViralAuthority PRO PREMIUM AI] Using OpenAI Whisper API (High Priority)...");
        const openai = new OpenAI({ apiKey: openAIApiKey });
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tempFilePath),
          model: "whisper-1",
          language: targetLanguage !== "auto" ? getLanguageCode(targetLanguage) : undefined,
          response_format: "verbose_json"
        });

        const verboseTranscription = transcription as OpenAIVerboseTranscription;
        superChargedText = (verboseTranscription.text || "").trim();
        segments = (verboseTranscription.segments || []).map((segment) => ({
          start: segment.start,
          end: segment.end,
          text: segment.text.trim()
        }));

        usingOpenAI = true;
        console.log("[ViralAuthority PRO PREMIUM AI] OpenAI Transcription Completed.");
      } catch (openAiErr) {
        console.error("[ViralAuthority PRO PREMIUM AI] OpenAI failed. Fallback to Local Whisper.", openAiErr);
      }
    }

    // 2. Fallback to Local Whisper if OpenAI is not available or failed
    if (!usingOpenAI) {
      console.log("[ViralAuthority PRO PREMIUM AI] Fallback: Loading Local Whisper-Tiny Model...");

      // Need WAV for local Xenova Whisper. Convert MP3 to WAV.
      const wavPath = tempFilePath.replace('.mp3', '.wav');
      tempFilesToCleanup.push(wavPath);
      await execFileAsync(ffmpegPath, [
        "-y",
        "-i", tempFilePath,
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        wavPath,
      ], { timeout: 180_000, maxBuffer: 1024 * 1024 * 8, windowsHide: true });

      const wavBuffer = fs.readFileSync(wavPath);
      const wav = new WaveFile(wavBuffer);
      wav.toBitDepth('32f');
      wav.toSampleRate(16000);
      const audioData = wav.getSamples(false, Float32Array);

      if (!transcriberWorker) {
        transcriberWorker = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny") as TranscriberWorker;
      }

      console.log("[ViralAuthority PRO PREMIUM AI] Transcribing... (Local Engine)");
      const output = await transcriberWorker(Array.isArray(audioData) ? audioData[0] : audioData, {
        chunk_length_s: 30,
        stride_length_s: 5,
        repetition_penalty: 1.2,
        no_repeat_ngram_size: 4,
        return_timestamps: true,
      });

      const result = formatTranscription(output);
      superChargedText = result.text;
      segments = result.segments;

      cleanupFiles([wavPath]);
    }

    // Final Cleanup
    cleanupFiles(tempFilesToCleanup);
    console.log("[ViralAuthority PRO PREMIUM AI] Request Completed.");

    if (!superChargedText) {
      throw new Error("No se pudo generar la transcripción de este audio.");
    }

    const improvedTranscription = await improveTranscript(superChargedText);

    return NextResponse.json({
      text: superChargedText,
      improved: improvedTranscription,
      segments: segments
    });

  } catch (error: unknown) {
    console.error("Transcription API Fatal Error:", error);
    cleanupFiles(tempFilesToCleanup);

    const message = getErrorMessage(error);
    if (message === "YOUTUBE_RATE_LIMITED") {
      return NextResponse.json(
        {
          success: false,
          error: "YOUTUBE_RATE_LIMITED",
          message: "YouTube bloqueó temporalmente la solicitud. Intenta nuevamente en unos minutos o prueba otro video."
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

function getLanguageCode(lang: string): string {
  const map: Record<string, string> = {
    "English": "en",
    "Spanish": "es",
    "French": "fr",
    "German": "de",
    "Italian": "it",
    "Portuguese": "pt"
  };
  return map[lang] || "en";
}
