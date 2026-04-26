import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { AspectRatioPreset, MediaAsset, MediaTransform, ProjectConfig, TeaserSettings, TextLayerTransform } from '../../../shared/types';
import { DEFAULT_MEDIA_TRANSFORMS, DEFAULT_TEXT_TRANSFORMS, DEFAULT_TRACKS } from '../../../shared/types';
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
  onTextTransformChange: (aspect: AspectRatioPreset['key'], layer: 'title' | 'subtitle', patch: Partial<TextLayerTransform>) => void;
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

interface ScaleStart {
  pointerId: number;
  startX: number;
  startY: number;
  startScale: number;
}

interface TextPanStart {
  pointerId: number;
  layer: 'title' | 'subtitle';
  startX: number;
  startY: number;
  startLayerX: number;
  startLayerY: number;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function fadeLevelAtTime(currentTime: number, duration: number, fadeInDuration: number, fadeOutDuration: number): number {
  const fadeInLevel = fadeInDuration > 0 ? clamp(currentTime / fadeInDuration, 0, 1) : 1;
  const fadeOutLevel = fadeOutDuration > 0 ? clamp((duration - currentTime) / fadeOutDuration, 0, 1) : 1;
  return clamp(Math.min(fadeInLevel, fadeOutLevel), 0, 1);
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
  onMediaTransformChange,
  onTextTransformChange
}: PreviewCanvasProps) {
  const settings = project.settings;
  const panStartRef = useRef<PanStart | null>(null);
  const scaleStartRef = useRef<ScaleStart | null>(null);
  const textPanStartRef = useRef<TextPanStart | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [draggingText, setDraggingText] = useState<'title' | 'subtitle' | null>(null);
  const duration = Math.max(1, settings.endOffset - settings.startOffset || settings.teaserDuration);
  const progress = Math.min(1, Math.max(0, currentTime / duration));
  const fadeInDuration = settings.fadeAudio ? clamp(settings.fadeInDuration ?? settings.fadeDuration ?? 0, 0, duration / 2) : 0;
  const fadeOutDuration = settings.fadeAudio ? clamp(settings.fadeOutDuration ?? settings.fadeDuration ?? 0, 0, duration / 2) : 0;
  const fadeLevel = settings.fadeAudio ? fadeLevelAtTime(currentTime, duration, fadeInDuration, fadeOutDuration) : 1;
  const fadeInPercent = (fadeInDuration / duration) * 100;
  const fadeOutPercent = (fadeOutDuration / duration) * 100;
  const tracks = { ...DEFAULT_TRACKS, ...project.timeline.tracks };
  const wantsVideo = settings.backgroundType !== 'static-cover' && video && !videoFailed && tracks.video.visible && !tracks.video.muted;
  const background = wantsVideo ? video : tracks.cover.visible && !tracks.cover.muted ? cover : undefined;
  const mediaTransform = settings.mediaTransforms?.[preset.key] ?? DEFAULT_MEDIA_TRANSFORMS[preset.key];
  const textTransform = settings.textTransforms?.[preset.key] ?? DEFAULT_TEXT_TRANSFORMS[preset.key];
  const mediaStyle: CSSProperties = {
    objectPosition: `${mediaTransform.positionX}% ${mediaTransform.positionY}%`,
    objectFit: mediaTransform.fitMode === 'fill' ? 'fill' : mediaTransform.fitMode === 'contain' ? 'contain' : 'cover',
    transform: `scale(${mediaTransform.scale}) rotate(${mediaTransform.rotation}deg)`,
    transformOrigin: `${mediaTransform.positionX}% ${mediaTransform.positionY}%`
  };
  const bars = syntheticBars(preset.key === '16x9' ? 72 : 48, project.selectedSongPath ?? project.title);
  const backgroundUrl = !isDemo && background ? teaserForgeApi.mediaUrl(background.path) : '';
  const titleText = project.title.trim();
  const subtitleText = project.subtitle.trim();
  const clipIsActive = (kind: 'title' | 'subtitle'): boolean =>
    project.timeline.clips.some((clip) => clip.kind === kind && clip.enabled && currentTime >= clip.start && currentTime <= clip.end);
  const effectIsActive = (effectKey: keyof TeaserSettings['effects']): boolean =>
    tracks.effects.visible &&
    !tracks.effects.muted &&
    project.timeline.clips.some((clip) => clip.kind === 'effect' && clip.effectKey === effectKey && clip.enabled && currentTime >= clip.start && currentTime <= clip.end);
  const titleActive = tracks.text.visible && !tracks.text.muted && settings.titleVisible && Boolean(titleText) && clipIsActive('title');
  const subtitleActive = tracks.text.visible && !tracks.text.muted && settings.subtitleVisible && Boolean(subtitleText) && clipIsActive('subtitle');

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
    const scaleStart = scaleStartRef.current;
    if (scaleStart && scaleStart.pointerId === event.pointerId) {
      event.preventDefault();
      const delta = ((event.clientX - scaleStart.startX) - (event.clientY - scaleStart.startY)) / 240;
      onMediaTransformChange(preset.key, { scale: Math.round(clamp(scaleStart.startScale + delta, 1, 2.5) * 100) / 100 });
      return;
    }

    const textPanStart = textPanStartRef.current;
    if (textPanStart && textPanStart.pointerId === event.pointerId) {
      event.preventDefault();
      onTextTransformChange(preset.key, textPanStart.layer, {
        x: clamp(textPanStart.startLayerX + ((event.clientX - textPanStart.startX) / textPanStart.width) * 100, 0, 100),
        y: clamp(textPanStart.startLayerY + ((event.clientY - textPanStart.startY) / textPanStart.height) * 100, 0, 100)
      });
      return;
    }

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
    const scaleStart = scaleStartRef.current;
    if (scaleStart && scaleStart.pointerId === event.pointerId) {
      scaleStartRef.current = null;
      setIsPanning(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }

    const textPanStart = textPanStartRef.current;
    if (textPanStart && textPanStart.pointerId === event.pointerId) {
      textPanStartRef.current = null;
      setDraggingText(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }

    const panStart = panStartRef.current;
    if (!panStart || panStart.pointerId !== event.pointerId) return;
    panStartRef.current = null;
    setIsPanning(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const beginMediaScale = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (!background) return;
    onSetPrimary();
    event.preventDefault();
    event.stopPropagation();
    scaleStartRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScale: mediaTransform.scale
    };
    stageRef.current?.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };

  const beginTextDrag = (event: ReactPointerEvent<HTMLDivElement>, layer: 'title' | 'subtitle'): void => {
    const stage = stageRef.current;
    if (!stage) return;
    onSetPrimary();
    event.preventDefault();
    event.stopPropagation();
    const rect = stage.getBoundingClientRect();
    const layerTransform = textTransform[layer];
    textPanStartRef.current = {
      pointerId: event.pointerId,
      layer,
      startX: event.clientX,
      startY: event.clientY,
      startLayerX: layerTransform.x,
      startLayerY: layerTransform.y,
      width: rect.width,
      height: rect.height
    };
    stage.setPointerCapture(event.pointerId);
    setDraggingText(layer);
  };

  const textLayerStyle = (layer: 'title' | 'subtitle') => ({
    left: `${textTransform[layer].x}%`,
    top: `${textTransform[layer].y}%`,
    transform: 'translate(-50%, -50%)'
  });

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

          {background && isPrimary && (
            <div className="preview-transform-box">
              {['nw', 'ne', 'sw', 'se'].map((handle) => (
                <button key={handle} className={`transform-handle ${handle}`} type="button" title="Drag to scale media" onPointerDown={beginMediaScale} />
              ))}
            </div>
          )}

          {titleActive && (
            <div className={`preview-text-layer title ${draggingText === 'title' ? 'dragging' : ''}`} style={textLayerStyle('title')} onPointerDown={(event) => beginTextDrag(event, 'title')}>
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
            </div>
          )}
          {subtitleActive && (
            <div className={`preview-text-layer subtitle ${draggingText === 'subtitle' ? 'dragging' : ''}`} style={textLayerStyle('subtitle')} onPointerDown={(event) => beginTextDrag(event, 'subtitle')}>
              <p>{subtitleText}</p>
            </div>
          )}

          {settings.waveformDisplay && (
            <div className={`preview-waveform ${settings.waveformStyle}`}>
              {bars.map((height, index) => (
                <span
                  key={`${preset.key}-${index}`}
                  style={{
                    height: `${8 + (18 + height * 62) * (0.32 + fadeLevel * 0.68)}%`,
                    opacity: 0.28 + fadeLevel * 0.72
                  }}
                />
              ))}
            </div>
          )}

          {settings.fadeAudio && (
            <div
              className="preview-audio-envelope"
              style={{
                '--fade-level': String(fadeLevel),
                '--fade-line-top': `${(1 - fadeLevel) * 100}%`,
                '--fade-meter-height': `${Math.max(8, fadeLevel * 100)}%`,
                '--fade-in-width': `${fadeInPercent}%`,
                '--fade-out-width': `${fadeOutPercent}%`,
                '--fade-progress': `${progress * 100}%`
              } as CSSProperties}
              aria-hidden="true"
            >
              {fadeInDuration > 0 && <span className="fade-ramp fade-in" />}
              {fadeOutDuration > 0 && <span className="fade-ramp fade-out" />}
              <i />
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
