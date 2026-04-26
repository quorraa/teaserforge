import { Check, Columns3, Grid3X3, MonitorUp, Redo2, Shield, Smartphone, Square as SquareIcon, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Inspector } from './components/Inspector/Inspector';
import { MediaBrowser } from './components/MediaBrowser/MediaBrowser';
import { PreviewCanvas } from './components/PreviewCanvas/PreviewCanvas';
import { Timeline } from './components/Timeline/Timeline';
import { bestAssetMatch, rankAssetMatches } from './lib/assetMatching';
import { isNativeTeaserForge, teaserForgeApi } from './lib/api';
import { createDemoProject, createDemoScan } from './lib/demoProject';
import { EXPORT_TARGETS } from './lib/ffmpegCommands';
import { createProjectForRoot, updatePairing } from './lib/projectStore';
import type {
  AppSettings,
  AspectRatioKey,
  ExportProgressEvent,
  FfmpegStatus,
  MediaAsset,
  MediaTransform,
  MediaScanResult,
  ProjectConfig,
  TeaserSettings,
  TextLayerTransform,
  TimelineTrackId,
  TimelineTrackState,
  TimelineClip,
  TimelineExportMarker,
  TimelineSelection,
  TimelineState
} from '../shared/types';
import { ASPECT_RATIOS, DEFAULT_MEDIA_TRANSFORMS, DEFAULT_PROJECT, DEFAULT_TEXT_TRANSFORMS, DEFAULT_TRACKS } from '../shared/types';

function findAsset(scan: MediaScanResult | null, path?: string): MediaAsset | undefined {
  if (!scan || !path) return undefined;
  return [...scan.groups.audio, ...scan.groups.images, ...scan.groups.videos].find((asset) => asset.path === path);
}

function assetFromPath(path: string | undefined, kind: MediaAsset['kind']): MediaAsset | undefined {
  if (!path) return undefined;
  const name = path.split(/[\\/]/).pop() ?? path;
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  return {
    id: path,
    name,
    path,
    relativePath: name,
    extension,
    kind,
    size: 0,
    mtimeMs: 0,
    folderName: ''
  };
}

function latestEvents(events: ExportProgressEvent[]): ExportProgressEvent[] {
  const map = new Map<string, ExportProgressEvent>();
  for (const event of events) map.set(`${event.id}-${event.aspect}`, event);
  return Array.from(map.values()).slice(-9).reverse();
}

function selectedClipIds(selection?: TimelineSelection): string[] {
  if (!selection) return [];
  if (selection.type === 'clip' && selection.id) return [selection.id];
  if (selection.type === 'clips') return selection.ids ?? [];
  return [];
}

function addRecentProject(settings: AppSettings, rootPath: string): AppSettings {
  const recentProjects = [rootPath, ...(settings.recentProjects ?? []).filter((path) => path !== rootPath)].slice(0, 8);
  return { ...settings, lastProjectPath: rootPath, recentProjects };
}

