const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const TEST_URLS = [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://youtu.be/dQw4w9WgXcQ",
  "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  "https://www.tiktok.com/@khaby.lame/video/7311111111111111111",
  "https://vm.tiktok.com/ZM.../",
  "https://www.instagram.com/reel/C1.../",
  "https://x.com/elonmusk/status/17.../"
];

async function runTests() {
  console.log("🚀 Starting Production Environment Check...");

  // 1. Check Binaries
  console.log("\n--- Binary Checks ---");
  const binaries = ['yt-dlp', 'ffmpeg'];
  for (const bin of binaries) {
    try {
      const { stdout } = await execPromise(`${bin} --version`).catch(() => execPromise(`which ${bin}`));
      console.log(`✅ ${bin} found: ${stdout.trim().split('\n')[0]}`);
    } catch (err) {
      console.error(`❌ ${bin} NOT FOUND in PATH. You may need to install it.`);
    }
  }

  // 2. Check Node versions
  console.log("\n--- System Info ---");
  console.log(`Node version: ${process.version}`);
  console.log(`Platform: ${process.platform}`);

  // 3. Test yt-dlp metadata fetch (Simulated)
  console.log("\n--- Metadata Fetch Test (YouTube) ---");
  const ytUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  try {
    console.log(`Testing yt-dlp info for: ${ytUrl}`);
    const { stdout } = await execPromise(`yt-dlp --dump-json --skip-download "${ytUrl}"`);
    const data = JSON.parse(stdout);
    console.log(`✅ Success! Title: ${data.title}`);
    console.log(`✅ Extractor: ${data.extractor}`);
  } catch (err) {
    console.error(`❌ yt-dlp metadata fetch failed:`, err.message);
    if (err.stderr) console.error(`Stderr: ${err.stderr}`);
  }

  console.log("\n--- Done ---");
}

runTests();
