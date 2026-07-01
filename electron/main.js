const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const fs = require("fs");
const http = require("http");

const execFileAsync = promisify(execFile);

const PORT = 3456;
let mainWindow = null;
let staticServer = null;

// --- Single instance lock ---
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const isDev = !app.isPackaged;

// Paths
const resourcesPath = isDev
  ? path.join(__dirname, "..")
  : process.resourcesPath;

const outDir = isDev
  ? path.join(__dirname, "..", "out")
  : path.join(resourcesPath, "out");

const whisperDir = isDev
  ? path.join(__dirname, "..", "resources", "whisper")
  : path.join(resourcesPath, "whisper");

const ffmpegDir = isDev
  ? path.join(__dirname, "..", "resources", "ffmpeg")
  : path.join(resourcesPath, "ffmpeg");

/* ------------------------------------------------------------------ */
/*  Minimal static file server (20 lines, zero deps, cannot crash)    */
/* ------------------------------------------------------------------ */
function startStaticServer() {
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ico": "image/x-icon",
  };

  staticServer = http.createServer((req, res) => {
    let urlPath = req.url.split("?")[0];
    if (urlPath === "/") urlPath = "/index.html";

    // Security: only serve files from outDir
    const filePath = path.normalize(path.join(outDir, urlPath));
    if (!filePath.startsWith(outDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream" });
      res.end(data);
    });
  });

  staticServer.listen(PORT, "127.0.0.1", () => {
    console.log(`[Vox] Static server on http://127.0.0.1:${PORT}`);
  });
}

