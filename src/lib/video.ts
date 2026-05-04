import axios from "axios";
import { detectSupportedPlatform, UNSUPPORTED_LINK_ERROR } from "@/lib/platforms";

const getApiUrl = () => {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || window.location.origin;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
};

const VIDEO_INFO_ENDPOINT = "/api/video/info";
const VIDEO_INFO_ERROR = UNSUPPORTED_LINK_ERROR;

export interface VideoFormat {
  url: string;
  ext: string;
  quality: string;
  filesize: number;
  format_id: string;
  premium?: boolean;
}

export interface VideoInfo {
  title: string;
  thumbnail: string;
  url: string;
  duration?: number;
  platform?: string;
  formats?: VideoFormat[];
  error?: string;
}

export async function getVideoInfo(videoUrl: string): Promise<VideoInfo> {
  try {
    const detection = detectSupportedPlatform(videoUrl);
    console.info("[ViralAuthority Video Helper] URL received", {
      url: videoUrl,
      platform: detection.platform,
      reason: detection.reason,
    });

    if (!detection.platform) {
      return {
        title: "",
        thumbnail: "",
        url: videoUrl,
        platform: "",
        formats: [],
        error: UNSUPPORTED_LINK_ERROR,
      };
    }

    const endpoint = "/api/video/info";
    console.log(`[ViralAuthority] Fetching from: ${endpoint}`);

    const response = await axios.post(
      endpoint,
      { url: videoUrl },
      { 
        timeout: 30_000,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error: unknown) {
    console.warn("Video info request failed:", error);
    
    let errorMessage = VIDEO_INFO_ERROR;
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') errorMessage = "El servidor tardó demasiado en responder.";
      else if (!error.response) errorMessage = "Error de red. Verifica tu conexión o el estado del servidor.";
      else errorMessage = (error.response?.data as { error?: string } | undefined)?.error || errorMessage;
    }

    return {
      title: "",
      thumbnail: "",
      url: videoUrl,
      platform: "",
      formats: [],
      error: errorMessage,
    };
  }
}

export async function downloadVideo(
  videoUrl: string,
  formatId?: string,
  ext?: string,
  qualityLabel?: string,
  platform?: string,
  title?: string
): Promise<void> {
  try {
    if (!videoUrl || !videoUrl.startsWith("http")) {
      throw new Error("Pega un enlace valido");
    }

    let type = "video";
    if (ext === "mp3" || ext === "m4a") type = "audio";
    if (ext === "jpg" || ext === "png" || ext === "webp") type = "image";

    const payload = {
      url: videoUrl,
      platform: platform || "",
      formatId: formatId || "",
      ext: ext || "",
      type,
      quality: qualityLabel || "best",
      title: title || "",
    };

    const response = await fetch("/api/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Error descargando");
    }

    const blob = await response.blob();
    let filename = "viralauthoritypro-download.mp4";
    const disposition = response.headers.get("Content-Disposition");

    if (disposition) {
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
      if (utf8Match?.[1]) filename = decodeURIComponent(utf8Match[1]);
      else if (asciiMatch?.[1]) filename = asciiMatch[1];
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.includes(".") ? filename : `${filename}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (error: unknown) {
    console.error("DOWNLOAD HELPER ERROR:", error);
    throw error;
  }
}

export async function getVideoMeta(videoUrl: string): Promise<VideoInfo> {
  return getVideoInfo(videoUrl);
}

export async function cleanupTempFiles() {
  // No-op on the frontend.
}
