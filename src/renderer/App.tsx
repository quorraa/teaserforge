import { Check, Columns3, Grid3X3, MonitorUp, Shield, Smartphone, Square as SquareIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  MediaScanResult,
  ProjectConfig,
  TeaserSettings,
  TimelineClip,
  TimelineExportMarker,
  TimelineSelection,
  TimelineState
} from '../shared/types';
import { ASPECT_RATIOS, DEFAULT_PROJECT } from '../shared/types';

function findAsset(scan: MediaScanResult | null, path?: string): MediaAsset | undefined {
  if (!scan || !path) return undefined;
  return [...scan.groups.audio, ...scan.groups.images, ...scan.groups.videos].find((asset) => asset.path === path);
}

function latestEvents(events: ExportProgressEvent[]): ExportProgressEvent[] {
  const map = new Map<string, ExportProgressEvent>();
  for (const event of events) map.set(`${event.id}-${event.aspect}`, event);
  return Array.from(map.values()).slice(-9).reverse();
}

export function App(): JSX.Element {
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

  const selectedSong = useMemo(() => findAsset(scan, project.selectedSongPath), [scan, project.selectedSongPath]);
  const selectedCover = useMemo(() => findAsset(scan, project.coverArtPath), [scan, project.coverArtPath]);
  const selectedVideo = useMemo(() => findAsset(scan, project.videoCoverPath), [scan, project.videoCoverPath]);
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

  const selectTimelineItem = useCallback((selected?: TimelineSelection) => {
    setProject((previous) => {
      const marker = selected?.type === 'export-marker' ? previous.timeline.exportMarkers.find((item) => item.id === selected.id) : undefined;
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
      setAppSettings((previous) => ({ ...previous, lastProjectPath: rootPath }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load project folder.');
    } finally {
      setLoading(false);
    }
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
      const savedCover = findAsset(scan, savedPairing?.coverArtPath);
      const savedVideo = findAsset(scan, savedPairing?.videoCoverPath);
      const cover = savedCover ?? bestAssetMatch(asset, scan.groups.coverArt);
      const video = savedVideo ?? bestAssetMatch(asset, scan.groups.videoCoverArt);
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

  const setCover = useCallback((asset: MediaAsset) => {
    setProject((previous) => updatePairing({ ...previous, coverArtPath: asset.path, updatedAt: new Date().toISOString() }, asset.path, previous.videoCoverPath));
  }, []);

  const setVideo = useCallback((asset: MediaAsset) => {
    setProject((previous) => updatePairing({ ...previous, videoCoverPath: asset.path, updatedAt: new Date().toISOString() }, previous.coverArtPath, asset.path));
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
      for (const target of targets) {
        const projectForTarget: ProjectConfig = {
          ...savedProject,
          settings: {
            ...savedProject.settings,
            primaryAspect: target.aspect,
            regionStart: savedProject.settings.startOffset,
            regionEnd: savedProject.settings.endOffset,
            teaserDuration: Math.max(1, savedProject.settings.endOffset - savedProject.settings.startOffset)
          }
        };
        await teaserForgeApi.exportBatch({ project: projectForTarget, targets: [target] });
      }
      await teaserForgeApi.checkFfmpeg().then(setFfmpegStatus);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
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
          onSelectOutputFolder={selectOutputFolder}
          onExportTargets={exportTargets}
          onAppSettingsChange={updateAppSettings}
          onCheckFfmpeg={checkFfmpeg}
          onPlayRegion={() => (window as Window & { teaserForgePlayRegion?: () => void }).teaserForgePlayRegion?.()}
        />
      </main>

      <div className={`playback-dot ${playing ? 'on' : ''}`} />
    </div>
  );
}
