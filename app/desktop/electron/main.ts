import { app, BrowserWindow, shell } from "electron";
import * as path from "path";

// 「薄いシェル」方式:
// - 開発時: ローカルの Next.js dev サーバー（http://localhost:3000）を読み込む
// - 本番時: Azure Container Apps にデプロイ済みの Web URL を読み込む
// デスクトップ側はウィンドウ表示に徹し、更新は Web デプロイだけで完結する。

const isDev = process.env.NODE_ENV !== "production";
const DEV_URL = process.env.DEV_URL ?? "http://localhost:3000";

// デプロイ済み Web（Azure Container Apps）の既定 URL。環境変数 WEB_URL で上書き可能。
const DEFAULT_WEB_URL =
  "https://maf-web-kyyxw.bravesky-7894b180.eastus.azurecontainerapps.io";
const WEB_URL = process.env.WEB_URL ?? DEFAULT_WEB_URL;

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 860,
    title: "Durable Functions & Agent Framework",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 外部リンク（target=_blank 等）は既定ブラウザで開く
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const url = isDev ? DEV_URL : WEB_URL;
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
