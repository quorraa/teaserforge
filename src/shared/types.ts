export type AssetKind = 'folder' | 'audio' | 'image' | 'video' | 'other';

export type AspectRatioKey = '9x16' | '1x1' | '16x9';

export interface AspectRatioPreset {
  key: AspectRatioKey;
  label: string;
  width: number;
  height: number;
}

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  kind: AssetKind;
  extension?: string;
  size?: number;
  mtimeMs?: number;
  children?: FileTreeNode[];
}

export interface MediaAsset {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  extension: string;
  kind: Exclude<AssetKind, 'folder'>;
  size: number;
  mtimeMs: number;
  folderName: string;
}

export interface MediaGroups {
  rootAudio: MediaAsset[];
  coverArt: MediaAsset[];
  videoCoverArt: MediaAsset[];
  images: MediaAsset[];
  videos: MediaAsset[];
  audio: MediaAsset[];
}

export interface MediaScanResult {
  rootPath: string;
  rootName: string;
  scannedAt: string;
  tree: FileTreeNode;
  groups: MediaGroups;
}

export interface AssetPairing {
  songPath: string;
  coverArtPath?: string;
  videoCoverPath?: string;
  updatedAt: string;
}

export interface MatchCandidate {
  asset: MediaAsset;
  score: number;
  reason: string;
}

export type TextAnimationPreset =
  | 'none'
  | 'fade-in'
  | 'glitch-slide-up'
  | 'soft-login'
  | 'signal-restore'
  | 'memory-bloom';

export type WaveformStyle = 'minimal' | 'neon' | 'pixel' | 'glass';
export type ExportQuality = 'draft' | 'high-1080p' | 'master';
export type ExportFormat = 'h264-mp4' | 'prores-mov';
export type BackgroundType = 'static-cover' | 'video-cover' | 'hybrid';
export type PositionPreset = 'top-left' | 'top-center' | 'center' | 'bottom-left' | 'bottom-center';

export interface EffectSettings {
  enabled: boolean;
  intensity: number;
}

export interface TeaserSettings {
  teaserDuration: number;
  startOffset: number;
  endOffset: number;
  loop: boolean;
  primaryAspect: AspectRatioKey;
  showGrid: boolean;
  showSafeArea: boolean;
  titleVisible: boolean;
  subtitleVisible: boolean;
  fontFamily: string;
  fontSize: number;
  positionPreset: PositionPreset;
  glowAmount: number;
  letterSpacing: number;
  textAnimation: TextAnimationPreset;
  backgroundType: BackgroundType;
  effects: {
    particles: EffectSettings;
    scanlines: EffectSettings;
    lightSweep: EffectSettings;
    bloomPulse: EffectSettings;
    vhsNoise: EffectSettings;
    chromaticAberration: EffectSettings;
    uiFlicker: EffectSettings;
  };
  videoLoopMode: 'loop' | 'trim' | 'freeze-last-frame';
  waveformDisplay: boolean;
  waveformStyle: WaveformStyle;
  normalizeAudio: boolean;
  fadeAudio: boolean;
  fadeDuration: number;
  regionStart: number;
  regionEnd: number;
  loopRegion: boolean;
  playSelectedRegion: boolean;
  progressBar: boolean;
  exportQuality: ExportQuality;
  frameRate: 24 | 30 | 60;
  exportFormat: ExportFormat;
  outputFolder?: string;
}

export interface ProjectConfig {
  schemaVersion: 1;
  rootPath?: string;
  title: string;
  subtitle: string;
  selectedSongPath?: string;
  coverArtPath?: string;
  videoCoverPath?: string;
  pairings: Record<string, AssetPairing>;
  settings: TeaserSettings;
  updatedAt: string;
}

export interface AppSettings {
  ffmpegPath?: string;
  lastProjectPath?: string;
}

export interface ExportTarget {
  aspect: AspectRatioKey;
  width: number;
  height: number;
}

export interface ExportRequest {
  project: ProjectConfig;
  target: ExportTarget;
}

export interface ExportBatchRequest {
  project: ProjectConfig;
  targets: ExportTarget[];
}

export type ExportJobStatus = 'queued' | 'running' | 'complete' | 'failed';

export interface ExportProgressEvent {
  id: string;
  aspect: AspectRatioKey;
  status: ExportJobStatus;
  percent: number;
  message: string;
  outputPath?: string;
}

export interface ExportResult {
  id: string;
  aspect: AspectRatioKey;
  outputPath?: string;
  success: boolean;
  log: string;
}

export interface FfmpegStatus {
  available: boolean;
  path?: string;
  version?: string;
  message: string;
}

export const ASPECT_RATIOS: AspectRatioPreset[] = [
  { key: '9x16', label: 'Portrait 9:16', width: 1080, height: 1920 },
  { key: '1x1', label: 'Square 1:1', width: 1080, height: 1080 },
  { key: '16x9', label: 'Landscape 16:9', width: 1920, height: 1080 }
];

export const DEFAULT_SETTINGS: TeaserSettings = {
  teaserDuration: 15,
  startOffset: 0,
  endOffset: 15,
  loop: true,
  primaryAspect: '9x16',
  showGrid: false,
  showSafeArea: true,
  titleVisible: true,
  subtitleVisible: true,
  fontFamily: 'Inter, Segoe UI, sans-serif',
  fontSize: 54,
  positionPreset: 'bottom-center',
  glowAmount: 32,
  letterSpacing: 0,
  textAnimation: 'glitch-slide-up',
  backgroundType: 'video-cover',
  effects: {
    particles: { enabled: true, intensity: 0.35 },
    scanlines: { enabled: true, intensity: 0.25 },
    lightSweep: { enabled: true, intensity: 0.2 },
    bloomPulse: { enabled: true, intensity: 0.35 },
    vhsNoise: { enabled: false, intensity: 0.2 },
    chromaticAberration: { enabled: true, intensity: 0.2 },
    uiFlicker: { enabled: false, intensity: 0.15 }
  },
  videoLoopMode: 'loop',
  waveformDisplay: true,
  waveformStyle: 'neon',
  normalizeAudio: false,
  fadeAudio: true,
  fadeDuration: 0.4,
  regionStart: 0,
  regionEnd: 15,
  loopRegion: false,
  playSelectedRegion: false,
  progressBar: true,
  exportQuality: 'high-1080p',
  frameRate: 30,
  exportFormat: 'h264-mp4'
};

export const DEFAULT_PROJECT: ProjectConfig = {
  schemaVersion: 1,
  title: 'SPRING_CACHE_01',
  subtitle: 'midnight_uplink_alpha',
  pairings: {},
  settings: DEFAULT_SETTINGS,
  updatedAt: new Date(0).toISOString()
};
