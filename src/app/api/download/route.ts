import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import { detectSupportedPlatform, UNSUPPORTED_LINK_ERROR } from "@/lib/platforms";

export const runtime = "nodejs";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);

async function getBinaryPaths() {
  const ytDlpEnv = process.env.YT_DLP_PATH;
  const ffmpegEnv = process.env.FFMPEG_PATH;
  
  let ytDlp = ytDlpEnv && fs.existsSync(ytDlpEnv) ? ytDlpEnv : "";
  let ffmpeg = ffmpegEnv && fs.existsSync(ffmpegEnv) ? ffmpegEnv : "";

  if (!ytDlp) {
    for (const p of ["/usr/local/bin/yt-dlp", "/usr/bin/yt-dlp"]) {
      if (fs.existsSync(p)) { ytDlp = p; break; }
    }
    if (!ytDlp) {
      try {
        const { stdout } = await execFileAsync("which", ["yt-dlp"]);
        ytDlp = stdout.trim();
      } catch {}
    }
    if (!ytDlp) ytDlp = "C:/Users/georg/AppData/Local/Microsoft/WinGet/Links/yt-dlp.exe";
  }

  if (!ffmpeg) {
    for (const p of ["/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]) {
      if (fs.existsSync(p)) { ffmpeg = p; break; }
    }
    if (!ffmpeg) {
      try {
        const { stdout } = await execFileAsync("which", ["ffmpeg"]);
        ffmpeg = stdout.trim();
      } catch {}
    }
    if (!ffmpeg) ffmpeg = "C:/Users/georg/AppData/Local/Microsoft/WinGet/Packages/yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-N-123778-g3b55818764-win64-gpl/bin/ffmpeg.exe";
  }

  return { ytDlp, ffmpeg };
}

function getCookiesPath() {
  const envPath = process.env.COOKIES_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  
  // Hardcoded production path fallback
  const prodPath = "/var/www/viralauthoritypro/cookies.txt";
  if (fs.existsSync(prodPath)) return prodPath;
  
  // Local path fallback
  if (fs.existsSync("cookies.txt")) return "cookies.txt";
  
  return "";
}

const PATH_SEPARATOR = process.platform === "win32" ? "\\" : "/";

const CONTENT_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function sanitizeFilename(title: string): string {
  const clean = (title || "download")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-")
    .toLowerCase()
    .slice(0, 80);

  return clean || "download";
}

function normalizeExt(ext?: unknown) {
  const clean = typeof ext === "string" ? ext.toLowerCase().replace(/^\./, "") : "";
  if (["mp3", "m4a", "mp4", "webm", "jpg", "jpeg", "png", "webp"].includes(clean)) {
    return clean;
  }
  return "";
}

function normalizeType(type: unknown, ext: string) {
  if (type === "audio" || ext === "mp3" || ext === "m4a") return "audio";
  if (type === "image" || ["jpg", "jpeg", "png", "webp"].includes(ext)) return "image";
  return "video";
}

function parseHeight(quality: unknown) {
  const value = typeof quality === "string" ? quality : "";
  const match = value.match(/(\d{3,4})p?/i);
  return match ? Number(match[1]) : undefined;
}

function qualitySuffix(type: string, quality: unknown, height?: number) {
  if (type === "audio") {
    const bitrate = typeof quality === "string" ? quality.match(/(128|192|256|320)/)?.[1] : undefined;
    return `${bitrate || "320"}kbps`;
  }

  if (type === "image") return "image";
  return height ? `${height}p` : "best";
}

function contentDisposition(filename: string) {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Fallo en la descarga";
}

function getErrorStderr(error: unknown) {
  return typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string"
    ? error.stderr
    : "";
}

function getTempDir() {
  const projectTemp = `${os.tmpdir()}${PATH_SEPARATOR}viralauthoritypro-downloads`;
  try {
    fs.mkdirSync(/*turbopackIgnore: true*/ projectTemp, { recursive: true });
    return projectTemp;
  } catch {
    return os.tmpdir();
  }
}

function getDownloadedFile(tempDir: string, internalBase: string) {
  const candidates = fs
    .readdirSync(/*turbopackIgnore: true*/ tempDir)
    .filter((file) => file.startsWith(internalBase) && !file.endsWith(".part") && !file.endsWith(".ytdl"))
    .map((file) => {
      const fullPath = `${tempDir}${PATH_SEPARATOR}${file}`;
      return { file, fullPath, stat: fs.statSync(/*turbopackIgnore: true*/ fullPath) };
    })
    .filter((entry) => entry.stat.isFile() && entry.stat.size > 0)
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs || b.stat.size - a.stat.size);

  return candidates[0];
}

