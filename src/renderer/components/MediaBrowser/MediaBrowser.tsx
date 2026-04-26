import { Film, Folder, FolderOpen, ImageIcon, Music2, RefreshCcw, Search, Sparkles } from 'lucide-react';
import type { ChangeEvent, DragEvent } from 'react';
import { useMemo, useState } from 'react';
import type { FileTreeNode, MediaAsset, MediaScanResult, ProjectConfig } from '../../../shared/types';
import { teaserForgeApi } from '../../lib/api';

interface MediaBrowserProps {
  scan: MediaScanResult | null;
  project: ProjectConfig;
  search: string;
  loading: boolean;
  isDemo: boolean;
  onSearchChange: (value: string) => void;
  onSelectProjectFolder: () => void;
  onRefresh: () => void;
  onDemoMode: () => void;
  onSelectSong: (asset: MediaAsset) => void;
  onSelectCover: (asset: MediaAsset) => void;
  onSelectVideo: (asset: MediaAsset) => void;
}

function matchesSearch(value: string, search: string): boolean {
  return value.toLowerCase().includes(search.trim().toLowerCase());
}

function filterTree(node: FileTreeNode, search: string): FileTreeNode | null {
  if (!search.trim()) return node;
  const children = node.children?.map((child) => filterTree(child, search)).filter(Boolean) as FileTreeNode[] | undefined;
  if (matchesSearch(node.name, search) || matchesSearch(node.relativePath, search) || (children && children.length > 0)) {
    return { ...node, children };
  }
  return null;
}

function folderOnlyTree(node: FileTreeNode): FileTreeNode | null {
  if (node.kind !== 'folder') return null;
  return {
    ...node,
    children: node.children?.map(folderOnlyTree).filter(Boolean) as FileTreeNode[] | undefined
  };
}

function AssetThumb({ asset, isDemo }: { asset: MediaAsset; isDemo: boolean }) {
  const [failed, setFailed] = useState(false);
  const url = teaserForgeApi.mediaUrl(asset.path);

  if (asset.kind === 'image' && !isDemo && !failed) {
    return <img className="asset-thumb" src={url} alt="" onError={() => setFailed(true)} />;
  }

  if (asset.kind === 'audio') return <Music2 className="asset-icon audio" size={18} />;
  if (asset.kind === 'video') return <Film className="asset-icon video" size={18} />;
  return <ImageIcon className="asset-icon image" size={18} />;
}

function assetDrag(event: DragEvent, asset: MediaAsset): void {
  event.dataTransfer.setData('application/x-teaserforge-asset', JSON.stringify(asset));
  event.dataTransfer.effectAllowed = 'copy';
}

function AssetRow({
  asset,
  isDemo,
  selected,
  onClick
}: {
  asset: MediaAsset;
  isDemo: boolean;
  selected: boolean;
  onClick: (asset: MediaAsset) => void;
}) {
  return (
    <button
      type="button"
      className={`asset-row ${selected ? 'selected' : ''}`}
      draggable
      onDragStart={(event) => assetDrag(event, asset)}
      onClick={() => onClick(asset)}
      title={asset.path}
    >
      <AssetThumb asset={asset} isDemo={isDemo} />
      <span className="asset-name">{asset.name}</span>
    </button>
  );
}

function TreeNode({
  node,
  assetsByPath,
  project,
  isDemo,
  onSelectSong,
  onSelectCover,
  onSelectVideo,
  level = 0
}: {
  node: FileTreeNode;
  assetsByPath: Map<string, MediaAsset>;
  project: ProjectConfig;
  isDemo: boolean;
  onSelectSong: (asset: MediaAsset) => void;
  onSelectCover: (asset: MediaAsset) => void;
  onSelectVideo: (asset: MediaAsset) => void;
  level?: number;
}) {
  const [open, setOpen] = useState(level < 2);
  const asset = assetsByPath.get(node.path);
  const selected = [project.selectedSongPath, project.coverArtPath, project.videoCoverPath].includes(node.path);

  if (node.kind === 'folder') {
    return (
      <div className="tree-node">
        <button className="tree-row folder-row" type="button" onClick={() => setOpen((value) => !value)} style={{ paddingLeft: 10 + level * 14 }}>
          {open ? <FolderOpen size={15} /> : <Folder size={15} />}
          <span>{node.name}</span>
        </button>
        {open && node.children?.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            assetsByPath={assetsByPath}
            project={project}
            isDemo={isDemo}
            onSelectSong={onSelectSong}
            onSelectCover={onSelectCover}
            onSelectVideo={onSelectVideo}
            level={level + 1}
          />
        ))}
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="tree-row muted-row" style={{ paddingLeft: 10 + level * 14 }}>
        <span className="tree-dot" />
        <span>{node.name}</span>
      </div>
    );
  }

  const handleClick = (): void => {
    if (asset.kind === 'audio') onSelectSong(asset);
    if (asset.kind === 'image') onSelectCover(asset);
    if (asset.kind === 'video') onSelectVideo(asset);
  };

  return (
    <button
      className={`tree-row file-row ${selected ? 'selected' : ''}`}
      type="button"
      draggable
      onDragStart={(event) => assetDrag(event, asset)}
      onClick={handleClick}
      style={{ paddingLeft: 10 + level * 14 }}
      title={node.path}
    >
      <AssetThumb asset={asset} isDemo={isDemo} />
      <span>{node.name}</span>
    </button>
  );
}

