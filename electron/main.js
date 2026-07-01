const { app, BrowserWindow, Menu } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORT = 3456;
let mainWindow = null;
let serverProcess = null;
let errorShown = false;

// --- Single instance lock (prevent hundreds of windows) ---
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

const isDev = !app.isPackaged;

const standaloneDir = isDev
  ? path.join(__dirname, "..", ".next", "standalone")
  : path.join(process.resourcesPath, "standalone");

const ffmpegDir = isDev
  ? path.join(__dirname, "..", "resources", "ffmpeg")
  : path.join(process.resourcesPath, "ffmpeg");

function resolveFfmpeg() {
  const ffmpegExe = path.join(ffmpegDir, "ffmpeg.exe");
  const ffprobeExe = path.join(ffmpegDir, "ffprobe.exe");
  if (fs.existsSync(ffmpegExe) && fs.existsSync(ffprobeExe)) {
    return { ffmpeg: ffmpegExe, ffprobe: ffprobeExe };
  }
  return null;
}

function startServer() {
  const serverScript = path.join(standaloneDir, "server.js");

  if (!fs.existsSync(serverScript)) {
    console.error(`[Vox] Server script not found: ${serverScript}`);
    return false;
  }

  const ffmpegPaths = resolveFfmpeg();

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    HOSTNAME: "127.0.0.1",
  };

  if (ffmpegPaths) {
    env.VOX_FFMPEG_PATH = ffmpegPaths.ffmpeg;
    env.VOX_FFPROBE_PATH = ffmpegPaths.ffprobe;
    console.log(`[Vox] Bundled ffmpeg: ${ffmpegPaths.ffmpeg}`);
  }

  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: standaloneDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", (data) => {
    console.log(`[Server] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on("data", (data) => {
    console.error(`[Server] ${data.toString().trim()}`);
  });

  serverProcess.on("error", (err) => {
    console.error(`[Vox] Failed to spawn server: ${err.message}`);
  });

  serverProcess.on("close", (code) => {
    console.log(`[Vox] Server exited with code ${code}`);
    serverProcess = null;
  });

  return true;
}

function createWindow(errorMsg) {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    title: "Vox",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);

  if (errorMsg) {
    // Show error as a nice HTML page inside the window (no system dialog spam)
    const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<style>
  body { margin:0; display:flex; align-items:center; justify-content:center; height:100vh;
    background:#111; color:#e5e5e5; font-family:system-ui,-apple-system,sans-serif; }
  .box { text-align:center; padding:48px; max-width:480px; }
  h1 { color:#f87171; font-size:24px; margin-bottom:12px; }
  p { color:#a1a1aa; font-size:14px; line-height:1.6; }
  .hint { margin-top:24px; color:#71717a; font-size:12px; }
</style></head><body>
<div class="box">
  <h1>Vox — ошибка запуска</h1>
  <p>${errorMsg.replace(/</g, "&lt;")}</p>
  <p class="hint">Попробуйте переустановить приложение.</p>
</div></body></html>`;
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function waitForServer(maxRetries = 90, interval = 500) {
  return new Promise((resolve, reject) => {
    const http = require("http");
    let retries = 0;

    const check = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      });

      req.on("error", () => retry());
      req.setTimeout(300, () => { req.destroy(); retry(); });
    };

    const retry = () => {
      retries++;
      if (retries >= maxRetries) {
        reject(new Error("Сервер не смог запуститься (таймаут)"));
        return;
      }
      setTimeout(check, interval);
    };

    check();
  });
}

function killServer() {
  if (serverProcess) {
    try {
      serverProcess.kill(); // default signal — works on Windows
    } catch (_) {}
    serverProcess = null;
  }
}

// --- App lifecycle ---

app.whenReady().then(async () => {
  try {
    const started = startServer();
    if (!started) {
      throw new Error("Файл сервера не найден. Попробуйте переустановить.");
    }
    await waitForServer();
    createWindow(null);
  } catch (err) {
    console.error("[Vox] Startup failed:", err.message);
    killServer();
    createWindow(err.message);
  }
});

// If a second instance is launched, focus the existing window
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("window-all-closed", () => {
  killServer();
  app.quit();
});

app.on("before-quit", () => {
  killServer();
});