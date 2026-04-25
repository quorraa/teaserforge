import type { DragEvent } from 'react';
import { useEffect, useState } from 'react';
import type { AspectRatioPreset, MediaAsset, ProjectConfig } from '../../../shared/types';
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

export function PreviewCanvas({
  preset,
  project,
  cover,
  video,
  currentTime,
  isPrimary,
  isDemo,
  onSetPrimary,
  onDropAsset
}: PreviewCanvasProps): JSX.Element {
  const settings = project.settings;
  const [videoFailed, setVideoFailed] = useState(false);
  const duration = Math.max(1, settings.endOffset - settings.startOffset || settings.teaserDuration);
  const progress = Math.min(1, Math.max(0, currentTime / duration));
  const wantsVideo = settings.backgroundType !== 'static-cover' && video && !videoFailed;
  const background = wantsVideo ? video : cover;
  const bars = syntheticBars(preset.key === '16x9' ? 72 : 48, project.selectedSongPath ?? project.title);
  const backgroundUrl = !isDemo && background ? teaserForgeApi.mediaUrl(background.path) : '';
  const titleText = project.title.trim();
  const subtitleText = project.subtitle.trim();

  useEffect(() => {
    setVideoFailed(false);
  }, [video?.path]);

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
        <div className="preview-stage" style={{ aspectRatio: `${preset.width} / ${preset.height}` }}>
          {backgroundUrl && background?.kind === 'video' ? (
            <video className="preview-bg" src={backgroundUrl} autoPlay muted loop playsInline onError={() => setVideoFailed(true)} />
          ) : backgroundUrl && background?.kind === 'image' ? (
            <img className="preview-bg" src={backgroundUrl} alt="" />
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
          {settings.effects.bloomPulse.enabled && <div className="effect-bloom" style={{ opacity: settings.effects.bloomPulse.intensity }} />}
          {settings.effects.lightSweep.enabled && <div className="effect-sweep" style={{ opacity: settings.effects.lightSweep.intensity }} />}
          {settings.effects.scanlines.enabled && <div className="effect-scanlines" style={{ opacity: settings.effects.scanlines.intensity }} />}
          {settings.effects.chromaticAberration.enabled && <div className="effect-chroma" style={{ opacity: settings.effects.chromaticAberration.intensity }} />}
          {settings.showGrid && <div className="preview-grid" />}
          {settings.showSafeArea && <div className="preview-safe-area" />}

          {(titleText || subtitleText) && (
            <div className={`preview-copy ${textPositionClass(settings.positionPreset)}`}>
            {settings.titleVisible && titleText && (
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
            {settings.subtitleVisible && subtitleText && <p>{subtitleText}</p>}
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
