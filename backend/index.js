const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { create: createYtDlp } = require('yt-dlp-exec');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const port = 3001;

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

function sanitizeFileName(name) {
  return name
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s-]/g, '')       // Remove non-word chars (except space and dash)
    .trim()
    .replace(/\s+/g, '-')           // Spaces to -
    .replace(/\-\-+/g, '-')         // Multiple - to single
    .slice(0, 80);                  // Max length for safety
}

// Load environment variables from the root .env
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Robust Binary Discovery
const getBinPath = (binName) => {
  const envPath = process.env[binName.toUpperCase() + '_PATH'];
  if (envPath && fs.existsSync(envPath)) return envPath;
  
  // Common Linux paths for production
  if (process.platform !== 'win32') {
    const linuxPaths = [
      `/usr/local/bin/${binName}`,
      `/usr/bin/${binName}`,
      path.join(__dirname, binName),
      path.join(process.cwd(), binName)
    ];
    for (const p of linuxPaths) {
      if (fs.existsSync(p)) return p;
    }
  }
  
  return binName; // Fallback to PATH
};

const YT_DLP_BIN = getBinPath('yt-dlp');
const FFMPEG_BIN = getBinPath('ffmpeg');
const COOKIES_PATH = process.env.COOKIES_PATH || path.join(__dirname, 'cookies.txt');

console.log(`🔍 [ViralAuthority Engine] YT-DLP: ${YT_DLP_BIN}`);
console.log(`🔍 [ViralAuthority Engine] FFmpeg: ${FFMPEG_BIN}`);

// Startup diagnostic
(async () => {
  try {
    const { stdout: ytdlpVer } = await execPromise(`"${YT_DLP_BIN}" --version`);
    console.log(`✅ [ViralAuthority Engine] YT-DLP version: ${ytdlpVer.trim()}`);
    const { stdout: ffmpegVer } = await execPromise(`"${FFMPEG_BIN}" -version`);
    console.log(`✅ [ViralAuthority Engine] FFmpeg detected: ${ffmpegVer.split('\n')[0]}`);
  } catch (err) {
    console.warn(`⚠️ [ViralAuthority Engine] Startup Diagnostic Warning: Some binaries might not be fully accessible.`, err.message);
  }
})();

let cookiesActive = false;
if (fs.existsSync(COOKIES_PATH)) {
  console.log(`🍪 [ViralAuthority Engine] Cookies detected at ${COOKIES_PATH}!`);
  cookiesActive = true;
}

const ytDlpWrapper = createYtDlp(YT_DLP_BIN);

function getYtDlpArgs(customArgs = {}) {
  const baseArgs = {
    noWarnings: true,
    noCheckCertificate: true,
    ffmpegLocation: FFMPEG_BIN,
    ...customArgs
  };

  if (cookiesActive && fs.existsSync(COOKIES_PATH)) {
    baseArgs.cookies = COOKIES_PATH;
  }

  return baseArgs;
}

// --- Security & Middleware ---
app.use(helmet());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { error: "Too many requests, please try again later." }
});
app.use('/info', limiter);
app.use('/download', limiter);

const PLATFORM_MAP = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  pinterest: "Pinterest",
  twitter: "Twitter/X",
  "twitter-x": "Twitter/X",
  reddit: "Reddit",
  twitch: "Twitch",
  soundcloud: "SoundCloud",
};