function Group({
  title,
  assets,
  isDemo,
  selectedPaths,
  onClick
}: {
  title: string;
  assets: MediaAsset[];
  isDemo: boolean;
  selectedPaths: Array<string | undefined>;
  onClick: (asset: MediaAsset) => void;
}) {
  return (
    <section className="asset-group">
      <div className="group-heading">
        <span>{title}</span>
        <small>{assets.length}</small>
      </div>
      <div className="asset-list">
        {assets.length === 0 ? (
          <div className="empty-note">No matching assets</div>
        ) : (
          assets.map((asset) => <AssetRow key={asset.id} asset={asset} isDemo={isDemo} selected={selectedPaths.includes(asset.path)} onClick={onClick} />)
        )}
      </div>
    </section>
  );
}

export function MediaBrowser({
  scan,
  project,
  search,
  loading,
  isDemo,
  onSearchChange,
  onSelectProjectFolder,
  onRefresh,
  onDemoMode,
  onSelectSong,
  onSelectCover,
  onSelectVideo
}: MediaBrowserProps) {
  const assetsByPath = useMemo(() => {
    const map = new Map<string, MediaAsset>();
    if (!scan) return map;
    [...scan.groups.audio, ...scan.groups.images, ...scan.groups.videos].forEach((asset) => map.set(asset.path, asset));
    return map;
  }, [scan]);

  const filteredTree = useMemo(() => (scan ? filterTree(scan.tree, search) : null), [scan, search]);
  const folderTree = useMemo(() => (filteredTree ? folderOnlyTree(filteredTree) : null), [filteredTree]);
  const filtered = (assets: MediaAsset[]): MediaAsset[] => assets.filter((asset) => !search.trim() || matchesSearch(asset.name, search) || matchesSearch(asset.relativePath, search));
  const selectedPaths = [project.selectedSongPath, project.coverArtPath, project.videoCoverPath];

  return (
    <aside className="media-browser panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Media Browser</p>
          <h2>{scan?.rootName ?? 'No project selected'}</h2>
        </div>
        <div className="icon-row">
          <button className="icon-button" type="button" title="Select project folder" onClick={onSelectProjectFolder}>
            <FolderOpen size={17} />
          </button>
          <button className="icon-button" type="button" title="Refresh folder" onClick={onRefresh} disabled={!scan || loading || isDemo}>
            <RefreshCcw size={16} />
          </button>
          <button className="icon-button" type="button" title="Load demo project" onClick={onDemoMode}>
            <Sparkles size={16} />
          </button>
        </div>
      </div>

      <div className="path-pill" title={scan?.rootPath}>
        {loading ? 'Scanning project folder...' : scan?.rootPath ?? 'Select a project folder or use demo mode'}
      </div>

      <label className="search-box">
        <Search size={15} />
        <input value={search} placeholder="Search files..." onChange={(event: ChangeEvent<HTMLInputElement>) => onSearchChange(event.target.value)} />
      </label>

      {!scan ? (
        <div className="empty-state">
          <FolderOpen size={34} />
          <p>Select a folder containing audio files, COVER_ART, and VIDEO_COVER_ART.</p>
          <button className="primary-button" type="button" onClick={onSelectProjectFolder}>
            Choose Folder
          </button>
        </div>
      ) : (
        <div className="browser-scroll">
          <section className="tree-section">
            <div className="group-heading">
              <span>Folders</span>
              <small>{isDemo ? 'demo' : 'live'}</small>
            </div>
            {folderTree && (
              <TreeNode
                node={folderTree}
                assetsByPath={assetsByPath}
                project={project}
                isDemo={isDemo}
                onSelectSong={onSelectSong}
                onSelectCover={onSelectCover}
                onSelectVideo={onSelectVideo}
              />
            )}
          </section>

          <Group title="Root Audio Files" assets={filtered(scan.groups.rootAudio)} isDemo={isDemo} selectedPaths={selectedPaths} onClick={onSelectSong} />
          <Group title="COVER_ART" assets={filtered(scan.groups.coverArt)} isDemo={isDemo} selectedPaths={selectedPaths} onClick={onSelectCover} />
          <Group title="VIDEO_COVER_ART" assets={filtered(scan.groups.videoCoverArt)} isDemo={isDemo} selectedPaths={selectedPaths} onClick={onSelectVideo} />
        </div>
      )}
    </aside>
  );
}