/* ------------------------------------------------------------------ */
/*  Whisper transcription (local, no internet)                        */
/* ------------------------------------------------------------------ */
function findWhisperExe() {
  const candidates = [
    path.join(whisperDir, "whisper.exe"),
    path.join(whisperDir, "main.exe"),
    path.join(whisperDir, "whisper-cli.exe"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findModel() {
  const candidates = fs.existsSync(whisperDir)
    ? fs.readdirSync(whisperDir).filter(f => f.endsWith(".bin"))
    : [];
  if (candidates.length > 0) return path.join(whisperDir, candidates[0]);
  return null;
}

function findFfmpeg() {
  const exe = path.join(ffmpegDir, "ffmpeg.exe");
  return fs.existsSync(exe) ? exe : "ffmpeg";
}

function findFfprobe() {
  const exe = path.join(ffmpegDir, "ffprobe.exe");
  return fs.existsSync(exe) ? exe : "ffprobe";
}

async function getDuration(filePath) {
  const ffprobe = findFfprobe();
  const { stdout } = await execFileAsync(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ], { timeout: 15_000 });
  return parseFloat(stdout.trim());
}

async function convertToWav(inputPath, outputDir) {
  const outputPath = path.join(outputDir, "input.wav");
  await execFileAsync(findFfmpeg(), [
    "-y", "-i", inputPath,
    "-ar", "16000", "-ac", "1", "-sample_fmt", "s16",
    outputPath,
  ], { timeout: 120_000 });
  return outputPath;
}

async function runWhisper(wavPath, modelPath) {
  const whisperExe = findWhisperExe();
  const outputDir = path.join(path.dirname(wavPath), "whisper-out");
  fs.mkdirSync(outputDir, { recursive: true });

  const baseName = path.basename(wavPath, ".wav");

  await execFileAsync(whisperExe, [
    "-m", modelPath,
    "-f", wavPath,
    "-l", "ru",
    "--no-timestamps",
    "--output-format", "txt",
    "--output-dir", outputDir,
  ], {
    timeout: 600_000,
    maxBuffer: 50 * 1024 * 1024,
  });

  const txtPath = path.join(outputDir, `${baseName}.txt`);
  if (fs.existsSync(txtPath)) {
    return fs.readFileSync(txtPath, "utf8").trim();
  }
  return "";
}

/* ------------------------------------------------------------------ */
/*  IPC Handlers                                                      */
/* ------------------------------------------------------------------ */
function registerIpc() {
  ipcMain.handle("transcribe", async (_event, audioBase64, fileName) => {
    const tmpDir = path.join(app.getPath("temp"), "vox-" + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      // Save audio
      const ext = fileName.toLowerCase().endsWith(".wav") ? ".wav" : path.extname(fileName) || ".webm";
      const inputPath = path.join(tmpDir, `input${ext}`);
      fs.writeFileSync(inputPath, Buffer.from(audioBase64, "base64"));

      const startTime = Date.now();

      // Convert to WAV if needed
      let wavPath;
      if (ext !== ".wav") {
        wavPath = await convertToWav(inputPath, tmpDir);
      } else {
        wavPath = inputPath;
      }

      // Get duration
      let duration = 0;
      try { duration = await getDuration(wavPath); } catch {}

      // Find model
      const modelPath = findModel();
      if (!modelPath) {
        throw new Error("Модель распознавания не найдена. Переустановите приложение.");
      }

      // Run whisper
      const transcription = await runWhisper(wavPath, modelPath);
      const processingTime = Date.now() - startTime;

      if (!transcription) {
        return {
          success: true,
          transcription: "",
          wordCount: 0,
          processingTime,
          fileName,
          fileSize: Buffer.from(audioBase64, "base64").length,
          audioDuration: duration,
          message: "Речь не обнаружена в аудиофайле",
        };
      }

      return {
        success: true,
        transcription,
        wordCount: transcription.split(/\s+/).filter(Boolean).length,
        charCount: transcription.length,
        processingTime,
        fileName,
        fileSize: Buffer.from(audioBase64, "base64").length,
        audioDuration: duration,
      };
    } catch (err) {
      console.error("[Vox] Transcription error:", err);
      return {
        success: false,
        error: err.message || "Ошибка распознавания речи",
      };
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  ipcMain.handle("export-docx", async (_event, text, fileName) => {
    try {
      const { generateDocx } = require("./docx-gen");
      const docxBuffer = generateDocx(text, fileName);

      const base = (fileName || "transcription").replace(/\.[^.]+$/, "");
      const defaultName = `${base}_расшифровка.docx`;

      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName,
        filters: [{ name: "Word документ", extensions: ["docx"] }],
      });

      if (filePath) {
        fs.writeFileSync(filePath, docxBuffer);
        return { success: true, filePath };
      }
      return { success: false, error: "Сохранение отменено" };
    } catch (err) {
      console.error("[Vox] DOCX export error:", err);
      return { success: false, error: err.message };
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Window                                                            */
/* ------------------------------------------------------------------ */
function createWindow() {
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
  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  mainWindow.on("closed", () => { mainWindow = null; });
}

function showErrorPage(msg) {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    title: "Vox",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  Menu.setApplicationMenu(null);
  const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><style>
body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#111;color:#e5e5e5;font-family:system-ui,sans-serif}
.box{text-align:center;padding:48px;max-width:520px}
h1{color:#f87171;font-size:22px;margin-bottom:12px}
p{color:#a1a1aa;font-size:14px;line-height:1.6}
.hint{margin-top:24px;color:#71717a;font-size:12px}
</style></head><body><div class="box">
<h1>Vox — ошибка запуска</h1>
<p>${msg.replace(/</g, "&lt;")}</p>
<p class="hint">Попробуйте переустановить приложение.</p>
</div></body></html>`;
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

/* ------------------------------------------------------------------ */
/*  App lifecycle                                                     */
/* ------------------------------------------------------------------ */
app.whenReady().then(() => {
  // Check if out/ exists
  if (!fs.existsSync(path.join(outDir, "index.html"))) {
    showErrorPage("Файлы приложения не найдены. Переустановите.");
    return;
  }

  // Check if whisper exists
  const whisperExe = findWhisperExe();
  const modelPath = findModel();
  if (!whisperExe || !modelPath) {
    showErrorPage("Модель распознавания речи не найдена. Переустановите.");
    return;
  }

  registerIpc();
  startStaticServer();
  createWindow();
});

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("window-all-closed", () => {
  if (staticServer) { staticServer.close(); staticServer = null; }
  app.quit();
});

app.on("before-quit", () => {
  if (staticServer) { staticServer.close(); staticServer = null; }
});