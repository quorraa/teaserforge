import type { DragEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { AspectRatioPreset, MediaAsset, MediaTransform, ProjectConfig, TeaserSettings } from '../../../shared/types';
import { DEFAULT_MEDIA_TRANSFORMS } from '../../../shared/types';
import { teaserForgeApi } from '../../lib/api';
import { formatTime } from '../../lib/timecode';
import { syntheticBars } from '../../lib/waveform';

interface PreviewCanvasProps {
  preset: AspectRatioPreset;
  project: ProjectConfig;
  cover?: MediaAsset;
  video?: MediaAsset;
  currentTime: number;
  isPrimary: boolean;
  isDemo: boolean;
  onSetPrimary: () => void;
  onDropAsset: (asset: MediaAsset) => void;
  onMediaTransformChange: (aspect: AspectRatioPreset['key'], patch: Partial<MediaTransform>) => void;
}

interface PanStart {
  pointerId: number;
  startX: number;
  startY: number;
  startPositionX: number;
  startPositionY: number;
  width: number;
  height: number;
}

function readDroppedAsset(event: DragEvent): MediaAsset | undefined {
  const raw = event.dataTransfer.getData('application/x-teaserforge-asset');
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as MediaAsset;
  } catch {
    return undefined;
  }
}

function textPositionClass(position: ProjectConfig['settings']['positionPreset']): string {
  return `text-${position}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function PreviewCanvas({
  preset,
  project,
  cover,
  video,
  currentTime,
  isPrimary,
  isDemo,
  onSetPrimary,
  onDropAsset,
  onMediaTransformChange
}: PreviewCanvasProps) {
  const settings = project.settings;
  const panStartRef = useRef<PanStart | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const duration = Math.max(1, settings.endOffset - settings.startOffset || settings.teaserDuration);
  const progress = Math.min(1, Math.max(0, currentTime / duration));
  const wantsVideo = settings.backgroundType !== 'static-cover' && video && !videoFailed;
  const background = wantsVideo ? video : cover;
  const mediaTransform = settings.mediaTransforms?.[preset.key] ?? DEFAULT_MEDIA_TRANSFORMS[preset.key];
  const mediaStyle = {
    objectPosition: `${mediaTransform.positionX}% ${mediaTransform.positionY}%`,
    transform: `scale(${mediaTransform.scale})`,
    transformOrigin: `${mediaTransform.positionX}% ${mediaTransform.positionY}%`
  };
  const bars = syntheticBars(preset.key === '16x9' ? 72 : 48, project.selectedSongPath ?? project.title);
  const backgroundUrl = !isDemo && background ? teaserForgeApi.mediaUrl(background.path) : '';
  const titleText = project.title.trim();
  const subtitleText = project.subtitle.trim();
  const clipIsActive = (kind: 'title' | 'subtitle'): boolean =>
    project.timeline.clips.some((clip) => clip.kind === kind && clip.enabled && currentTime >= clip.start && currentTime <= clip.end);
  const effectIsActive = (effectKey: keyof TeaserSettings['effects']): boolean =>
    project.timeline.clips.some((clip) => clip.kind === 'effect' && clip.effectKey === effectKey && clip.enabled && currentTime >= clip.start && currentTime <= clip.end);
  const titleActive = settings.titleVisible && Boolean(titleText) && clipIsActive('title');
  const subtitleActive = settings.subtitleVisible && Boolean(subtitleText) && clipIsActive('subtitle');

  useEffect(() => {
    setVideoFailed(false);
  }, [video?.path]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleWheel = (event: WheelEvent): void => {
      if (!background || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      const nextScale = clamp(mediaTransform.scale + (event.deltaY < 0 ? 0.05 : -0.05), 1, 2.5);
      onMediaTransformChange(preset.key, { scale: Math.round(nextScale * 100) / 100 });
    };

    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, [background, mediaTransform.scale, onMediaTransformChange, preset.key]);

  const beginMediaPan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!background || event.button !== 0) return;
    onSetPrimary();
    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    panStartRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPositionX: mediaTransform.positionX,
      startPositionY: mediaTransform.positionY,
      width: rect.width,
      height: rect.height
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };

  const moveMediaPan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const panStart = panStartRef.current;
    if (!panStart || panStart.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = ((event.clientX - panStart.startX) / panStart.width) * 100;
    const deltaY = ((event.clientY - panStart.startY) / panStart.height) * 100;

    onMediaTransformChange(preset.key, {
      positionX: clamp(panStart.startPositionX - deltaX, 0, 100),
      positionY: clamp(panStart.startPositionY - deltaY, 0, 100)
    });
  };

  const endMediaPan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const panStart = panStartRef.current;
    if (!panStart || panStart.pointerId !== event.pointerId) return;
    panStartRef.current = null;
    setIsPanning(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <section
      className={`preview-shell ${isPrimary ? 'primary-preview' : ''}`}
      onClick={onSetPrimary}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const asset = readDroppedAsset(event);
        if (asset) onDropAsset(asset);
      }}
    >
      <button type="button" className="preview-heading" onClick={onSetPrimary}>
        <span className="ratio-dot" />
        {preset.label}
      </button>
      <div className="preview-stage-wrap">
        <div
          className={`preview-stage ${background ? 'editable-media' : ''} ${isPanning ? 'panning' : ''}`}
          ref={stageRef}
          style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
          onPointerDown={beginMediaPan}
          onPointerMove={moveMediaPan}
          onPointerUp={endMediaPan}
          onPointerCancel={endMediaPan}
          title={background ? 'Drag to reposition media. Ctrl+wheel to scale.' : undefined}
        >
          {backgroundUrl && background?.kind === 'video' ? (
            <video className="preview-bg" src={backgroundUrl} style={mediaStyle} autoPlay muted loop playsInline onError={() => setVideoFailed(true)} />
          ) : backgroundUrl && background?.kind === 'image' ? (
            <img className="preview-bg" src={backgroundUrl} style={mediaStyle} alt="" />
          ) : (
            <div className={`preview-placeholder ${background ? 'visual-only' : ''}`}>
              {!background && (
                <>
                  <span>TEASERFORGE</span>
                  <strong>Select cover art</strong>
                </>
              )}
            </div>
          )}

          <div className="preview-vignette" />
          {settings.effects.bloomPulse.enabled && effectIsActive('bloomPulse') && <div className="effect-bloom" style={{ opacity: settings.effects.bloomPulse.intensity }} />}
          {settings.effects.lightSweep.enabled && effectIsActive('lightSweep') && <div className="effect-sweep" style={{ opacity: settings.effects.lightSweep.intensity }} />}
          {settings.effects.scanlines.enabled && effectIsActive('scanlines') && <div className="effect-scanlines" style={{ opacity: settings.effects.scanlines.intensity }} />}
          {settings.effects.chromaticAberration.enabled && effectIsActive('chromaticAberration') && <div className="effect-chroma" style={{ opacity: settings.effects.chromaticAberration.intensity }} />}
          {settings.showGrid && <div className="preview-grid" />}
          {settings.showSafeArea && <div className="preview-safe-area" />}

          {(titleActive || subtitleActive) && (
            <div className={`preview-copy ${textPositionClass(settings.positionPreset)}`}>
            {titleActive && (
              <h3
                style={{
                  fontFamily: settings.fontFamily,
                  fontSize: `${Math.max(18, Math.round(settings.fontSize * (preset.key === '16x9' ? 0.72 : preset.key === '1x1' ? 0.62 : 0.54)))}px`,
                  letterSpacing: `${settings.letterSpacing}px`,
                  textShadow: `0 0 ${settings.glowAmount}px rgba(0,216,255,.7)`
                }}
              >
                {titleText}
              </h3>
            )}
            {subtitleActive && <p>{subtitleText}</p>}
            </div>
          )}

          {settings.waveformDisplay && (
            <div className={`preview-waveform ${settings.waveformStyle}`}>
              {bars.map((height, index) => (
                <span key={`${preset.key}-${index}`} style={{ height: `${18 + height * 62}%` }} />
              ))}
            </div>
          )}

          {settings.progressBar && (
            <div className="preview-progress">
              <div style={{ width: `${progress * 100}%` }} />
            </div>
          )}

          <div className="preview-time">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
