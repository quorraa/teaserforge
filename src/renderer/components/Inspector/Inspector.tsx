import { CheckCircle2, CircleAlert, FolderOpen, Play, Settings2, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import type {
  AppSettings,
  ExportProgressEvent,
  FfmpegStatus,
  MatchCandidate,
  MediaAsset,
  MediaMotionKeyframes,
  MediaScanResult,
  MediaTransform,
  MotionEasing,
  ProjectConfig,
  TeaserSettings,
  TimelineClip,
  TimelineExportMarker,
  TimelineSelection
} from '../../../shared/types';
import { ASPECT_RATIOS, DEFAULT_MEDIA_MOTION, DEFAULT_MEDIA_TRANSFORMS, DEFAULT_TEXT_TRANSFORMS } from '../../../shared/types';
import { defaultOutputHint, EXPORT_TARGETS } from '../../lib/ffmpegCommands';
import { formatTime, parseNumber } from '../../lib/timecode';
import { ExportQueue } from '../ExportQueue/ExportQueue';

type InspectorTab = 'project' | 'text' | 'animation' | 'audio' | 'export' | 'settings';

interface InspectorProps {
  scan: MediaScanResult | null;
  project: ProjectConfig;
  appSettings: AppSettings;
  ffmpegStatus: FfmpegStatus | null;
  selectedSong?: MediaAsset;
  coverCandidates: MatchCandidate[];
  videoCandidates: MatchCandidate[];
  exportEvents: ExportProgressEvent[];
  exporting: boolean;
  isDemo: boolean;
  onProjectChange: (patch: Partial<ProjectConfig>) => void;
  onSettingsChange: (patch: Partial<TeaserSettings>) => void;
  onTimelineSelectionChange: (selection?: TimelineSelection) => void;
  onTimelineClipChange: (clipId: string, patch: Partial<TimelineClip>) => void;
  onTimelineMarkerChange: (markerId: string, patch: Partial<TimelineExportMarker>) => void;
  onSetCover: (asset?: MediaAsset) => void;
  onSetVideo: (asset?: MediaAsset) => void;
  onRelinkMedia: (kind: 'song' | 'cover' | 'video') => void;
  onSelectOutputFolder: () => void;
  onExportTargets: (targetKeys: string[]) => void;
  onCancelExports: () => void;
  onOpenOutputFolder: () => void;
  onLoadRecentProject: (rootPath: string) => void;
  onAppSettingsChange: (settings: AppSettings) => void;
  onCheckFfmpeg: () => void;
  onPlayRegion: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button className={`switch ${checked ? 'on' : ''}`} type="button" onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

function MatchList({
  title,
  candidates,
  onPick
}: {
  title: string;
  candidates: MatchCandidate[];
  onPick: (asset: MediaAsset) => void;
}) {
  return (
    <div className="match-list">
      <div className="mini-heading">{title}</div>
      {candidates.length === 0 ? (
        <div className="empty-note">No suggestions</div>
      ) : (
        candidates.slice(0, 4).map((candidate) => (
          <button type="button" key={candidate.asset.id} onClick={() => onPick(candidate.asset)}>
            <span>{candidate.asset.name}</span>
            <small>
              {candidate.score} · {candidate.reason}
            </small>
          </button>
        ))
      )}
    </div>
  );
}

function EffectControl({
  label,
  value,
  onChange
}: {
  label: string;
  value: { enabled: boolean; intensity: number };
  onChange: (value: { enabled: boolean; intensity: number }) => void;
}) {
  return (
    <div className="effect-control">
      <div>
        <span>{label}</span>
        <Switch checked={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} />
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value.intensity}
        onChange={(event) => onChange({ ...value, intensity: Number(event.target.value) })}
      />
    </div>
  );
}

export function Inspector({
  scan,
  project,
  appSettings,
  ffmpegStatus,
  selectedSong,
  coverCandidates,
  videoCandidates,
  exportEvents,
  exporting,
  isDemo,
  onProjectChange,
  onSettingsChange,
  onTimelineSelectionChange,
  onTimelineClipChange,
  onTimelineMarkerChange,
  onSetCover,
  onSetVideo,
  onRelinkMedia,
  onSelectOutputFolder,
  onExportTargets,
  onCancelExports,
  onOpenOutputFolder,
  onLoadRecentProject,
  onAppSettingsChange,
  onCheckFfmpeg,
  onPlayRegion
}: InspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('project');
  const settings = project.settings;
  const selectedTarget = EXPORT_TARGETS.find((target) => target.aspect === settings.primaryAspect) ?? EXPORT_TARGETS[0];
  const selectedTimelineClip = project.timeline.selected?.type === 'clip' && project.timeline.selected.id
    ? project.timeline.clips.find((clip) => clip.id === project.timeline.selected?.id)
    : undefined;
  const selectedTimelineMarker = project.timeline.selected?.type === 'export-marker' && project.timeline.selected.id
    ? project.timeline.exportMarkers.find((marker) => marker.id === project.timeline.selected?.id)
    : undefined;
  const selectedExportRange = project.timeline.selected?.type === 'export-range';
  const activeMediaTransform = settings.mediaTransforms?.[settings.primaryAspect] ?? DEFAULT_MEDIA_TRANSFORMS[settings.primaryAspect];
  const activeMediaMotion = settings.mediaMotion?.[settings.primaryAspect] ?? DEFAULT_MEDIA_MOTION[settings.primaryAspect];
  const activeTextTransform = settings.textTransforms?.[settings.primaryAspect] ?? DEFAULT_TEXT_TRANSFORMS[settings.primaryAspect];
  const teaserDuration = Math.max(1, settings.endOffset - settings.startOffset || settings.teaserDuration);
  const maxFadeDuration = Math.max(0, teaserDuration / 2);
  const fadeInDuration = Math.min(settings.fadeInDuration ?? settings.fadeDuration ?? 0, maxFadeDuration);
  const fadeOutDuration = Math.min(settings.fadeOutDuration ?? settings.fadeDuration ?? 0, maxFadeDuration);
  const fadeDurationsLinked = settings.fadeDurationsLinked ?? true;

  const assetName = (path?: string): string => path?.split(/[\\/]/).pop() ?? 'None selected';
  const updateActiveMediaTransform = (patch: Partial<typeof activeMediaTransform>): void => {
    const mediaTransforms = {
      ...DEFAULT_MEDIA_TRANSFORMS,
      ...settings.mediaTransforms
    };

    onSettingsChange({
      mediaTransforms: {
        ...mediaTransforms,
        [settings.primaryAspect]: {
          ...activeMediaTransform,
          ...patch
        }
      }
    });
  };
  const updateActiveMediaMotion = (patch: Partial<MediaMotionKeyframes>): void => {
    const mediaMotion = {
      ...DEFAULT_MEDIA_MOTION,
      ...settings.mediaMotion
    };

    onSettingsChange({
      mediaMotion: {
        ...mediaMotion,
        [settings.primaryAspect]: {
          ...activeMediaMotion,
          ...patch,
          start: {
            ...activeMediaMotion.start,
            ...patch.start
          },
          end: {
            ...activeMediaMotion.end,
            ...patch.end
          }
        }
      }
    });
  };
  const updateMotionKeyframe = (keyframe: 'start' | 'end', patch: Partial<MediaTransform>): void => {
    updateActiveMediaMotion({
      [keyframe]: {
        ...activeMediaMotion[keyframe],
        ...patch
      }
    } as Partial<MediaMotionKeyframes>);
  };
  const updateActiveTextTransform = (layer: 'title' | 'subtitle', patch: Partial<typeof activeTextTransform.title>): void => {
    const textTransforms = {
      ...DEFAULT_TEXT_TRANSFORMS,
      ...settings.textTransforms
    };

    onSettingsChange({
      textTransforms: {
        ...textTransforms,
        [settings.primaryAspect]: {
          ...activeTextTransform,
          [layer]: {
            ...activeTextTransform[layer],
            ...patch
          }
        }
      }
    });
  };
  const updateFadeDurationsLinked = (linked: boolean): void => {
    if (!linked) {
      onSettingsChange({ fadeDurationsLinked: false });
      return;
    }
    const nextDuration = Math.max(fadeInDuration, fadeOutDuration);
    onSettingsChange({
      fadeDuration: nextDuration,
      fadeInDuration: nextDuration,
      fadeOutDuration: nextDuration,
      fadeDurationsLinked: true
    });
  };
  const updateFadeDuration = (type: 'linked' | 'in' | 'out', value: number): void => {
    const nextDuration = Math.min(Math.max(0, value), maxFadeDuration);
    if (type === 'linked' || fadeDurationsLinked) {
      onSettingsChange({
        fadeDuration: nextDuration,
        fadeInDuration: nextDuration,
        fadeOutDuration: nextDuration
      });
      return;
    }

    const nextFadeInDuration = type === 'in' ? nextDuration : fadeInDuration;
    const nextFadeOutDuration = type === 'out' ? nextDuration : fadeOutDuration;
    onSettingsChange({
      fadeDuration: Math.max(nextFadeInDuration, nextFadeOutDuration),
      fadeInDuration: nextFadeInDuration,
      fadeOutDuration: nextFadeOutDuration
    });
  };

  return (
    <aside className="inspector panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Teaser Inspector</p>
          <h2>{tab[0].toUpperCase() + tab.slice(1)}</h2>
        </div>
        <Settings2 size={18} />
      </div>

      <nav className="tabs">
        {(['project', 'text', 'animation', 'audio', 'export', 'settings'] as InspectorTab[]).map((item) => (
          <button key={item} type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>

      <div className="inspector-scroll">
        {(selectedTimelineClip || selectedTimelineMarker || selectedExportRange) && (
          <div className="timeline-selection-card">
            <div className="selection-heading">
              <div>
                <span>Timeline Selection</span>
                <strong>{selectedTimelineClip?.label ?? selectedTimelineMarker?.label ?? 'Export Range'}</strong>
              </div>
              <button type="button" onClick={() => onTimelineSelectionChange(undefined)}>Clear</button>
            </div>

            {selectedTimelineClip && (
              <div className="stack compact">
                <Field label="Clip label">
                  <input value={selectedTimelineClip.label} onChange={(event) => onTimelineClipChange(selectedTimelineClip.id, { label: event.target.value })} />
                </Field>
                <Field label="Enabled">
                  <Switch checked={selectedTimelineClip.enabled} onChange={(enabled) => onTimelineClipChange(selectedTimelineClip.id, { enabled })} />
                </Field>
                <Field label="Start">
                  <input
                    type="number"
                    min="0"
                    step="0.05"
                    value={selectedTimelineClip.start}
                    onChange={(event) => onTimelineClipChange(selectedTimelineClip.id, { start: Math.min(selectedTimelineClip.end - 0.25, Math.max(0, parseNumber(event.target.value, selectedTimelineClip.start))) })}
                  />
                </Field>
                <Field label="End">
                  <input
                    type="number"
                    min="0"
                    step="0.05"
                    value={selectedTimelineClip.end}
                    onChange={(event) => onTimelineClipChange(selectedTimelineClip.id, { end: Math.max(selectedTimelineClip.start + 0.25, parseNumber(event.target.value, selectedTimelineClip.end)) })}
                  />
                </Field>
                <div className="notice">Drag this clip in the timeline to move it. Pull the left or right edge to resize its active range.</div>
              </div>
            )}

            {selectedTimelineMarker && (
              <div className="stack compact">
                <Field label="Aspect">
                  <input value={ASPECT_RATIOS.find((preset) => preset.key === selectedTimelineMarker.aspect)?.label ?? selectedTimelineMarker.aspect} readOnly />
                </Field>
                <Field label="Start">
                  <input
                    type="number"
                    min="0"
                    step="0.05"
                    value={selectedTimelineMarker.start}
                    onChange={(event) => onTimelineMarkerChange(selectedTimelineMarker.id, { start: Math.min(selectedTimelineMarker.end - 0.25, Math.max(0, parseNumber(event.target.value, selectedTimelineMarker.start))) })}
                  />
                </Field>
                <Field label="End">
                  <input
                    type="number"
                    min="0"
                    step="0.05"
                    value={selectedTimelineMarker.end}
                    onChange={(event) => onTimelineMarkerChange(selectedTimelineMarker.id, { end: Math.max(selectedTimelineMarker.start + 0.25, parseNumber(event.target.value, selectedTimelineMarker.end)) })}
                  />
                </Field>
                <button className="secondary-button" type="button" onClick={() => onExportTargets([selectedTimelineMarker.aspect])} disabled={exporting || isDemo}>
                  <UploadCloud size={15} />
                  Export this marker
                </button>
                <div className="notice">Clicking a marker selects its aspect and range. Double-click the marker in the timeline to export it directly.</div>
              </div>
            )}

            {selectedExportRange && (
              <div className="stack compact">
                <Field label="Active aspect">
                  <select value={settings.primaryAspect} onChange={(event) => onSettingsChange({ primaryAspect: event.target.value as TeaserSettings['primaryAspect'] })}>
                    {ASPECT_RATIOS.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
                  </select>
                </Field>
                <Field label="Start">
                  <input
                    type="number"
                    min="0"
                    step="0.05"
                    value={settings.startOffset}
                    onChange={(event) => {
                      const startOffset = Math.min(settings.endOffset - 0.25, Math.max(0, parseNumber(event.target.value, settings.startOffset)));
                      onSettingsChange({ startOffset, regionStart: startOffset, teaserDuration: Math.max(1, settings.endOffset - startOffset) });
                    }}
                  />
                </Field>
                <Field label="End">
                  <input
                    type="number"
                    min="0"
                    step="0.05"
                    value={settings.endOffset}
                    onChange={(event) => {
                      const endOffset = Math.max(settings.startOffset + 0.25, parseNumber(event.target.value, settings.endOffset));
                      onSettingsChange({ endOffset, regionEnd: endOffset, teaserDuration: Math.max(1, endOffset - settings.startOffset) });
                    }}
                  />
                </Field>
                <button className="secondary-button" type="button" onClick={() => onExportTargets([settings.primaryAspect])} disabled={exporting || isDemo}>
                  <UploadCloud size={15} />
                  Export active aspect
                </button>
                <div className="notice">Drag the export range to move the selected snippet. Pull either edge to resize it. Format chips select which preview/export target is active.</div>
              </div>
            )}
          </div>
        )}

        {tab === 'project' && (
          <div className="stack">
            <Field label="Title">
              <input value={project.title} onChange={(event) => onProjectChange({ title: event.target.value })} />
            </Field>
            <Field label="Subtitle / Artist">
              <input value={project.subtitle} onChange={(event) => onProjectChange({ subtitle: event.target.value })} />
            </Field>
            <div className="file-summary">
              <span>Song file</span>
              <strong>{assetName(project.selectedSongPath)}</strong>
            </div>
            <div className="inline-actions">
              <button className="secondary-button" type="button" onClick={() => onRelinkMedia('song')}>
                <FolderOpen size={15} />
                Relink song
              </button>
            </div>
            <Field label="Cover art">
              <select value={project.coverArtPath ?? ''} onChange={(event) => {
                if (!event.target.value) {
                  onSetCover(undefined);
                  return;
                }
                const asset = scan?.groups.coverArt.find((item) => item.path === event.target.value);
                if (asset) onSetCover(asset);
              }}>
                <option value="">None</option>
                {scan?.groups.coverArt.map((asset) => <option key={asset.id} value={asset.path}>{asset.name}</option>)}
              </select>
            </Field>
            <div className="inline-actions">
              <button className="secondary-button" type="button" onClick={() => onRelinkMedia('cover')}>
                <FolderOpen size={15} />
                Relink cover art
              </button>
              <button className="secondary-button" type="button" onClick={() => onSetCover(undefined)}>
                None
              </button>
            </div>
            <Field label="Video cover art">
              <select value={project.videoCoverPath ?? ''} onChange={(event) => {
                if (!event.target.value) {
                  onSetVideo(undefined);
                  return;
                }
                const asset = scan?.groups.videoCoverArt.find((item) => item.path === event.target.value);
                if (asset) onSetVideo(asset);
              }}>
                <option value="">None</option>
                {scan?.groups.videoCoverArt.map((asset) => <option key={asset.id} value={asset.path}>{asset.name}</option>)}
              </select>
            </Field>
            <div className="inline-actions">
              <button className="secondary-button" type="button" onClick={() => onRelinkMedia('video')}>
                <FolderOpen size={15} />
                Relink video cover
              </button>
              <button className="secondary-button" type="button" onClick={() => onSetVideo(undefined)}>
                None
              </button>
            </div>
            <Field label="Teaser duration">
              <input
                type="number"
                min="1"
                max="180"
                step="0.1"
                value={settings.teaserDuration}
                onChange={(event) => {
                  const teaserDuration = parseNumber(event.target.value, settings.teaserDuration);
                  onSettingsChange({ teaserDuration, endOffset: settings.startOffset + teaserDuration, regionEnd: settings.startOffset + teaserDuration });
                }}
              />
            </Field>
            <Field label="Start offset">
              <input
                type="number"
                min="0"
                step="0.01"
                value={settings.startOffset}
                onChange={(event) => onSettingsChange({ startOffset: parseNumber(event.target.value, settings.startOffset), regionStart: parseNumber(event.target.value, settings.startOffset) })}
              />
            </Field>
            <Field label="End offset">
              <input
                type="number"
                min="0"
                step="0.01"
                value={settings.endOffset}
                onChange={(event) => {
                  const endOffset = parseNumber(event.target.value, settings.endOffset);
                  onSettingsChange({ endOffset, regionEnd: endOffset, teaserDuration: Math.max(1, endOffset - settings.startOffset) });
                }}
              />
            </Field>
            <Field label="Loop">
              <Switch checked={settings.loop} onChange={(loop) => onSettingsChange({ loop })} />
            </Field>
            <Field label="Aspect ratio preset">
              <select value={settings.primaryAspect} onChange={(event) => onSettingsChange({ primaryAspect: event.target.value as TeaserSettings['primaryAspect'] })}>
                {ASPECT_RATIOS.map((preset) => <option value={preset.key} key={preset.key}>{preset.label}</option>)}
              </select>
            </Field>
            <MatchList title="Suggested Cover Art" candidates={coverCandidates} onPick={onSetCover} />
            <MatchList title="Suggested Video Cover" candidates={videoCandidates} onPick={onSetVideo} />
            {isDemo && <div className="notice">Demo paths mirror the sample folder. Select a real folder for playback and export.</div>}
            {selectedSong && <div className="notice">Selected section: {formatTime(settings.startOffset)} to {formatTime(settings.endOffset)}.</div>}
          </div>
        )}

        {tab === 'text' && (
          <div className="stack">
            <Field label="Title visibility">
              <Switch checked={settings.titleVisible} onChange={(titleVisible) => onSettingsChange({ titleVisible })} />
            </Field>
            <Field label="Subtitle visibility">
              <Switch checked={settings.subtitleVisible} onChange={(subtitleVisible) => onSettingsChange({ subtitleVisible })} />
            </Field>
            <Field label="Font family">
              <select value={settings.fontFamily} onChange={(event) => onSettingsChange({ fontFamily: event.target.value })}>
                <option>Inter, Segoe UI, sans-serif</option>
                <option>Consolas, Cascadia Mono, monospace</option>
                <option>Arial, sans-serif</option>
                <option>Georgia, serif</option>
              </select>
            </Field>
            <Field label="Font size">
              <input type="range" min="24" max="120" value={settings.fontSize} onChange={(event) => onSettingsChange({ fontSize: Number(event.target.value) })} />
            </Field>
            <Field label="Position preset">
              <select value={settings.positionPreset} onChange={(event) => onSettingsChange({ positionPreset: event.target.value as TeaserSettings['positionPreset'] })}>
                <option value="top-left">Top Left</option>
                <option value="top-center">Top Center</option>
                <option value="center">Center</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-center">Bottom Center</option>
              </select>
            </Field>
            <div className="notice">Text positions are stored per aspect ratio. Drag text directly in the preview or use these controls.</div>
            <Field label="Title X">
              <input type="range" min="0" max="100" step="0.5" value={activeTextTransform.title.x} onChange={(event) => updateActiveTextTransform('title', { x: Number(event.target.value) })} />
            </Field>
            <Field label="Title Y">
              <input type="range" min="0" max="100" step="0.5" value={activeTextTransform.title.y} onChange={(event) => updateActiveTextTransform('title', { y: Number(event.target.value) })} />
            </Field>
            <Field label="Subtitle X">
              <input type="range" min="0" max="100" step="0.5" value={activeTextTransform.subtitle.x} onChange={(event) => updateActiveTextTransform('subtitle', { x: Number(event.target.value) })} />
            </Field>
            <Field label="Subtitle Y">
              <input type="range" min="0" max="100" step="0.5" value={activeTextTransform.subtitle.y} onChange={(event) => updateActiveTextTransform('subtitle', { y: Number(event.target.value) })} />
            </Field>
            <Field label="Glow amount">
              <input type="range" min="0" max="80" value={settings.glowAmount} onChange={(event) => onSettingsChange({ glowAmount: Number(event.target.value) })} />
            </Field>
            <Field label="Letter spacing">
              <input type="range" min="0" max="12" value={settings.letterSpacing} onChange={(event) => onSettingsChange({ letterSpacing: Number(event.target.value) })} />
            </Field>
            <Field label="Text animation">
              <select value={settings.textAnimation} onChange={(event) => onSettingsChange({ textAnimation: event.target.value as TeaserSettings['textAnimation'] })}>
                <option value="none">None</option>
                <option value="fade-in">Fade In</option>
                <option value="glitch-slide-up">Glitch Slide Up</option>
                <option value="soft-login">Soft Login</option>
                <option value="signal-restore">Signal Restore</option>
                <option value="memory-bloom">Memory Bloom</option>
              </select>
            </Field>
          </div>
        )}

        {tab === 'animation' && (
          <div className="stack">
            <Field label="Background type">
              <select value={settings.backgroundType} onChange={(event) => onSettingsChange({ backgroundType: event.target.value as TeaserSettings['backgroundType'] })}>
                <option value="static-cover">Static cover art</option>
                <option value="video-cover">Video cover art</option>
                <option value="hybrid">Hybrid still + motion overlays</option>
              </select>
            </Field>
            <div className="notice">Media framing applies to the active aspect ratio. Drag the preview to reposition; Ctrl+wheel scales it; corner handles rotate it.</div>
            <Field label="Media fit">
              <select value={activeMediaTransform.fitMode} onChange={(event) => updateActiveMediaTransform({ fitMode: event.target.value as typeof activeMediaTransform.fitMode })}>
                <option value="fit">Fit crop</option>
                <option value="contain">Contain</option>
                <option value="fill">Fill stretch</option>
              </select>
            </Field>
            <Field label="Media X">
              <input type="range" min="0" max="100" step="0.5" value={activeMediaTransform.positionX} onChange={(event) => updateActiveMediaTransform({ positionX: Number(event.target.value) })} />
            </Field>
            <Field label="Media Y">
              <input type="range" min="0" max="100" step="0.5" value={activeMediaTransform.positionY} onChange={(event) => updateActiveMediaTransform({ positionY: Number(event.target.value) })} />
            </Field>
            <Field label="Media scale">
              <input type="range" min="1" max="2.5" step="0.01" value={activeMediaTransform.scale} onChange={(event) => updateActiveMediaTransform({ scale: Number(event.target.value) })} />
            </Field>
            <Field label="Media rotation">
              <input type="range" min="-180" max="180" step="0.5" value={activeMediaTransform.rotation} onChange={(event) => updateActiveMediaTransform({ rotation: Number(event.target.value) })} />
            </Field>
            <div className="inline-actions">
              <button className="secondary-button" type="button" onClick={() => updateActiveMediaTransform({ positionX: 50, positionY: 50 })}>
                Reset position
              </button>
              <button className="secondary-button" type="button" onClick={() => updateActiveMediaTransform({ scale: 1 })}>
                Reset scale
              </button>
            </div>
            <div className="inline-actions">
              <button className="secondary-button" type="button" onClick={() => updateActiveMediaTransform({ rotation: 0 })}>
                Reset rotation
              </button>
              <button className="secondary-button" type="button" onClick={() => updateActiveMediaTransform(DEFAULT_MEDIA_TRANSFORMS[settings.primaryAspect])}>
                Reset framing
              </button>
            </div>
            <Field label="Motion keyframes">
              <Switch checked={activeMediaMotion.enabled} onChange={(enabled) => updateActiveMediaMotion({ enabled })} />
            </Field>
            <Field label="Motion easing">
              <select value={activeMediaMotion.easing} onChange={(event) => updateActiveMediaMotion({ easing: event.target.value as MotionEasing })}>
                <option value="linear">Linear</option>
                <option value="ease-in">Ease In</option>
                <option value="ease-out">Ease Out</option>
                <option value="ease-in-out">Ease In/Out</option>
                <option value="soft-drift">Soft Drift</option>
              </select>
            </Field>
            {activeMediaMotion.enabled && (
              <>
                <div className="inline-actions">
                  <button className="secondary-button" type="button" onClick={() => updateActiveMediaMotion({ start: { ...activeMediaTransform } })}>
                    Set start from current
                  </button>
                  <button className="secondary-button" type="button" onClick={() => updateActiveMediaMotion({ end: { ...activeMediaTransform } })}>
                    Set end from current
                  </button>
                </div>
                <div className="inline-actions">
                  <button className="secondary-button" type="button" onClick={() => updateActiveMediaMotion(DEFAULT_MEDIA_MOTION[settings.primaryAspect])}>
                    Reset motion
                  </button>
                </div>
                <div className="mini-heading">Motion Start</div>
                <Field label="Start X">
                  <input type="range" min="0" max="100" step="0.5" value={activeMediaMotion.start.positionX} onChange={(event) => updateMotionKeyframe('start', { positionX: Number(event.target.value) })} />
                </Field>
                <Field label="Start Y">
                  <input type="range" min="0" max="100" step="0.5" value={activeMediaMotion.start.positionY} onChange={(event) => updateMotionKeyframe('start', { positionY: Number(event.target.value) })} />
                </Field>
                <Field label="Start scale">
                  <input type="range" min="1" max="2.5" step="0.01" value={activeMediaMotion.start.scale} onChange={(event) => updateMotionKeyframe('start', { scale: Number(event.target.value) })} />
                </Field>
                <Field label="Start rotate">
                  <input type="range" min="-180" max="180" step="0.5" value={activeMediaMotion.start.rotation} onChange={(event) => updateMotionKeyframe('start', { rotation: Number(event.target.value) })} />
                </Field>
                <div className="mini-heading">Motion End</div>
                <Field label="End X">
                  <input type="range" min="0" max="100" step="0.5" value={activeMediaMotion.end.positionX} onChange={(event) => updateMotionKeyframe('end', { positionX: Number(event.target.value) })} />
                </Field>
                <Field label="End Y">
                  <input type="range" min="0" max="100" step="0.5" value={activeMediaMotion.end.positionY} onChange={(event) => updateMotionKeyframe('end', { positionY: Number(event.target.value) })} />
                </Field>
                <Field label="End scale">
                  <input type="range" min="1" max="2.5" step="0.01" value={activeMediaMotion.end.scale} onChange={(event) => updateMotionKeyframe('end', { scale: Number(event.target.value) })} />
                </Field>
                <Field label="End rotate">
                  <input type="range" min="-180" max="180" step="0.5" value={activeMediaMotion.end.rotation} onChange={(event) => updateMotionKeyframe('end', { rotation: Number(event.target.value) })} />
                </Field>
              </>
            )}
            <EffectControl label="Particles" value={settings.effects.particles} onChange={(particles) => onSettingsChange({ effects: { ...settings.effects, particles } })} />
            <EffectControl label="Scanlines" value={settings.effects.scanlines} onChange={(scanlines) => onSettingsChange({ effects: { ...settings.effects, scanlines } })} />
            <EffectControl label="Light sweep" value={settings.effects.lightSweep} onChange={(lightSweep) => onSettingsChange({ effects: { ...settings.effects, lightSweep } })} />
            <EffectControl label="Bloom pulse" value={settings.effects.bloomPulse} onChange={(bloomPulse) => onSettingsChange({ effects: { ...settings.effects, bloomPulse } })} />
            <EffectControl label="VHS noise" value={settings.effects.vhsNoise} onChange={(vhsNoise) => onSettingsChange({ effects: { ...settings.effects, vhsNoise } })} />
            <EffectControl label="Chromatic aberration" value={settings.effects.chromaticAberration} onChange={(chromaticAberration) => onSettingsChange({ effects: { ...settings.effects, chromaticAberration } })} />
            <EffectControl label="UI flicker" value={settings.effects.uiFlicker} onChange={(uiFlicker) => onSettingsChange({ effects: { ...settings.effects, uiFlicker } })} />
            <Field label="Video loop mode">
              <select value={settings.videoLoopMode} onChange={(event) => onSettingsChange({ videoLoopMode: event.target.value as TeaserSettings['videoLoopMode'] })}>
                <option value="loop">Loop</option>
                <option value="trim">Trim</option>
                <option value="freeze-last-frame">Freeze last frame</option>
              </select>
            </Field>
          </div>
        )}

        {tab === 'audio' && (
          <div className="stack">
            <Field label="Waveform display">
              <Switch checked={settings.waveformDisplay} onChange={(waveformDisplay) => onSettingsChange({ waveformDisplay })} />
            </Field>
            <Field label="Waveform style">
              <select value={settings.waveformStyle} onChange={(event) => onSettingsChange({ waveformStyle: event.target.value as TeaserSettings['waveformStyle'] })}>
                <option value="minimal">Minimal</option>
                <option value="neon">Neon</option>
                <option value="pixel">Pixel</option>
                <option value="glass">Glass</option>
              </select>
            </Field>
            <Field label="Normalize audio">
              <Switch checked={settings.normalizeAudio} onChange={(normalizeAudio) => onSettingsChange({ normalizeAudio })} />
            </Field>
            <Field label="Audio gain">
              <input type="range" min="0" max="2" step="0.01" value={settings.audioGain} onChange={(event) => onSettingsChange({ audioGain: Number(event.target.value) })} />
            </Field>
            <Field label="Fade in/out">
              <Switch checked={settings.fadeAudio} onChange={(fadeAudio) => onSettingsChange({ fadeAudio })} />
            </Field>
            <Field label="Symmetrical fade">
              <Switch checked={fadeDurationsLinked} onChange={updateFadeDurationsLinked} />
            </Field>
            {fadeDurationsLinked ? (
              <Field label="Fade duration">
                <input
                  type="number"
                  min="0"
                  max={maxFadeDuration}
                  step="0.05"
                  value={fadeInDuration}
                  onChange={(event) => updateFadeDuration('linked', parseNumber(event.target.value, fadeInDuration))}
                />
              </Field>
            ) : (
              <>
                <Field label="Fade in">
                  <input
                    type="number"
                    min="0"
                    max={maxFadeDuration}
                    step="0.05"
                    value={fadeInDuration}
                    onChange={(event) => updateFadeDuration('in', parseNumber(event.target.value, fadeInDuration))}
                  />
                </Field>
                <Field label="Fade out">
                  <input
                    type="number"
                    min="0"
                    max={maxFadeDuration}
                    step="0.05"
                    value={fadeOutDuration}
                    onChange={(event) => updateFadeDuration('out', parseNumber(event.target.value, fadeOutDuration))}
                  />
                </Field>
              </>
            )}
            <Field label="Snippet region start">
              <input type="number" min="0" step="0.01" value={settings.regionStart} onChange={(event) => onSettingsChange({ regionStart: parseNumber(event.target.value, settings.regionStart), startOffset: parseNumber(event.target.value, settings.regionStart) })} />
            </Field>
            <Field label="Snippet region end">
              <input type="number" min="0" step="0.01" value={settings.regionEnd} onChange={(event) => onSettingsChange({ regionEnd: parseNumber(event.target.value, settings.regionEnd), endOffset: parseNumber(event.target.value, settings.regionEnd) })} />
            </Field>
            <Field label="Loop selected region">
              <Switch checked={settings.loopRegion} onChange={(loopRegion) => onSettingsChange({ loopRegion })} />
            </Field>
            <button className="secondary-button" type="button" onClick={onPlayRegion} disabled={!selectedSong || isDemo}>
              <Play size={15} />
              Play selected region
            </button>
            <div className="notice">Drag the fade handles on the waveform lane to adjust fade length visually. The preview waveform follows the current fade level while playback or scrubbing moves through the teaser.</div>
          </div>
        )}

        {tab === 'export' && (
          <div className="stack">
            <Field label="Quality">
              <select value={settings.exportQuality} onChange={(event) => onSettingsChange({ exportQuality: event.target.value as TeaserSettings['exportQuality'] })}>
                <option value="draft">Draft</option>
                <option value="high-1080p">High 1080p</option>
                <option value="master">Master</option>
              </select>
            </Field>
            <Field label="Frame rate">
              <select value={settings.frameRate} onChange={(event) => onSettingsChange({ frameRate: Number(event.target.value) as TeaserSettings['frameRate'] })}>
                <option value={24}>24</option>
                <option value={30}>30</option>
                <option value={60}>60</option>
              </select>
            </Field>
            <Field label="Format">
              <select value={settings.exportFormat} onChange={(event) => onSettingsChange({ exportFormat: event.target.value as TeaserSettings['exportFormat'] })}>
                <option value="h264-mp4">H.264 MP4</option>
                <option value="prores-mov" disabled>ProRes MOV if available later</option>
              </select>
            </Field>
            <Field label="Output folder">
              <button className="field-button" type="button" onClick={onSelectOutputFolder}>
                <FolderOpen size={15} />
                {settings.outputFolder ? 'Change folder' : 'Select folder'}
              </button>
            </Field>
            <div className="output-hint">{defaultOutputHint(project, selectedTarget.aspect)}</div>
            <div className="export-buttons">
              <button className="secondary-button" type="button" onClick={() => onExportTargets([settings.primaryAspect])} disabled={exporting || isDemo}>
                <UploadCloud size={16} />
                Export selected format only
              </button>
              <button className="primary-button" type="button" onClick={() => onExportTargets(EXPORT_TARGETS.map((target) => target.aspect))} disabled={exporting || isDemo}>
                <UploadCloud size={16} />
                Export all formats
              </button>
            </div>
            <div className="inline-actions">
              <button className="secondary-button" type="button" onClick={onCancelExports} disabled={!exporting}>
                <CircleAlert size={15} />
                Cancel exports
              </button>
              <button className="secondary-button" type="button" onClick={onOpenOutputFolder}>
                <FolderOpen size={15} />
                Open output folder
              </button>
            </div>
            <div className={`ffmpeg-status ${ffmpegStatus?.available ? 'ok' : 'warn'}`}>
              {ffmpegStatus?.available ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}
              <span>{ffmpegStatus?.message ?? 'FFmpeg status not checked'}</span>
            </div>
            <ExportQueue events={exportEvents} />
          </div>
        )}

        {tab === 'settings' && (
          <div className="stack">
            <div className="notice">FFmpeg can be installed system-wide or supplied manually. TeaserForge also tries a bundled package fallback.</div>
            <Field label="FFmpeg path">
              <input
                value={appSettings.ffmpegPath ?? ''}
                placeholder="C:\\ffmpeg\\bin\\ffmpeg.exe"
                onChange={(event) => onAppSettingsChange({ ...appSettings, ffmpegPath: event.target.value || undefined })}
              />
            </Field>
            <button className="secondary-button" type="button" onClick={onCheckFfmpeg}>
              <CheckCircle2 size={15} />
              Check FFmpeg
            </button>
            <div className={`ffmpeg-status ${ffmpegStatus?.available ? 'ok' : 'warn'}`}>
              {ffmpegStatus?.available ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}
              <span>{ffmpegStatus?.path ?? ffmpegStatus?.message ?? 'No FFmpeg check has run yet.'}</span>
            </div>
            {(appSettings.recentProjects ?? []).length > 0 && (
              <div className="recent-projects">
                <div className="mini-heading">Recent Projects</div>
                {(appSettings.recentProjects ?? []).map((rootPath) => (
                  <button key={rootPath} type="button" onClick={() => onLoadRecentProject(rootPath)}>
                    {rootPath}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
