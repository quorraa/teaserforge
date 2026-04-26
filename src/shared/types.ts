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
export type MediaFitMode = 'fit' | 'fill' | 'contain';
export type PositionPreset = 'top-left' | 'top-center' | 'center' | 'bottom-left' | 'bottom-center';

export interface EffectSettings {
  enabled: boolean;
  intensity: number;
}

export interface MediaTransform {
  positionX: number;
  positionY: number;
  scale: number;
  rotation: number;
  fitMode: MediaFitMode;
}

export interface TextLayerTransform {
  x: number;
  y: number;
}

export interface TextTransform {
  title: TextLayerTransform;
  subtitle: TextLayerTransform;
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
  mediaTransforms: Record<AspectRatioKey, MediaTransform>;
  textTransforms: Record<AspectRatioKey, TextTransform>;
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
  fadeInDuration: number;
  fadeOutDuration: number;
  fadeDurationsLinked: boolean;
  audioGain: number;
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

export type TimelineTrackId = 'text' | 'cover' | 'video' | 'effects';
export type TimelineClipKind = 'title' | 'subtitle' | 'cover-art' | 'video-cover' | 'effect';

export interface TimelineTrackState {
  visible: boolean;
  muted: boolean;
  locked: boolean;
}

export interface TimelineClip {
  id: string;
  track: TimelineTrackId;
  kind: TimelineClipKind;
  label: string;
  start: number;
  end: number;
  enabled: boolean;
  effectKey?: keyof TeaserSettings['effects'];
}

export interface TimelineExportMarker {
  id: string;
  aspect: AspectRatioKey;
  label: string;
  start: number;
  end: number;
}

export interface TimelineSelection {
  type: 'clip' | 'clips' | 'export-marker' | 'export-range';
  id?: string;
  ids?: string[];
}

export interface TimelineState {
  clips: TimelineClip[];
  exportMarkers: TimelineExportMarker[];
  tracks: Record<TimelineTrackId, TimelineTrackState>;
  beatMarkers: number[];
  selected?: TimelineSelection;
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
  timeline: TimelineState;
  updatedAt: string;
}

export interface AppSettings {
  ffmpegPath?: string;
  lastProjectPath?: string;
  recentProjects?: string[];
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

export const DEFAULT_MEDIA_TRANSFORMS: Record<AspectRatioKey, MediaTransform> = {
  '9x16': { positionX: 50, positionY: 50, scale: 1, rotation: 0, fitMode: 'fit' },
  '1x1': { positionX: 50, positionY: 50, scale: 1, rotation: 0, fitMode: 'fit' },
  '16x9': { positionX: 50, positionY: 50, scale: 1, rotation: 0, fitMode: 'fit' }
};

export const DEFAULT_TEXT_TRANSFORMS: Record<AspectRatioKey, TextTransform> = {
  '9x16': { title: { x: 50, y: 72 }, subtitle: { x: 50, y: 81 } },
  '1x1': { title: { x: 50, y: 66 }, subtitle: { x: 50, y: 76 } },
  '16x9': { title: { x: 50, y: 62 }, subtitle: { x: 50, y: 73 } }
};

export const DEFAULT_TRACKS: Record<TimelineTrackId, TimelineTrackState> = {
  text: { visible: true, muted: false, locked: false },
  cover: { visible: true, muted: false, locked: false },
  video: { visible: true, muted: false, locked: false },
  effects: { visible: true, muted: false, locked: false }
};

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
  mediaTransforms: DEFAULT_MEDIA_TRANSFORMS,
  textTransforms: DEFAULT_TEXT_TRANSFORMS,
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
  fadeInDuration: 0.4,
  fadeOutDuration: 0.4,
  fadeDurationsLinked: true,
  audioGain: 1,
  regionStart: 0,
  regionEnd: 15,
  loopRegion: false,
  playSelectedRegion: false,
  progressBar: true,
  exportQuality: 'high-1080p',
  frameRate: 30,
  exportFormat: 'h264-mp4'
};

export const DEFAULT_TIMELINE: TimelineState = {
  clips: [
    { id: 'clip-title', track: 'text', kind: 'title', label: 'Title', start: 0, end: 8.2, enabled: true },
    { id: 'clip-subtitle', track: 'text', kind: 'subtitle', label: 'Subtitle / Artist', start: 8.8, end: 15, enabled: true },
    { id: 'clip-cover-a', track: 'cover', kind: 'cover-art', label: 'Cover art', start: 0.6, end: 5.2, enabled: true },
    { id: 'clip-cover-b', track: 'cover', kind: 'cover-art', label: 'Cover art', start: 5.8, end: 10.4, enabled: true },
    { id: 'clip-cover-c', track: 'cover', kind: 'cover-art', label: 'Cover art', start: 11.2, end: 14.7, enabled: true },
    { id: 'clip-video-a', track: 'video', kind: 'video-cover', label: 'Video cover', start: 0.4, end: 4.8, enabled: true },
    { id: 'clip-video-b', track: 'video', kind: 'video-cover', label: 'Video cover', start: 5.4, end: 9.6, enabled: true },
    { id: 'clip-video-c', track: 'video', kind: 'video-cover', label: 'Video cover', start: 10.2, end: 14.7, enabled: true },
    { id: 'clip-effect-particles', track: 'effects', kind: 'effect', label: 'Particles', start: 1.2, end: 2.6, enabled: true, effectKey: 'particles' },
    { id: 'clip-effect-scanlines', track: 'effects', kind: 'effect', label: 'Scanlines', start: 3.4, end: 4.5, enabled: true, effectKey: 'scanlines' },
    { id: 'clip-effect-light-sweep', track: 'effects', kind: 'effect', label: 'Light Sweep', start: 5.5, end: 6.7, enabled: true, effectKey: 'lightSweep' },
    { id: 'clip-effect-bloom', track: 'effects', kind: 'effect', label: 'Bloom Pulse', start: 7.4, end: 8.7, enabled: true, effectKey: 'bloomPulse' },
    { id: 'clip-effect-chroma', track: 'effects', kind: 'effect', label: 'Chromatic Aberration', start: 9.5, end: 11, enabled: true, effectKey: 'chromaticAberration' }
  ],
  tracks: DEFAULT_TRACKS,
  beatMarkers: [],
  exportMarkers: [
    { id: 'export-9x16', aspect: '9x16', label: '9:16 Export', start: 0, end: 15 },
    { id: 'export-1x1', aspect: '1x1', label: '1:1 Export', start: 0, end: 15 },
    { id: 'export-16x9', aspect: '16x9', label: '16:9 Export', start: 0, end: 15 }
  ]
};

export const DEFAULT_PROJECT: ProjectConfig = {
  schemaVersion: 1,
  title: '',
  subtitle: '',
  pairings: {},
  settings: DEFAULT_SETTINGS,
  timeline: DEFAULT_TIMELINE,
  updatedAt: new Date(0).toISOString()
};
