import { app, BrowserWindow, shell } from "electron";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";
import * as net from "net";

const isDev = process.env.NODE_ENV !== "production";
const DEV_URL = process.env.DEV_URL ?? "http://localhost:3000";
const PROD_PORT = Number(process.env.PROD_PORT ?? 34567);
const PROD_HOST = "127.0.0.1";

let mainWindow: BrowserWindow | null = null;
let nextServer: ChildProcess | null = null;

/** 指定ポートが接続可能になるまで待機する。 */
function waitForPort(port: number, host: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect(port, host);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
        } else {
          setTimeout(tryOnce, 300);
        }
      });
    };
    tryOnce();
  });
}

/**
 * 本番モードで app/web の standalone サーバーを子プロセスとして起動する。
 * `next build`（output: "standalone"）で生成される server.js を実行する。
 */
async function startNextStandalone(): Promise<string> {
  const webDir = path.resolve(__dirname, "..", "..", "web");
  const serverJs = path.join(webDir, ".next", "standalone", "server.js");

  nextServer = spawn(process.execPath, [serverJs], {
    cwd: path.join(webDir, ".next", "standalone"),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PROD_PORT),
      HOSTNAME: PROD_HOST,
      // Functions バックエンドの URL（未指定ならローカル func）
      FUNCTIONS_BASE_URL: process.env.FUNCTIONS_BASE_URL ?? "http://localhost:7071",
    },
    stdio: "inherit",
    // Electron の同梱 Node ランタイムでスクリプトとして実行する
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  nextServer.on("exit", (code) => {
    console.log(`[next] standalone server exited: ${code}`);
  });

  await waitForPort(PROD_PORT, PROD_HOST);
  return `http://${PROD_HOST}:${PROD_PORT}`;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    title: "DurableFunctions HITL",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 外部リンクは既定ブラウザで開く
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const url = isDev ? DEV_URL : await startNextStandalone();
  await mainWindow.loadURL(url);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// アプリ終了時に Next サーバーを確実に停止
app.on("before-quit", () => {
  if (nextServer && !nextServer.killed) {
    nextServer.kill();
  }
});