// --- Helper Functions ---
function prioritizeFormats(formats) {
  const qualities = [
    { label: '360p', height: 360, premium: false },
    { label: '720p', height: 720, premium: false },
    { label: '1080p', height: 1080, premium: true },
    { label: '1440p (2K)', height: 1440, premium: true },
    { label: '2160p (4K)', height: 2160, premium: true },
    { label: '4320p (8K)', height: 4320, premium: true }
  ];
  
  const results = [];

  // 1. Best Audio Only
  const bestAudio = (formats || []).filter(f => f.vcodec === 'none' && f.acodec !== 'none')
    .sort((a,b) => (b.abr || 0) - (a.abr || 0))[0];
  if (bestAudio) {
    results.push({
      format_id: "audio_128",
      quality: "MP3 Audio (128 kbps)",
      ext: "mp3",
      filesize: 0,
      premium: false,
      isAudio: true,
      bitrate: "128"
    });
    results.push({
      format_id: "audio_192",
      quality: "MP3 Audio (192 kbps)",
      ext: "mp3",
      filesize: 0,
      premium: false,
      isAudio: true,
      bitrate: "192"
    });
    results.push({
      format_id: "audio_256",
      quality: "MP3 Audio (256 kbps)",
      ext: "mp3",
      filesize: 0,
      premium: true,
      isAudio: true,
      bitrate: "256"
    });
    results.push({
      format_id: "audio_320",
      quality: "MP3 Audio (320 kbps)",
      ext: "mp3",
      filesize: 0,
      premium: true,
      isAudio: true,
      bitrate: "320"
    });
  }

  // 2. Map standard and high qualities
  const foundHeights = [...new Set((formats || []).map(f => f.height).filter(h => h))];
  console.log(`[ViralAuthority PRO PREMIUM Engine] Found available heights: ${foundHeights.join(", ")}`);

  qualities.forEach(q => {
    const matches = (formats || []).filter(f => {
      if (f.vcodec === 'none') return false;
      const h = f.height || 0;
      const w = f.width || 0;
      const minDim = Math.min(w, h);
      const note = (f.format_note || '').toLowerCase();
      
      // Standard match by height or minDim
      if (Math.abs(h - q.height) <= 10) return true;
      if (Math.abs(minDim - q.height) <= 10) return true;
      
      // Match by format_note (e.g. "2160p", "4k")
      if (note.includes(q.height.toString() + 'p')) return true;
      if (q.height === 2160 && (note.includes('4k') || note.includes('2160'))) return true;
      if (q.height === 1440 && (note.includes('2k') || note.includes('1440'))) return true;
      
      return false;
    });

    if (matches.length > 0) {
      // Pick best based on resolution then filesize/bitrate
      const best = matches.sort((a,b) => {
        const sizeA = a.filesize || a.filesize_approx || 0;
        const sizeB = b.filesize || b.filesize_approx || 0;
        return sizeB - sizeA;
      })[0];

      results.push({
        format_id: best.format_id,
        quality: q.label,
        ext: best.ext,
        filesize: best.filesize || best.filesize_approx || 0,
        premium: q.premium
      });
    }
  });

  // 3. Absolute Best Fallback
  const absoluteBest = (formats || []).filter(f => f.vcodec !== 'none' || f.ext === 'mp4' || f.ext === 'm4v')
    .sort((a, b) => {
       const resA = (a.width || 0) * (a.height || 0);
       const resB = (b.width || 0) * (b.height || 0);
       if (resB !== resA && resB > 0 && resA > 0) return resB - resA;
       const sizeA = a.filesize || a.filesize_approx || 0;
       const sizeB = b.filesize || b.filesize_approx || 0;
       return sizeB - sizeA;
    })[0];

  if (absoluteBest) {
    const isAlreadyIncluded = results.some(r => r.format_id === absoluteBest.format_id);
    const minDim = Math.min(absoluteBest.width || 0, absoluteBest.height || 0);
    
    if (!isAlreadyIncluded) {
      let label = minDim > 0 ? `${minDim}p` : "High Quality";
      if (minDim >= 2160) label = "4K Ultra HD (Max)";
      else if (minDim >= 1440) label = "2K Quad HD (Max)";
      else if (minDim >= 1080) label = "1080p Full HD (Max)";
      else if (minDim >= 720) label = "720p HD (Max)";

      results.push({
        format_id: absoluteBest.format_id,
        quality: label,
        ext: absoluteBest.ext || "mp4",
        filesize: absoluteBest.filesize || absoluteBest.filesize_approx || 0,
        premium: minDim >= 1080
      });
    }
  }

  // 4. Emergency Fallback (if still empty, take anything)
  if (results.length === 0 && (formats || []).length > 0) {
    const fallback = formats[0];
    results.push({
      format_id: fallback.format_id || "best",
      quality: "Auto-Detected Quality",
      ext: fallback.ext || "mp4",
      filesize: fallback.filesize || fallback.filesize_approx || 0,
      premium: false
    });
  }

  return results;
}