function buildYtDlpArgs(params: {
  url: string;
  type: string;
  requestedExt: string;
  formatId: string;
  height?: number;
  quality: unknown;
  outputTemplate: string;
  ffmpegPath: string;
  cookiesPath: string;
}) {
  const args: string[] = [];

  if (params.type === "audio") {
    const requestedAudioExt = params.requestedExt === "m4a" ? "m4a" : "mp3";
    const bitrate = typeof params.quality === "string" ? params.quality.match(/(128|192|256|320)/)?.[1] : undefined;
    args.push("-x", "--audio-format", requestedAudioExt);
    if (requestedAudioExt === "mp3") {
      args.push("--audio-quality", "0");
      if (bitrate) args.push("--postprocessor-args", `ffmpeg:-b:a ${bitrate}k`);
    }
  } else if (params.type === "image") {
    args.push("--write-thumbnail", "--convert-thumbnails", params.requestedExt || "jpg", "--skip-download");
  } else {
    const explicitFormat = params.formatId && !params.formatId.startsWith("audio_") ? params.formatId : "";
    const format = explicitFormat
      ? `${explicitFormat}+bestaudio/best`
      : params.height
        ? `bestvideo[height<=${params.height}]+bestaudio/best[height<=${params.height}]/best`
        : "bestvideo+bestaudio/best";
    args.push("-f", format, "--merge-output-format", "mp4");
  }

  args.push("-o", params.outputTemplate, "--ffmpeg-location", params.ffmpegPath, "--no-playlist", "--no-check-certificate");

  if (params.cookiesPath) {
    args.push("--cookies", params.cookiesPath);
  }

  args.push(params.url);
  return args;
}

export async function POST(req: NextRequest) {
  let actualFilePath = "";

  try {
    const body = await req.json().catch(() => ({}));
    const url = typeof body.url === "string" ? body.url.trim() : "";

    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "Missing or invalid URL" }, { status: 400 });
    }

    const detection = detectSupportedPlatform(url);
    console.info("[ViralAuthority Download API] Platform detection", {
      url,
      platform: detection.platform,
      reason: detection.reason,
    });

    if (!detection.platform) {
      return NextResponse.json(
        {
          error: UNSUPPORTED_LINK_ERROR,
          reason: detection.reason,
        },
        { status: 400 },
      );
    }

    const requestedExt = normalizeExt(body.ext);
    const type = normalizeType(body.type, requestedExt);
    const platform = sanitizeFilename(typeof body.platform === "string" && body.platform ? body.platform : detection.platform);
    const safeTitle = sanitizeFilename(typeof body.title === "string" && body.title ? body.title : "download");
    const formatId = typeof body.formatId === "string" ? body.formatId : "";
    const height = parseHeight(body.quality);
    const suffix = qualitySuffix(type, body.quality, height);

    const tempDir = getTempDir();
    const internalBase = `download_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const outputTemplate = `${tempDir}${PATH_SEPARATOR}${internalBase}.%(ext)s`;
    const { ytDlp: ytDlpPath, ffmpeg: ffmpegPath } = await getBinaryPaths();
    const cookiesPath = getCookiesPath();
    const args = buildYtDlpArgs({
      url,
      type,
      requestedExt,
      formatId,
      height,
      quality: body.quality,
      outputTemplate,
      ffmpegPath,
      cookiesPath,
    });

    console.log("[ViralAuthority PRO PREMIUM Download Engine] Executing yt-dlp", {
      type,
      formatId: formatId || "auto",
      quality: body.quality || "best",
      requestedExt: requestedExt || "auto",
    });

    await execFileAsync(ytDlpPath, args, {
      timeout: 240_000,
      maxBuffer: 1024 * 1024 * 8,
      windowsHide: true,
    });

    const targetFile = getDownloadedFile(tempDir, internalBase);
    if (!targetFile) {
      throw new Error("Download failed or file not found.");
    }

    actualFilePath = targetFile.fullPath;
    const actualExt = targetFile.file.split(".").pop()?.toLowerCase() || requestedExt || (type === "audio" ? "mp3" : "mp4");
    const downloadFilename = `viralauthoritypro-${platform}-${safeTitle}-${suffix}.${actualExt}`;
    const fileStream = fs.createReadStream(/*turbopackIgnore: true*/ actualFilePath);

    const webReadableStream = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk) => controller.enqueue(chunk));
        fileStream.on("end", () => {
          controller.close();
          fs.promises.unlink(/*turbopackIgnore: true*/ actualFilePath).catch(() => {});
        });
        fileStream.on("error", (err) => {
          controller.error(err);
          fs.promises.unlink(/*turbopackIgnore: true*/ actualFilePath).catch(() => {});
        });
      },
      cancel() {
        fileStream.destroy();
        fs.promises.unlink(/*turbopackIgnore: true*/ actualFilePath).catch(() => {});
      },
    });

    const headers = new Headers();
    headers.set("Content-Type", CONTENT_TYPES[actualExt] || "application/octet-stream");
    headers.set("Content-Length", targetFile.stat.size.toString());
    headers.set("Content-Disposition", contentDisposition(downloadFilename));
    headers.set("Access-Control-Expose-Headers", "Content-Disposition");

    return new NextResponse(webReadableStream, { status: 200, headers });
  } catch (error: unknown) {
    if (actualFilePath) fs.promises.unlink(/*turbopackIgnore: true*/ actualFilePath).catch(() => {});

    console.error("[ViralAuthority PRO PREMIUM Download API] Error:", {
      message: getErrorMessage(error),
      stderr: getErrorStderr(error),
    });

    return NextResponse.json(
      {
        error: getErrorMessage(error),
        details: getErrorStderr(error),
      },
      { status: 500 },
    );
  }
}
