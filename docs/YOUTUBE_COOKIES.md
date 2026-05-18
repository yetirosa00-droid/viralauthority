# YouTube Cookies Configuration (Netscape format)

To prevent anti-bot blocking (e.g. `Sign in to confirm you’re not a bot`, `HTTP Error 429: Too Many Requests`) when downloading or transcribing YouTube videos on a VPS, you can supply your personal/authenticated YouTube cookies.

> [!WARNING]
> YouTube cookies contain session credentials. Treat them like private passwords. **NEVER** commit cookie files to git or upload them to public/shared repositories.

---

## 📥 How to Export YouTube Cookies

1. Install a reliable, open-source cookie exporter browser extension:
   * **Get cookies.txt LOCALLY** (Chrome/Firefox/Brave)
   * **EditThisCookie** or similar Netscape-compatible cookie exporter.
2. Open [YouTube](https://www.youtube.com) in your browser and ensure you are logged in (you can use a burner/throwaway Google Account if desired).
3. Click the cookie exporter extension icon.
4. Select **Export** / **Export as Netscape format** or download the cookies as a text file.
5. Save the file.

---

## 🛠️ Installation on VPS

1. Upload the exported text file to your VPS target path:
   ```bash
   /var/www/viralauthoritypro/cookies/youtube.txt
   ```
2. Set strict secure permissions on the file so only root and the running app can access it:
   ```bash
   chmod 600 /var/www/viralauthoritypro/cookies/youtube.txt
   ```

---

## ⚙️ Configuration in Environment Variables

Your system looks for the cookies file path automatically using the `YTDLP_COOKIES_PATH` environment variable.

Add this line to your `/var/www/viralauthoritypro/.env` file on the VPS:
```env
YTDLP_COOKIES_PATH=/var/www/viralauthoritypro/cookies/youtube.txt
```

If the environment variable is configured and the file exists, the backend and transcription pipelines will automatically append `--cookies /var/www/viralauthoritypro/cookies/youtube.txt` to all `yt-dlp` commands, bypassing bot checks perfectly!
