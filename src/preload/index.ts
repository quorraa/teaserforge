import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSettings,
  ExportBatchRequest,
  ExportProgressEvent,
  ExportResult,
  FfmpegStatus,
  MediaScanResult,
  ProjectConfig
} from '../shared/types';

export interface TeaserForgeApi {
  selectProjectFolder: () => Promise<string | undefined>;
  selectOutputFolder: () => Promise<string | undefined>;
  selectMediaFile: () => Promise<string | undefined>;
  openPath: (targetPath: string) => Promise<string>;
  scanProjectFolder: (rootPath: string) => Promise<MediaScanResult>;
  loadProjectConfig: (rootPath: string) => Promise<ProjectConfig>;
  saveProjectConfig: (project: ProjectConfig) => Promise<ProjectConfig>;
  getAppSettings: () => Promise<AppSettings>;
  saveAppSettings: (settings: AppSettings) => Promise<AppSettings>;
  checkFfmpeg: () => Promise<FfmpegStatus>;
  exportBatch: (request: ExportBatchRequest) => Promise<ExportResult[]>;
  cancelExports: () => Promise<boolean>;
  onExportProgress: (callback: (event: ExportProgressEvent) => void) => () => void;
  mediaUrl: (filePath?: string) => string;
}

const api: TeaserForgeApi = {
  selectProjectFolder: () => ipcRenderer.invoke('filesystem:selectProjectFolder'),
  selectOutputFolder: () => ipcRenderer.invoke('filesystem:selectOutputFolder'),
  selectMediaFile: () => ipcRenderer.invoke('filesystem:selectMediaFile'),
  openPath: (targetPath) => ipcRenderer.invoke('filesystem:openPath', targetPath),
  scanProjectFolder: (rootPath) => ipcRenderer.invoke('filesystem:scanProjectFolder', rootPath),
  loadProjectConfig: (rootPath) => ipcRenderer.invoke('filesystem:loadProjectConfig', rootPath),
  saveProjectConfig: (project) => ipcRenderer.invoke('filesystem:saveProjectConfig', project),
  getAppSettings: () => ipcRenderer.invoke('filesystem:getAppSettings'),
  saveAppSettings: (settings) => ipcRenderer.invoke('filesystem:saveAppSettings', settings),
  checkFfmpeg: () => ipcRenderer.invoke('export:checkFfmpeg'),
  exportBatch: (request) => ipcRenderer.invoke('export:runBatch', request),
  cancelExports: () => ipcRenderer.invoke('export:cancelAll'),
  onExportProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ExportProgressEvent) => callback(progress);
    ipcRenderer.on('export:progress', listener);
    return () => ipcRenderer.removeListener('export:progress', listener);
  },
  mediaUrl: (filePath) => (filePath ? `teaserforge://media?path=${encodeURIComponent(filePath)}` : '')
};

contextBridge.exposeInMainWorld('teaserForge', api);

declare global {
  interface Window {
    teaserForge: TeaserForgeApi;
  }
}
