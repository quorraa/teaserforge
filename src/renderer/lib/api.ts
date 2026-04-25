import type {
  AppSettings,
  ExportBatchRequest,
  ExportProgressEvent,
  ExportResult,
  FfmpegStatus,
  MediaScanResult,
  ProjectConfig
} from '../../shared/types';
import { createDemoProject, createDemoScan } from './demoProject';

type TeaserForgeRendererApi = {
  selectProjectFolder: () => Promise<string | undefined>;
  selectOutputFolder: () => Promise<string | undefined>;
  scanProjectFolder: (rootPath: string) => Promise<MediaScanResult>;
  loadProjectConfig: (rootPath: string) => Promise<ProjectConfig>;
  saveProjectConfig: (project: ProjectConfig) => Promise<ProjectConfig>;
  getAppSettings: () => Promise<AppSettings>;
  saveAppSettings: (settings: AppSettings) => Promise<AppSettings>;
  checkFfmpeg: () => Promise<FfmpegStatus>;
  exportBatch: (request: ExportBatchRequest) => Promise<ExportResult[]>;
  onExportProgress: (callback: (event: ExportProgressEvent) => void) => () => void;
  mediaUrl: (filePath?: string) => string;
};

function browserFallbackApi(): TeaserForgeRendererApi {
  return {
    selectProjectFolder: async () => undefined,
    selectOutputFolder: async () => undefined,
    scanProjectFolder: async () => createDemoScan(),
    loadProjectConfig: async () => createDemoProject(),
    saveProjectConfig: async (project) => project,
    getAppSettings: async () => ({}),
    saveAppSettings: async (settings) => {
      localStorage.setItem('teaserforge.browserSettings', JSON.stringify(settings));
      return settings;
    },
    checkFfmpeg: async () => ({
      available: false,
      message: 'Open in Electron to use FFmpeg export.'
    }),
    exportBatch: async () => {
      throw new Error('Export is available in the Electron desktop app.');
    },
    onExportProgress: () => () => undefined,
    mediaUrl: () => ''
  };
}

export function isNativeTeaserForge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.teaserForge);
}

export const teaserForgeApi: TeaserForgeRendererApi =
  typeof window !== 'undefined' && window.teaserForge ? window.teaserForge : browserFallbackApi();
