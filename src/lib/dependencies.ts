import { exec } from "child_process";
import util from "util";
import fs from "fs";
import path from "path";

const execPromise = util.promisify(exec);

export interface DependencyCheck {
  ytDlp: boolean;
  ffmpeg: boolean;
  pythonYtDlp: boolean;
  version?: string;
  error?: string;
}

export async function checkDependencies(): Promise<DependencyCheck> {
  const result: DependencyCheck = {
    ytDlp: false,
    ffmpeg: false,
    pythonYtDlp: false,
  };

  try {
    // Check yt-dlp
    const ytDlpPath = process.env.YT_DLP_PATH || 'yt-dlp';
    const shellOption = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    try {
      await execPromise(`"${ytDlpPath}" --version`, { shell: shellOption });
      result.ytDlp = true;
    } catch (e) {
      // Try python -m yt_dlp
      try {
        await execPromise('python -m yt_dlp --version', { shell: shellOption });
        result.pythonYtDlp = true;
      } catch (e2) {}
    }

    // Check ffmpeg
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    try {
      await execPromise(`"${ffmpegPath}" -version`, { shell: shellOption });
      result.ffmpeg = true;
    } catch (e) {}

  } catch (error: any) {
    result.error = error.message;
  }

  return result;
}

export function getYT_DLP_BIN() {
  return process.env.YT_DLP_PATH || 'yt-dlp';
}

export function getFFMPEG_BIN() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}
