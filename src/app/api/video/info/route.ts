import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { NextResponse } from "next/server";
import { detectSupportedPlatform, UNSUPPORTED_LINK_ERROR } from "@/lib/platforms";

export const runtime = "nodejs";
export const maxDuration = 60;

const execFileAsync = promisify(execFile);
const YT_DLP_PATH = process.env.YT_DLP_PATH || "C:/Users/georg/AppData/Local/Microsoft/WinGet/Links/yt-dlp.exe";
const COOKIES_PATH = process.env.COOKIES_PATH || "";
const PUBLIC_ERROR = "No se pudo analizar el enlace. Verifica la URL.";

type RawFormat = {
  format_id?: string;
  ext?: string;
  filesize?: number;
  filesize_approx?: number;
  height?: number;
  width?: number;
  vcodec?: string;
  acodec?: string;
  abr?: number;
  format_note?: string;
};

type VideoFormat = {
  url: string;
  ext: string;
  quality: string;
  filesize: number;
  format_id: string;
  premium?: boolean;
};

const PLATFORM_MAP: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  pinterest: "Pinterest",
  twitter: "Twitter/X",
  x: "Twitter/X",
  reddit: "Reddit",
  twitch: "Twitch",
  soundcloud: "SoundCloud",
};

function isValidHttpUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}

function getErrorStderr(error: unknown) {
  return typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string"
    ? error.stderr
    : "";
}

function formatSize(format: RawFormat) {
  return format.filesize || format.filesize_approx || 0;
}

function prioritizeFormats(formats: RawFormat[]): VideoFormat[] {
  const qualities = [
    { label: "360p", height: 360, premium: false },
    { label: "720p", height: 720, premium: false },
    { label: "1080p", height: 1080, premium: true },
    { label: "1440p (2K)", height: 1440, premium: true },
    { label: "2160p (4K)", height: 2160, premium: true },
    { label: "4320p (8K)", height: 4320, premium: true },
  ];

  const results: VideoFormat[] = [];
  const bestAudio = formats
    .filter((format) => format.vcodec === "none" && format.acodec !== "none")
    .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

  if (bestAudio) {
    for (const bitrate of ["128", "192", "256", "320"]) {
      results.push({
        format_id: `audio_${bitrate}`,
        quality: `MP3 Audio (${bitrate} kbps)`,
        ext: "mp3",
        filesize: 0,
        url: "",
        premium: Number(bitrate) > 128,
      });
    }
  }

  for (const quality of qualities) {
    const matches = formats.filter((format) => {
      if (format.vcodec === "none") return false;
      const height = format.height || 0;
      const width = format.width || 0;
      const minDimension = Math.min(width, height);
      const note = (format.format_note || "").toLowerCase();

      if (Math.abs(height - quality.height) <= 10) return true;
      if (Math.abs(minDimension - quality.height) <= 10) return true;
      if (note.includes(`${quality.height}p`)) return true;
      if (quality.height === 2160 && (note.includes("4k") || note.includes("2160"))) return true;
      if (quality.height === 1440 && (note.includes("2k") || note.includes("1440"))) return true;
      return false;
    });

    if (matches.length > 0) {
      const best = matches.sort((a, b) => formatSize(b) - formatSize(a))[0];
      results.push({
        format_id: best.format_id || "best",
        quality: quality.label,
        ext: best.ext || "mp4",
        filesize: formatSize(best),
        url: "",
        premium: quality.premium,
      });
    }
  }

  const absoluteBest = formats
    .filter((format) => format.vcodec !== "none" || format.ext === "mp4" || format.ext === "m4v")
    .sort((a, b) => {
      const resA = (a.width || 0) * (a.height || 0);
      const resB = (b.width || 0) * (b.height || 0);
      if (resA !== resB) return resB - resA;
      return formatSize(b) - formatSize(a);
    })[0];

  if (absoluteBest && !results.some((format) => format.format_id === absoluteBest.format_id)) {
    const minDimension = Math.min(absoluteBest.width || 0, absoluteBest.height || 0);
    let label = minDimension > 0 ? `${minDimension}p` : "High Quality";
    if (minDimension >= 2160) label = "4K Ultra HD (Max)";
    else if (minDimension >= 1440) label = "2K Quad HD (Max)";
    else if (minDimension >= 1080) label = "1080p Full HD (Max)";
    else if (minDimension >= 720) label = "720p HD (Max)";

    results.push({
      format_id: absoluteBest.format_id || "best",
      quality: label,
      ext: absoluteBest.ext || "mp4",
      filesize: formatSize(absoluteBest),
      url: "",
      premium: minDimension >= 1080,
    });
  }

  if (results.length === 0 && formats.length > 0) {
    const fallback = formats[0];
    results.push({
      format_id: fallback.format_id || "best",
      quality: "Auto-Detected Quality",
      ext: fallback.ext || "mp4",
      filesize: formatSize(fallback),
      url: "",
      premium: false,
    });
  }

  return results;
}

export async function POST(request: Request) {
  let body: { url?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: PUBLIC_ERROR }, { status: 400 });
  }

  if (!isValidHttpUrl(body.url)) {
    console.info("[Video Info API] Platform detection rejected:", {
      url: body.url,
      platform: null,
      reason: "invalid URL",
    });
    return NextResponse.json({ error: UNSUPPORTED_LINK_ERROR, reason: "invalid URL" }, { status: 400 });
  }

  const url = String(body.url).trim();
  const detection = detectSupportedPlatform(url);
  console.info("[Video Info API] Platform detection", {
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

  const args = [url, "--dump-single-json", "--no-playlist", "--skip-download", "--no-warnings"];

  if (COOKIES_PATH && fs.existsSync(COOKIES_PATH)) {
    args.push("--cookies", COOKIES_PATH);
  }

  try {
    const { stdout } = await execFileAsync(YT_DLP_PATH, args, {
      timeout: 45_000,
      maxBuffer: 1024 * 1024 * 16,
      windowsHide: true,
    });
    const data = JSON.parse(stdout);
    const extractorKey = typeof data.extractor_key === "string" ? data.extractor_key : "generic";
    const platformKey = extractorKey.toLowerCase();

    return NextResponse.json({
      title: data.title || "Video",
      thumbnail: data.thumbnail || "",
      duration: typeof data.duration === "number" ? data.duration : undefined,
      url,
      platform: PLATFORM_MAP[platformKey] || detection.label || extractorKey,
      formats: prioritizeFormats(Array.isArray(data.formats) ? data.formats : []),
    });
  } catch (error: unknown) {
    const details = `${getErrorMessage(error)} ${getErrorStderr(error)}`.toLowerCase();
    const status = details.includes("private") || details.includes("sign in") ? 403 : 400;

    console.error("[Video Info API] Failed to analyze URL:", {
      message: getErrorMessage(error),
      stderr: getErrorStderr(error),
    });

    return NextResponse.json({ error: PUBLIC_ERROR }, { status });
  }
}
