const { app, BrowserWindow, Menu } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORT = 3456;
let mainWindow = null;
let serverProcess = null;

const isDev = !app.isPackaged;
// In packaged app: standalone server is in resources/standalone
// In dev: it's in .next/standalone
const standaloneDir = isDev
  ? path.join(__dirname, "..", ".next", "standalone")
  : path.join(process.resourcesPath, "standalone");

/**
 * Start the Next.js standalone server as a child process.
 */
function startServer() {
  const serverScript = path.join(standaloneDir, "server.js");

  if (!fs.existsSync(serverScript)) {
    console.error(`Server script not found: ${serverScript}`);
    app.quit();
    return;
  }

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    HOSTNAME: "127.0.0.1",
  };

  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: standaloneDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[Server] ${msg}`);
  });

  serverProcess.stderr.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[Server] ${msg}`);
  });

  serverProcess.on("close", (code) => {
    console.log(`Server exited with code ${code}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });
}

/**
 * Create the main browser window.
 */
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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Wait for the server to be ready by polling the URL.
 */
function waitForServer(maxRetries = 40, interval = 500) {
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
        reject(new Error("Server failed to start"));
        return;
      }
      setTimeout(check, interval);
    };

    check();
  });
}

// --- App lifecycle ---

app.whenReady().then(async () => {
  try {
    startServer();
    await waitForServer();
    createWindow();
  } catch (err) {
    console.error("Failed to start:", err);
    const { dialog } = require("electron");
    dialog.showErrorBox(
      "Vox — Ошибка запуска",
      "Не удалось запустить сервер.\nУбедитесь, что ffmpeg установлен.\n\n" + err.message
    );
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (serverProcess) { serverProcess.kill("SIGTERM"); serverProcess = null; }
  app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) { serverProcess.kill("SIGTERM"); serverProcess = null; }
});