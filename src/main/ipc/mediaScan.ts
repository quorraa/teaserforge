import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AssetKind, FileTreeNode, MediaAsset, MediaGroups, MediaScanResult } from '../../shared/types';

const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.flac', '.m4a', '.aac', '.ogg']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);
const SKIPPED_DIRS = new Set(['node_modules', '.git', 'out', 'dist', '.vite']);

function toId(filePath: string): string {
  return Buffer.from(filePath).toString('base64url');
}

function classify(fileName: string, isDirectory: boolean): AssetKind {
  if (isDirectory) return 'folder';
  const extension = path.extname(fileName).toLowerCase();
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  return 'other';
}

function folderName(rootPath: string, filePath: string): string {
  const relativePath = path.relative(rootPath, filePath);
  const segments = relativePath.split(path.sep);
  return segments.length > 1 ? segments[0] : 'Root';
}

function createGroups(): MediaGroups {
  return {
    rootAudio: [],
    coverArt: [],
    videoCoverArt: [],
    images: [],
    videos: [],
    audio: []
  };
}

function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes.sort((left, right) => {
    if (left.kind === 'folder' && right.kind !== 'folder') return -1;
    if (left.kind !== 'folder' && right.kind === 'folder') return 1;
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function pushAsset(groups: MediaGroups, rootPath: string, node: FileTreeNode): void {
  if (node.kind !== 'audio' && node.kind !== 'image' && node.kind !== 'video') return;

  const asset: MediaAsset = {
    id: node.id,
    name: node.name,
    path: node.path,
    relativePath: node.relativePath,
    extension: node.extension ?? '',
    kind: node.kind,
    size: node.size ?? 0,
    mtimeMs: node.mtimeMs ?? 0,
    folderName: folderName(rootPath, node.path)
  };

  if (asset.kind === 'audio') {
    groups.audio.push(asset);
    if (!asset.relativePath.includes(path.sep) && !asset.relativePath.includes('/')) {
      groups.rootAudio.push(asset);
    }
  }

  if (asset.kind === 'image') {
    groups.images.push(asset);
    if (asset.folderName.toUpperCase() === 'COVER_ART') {
      groups.coverArt.push(asset);
    }
  }

  if (asset.kind === 'video') {
    groups.videos.push(asset);
    if (asset.folderName.toUpperCase() === 'VIDEO_COVER_ART') {
      groups.videoCoverArt.push(asset);
    }
  }
}

async function walk(rootPath: string, currentPath: string, groups: MediaGroups): Promise<FileTreeNode> {
  const stat = await fs.stat(currentPath);
  const name = path.basename(currentPath);
  const isDirectory = stat.isDirectory();
  const node: FileTreeNode = {
    id: toId(currentPath),
    name,
    path: currentPath,
    relativePath: path.relative(rootPath, currentPath),
    kind: classify(name, isDirectory),
    extension: isDirectory ? undefined : path.extname(name).toLowerCase(),
    size: isDirectory ? undefined : stat.size,
    mtimeMs: stat.mtimeMs
  };

  if (isDirectory) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const children: FileTreeNode[] = [];
    for (const entry of entries) {
      if (entry.isDirectory() && SKIPPED_DIRS.has(entry.name)) continue;
      children.push(await walk(rootPath, path.join(currentPath, entry.name), groups));
    }
    node.children = sortTree(children);
    return node;
  }

  pushAsset(groups, rootPath, node);
  return node;
}

function sortAssets(assets: MediaAsset[]): MediaAsset[] {
  return assets.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
}

export async function scanProjectFolder(rootPath: string): Promise<MediaScanResult> {
  const stat = await fs.stat(rootPath);
  if (!stat.isDirectory()) {
    throw new Error('Selected project path is not a folder.');
  }

  const groups = createGroups();
  const tree = await walk(rootPath, rootPath, groups);

  for (const assets of Object.values(groups)) {
    sortAssets(assets);
  }

  return {
    rootPath,
    rootName: path.basename(rootPath),
    scannedAt: new Date().toISOString(),
    tree,
    groups
  };
}
