import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execFileAsync = promisify(execFile);

async function getBinaryPaths() {
  const envPath = process.env.YT_DLP_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  for (const p of ["/usr/local/bin/yt-dlp", "/usr/bin/yt-dlp"]) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const { stdout } = await execFileAsync("which", ["yt-dlp"]);
    if (stdout.trim()) return stdout.trim();
  } catch {}
  return "yt-dlp";
}

export async function GET() {
  try {
    const ytDlpPath = await getBinaryPaths();
    const { stdout, stderr } = await execFileAsync(ytDlpPath, ["--version"], { timeout: 10000 });
    return NextResponse.json({ 
      ytDlpPath, 
      version: stdout.trim(), 
      stderr: stderr.trim(),
      env: {
        YT_DLP_PATH: process.env.YT_DLP_PATH,
        NODE_ENV: process.env.NODE_ENV
      }
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message, 
      stderr: error.stderr,
      stack: error.stack
    }, { status: 500 });
  }
}
