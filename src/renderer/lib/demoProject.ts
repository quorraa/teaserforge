import type { FileTreeNode, MediaAsset, MediaScanResult, ProjectConfig } from '../../shared/types';
import { DEFAULT_PROJECT } from '../../shared/types';

const ROOT = 'F:\\OneDrive\\Music\\junglenostalgicbreakcore\\SPRING_CACHE_01';
const COVER = `${ROOT}\\COVER_ART`;
const VIDEO = `${ROOT}\\VIDEO_COVER_ART`;

const audioNames = [
  '[24bits]Fragments_v1.7.3.wav',
  'amen_grid_v1.2.wav',
  'BLUEALTAR_404.wav',
  'Eden.Login.wav',
  'heart_sync.dll.wav',
  'lost_signal.sys.wav',
  'midnight_uplink_alpha.wav',
  'midnight_uplink.wav'
];

const coverNames = [
  'amen_grid_v1.2_suno.png',
  'BLUEALTAR_404.png',
  'Eden.Login.png',
  'Eden.Login9x16.png',
  'fragments_v1.7.3_spotify.png',
  'fragments_v1.7.3_suno.png',
  'fragments9x16.png',
  'heart_sync.dll.png',
  'lost.signal.spotify.png',
  'lost.signal.suno.png',
  'midnight_uplink_alpha_suno.png',
  'midnight_uplink_suno.png',
  'Pearl.Login.png',
  'SPRING_CACHE_01.png'
];

const videoNames = [
  'BLUEALTAR_404.mp4',
  'Eden.Login9x16.mp4',
  'fragments_v1.7.3_suno.mp4',
  'heart_sync.dll.mp4',
  'lost.signal.suno-needsrework.mp4',
  'midnight_uplink_alpha_suno.mp4',
  'midnight_uplink_suno.mp4',
  'SPRING_CACHE_01.mp4'
];

function id(path: string): string {
  return btoa(path).replace(/[=/+]/g, '');
}

function asset(root: string, folderName: string, name: string, kind: MediaAsset['kind']): MediaAsset {
  const path = folderName === 'Root' ? `${root}\\${name}` : `${root}\\${folderName}\\${name}`;
  return {
    id: id(path),
    name,
    path,
    relativePath: folderName === 'Root' ? name : `${folderName}\\${name}`,
    extension: name.slice(name.lastIndexOf('.')).toLowerCase(),
    kind,
    size: 1024,
    mtimeMs: Date.now(),
    folderName
  };
}

function fileNode(mediaAsset: MediaAsset): FileTreeNode {
  return {
    id: mediaAsset.id,
    name: mediaAsset.name,
    path: mediaAsset.path,
    relativePath: mediaAsset.relativePath,
    kind: mediaAsset.kind,
    extension: mediaAsset.extension,
    size: mediaAsset.size,
    mtimeMs: mediaAsset.mtimeMs
  };
}

export function createDemoScan(): MediaScanResult {
  const audio = audioNames.map((name) => asset(ROOT, 'Root', name, 'audio'));
  const coverArt = coverNames.map((name) => asset(ROOT, 'COVER_ART', name, 'image'));
  const videoCoverArt = videoNames.map((name) => asset(ROOT, 'VIDEO_COVER_ART', name, 'video'));
  const tree: FileTreeNode = {
    id: id(ROOT),
    name: 'SPRING_CACHE_01',
    path: ROOT,
    relativePath: '',
    kind: 'folder',
    children: [
      {
        id: id(COVER),
        name: 'COVER_ART',
        path: COVER,
        relativePath: 'COVER_ART',
        kind: 'folder',
        children: coverArt.map(fileNode)
      },
      {
        id: id(VIDEO),
        name: 'VIDEO_COVER_ART',
        path: VIDEO,
        relativePath: 'VIDEO_COVER_ART',
        kind: 'folder',
        children: videoCoverArt.map(fileNode)
      },
      ...audio.map(fileNode)
    ]
  };

  return {
    rootPath: ROOT,
    rootName: 'SPRING_CACHE_01',
    scannedAt: new Date().toISOString(),
    tree,
    groups: {
      rootAudio: audio,
      audio,
      coverArt,
      videoCoverArt,
      images: coverArt,
      videos: videoCoverArt
    }
  };
}

export function createDemoProject(): ProjectConfig {
  const scan = createDemoScan();
  return {
    ...DEFAULT_PROJECT,
    rootPath: ROOT,
    selectedSongPath: scan.groups.rootAudio[6]?.path,
    coverArtPath: scan.groups.coverArt[10]?.path,
    videoCoverPath: scan.groups.videoCoverArt[5]?.path,
    title: 'SPRING_CACHE_01',
    subtitle: 'midnight_uplink_alpha',
    updatedAt: new Date().toISOString()
  };
}