export function App() {
  const [scan, setScan] = useState<MediaScanResult | null>(null);
  const [project, setProject] = useState<ProjectConfig>(DEFAULT_PROJECT);
  const [appSettings, setAppSettings] = useState<AppSettings>({});
  const [ffmpegStatus, setFfmpegStatus] = useState<FfmpegStatus | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isDemo, setIsDemo] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exportEvents, setExportEvents] = useState<ExportProgressEvent[]>([]);
  const [exporting, setExporting] = useState(false);
  const [showAllPreviews, setShowAllPreviews] = useState(false);
  const historyRef = useRef<{ past: ProjectConfig[]; future: ProjectConfig[]; last?: ProjectConfig; applying: boolean }>({
    past: [],
    future: [],
    applying: false
  });

  const selectedSong = useMemo(() => findAsset(scan, project.selectedSongPath) ?? assetFromPath(project.selectedSongPath, 'audio'), [scan, project.selectedSongPath]);
  const selectedCover = useMemo(() => findAsset(scan, project.coverArtPath) ?? assetFromPath(project.coverArtPath, 'image'), [scan, project.coverArtPath]);
  const selectedVideo = useMemo(() => findAsset(scan, project.videoCoverPath) ?? assetFromPath(project.videoCoverPath, 'video'), [scan, project.videoCoverPath]);
  const coverCandidates = useMemo(() => rankAssetMatches(selectedSong, scan?.groups.coverArt ?? []), [scan?.groups.coverArt, selectedSong]);
  const videoCandidates = useMemo(() => rankAssetMatches(selectedSong, scan?.groups.videoCoverArt ?? []), [scan?.groups.videoCoverArt, selectedSong]);
  const activeAspectPreset = useMemo(
    () => ASPECT_RATIOS.find((preset) => preset.key === project.settings.primaryAspect) ?? ASPECT_RATIOS[0],
    [project.settings.primaryAspect]
  );
  const visiblePreviewPresets = showAllPreviews ? ASPECT_RATIOS : [activeAspectPreset];

  const updateSettings = useCallback((patch: Partial<TeaserSettings>) => {
    setProject((previous) => ({
      ...previous,
      settings: {
        ...previous.settings,
        ...patch
      },
      updatedAt: new Date().toISOString()
    }));
  }, []);

  const updateProject = useCallback((patch: Partial<ProjectConfig>) => {
    setProject((previous) => ({
      ...previous,
      ...patch,
      updatedAt: new Date().toISOString()
    }));
  }, []);

  const updateTimeline = useCallback((timeline: TimelineState) => {
    setProject((previous) => ({
      ...previous,
      timeline,
      updatedAt: new Date().toISOString()
    }));
  }, []);

  const updateTimelineTrack = useCallback((track: TimelineTrackId, patch: Partial<TimelineTrackState>) => {
    setProject((previous) => ({
      ...previous,
      timeline: {
        ...previous.timeline,
        tracks: {
          ...DEFAULT_TRACKS,
          ...previous.timeline.tracks,
          [track]: {
            ...(previous.timeline.tracks?.[track] ?? DEFAULT_TRACKS[track]),
            ...patch
          }
        }
      },
      updatedAt: new Date().toISOString()
    }));
  }, []);

  const updateMediaTransform = useCallback((aspect: AspectRatioKey, patch: Partial<MediaTransform>) => {
    setProject((previous) => {
      const mediaTransforms = {
        ...DEFAULT_MEDIA_TRANSFORMS,
        ...previous.settings.mediaTransforms
      };
      const currentTransform = mediaTransforms[aspect] ?? DEFAULT_MEDIA_TRANSFORMS[aspect];

      return {
        ...previous,
        settings: {
          ...previous.settings,
          mediaTransforms: {
            ...mediaTransforms,
            [aspect]: {
              ...currentTransform,
              ...patch
            }
          }
        },
        updatedAt: new Date().toISOString()
      };
    });
  }, []);

  const updateTextTransform = useCallback((aspect: AspectRatioKey, layer: 'title' | 'subtitle', patch: Partial<TextLayerTransform>) => {
    setProject((previous) => {
      const textTransforms = {
        ...DEFAULT_TEXT_TRANSFORMS,
        ...previous.settings.textTransforms
      };
      const currentAspect = textTransforms[aspect] ?? DEFAULT_TEXT_TRANSFORMS[aspect];

      return {
        ...previous,
        settings: {
          ...previous.settings,
          textTransforms: {
            ...textTransforms,
            [aspect]: {
              ...currentAspect,
              [layer]: {
                ...currentAspect[layer],
                ...patch
              }
            }
          }
        },
        updatedAt: new Date().toISOString()
      };
    });
  }, []);

  const selectTimelineItem = useCallback((selected?: TimelineSelection) => {
    setProject((previous) => {
      const marker = selected?.type === 'export-marker' && selected.id ? previous.timeline.exportMarkers.find((item) => item.id === selected.id) : undefined;
      return {
        ...previous,
        timeline: {
          ...previous.timeline,
          selected
        },
        settings: marker
          ? {
              ...previous.settings,
              primaryAspect: marker.aspect,
              startOffset: marker.start,
              endOffset: marker.end,
              regionStart: marker.start,
              regionEnd: marker.end,
              teaserDuration: Math.max(1, marker.end - marker.start)
            }
          : previous.settings,
        updatedAt: new Date().toISOString()
      };
    });
  }, []);

  const updateTimelineClip = useCallback((clipId: string, patch: Partial<TimelineClip>) => {
    setProject((previous) => {
      let changedClip: TimelineClip | undefined;
      const clips = previous.timeline.clips.map((clip) => {
        if (clip.id !== clipId) return clip;
        changedClip = { ...clip, ...patch };
        return changedClip;
      });
      const nextSettings = changedClip?.effectKey && typeof patch.enabled === 'boolean'
        ? {
            ...previous.settings,
            effects: {
              ...previous.settings.effects,
              [changedClip.effectKey]: {
                ...previous.settings.effects[changedClip.effectKey],
                enabled: patch.enabled
              }
            }
          }
        : previous.settings;

      return {
        ...previous,
        settings: nextSettings,
        timeline: {
          ...previous.timeline,
          clips
        },
        updatedAt: new Date().toISOString()
      };
    });
  }, []);

  const updateTimelineMarker = useCallback((markerId: string, patch: Partial<TimelineExportMarker>) => {
    setProject((previous) => {
      let changedMarker: TimelineExportMarker | undefined;
      const exportMarkers = previous.timeline.exportMarkers.map((marker) => {
        if (marker.id !== markerId) return marker;
        changedMarker = { ...marker, ...patch };
        return changedMarker;
      });

      return {
        ...previous,
        timeline: {
          ...previous.timeline,
          exportMarkers
        },
        settings: changedMarker && previous.timeline.selected?.type === 'export-marker' && previous.timeline.selected.id === markerId
          ? {
              ...previous.settings,
              primaryAspect: changedMarker.aspect,
              startOffset: changedMarker.start,
              endOffset: changedMarker.end,
              regionStart: changedMarker.start,
              regionEnd: changedMarker.end,
              teaserDuration: Math.max(1, changedMarker.end - changedMarker.start)
            }
          : previous.settings,
        updatedAt: new Date().toISOString()
      };
    });
  }, []);

  const deleteTimelineSelection = useCallback(() => {
    setProject((previous) => {
      const ids = selectedClipIds(previous.timeline.selected);
      if (ids.length === 0) return previous;

      return {
        ...previous,
        timeline: {
          ...previous.timeline,
          clips: previous.timeline.clips.filter((clip) => !ids.includes(clip.id)),
          selected: undefined
        },
        updatedAt: new Date().toISOString()
      };
    });
  }, []);

  const duplicateTimelineSelection = useCallback(() => {
    setProject((previous) => {
      const ids = selectedClipIds(previous.timeline.selected);
      const originals = previous.timeline.clips.filter((clip) => ids.includes(clip.id));
      if (originals.length === 0) return previous;

      const now = Date.now();
      const copies = originals.map((clip, index) => ({
        ...clip,
        id: `${clip.id}-copy-${now}-${index}`,
        start: Math.max(0, clip.start + 0.5),
        end: clip.end + 0.5,
        label: `${clip.label} copy`
      }));

      return {
        ...previous,
        timeline: {
          ...previous.timeline,
          clips: [...previous.timeline.clips, ...copies],
          selected: { type: 'clips', ids: copies.map((clip) => clip.id) }
        },
        updatedAt: new Date().toISOString()
      };
    });
  }, []);

  const splitTimelineSelection = useCallback(() => {
    setProject((previous) => {
      const ids = selectedClipIds(previous.timeline.selected);
      const splitAt = previous.settings.startOffset + currentTime;
      const selectedAfterSplit: string[] = [];
      let changed = false;
      const now = Date.now();

      const clips = previous.timeline.clips.flatMap((clip, index) => {
        if (!ids.includes(clip.id) || splitAt <= clip.start + 0.1 || splitAt >= clip.end - 0.1) return [clip];
        changed = true;
        const left = { ...clip, id: `${clip.id}-a-${now}-${index}`, end: splitAt };
        const right = { ...clip, id: `${clip.id}-b-${now}-${index}`, start: splitAt };
        selectedAfterSplit.push(left.id, right.id);
        return [left, right];
      });

      if (!changed) return previous;
      return {
        ...previous,
        timeline: {
          ...previous.timeline,
          clips,
          selected: { type: 'clips', ids: selectedAfterSplit }
        },
        updatedAt: new Date().toISOString()
      };
    });
  }, [currentTime]);

  const nudgeTimelineSelection = useCallback((delta: number) => {
    setProject((previous) => {
      const ids = selectedClipIds(previous.timeline.selected);
      if (ids.length === 0 && previous.timeline.selected?.type !== 'export-range') return previous;

      if (previous.timeline.selected?.type === 'export-range') {
        const duration = previous.settings.endOffset - previous.settings.startOffset;
        const startOffset = Math.max(0, previous.settings.startOffset + delta);
        const endOffset = startOffset + duration;
        return {
          ...previous,
          settings: {
            ...previous.settings,
            startOffset,
            endOffset,
            regionStart: startOffset,
            regionEnd: endOffset
          },
          updatedAt: new Date().toISOString()
        };
      }

      return {
        ...previous,
        timeline: {
          ...previous.timeline,
          clips: previous.timeline.clips.map((clip) => {
            if (!ids.includes(clip.id)) return clip;
            const duration = clip.end - clip.start;
            const start = Math.max(0, clip.start + delta);
            return { ...clip, start, end: start + duration };
          })
        },
        updatedAt: new Date().toISOString()
      };
    });
  }, []);

  const loadProject = useCallback(async (rootPath: string) => {
    setLoading(true);
      setError(null);
    try {
      const [scanResult, savedProject] = await Promise.all([
        teaserForgeApi.scanProjectFolder(rootPath),
        teaserForgeApi.loadProjectConfig(rootPath)
      ]);
      setScan(scanResult);
      setProject(createProjectForRoot(rootPath, scanResult.rootName, savedProject));
      setIsDemo(!isNativeTeaserForge());
      setCurrentTime(0);
      setSearch('');
      setAppSettings((previous) => {
        const nextSettings = addRecentProject(previous, rootPath);
        void teaserForgeApi.saveAppSettings(nextSettings);
        return nextSettings;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load project folder.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const history = historyRef.current;
    if (history.applying) {
      history.applying = false;
      history.last = project;
      return;
    }

    if (!history.last) {
      history.last = project;
      return;
    }

    if (history.last !== project) {
      history.past = [...history.past, history.last].slice(-60);
      history.future = [];
      history.last = project;
    }
  }, [project]);

  const undoProject = useCallback(() => {
    const history = historyRef.current;
    const previous = history.past.pop();
    if (!previous) return;
    history.future = history.last ? [history.last, ...history.future].slice(0, 60) : history.future;
    history.applying = true;
    setProject(previous);
  }, []);

  const redoProject = useCallback(() => {
    const history = historyRef.current;
    const next = history.future.shift();
    if (!next) return;
    if (history.last) history.past = [...history.past, history.last].slice(-60);
    history.applying = true;
    setProject(next);
  }, []);

  useEffect(() => {
    const unsubscribe = teaserForgeApi.onExportProgress((event) => {
      setExportEvents((previous) => latestEvents([...previous, event]));
    });

    teaserForgeApi.getAppSettings().then((settings) => {
      setAppSettings(settings);
      if (settings.lastProjectPath) {
        void loadProject(settings.lastProjectPath);
      } else {
        setScan(createDemoScan());
        setProject(createDemoProject());
        setIsDemo(true);
      }
    });

    teaserForgeApi.checkFfmpeg().then(setFfmpegStatus).catch(() => {
      setFfmpegStatus({ available: false, message: 'FFmpeg check failed.' });
    });

    return unsubscribe;
  }, [loadProject]);

  useEffect(() => {
    if (!project.rootPath || isDemo) return;
    setSaveStatus('saving');
    const handle = window.setTimeout(() => {
      teaserForgeApi
        .saveProjectConfig(project)
        .then(() => {
          setSaveStatus('saved');
        })
        .catch(() => setSaveStatus('error'));
    }, 650);

    return () => window.clearTimeout(handle);
  }, [project, isDemo]);

  const selectProjectFolder = async (): Promise<void> => {
    const rootPath = await teaserForgeApi.selectProjectFolder();
    if (!rootPath && !isNativeTeaserForge()) {
      setError('Folder picking is available in the Electron desktop window. Browser mode uses demo data for layout checks.');
    }
    if (rootPath) await loadProject(rootPath);
  };

  const refreshProject = async (): Promise<void> => {
    if (!scan?.rootPath || isDemo) return;
    await loadProject(scan.rootPath);
  };

  const enableDemo = (): void => {
    setScan(createDemoScan());
    setProject(createDemoProject());
    setIsDemo(true);
    setError(null);
    setCurrentTime(0);
  };

  const selectSong = useCallback((asset: MediaAsset) => {
    if (!scan) return;
    setCurrentTime(0);
    setProject((previous) => {
      const savedPairing = previous.pairings[asset.path];
      const cover = savedPairing
        ? findAsset(scan, savedPairing.coverArtPath)
        : bestAssetMatch(asset, scan.groups.coverArt);
      const video = savedPairing
        ? findAsset(scan, savedPairing.videoCoverPath)
        : bestAssetMatch(asset, scan.groups.videoCoverArt);
      const nextProject: ProjectConfig = {
        ...previous,
        selectedSongPath: asset.path,
        coverArtPath: cover?.path,
        videoCoverPath: video?.path,
        settings: {
          ...previous.settings,
          startOffset: 0,
          endOffset: previous.settings.teaserDuration,
          regionStart: 0,
          regionEnd: previous.settings.teaserDuration
        },
        updatedAt: new Date().toISOString()
      };
      return updatePairing(nextProject, cover?.path, video?.path);
    });
  }, [scan]);

  const setCover = useCallback((asset?: MediaAsset) => {
    const coverArtPath = asset?.path;
    setProject((previous) => updatePairing({ ...previous, coverArtPath, updatedAt: new Date().toISOString() }, coverArtPath, previous.videoCoverPath));
  }, []);

  const setVideo = useCallback((asset?: MediaAsset) => {
    const videoCoverPath = asset?.path;
    setProject((previous) => updatePairing({ ...previous, videoCoverPath, updatedAt: new Date().toISOString() }, previous.coverArtPath, videoCoverPath));
  }, []);

  const handleDropAsset = (asset: MediaAsset): void => {
    if (asset.kind === 'audio') selectSong(asset);
    if (asset.kind === 'image') setCover(asset);
    if (asset.kind === 'video') setVideo(asset);
  };

  const selectOutputFolder = async (): Promise<void> => {
    const outputFolder = await teaserForgeApi.selectOutputFolder();
    if (!outputFolder && !isNativeTeaserForge()) {
      setError('Output folder selection is available in the Electron desktop window.');
    }
    if (outputFolder) updateSettings({ outputFolder });
  };

  const relinkMedia = async (kind: 'song' | 'cover' | 'video'): Promise<void> => {
    const filePath = await teaserForgeApi.selectMediaFile();
    if (!filePath) return;
    if (kind === 'song') {
      setProject((previous) => ({
        ...previous,
        selectedSongPath: filePath,
        updatedAt: new Date().toISOString()
      }));
      setCurrentTime(0);
      return;
    }
    if (kind === 'cover') {
      setCover(assetFromPath(filePath, 'image'));
      return;
    }
    setVideo(assetFromPath(filePath, 'video'));
  };

  const exportTargets = async (targetKeys: string[]): Promise<void> => {
    if (!project.selectedSongPath || (!project.coverArtPath && !project.videoCoverPath)) {
      setError('Select a song and cover or video cover before exporting.');
      return;
    }

    const targets = EXPORT_TARGETS.filter((target) => targetKeys.includes(target.aspect));
    if (targets.length === 0) return;

    setError(null);
    setExporting(true);
    try {
      const savedProject = project.rootPath && !isDemo ? await teaserForgeApi.saveProjectConfig(project) : project;
      const projectForExport: ProjectConfig = {
        ...savedProject,
        settings: {
          ...savedProject.settings,
          regionStart: savedProject.settings.startOffset,
          regionEnd: savedProject.settings.endOffset,
          teaserDuration: Math.max(1, savedProject.settings.endOffset - savedProject.settings.startOffset)
        }
      };
      await teaserForgeApi.exportBatch({ project: projectForExport, targets });
      await teaserForgeApi.checkFfmpeg().then(setFfmpegStatus);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const cancelExports = async (): Promise<void> => {
    await teaserForgeApi.cancelExports();
    setExporting(false);
  };

  const openOutputFolder = async (): Promise<void> => {
    const target = project.settings.outputFolder ?? (project.rootPath ? `${project.rootPath}\\teaser_exports` : undefined);
    if (!target) {
      setError('Select an output folder before opening it.');
      return;
    }
    await teaserForgeApi.openPath(target);
  };

  const updateAppSettings = (settings: AppSettings): void => {
    setAppSettings(settings);
    teaserForgeApi.saveAppSettings(settings).then(setAppSettings).catch(() => {
      setError('Unable to save app settings.');
    });
  };

  const checkFfmpeg = (): void => {
    teaserForgeApi.checkFfmpeg().then(setFfmpegStatus).catch((checkError) => {
      setFfmpegStatus({ available: false, message: checkError instanceof Error ? checkError.message : 'FFmpeg check failed.' });
    });
  };

  const setPrimaryAspect = (aspect: AspectRatioKey): void => updateSettings({ primaryAspect: aspect });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isEditable = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '') || target?.isContentEditable;
      if (isEditable) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoProject();
        else undoProject();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redoProject();
      } else if ((event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        deleteTimelineSelection();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateTimelineSelection();
      } else if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        splitTimelineSelection();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        nudgeTimelineSelection(event.shiftKey ? -1 : -0.05);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        nudgeTimelineSelection(event.shiftKey ? 1 : 0.05);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteTimelineSelection, duplicateTimelineSelection, nudgeTimelineSelection, redoProject, splitTimelineSelection, undoProject]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">TF</div>
          <div>
            <strong>TeaserForge</strong>
            <span>Local-first music teaser editor</span>
          </div>
        </div>
        <nav className="menu">
          <button type="button" onClick={selectProjectFolder}>File</button>
          <button type="button" onClick={refreshProject}>Project</button>
          <button type="button" onClick={() => exportTargets([project.settings.primaryAspect])}>Export</button>
          <button type="button" onClick={undoProject} title="Undo">
            <Undo2 size={14} />
          </button>
          <button type="button" onClick={redoProject} title="Redo">
            <Redo2 size={14} />
          </button>
          <button type="button" onClick={checkFfmpeg}>Help</button>
        </nav>
        <div className="status-area">
          <span>{scan?.rootName ?? 'No project'}</span>
          <span className={`save-pill ${saveStatus}`}>
            <Check size={13} />
            {isDemo ? 'Demo' : saveStatus === 'saving' ? 'Saving' : saveStatus === 'error' ? 'Save error' : 'Saved'}
          </span>
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <main className="editor-layout">
        <MediaBrowser
          scan={scan}
          project={project}
          search={search}
          loading={loading}
          isDemo={isDemo}
          onSearchChange={setSearch}
          onSelectProjectFolder={selectProjectFolder}
          onRefresh={refreshProject}
          onDemoMode={enableDemo}
          onSelectSong={selectSong}
          onSelectCover={setCover}
          onSelectVideo={setVideo}
        />

        <section className="workspace">
          <div className="workspace-toolbar panel">
            <div>
              <p className="eyebrow">{showAllPreviews ? 'Preview Canvases' : 'Preview Canvas'}</p>
              <h1>{project.title || scan?.rootName || 'Untitled Project'}</h1>
            </div>
            <div className="toolbar-toggles">
              <button className={project.settings.showSafeArea ? 'active' : ''} type="button" onClick={() => updateSettings({ showSafeArea: !project.settings.showSafeArea })}>
                <Shield size={15} />
                Safe Area
              </button>
              <button className={project.settings.showGrid ? 'active' : ''} type="button" onClick={() => updateSettings({ showGrid: !project.settings.showGrid })}>
                <Grid3X3 size={15} />
                Grid
              </button>
              <button className={showAllPreviews ? 'active' : ''} type="button" onClick={() => setShowAllPreviews((value) => !value)}>
                <Columns3 size={15} />
                Compare
              </button>
              <button className={project.settings.primaryAspect === '9x16' ? 'active' : ''} type="button" onClick={() => setPrimaryAspect('9x16')}>
                <Smartphone size={15} />
                9:16
              </button>
              <button className={project.settings.primaryAspect === '1x1' ? 'active' : ''} type="button" onClick={() => setPrimaryAspect('1x1')}>
                <SquareIcon size={15} />
                1:1
              </button>
              <button className={project.settings.primaryAspect === '16x9' ? 'active' : ''} type="button" onClick={() => setPrimaryAspect('16x9')}>
                <MonitorUp size={15} />
                16:9
              </button>
            </div>
          </div>

          <div className={`preview-grid-main ${showAllPreviews ? 'compare' : `focused focus-${activeAspectPreset.key}`}`}>
            {visiblePreviewPresets.map((preset) => (
              <PreviewCanvas
                key={preset.key}
                preset={preset}
                project={project}
                cover={selectedCover}
                video={selectedVideo}
                currentTime={currentTime}
                isPrimary={project.settings.primaryAspect === preset.key}
                isDemo={isDemo}
                onSetPrimary={() => setPrimaryAspect(preset.key)}
                onDropAsset={handleDropAsset}
                onMediaTransformChange={updateMediaTransform}
                onTextTransformChange={updateTextTransform}
              />
            ))}
          </div>

          <Timeline
            project={project}
            selectedSong={selectedSong}
            cover={selectedCover}
            video={selectedVideo}
            isDemo={isDemo}
            currentTime={currentTime}
            onCurrentTime={setCurrentTime}
            onSettingsChange={updateSettings}
            onTimelineChange={updateTimeline}
            onTimelineSelectionChange={selectTimelineItem}
            onTimelineClipChange={updateTimelineClip}
            onTimelineMarkerChange={updateTimelineMarker}
            onTimelineTrackChange={updateTimelineTrack}
            onDeleteSelection={deleteTimelineSelection}
            onDuplicateSelection={duplicateTimelineSelection}
            onSplitSelection={splitTimelineSelection}
            onNudgeSelection={nudgeTimelineSelection}
            onExportMarker={(aspect) => exportTargets([aspect])}
            onPlaybackChange={setPlaying}
          />
        </section>

        <Inspector
          scan={scan}
          project={project}
          appSettings={appSettings}
          ffmpegStatus={ffmpegStatus}
          selectedSong={selectedSong}
          coverCandidates={coverCandidates}
          videoCandidates={videoCandidates}
          exportEvents={exportEvents}
          exporting={exporting}
          isDemo={isDemo}
          onProjectChange={updateProject}
          onSettingsChange={updateSettings}
          onTimelineSelectionChange={selectTimelineItem}
          onTimelineClipChange={updateTimelineClip}
          onTimelineMarkerChange={updateTimelineMarker}
          onSetCover={setCover}
          onSetVideo={setVideo}
          onRelinkMedia={relinkMedia}
          onSelectOutputFolder={selectOutputFolder}
          onExportTargets={exportTargets}
          onCancelExports={cancelExports}
          onOpenOutputFolder={openOutputFolder}
          onLoadRecentProject={loadProject}
          onAppSettingsChange={updateAppSettings}
          onCheckFfmpeg={checkFfmpeg}
          onPlayRegion={() => (window as Window & { teaserForgePlayRegion?: () => void }).teaserForgePlayRegion?.()}
        />
      </main>

      <div className={`playback-dot ${playing ? 'on' : ''}`} />
    </div>
  );
}
