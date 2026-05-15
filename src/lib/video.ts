import axios from "axios";
import { detectPlatform, detectSupportedPlatform, UNSUPPORTED_LINK_ERROR } from "@/lib/platforms";

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
  const url = videoUrl.trim();
  try {
    const platformId = detectPlatform(url);
    const detection = detectSupportedPlatform(url);

    console.info(`[ViralAuthority PRO PREMIUM] Detect Platform: ${platformId}`, {
      url: url,
      reason: detection.reason,
      route: detection.route
    });

    if (platformId === "unknown") {
      console.warn(`[ViralAuthority PRO PREMIUM] Unsupported Platform for URL: ${url}`);
      return {
        title: "",
        thumbnail: "",
        url: url,
        platform: "",
        formats: [],
        error: UNSUPPORTED_LINK_ERROR,
      };
    }

    const endpoint = "/api/video/info";
    console.info(`[ViralAuthority PRO PREMIUM] Fetching metadata from ${endpoint} for ${platformId}...`);

    const response = await axios.post(
      endpoint,
      { url: url },
      { 
        timeout: 45_000, // Increased timeout for heavy videos
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data && response.data.error) {
      return {
        ...response.data,
        title: response.data.title || "",
        thumbnail: response.data.thumbnail || "",
        url: url,
        formats: response.data.formats || [],
      };
    }

    return response.data;
  } catch (error: unknown) {
    console.error("[ViralAuthority PRO PREMIUM] Video metadata fetch error:", error);
    
    let errorMessage = "No se pudo procesar este enlace ahora. Intenta nuevamente o usa otro video.";
    
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        errorMessage = "El servidor tardó demasiado en responder. El video podría ser muy largo o estar restringido.";
      } else if (!error.response) {
        errorMessage = "Error de red. Verifica tu conexión o el estado del servidor de ViralAuthority.";
      } else {
        const serverError = (error.response?.data as { error?: string } | undefined)?.error;
        errorMessage = serverError || errorMessage;
      }
    }

    return {
      title: "",
      thumbnail: "",
      url: url,
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
      throw new Error(errData.error || "Error al procesar el video");
    }

    const data = await response.json();
    if (!data.success || !data.url) {
      throw new Error(data.error || "No se pudo obtener el enlace de descarga");
    }

    // Now fetch the actual file from our new proxy route
    // The backend returns a URL like /download-file?file=...&name=...
    // We replace it with our proxy /api/download-file?...
    const downloadUrl = data.url.replace('/download-file', '/api/download-file');
    
    console.log(`[ViralAuthority] Downloading file from: ${downloadUrl}`);
    
    const fileResponse = await fetch(downloadUrl);
    if (!fileResponse.ok) {
      throw new Error("Error al descargar el archivo final");
    }

    const blob = await fileResponse.blob();
    let filename = data.fileName || "viralauthoritypro-download.mp4";
    const disposition = fileResponse.headers.get("Content-Disposition");

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