function handleFinalFile(internalFileBase, isAudio, finalUserFileName, res) {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR);
    const targetFile = files.find(f => f.startsWith(internalFileBase) && (f.endsWith('.mp4') || f.endsWith('.mp3')));

    if (!targetFile) {
      console.error("❌ [ViralAuthority PRO PREMIUM Engine] Target file not found in:", files.filter(f => f.startsWith(internalFileBase)));
      return res.status(500).json({ error: "Could not find final converted file." });
    }

    const fullPath = path.join(DOWNLOADS_DIR, targetFile);
    const stats = fs.statSync(fullPath);
    
    // VALIDATE REAL SIZE (Lowered to allow short videos/audio)
    const minSize = 1024 * 10; // 10KB - Enough to ensure it's not just metadata or empty
    if (stats.size < minSize) {
      console.error(`❌ [ViralAuthority PRO PREMIUM Engine] File too small: ${stats.size} bytes`);
      try { fs.unlinkSync(fullPath); } catch(e) {}
      return res.status(500).json({ 
        error: "El archivo generado parece incompleto o demasiado pequeño.",
        details: `Tamaño: ${(stats.size / 1024).toFixed(1)} KB. Intenta con otra calidad.`
      });
    }

    console.log(`✅ [ViralAuthority PRO PREMIUM Engine] File ready: ${targetFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

    // Cleanup: Remove any .part, .webm, .m4a or temp files from this session
    const tempFiles = files.filter(f => f.startsWith(internalFileBase) && !f.endsWith('.mp4') && !f.endsWith('.mp3'));
    tempFiles.forEach(f => {
      try { fs.unlinkSync(path.join(DOWNLOADS_DIR, f)); } catch(e) {}
    });

    res.json({ 
      url: `/download-file?file=${encodeURIComponent(targetFile)}&name=${encodeURIComponent(finalUserFileName)}`, 
      fileName: finalUserFileName,
      success: true,
      message: `Archivo listo: ${finalUserFileName}`
    });
  } catch (e) {
    console.error("❌ [ViralAuthority PRO PREMIUM Engine] Error in handleFinalFile:", e);
    res.status(500).json({ error: "Error finalizando la descarga." });
  }
}

// --- Routes ---

/**
 * FETCH VIDEO METADATA
 */
app.post('/info', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  const cleanUrl = url.trim();
  console.log(`\n--- [ViralAuthority PRO PREMIUM] NEW INFO REQUEST ---`);
  console.log(`🔗 URL: ${cleanUrl}`);
  console.log(`🛠️ YT-DLP BIN: ${YT_DLP_BIN}`);
  console.log(`🛠️ FFmpeg BIN: ${FFMPEG_BIN}`);

  try {
    const args = getYtDlpArgs({
      dumpSingleJson: true,
      noPlaylist: true,
      skipDownload: true,
    });
    
    console.log(`🛠️ Executing yt-dlp metadata fetch...`);
    const data = await ytDlpWrapper(cleanUrl, args);
    
    const platform = PLATFORM_MAP[data.extractor_key?.toLowerCase()] || data.extractor_key || "unknown";
    console.log(`✅ Title: ${data.title}`);
    console.log(`✅ Platform detected by engine: ${platform}`);

    const info = {
      title: data.title,
      thumbnail: data.thumbnail,
      duration: data.duration,
      url: cleanUrl,
      platform: platform,
      formats: prioritizeFormats(data.formats || [])
    };

    res.json(info);
  } catch (error) {
    console.error("❌ Info Fetching Error:", error.message);
    if (error.stderr) console.error("❌ Stderr:", error.stderr);
    
    // Specifically handle common yt-dlp/video errors
    const errorMessage = error.stderr || error.message || "";
    if (errorMessage.includes("Video unavailable") || errorMessage.includes("Incomplete YouTube ID")) {
      return res.status(404).json({ error: "El video no está disponible o el enlace está roto." });
    }
    if (errorMessage.includes("Private video") || errorMessage.includes("Sign in if you've been granted access") || errorMessage.includes("private post")) {
      return res.status(403).json({ error: "Este video es privado o restringido. Podría requerir cookies de sesión actualizadas." });
    }
    if (errorMessage.includes("Your IP address is blocked") || errorMessage.includes("TikTok")) {
       return res.status(403).json({ error: "TikTok está bloqueando temporalmente las solicitudes. Intenta en unos minutos." });
    }

    res.status(400).json({ 
      error: "No se pudo procesar la información del video.",
      details: errorMessage.slice(0, 100) 
    });
  }
});

/**
 * DOWNLOAD & STREAM (DIRECT PROXY)
 * This handles the CORS and 403 errors by streaming THROUGH the VPS.
 */
app.post('/download', async (req, res) => {
  const { url, formatId, qualityLabel } = req.body;
  if (!url || !formatId) return res.status(400).json({ error: "URL and formatId are required" });

  console.log(`🚀 [ViralAuthority PRO PREMIUM Engine] NEW DOWNLOAD REQUEST ---`);
  console.log(`🔗 URL: ${url}`);
  console.log(`📦 FormatID: ${formatId}`);
  console.log(`🛠️ YT-DLP BIN: ${YT_DLP_BIN}`);
  console.log(`🛠️ FFmpeg BIN: ${FFMPEG_BIN}`);

  // Cleanup old files (> 1 hour)
  try {
    const now = Date.now();
    const files = fs.readdirSync(DOWNLOADS_DIR);
    files.forEach(file => {
      const filePath = path.join(DOWNLOADS_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 3600000) { // 1 hour
        fs.unlinkSync(filePath);
      }
    });
  } catch (err) {
    console.error("Cleanup error:", err);
  }

  try {
    const isAudio = formatId.startsWith('audio_');
    const timestamp = Date.now();
    
    console.log(`🛠️ Fetching title for download naming...`);
    const info = await execPromise(`"${YT_DLP_BIN}" --print "%(title)s" "${url}"`);
    const rawTitle = info.stdout.trim() || "video";
    const safeTitle = sanitizeFileName(rawTitle);
    
    console.log(`✅ Safe Title: ${safeTitle}`);
    
    let bitrate = "128";
    if (formatId === "audio_192") bitrate = "192";
    if (formatId === "audio_256") bitrate = "256";
    if (formatId === "audio_320") bitrate = "320";

    const extension = isAudio ? "mp3" : "mp4";
    const qualityTag = isAudio ? `${bitrate}kbps` : (qualityLabel ? qualityLabel.replace(/\s+/g, '').toLowerCase() : 'best');
    const finalUserFileName = `${safeTitle}-${qualityTag}.${extension}`;
    
    const internalFileBase = `viralauthoritypro_${timestamp}_${safeTitle}`;
    const outputTemplate = path.join(DOWNLOADS_DIR, `${internalFileBase}.%(ext)s`);

    let command = "";
    if (isAudio) {
      // Audio MP3 PREMIUM/FREE based on bitrate
      command = `"${YT_DLP_BIN}" -x --audio-format mp3 --audio-quality 0 --postprocessor-args "ffmpeg:-b:a ${bitrate}k" -o "${outputTemplate}" "${url}"`;
    } else {
      // Video MP4 with strict quality requirements
      let formatStr = "";
      if (qualityLabel === '360p') {
        formatStr = 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=360]';
      } else if (qualityLabel === '720p') {
        formatStr = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]';
      } else if (qualityLabel === '1080p') {
        formatStr = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]';
      } else if (qualityLabel.includes('2K')) {
        formatStr = 'bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/best[height<=1440][ext=mp4]/best[height<=1440]';
      } else if (qualityLabel.includes('4K')) {
        formatStr = 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[height<=2160][ext=mp4]/best[height<=2160]';
      } else if (qualityLabel.includes('8K')) {
        formatStr = 'bestvideo[height<=4320][ext=mp4]+bestaudio[ext=m4a]/best[height<=4320][ext=mp4]/best[height<=4320]';
      } else {
        formatStr = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
      }

      command = `"${YT_DLP_BIN}" -f "${formatStr}" --merge-output-format mp4 --recode-video mp4 -o "${outputTemplate}" "${url}"`;
    }

    if (cookiesActive && fs.existsSync(COOKIES_PATH)) {
      command += ` --cookies "${COOKIES_PATH}"`;
    }
    
    // Only pass --ffmpeg-location if it's an absolute path
    if (FFMPEG_BIN && FFMPEG_BIN !== 'ffmpeg' && FFMPEG_BIN !== 'ffmpeg.exe') {
      command += ` --ffmpeg-location "${FFMPEG_BIN}"`;
    }

    console.log(`🛠️ [ViralAuthority PRO PREMIUM Engine] Executing: ${command}`);

    exec(command, { shell: true }, (error, stdout, stderr) => {
      if (error) {
        console.error("❌ [ViralAuthority PRO PREMIUM Engine] Exec Error:", error);
        console.error("❌ [ViralAuthority PRO PREMIUM Engine] Stdout:", stdout);
        console.error("❌ [ViralAuthority PRO PREMIUM Engine] Stderr:", stderr);
        
        // RE-TRY WITH SIMPLE FORMAT IF IT FAILED (for platforms like Pinterest)
        if (!isAudio && !command.includes('-f best')) {
          console.log("🔄 [ViralAuthority PRO PREMIUM Engine] Retrying with simple format...");
          const simpleCommand = `"${YT_DLP_BIN}" -f best --merge-output-format mp4 -o "${outputTemplate}" "${url}" --ffmpeg-location "${FFMPEG_BIN}"`;
          return exec(simpleCommand, { shell: true }, (error2, stdout2, stderr2) => {
            if (error2) {
               console.error("❌ [ViralAuthority PRO PREMIUM Engine] Retry Exec Error:", error2);
               console.error("❌ [ViralAuthority PRO PREMIUM Engine] Retry Stderr:", stderr2);
               return res.status(500).json({ error: "Download/Conversion failed after retry." });
            }
            handleFinalFile(internalFileBase, isAudio, finalUserFileName, res);
          });
        }
        
        return res.status(500).json({ error: "Download/Conversion failed." });
      }

      handleFinalFile(internalFileBase, isAudio, finalUserFileName, res);
    });

  } catch (error) {
    console.error("Download Processing Error:", error);
    res.status(500).json({ error: "Download failed." });
  }
});

// Serve the downloads folder with explicit headers
app.get('/download-file', (req, res) => {
  const { file, name } = req.query;
  if (!file) return res.status(400).send("File name is required");
  
  const filePath = path.join(DOWNLOADS_DIR, file);
  if (!fs.existsSync(filePath)) return res.status(404).send("File not found");

  const stats = fs.statSync(filePath);
  const downloadName = (name || file).toString();
  
  // Set explicit headers to ensure Chrome and other browsers recognize the filename
  const safeName = downloadName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
  res.setHeader('Content-Length', stats.size);
  
  // Also set Content-Type based on extension
  const ext = path.extname(downloadName).toLowerCase();
  if (ext === '.mp3') res.setHeader('Content-Type', 'audio/mpeg');
  else if (ext === '.mp4') res.setHeader('Content-Type', 'video/mp4');
  else if (ext === '.png') res.setHeader('Content-Type', 'image/png');
  else if (ext === '.jpg' || ext === '.jpeg') res.setHeader('Content-Type', 'image/jpeg');
  else if (ext === '.webp') res.setHeader('Content-Type', 'image/webp');
  else res.setHeader('Content-Type', 'application/octet-stream');

  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      console.error("Download Error:", err);
      res.status(500).send("Error downloading file");
    }
  }); 
});

app.use('/downloads', express.static(DOWNLOADS_DIR));

/**
 * STREAM PROXY
 * High-speed data pipe from Source to User
 */
app.get('/stream', async (req, res) => {
  const { v: videoUrl, n: fileName } = req.query;
  if (!videoUrl) return res.status(400).send("Source URL missing");

  try {
    // Determine the platform for extreme spoofing
    let referer = 'https://www.google.com';
    let userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

    if (videoUrl.includes('tiktok.com')) {
      referer = 'https://www.tiktok.com/';
      // Use a high-end mobile agent for TikTok bypass
      userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
    } else if (videoUrl.includes('pinimg.com')) {
      referer = 'https://www.pinterest.com/';
    } else if (videoUrl.includes('fbcdn.net') || videoUrl.includes('facebook.com')) {
      referer = 'https://www.facebook.com/';
    } else if (videoUrl.includes('instagram.com')) {
      referer = 'https://www.instagram.com/';
    }

    const response = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream',
      timeout: 15000,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
        'Referer': referer,
        'sec-ch-ua-mobile': videoUrl.includes('tiktok') ? '?1' : '?0',
        'sec-ch-ua-platform': videoUrl.includes('tiktok') ? '"iOS"' : '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Upgrade-Insecure-Requests': '1',
        'Connection': 'keep-alive'
      }
    });

    // Final Content-Type Logic (Forces recognition)
    let contentType = response.headers['content-type'] || 'application/octet-stream';
    
    // If it's a generic stream but we have an extension in filename, force it
    if (contentType === 'application/octet-stream' || !contentType) {
      if (fileName.endsWith('.mp3')) contentType = 'audio/mpeg';
      else if (fileName.endsWith('.mp4')) contentType = 'video/mp4';
      else if (fileName.endsWith('.m4a')) contentType = 'audio/mp4';
      else if (fileName.endsWith('.webm')) contentType = 'video/webm';
    }

    const safeFallbackName = (fileName || 'viralauthoritypro_file.bin')
      .replace(/[^\x20-\x7E]/g, '_') 
      .replace(/["\\]/g, '');        
      
    const encodedName = encodeURIComponent(fileName || 'viralauthoritypro_file.bin');
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFallbackName}"; filename*=UTF-8''${encodedName}`);
    res.setHeader('Accept-Ranges', 'bytes');
    
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    response.data.pipe(res);
  } catch (error) {
    console.error("Streaming Proxy Error:", error.message);
    
    // EMERGENCY FALLBACK: If proxying fails, REDIRECT the user directly to the source.
    // This bypasses server restrictions by using the user's own IP and cookies.
    console.log("🚀 [ViralAuthority PRO PREMIUM Rescue] Proxy failed, redirecting user directly to source...");
    res.redirect(videoUrl);
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'ViralAuthority PRO PREMIUM Advanced Engine', timestamp: new Date() });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 ViralAuthority PRO PREMIUM Advanced Engine running at http://0.0.0.0:${port}`);
});
