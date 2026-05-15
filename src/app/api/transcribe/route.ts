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

const COOKIES_PATH = process.env.COOKIES_PATH || path.join(process.cwd(), "backend", "cookies.txt");

type Segment = { start: number; end: number; text: string };
type WhisperChunk = { text?: string; timestamp?: [number, number] | number[] };
type WhisperOutput = { text?: string; chunks?: WhisperChunk[] };
type TranscriberWorker = (audio: Float32Array, options: Record<string, unknown>) => Promise<WhisperOutput>;
type OpenAIVerboseTranscription = { text?: string; segments?: Segment[] };

let transcriberWorker: TranscriberWorker | null = null;

function getBinaryPaths() {
  const ytDlpPath = path.normalize(process.env.YT_DLP_PATH || winYtDlp);
  const ffmpegPath = path.normalize(process.env.FFMPEG_PATH || winFfmpeg);
  const ffprobePath = process.env.FFPROBE_PATH
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

async function getRemoteDuration(url: string, ytDlpPath: string) {
  const args = [url, "--dump-single-json", "--no-playlist", "--skip-download", "--no-warnings"];
  
  if (fs.existsSync(COOKIES_PATH)) {
    args.push("--cookies", COOKIES_PATH);
  }

  const { stdout } = await execFileAsync(
    ytDlpPath,
    args,
    { timeout: 45_000, maxBuffer: 1024 * 1024 * 8, windowsHide: true },
  );

  const info = JSON.parse(stdout);
  return typeof info.duration === "number" ? info.duration : 0;
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

export async function POST(request: Request) {
  let tempFilePath = "";
  const tempFilesToCleanup: string[] = [];

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
        if (message.includes("Upgrade") || message.includes("Premium")) throw e;
      }

      try {
        const args = [
          url,
          "-f", "bestaudio/best",
          "-x",
          "--audio-format", "mp3",
          "--audio-quality", "128K",
          "--postprocessor-args", "-ar 16000 -ac 1",
          "--ffmpeg-location", ffmpegPath,
          "-o", tempFilePath.replace(".mp3", ""),
          "--no-playlist",
          "--no-warnings",
        ];

        if (fs.existsSync(COOKIES_PATH)) {
          console.log("[ViralAuthority PRO PREMIUM AI] Using cookies for download...");
          args.push("--cookies", COOKIES_PATH);
        }

        await execFileAsync(ytDlpPath, args, { 
          timeout: 300_000, 
          maxBuffer: 1024 * 1024 * 8, 
          windowsHide: true 
        });
      } catch (e: any) {
        console.error("[ViralAuthority PRO PREMIUM AI] YT-DLP Error:", e.message);
        const errorMsg = e.message || "";
        if (errorMsg.includes("Sign in to confirm you’re not a bot")) {
          throw new Error("YouTube bloqueó temporalmente la solicitud. Intenta de nuevo en unos minutos.");
        }
        if (errorMsg.includes("Private video") || errorMsg.includes("video is private")) {
          throw new Error("El video es privado y no puede ser procesado.");
        }
        throw new Error("Error al procesar el video. Verifica que el enlace sea público y válido.");
      }
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

    return NextResponse.json(
      { error: getErrorMessage(error) },
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
