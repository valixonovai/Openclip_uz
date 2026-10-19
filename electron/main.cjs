const { app, BrowserWindow, dialog, ipcMain, protocol, net } = require("electron");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

protocol.registerSchemesAsPrivileged([
  { scheme: "uzclip-media", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let mainWindow;
let worker;
let stdoutBuffer = "";
let workerReady = false;
const pending = new Map();
const queued = [];
const mediaTokens = new Map();

function workerPaths() {
  if (app.isPackaged) {
    const executable = process.platform === "win32" ? "uzclip-worker.exe" : "uzclip-worker";
    return {
      executable: path.join(process.resourcesPath, "worker", "uzclip-worker", executable),
      script: null,
      cwd: process.resourcesPath,
    };
  }
  const root = path.join(__dirname, "..");
  const venvPython = path.join(root, ".venv", process.platform === "win32" ? "Scripts" : "bin", process.platform === "win32" ? "python.exe" : "python");
  return {
    executable: fs.existsSync(venvPython) ? venvPython : (process.platform === "win32" ? "python" : "python3"),
    script: path.join(root, "worker", "main.py"),
    cwd: root,
  };
}

function workerEnvironment() {
  const dataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return {
    ...process.env,
    UZCLIP_DATA_DIR: dataDir,
    UZCLIP_FFMPEG: process.env.UZCLIP_FFMPEG || "ffmpeg",
    UZCLIP_FFPROBE: process.env.UZCLIP_FFPROBE || "ffprobe",
  };
}

function startWorker() {
  if (worker && worker.exitCode === null) return;
  const paths = workerPaths();
  const args = app.isPackaged ? [] : ["-u", paths.script];
  const executable = !app.isPackaged && process.env.PYTHON ? process.env.PYTHON : paths.executable;
  worker = spawn(executable, args, { cwd: paths.cwd, env: workerEnvironment() });
  worker.stdout.setEncoding("utf8");
  worker.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        handleWorkerMessage(JSON.parse(line));
      } catch (error) {
        console.error("Ignoring invalid worker message:", error.message);
      }
    }
  });
  worker.stderr.setEncoding("utf8");
  worker.stderr.on("data", (chunk) => console.error("[worker]", chunk.trimEnd()));
  worker.on("error", (error) => {
    workerReady = false;
    rejectPending("Worker failed to start: " + error.message);
  });
  worker.on("exit", (code, signal) => {
    workerReady = false;
    rejectPending("Worker stopped (" + (code ?? signal ?? "unknown") + ").");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("worker:event", {
        event: "runtime.worker-stopped",
        data: { code, signal },
      });
    }
  });
}

function handleWorkerMessage(message) {
  if (message.type === "ready") {
    workerReady = true;
    while (queued.length) worker.stdin.write(JSON.stringify(queued.shift()) + "\n");
    return;
  }
  if (message.type === "response" && pending.has(message.id)) {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.ok) entry.resolve(message.result);
    else entry.reject(new Error(message.error?.message || "Local worker request failed."));
    return;
  }
  if (message.type === "event" && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("worker:event", {
      event: message.event,
      data: message.data,
    });
  }
}

function rejectPending(reason) {
  for (const [id, entry] of pending) {
    clearTimeout(entry.timer);
    entry.reject(new Error(reason));
    pending.delete(id);
  }
}

function requestWorker(method, params = {}, timeoutMs = 120000) {
  startWorker();
  const message = { id: randomUUID(), method, params };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(message.id);
      reject(new Error("Local worker did not respond in time."));
    }, timeoutMs);
    pending.set(message.id, { resolve, reject, timer });
    if (workerReady) worker.stdin.write(JSON.stringify(message) + "\n");
    else queued.push(message);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: "#101116",
    title: "UzClip AI",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (!app.isPackaged && process.argv.includes("--dev-server")) {
    mainWindow.loadURL("http://127.0.0.1:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  protocol.handle("uzclip-media", async (request) => {
    const token = new URL(request.url).pathname.slice(1);
    const mediaPath = mediaTokens.get(token);
    if (!mediaPath) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(mediaPath).toString());
  });
  startWorker();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  if (worker && worker.exitCode === null) worker.kill();
});

ipcMain.handle("dialog:open-video", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Videoni tanlang / Select a video",
    properties: ["openFile"],
    filters: [
      { name: "Video", extensions: ["mp4", "mov", "mkv", "webm", "m4v", "avi"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("dialog:save-video", async (_event, suggestedName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Klipni eksport qilish / Export clip",
    defaultPath: suggestedName || "uzclip-short.mp4",
    buttonLabel: "Eksport / Export",
    filters: [{ name: "MP4 video", extensions: ["mp4"] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle("media:url", async (_event, projectId) => {
  const project = await requestWorker("projects.get", { project_id: projectId });
  const token = randomUUID();
  if (mediaTokens.size > 50) mediaTokens.delete(mediaTokens.keys().next().value);
  mediaTokens.set(token, project.source_path);
  return "uzclip-media://video/" + token;
});

ipcMain.handle("worker:request", async (_event, payload) => {
  if (!payload || typeof payload.method !== "string") throw new Error("Invalid worker method.");
  const allowed = new Set([
    "runtime.status", "projects.list", "projects.import", "projects.get", "projects.delete",
    "models.status", "models.install", "transcription.start", "transcript.update", "jobs.cancel",
    "clips.render", "clips.update",
  ]);
  if (!allowed.has(payload.method)) throw new Error("This local worker method is not allowed.");
  const timeout = payload.method === "models.install" ? 1800000 : 120000;
  return requestWorker(payload.method, payload.params || {}, timeout);
});
