import { contextBridge } from "electron";

/**
 * 最小のプリロード。
 * contextIsolation:true / nodeIntegration:false のセキュアな既定構成。
 * 現状 UI 側は Next.js の API ルート経由でバックエンドと通信するため、
 * ここで公開する API は最小限（将来の IPC 拡張余地としてのプレースホルダ）。
 */
contextBridge.exposeInMainWorld("desktop", {
  isElectron: true,
  platform: process.platform,
});
