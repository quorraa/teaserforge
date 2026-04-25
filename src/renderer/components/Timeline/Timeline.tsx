import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import WaveSurfer from 'wavesurfer.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaAsset, ProjectConfig, TeaserSettings } from '../../../shared/types';
import { teaserForgeApi } from '../../lib/api';
import { formatTime } from '../../lib/timecode';
import { syntheticBars } from '../../lib/waveform';
import { Transport } from '../Transport/Transport';

interface TimelineProps {
  project: ProjectConfig;
  selectedSong?: MediaAsset;
  cover?: MediaAsset;
  video?: MediaAsset;
  isDemo: boolean;
  currentTime: number;
  onCurrentTime: (time: number) => void;
  onSettingsChange: (patch: Partial<TeaserSettings>) => void;
  onPlaybackChange: (playing: boolean) => void;
}

const PRESET_DURATIONS = [5, 10, 15, 20, 30, 45];

export function Timeline({
  project,
  selectedSong,
  cover,
  video,
  isDemo,
  currentTime,
  onCurrentTime,
  onSettingsChange,
  onPlaybackChange
}: TimelineProps): JSX.Element {
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const regionRef = useRef<any>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.86);
  const [audioDuration, setAudioDuration] = useState(0);
  const settings = project.settings;
  const settingsRef = useRef(settings);
  const teaserDuration = Math.max(1, settings.endOffset - settings.startOffset || settings.teaserDuration);
  const disabled = !selectedSong || isDemo;

  const waveformBars = useMemo(() => syntheticBars(140, selectedSong?.name ?? project.title), [project.title, selectedSong?.name]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!waveformRef.current || !selectedSong || isDemo) return;

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      url: teaserForgeApi.mediaUrl(selectedSong.path),
      height: 84,
      normalize: true,
      waveColor: '#3f2c75',
      progressColor: '#a66cff',
      cursorColor: '#00d8ff',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 2,
      barRadius: 2
    });

    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    waveSurferRef.current = wavesurfer;

    wavesurfer.on('ready', () => {
      const duration = wavesurfer.getDuration();
      setAudioDuration(duration);
      wavesurfer.setVolume(volume);
      const start = Math.min(settings.startOffset, Math.max(0, duration - 1));
      const end = Math.min(Math.max(settings.endOffset, start + 1), duration);
      regionRef.current = regions.addRegion({
        start,
        end,
        color: 'rgba(0, 216, 255, 0.14)',
        drag: true,
        resize: true
      });
      onSettingsChange({
        startOffset: start,
        endOffset: end,
        regionStart: start,
        regionEnd: end,
        teaserDuration: Math.max(1, end - start)
      });
    });

    wavesurfer.on('timeupdate', (time) => {
      const latestSettings = settingsRef.current;
      onCurrentTime(Math.max(0, time - latestSettings.startOffset));
      if (latestSettings.loopRegion && time >= latestSettings.endOffset) {
        wavesurfer.setTime(latestSettings.startOffset);
        wavesurfer.play();
      }
    });

    wavesurfer.on('play', () => {
      setPlaying(true);
      onPlaybackChange(true);
    });
    wavesurfer.on('pause', () => {
      setPlaying(false);
      onPlaybackChange(false);
    });
    wavesurfer.on('finish', () => {
      setPlaying(false);
      onPlaybackChange(false);
    });

    regions.on('region-updated', (region: any) => {
      const start = Math.max(0, region.start);
      const end = Math.max(start + 0.2, region.end);
      onSettingsChange({
        startOffset: start,
        endOffset: end,
        regionStart: start,
        regionEnd: end,
        teaserDuration: Math.max(1, end - start)
      });
    });

    regions.on('region-clicked', (region: any, event: MouseEvent) => {
      event.stopPropagation();
      region.play();
    });

    return () => {
      waveSurferRef.current = null;
      regionRef.current = null;
      wavesurfer.destroy();
    };
  }, [selectedSong?.path, isDemo]);

  useEffect(() => {
    waveSurferRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    if (!regionRef.current || !audioDuration) return;
    const start = Math.min(settings.startOffset, Math.max(0, audioDuration - 0.5));
    const end = Math.min(Math.max(settings.endOffset, start + 0.2), audioDuration);
    regionRef.current.setOptions({ start, end });
  }, [settings.startOffset, settings.endOffset, audioDuration]);

  const playPause = useCallback(() => {
    const wavesurfer = waveSurferRef.current;
    if (!wavesurfer) return;
    if (wavesurfer.isPlaying()) {
      wavesurfer.pause();
      return;
    }
    wavesurfer.play(settings.startOffset, settings.endOffset);
  }, [settings.endOffset, settings.startOffset]);

  const playRegion = useCallback(() => {
    waveSurferRef.current?.play(settings.startOffset, settings.endOffset);
  }, [settings.endOffset, settings.startOffset]);

  useEffect(() => {
    (window as Window & { teaserForgePlayRegion?: () => void }).teaserForgePlayRegion = playRegion;
    return () => {
      delete (window as Window & { teaserForgePlayRegion?: () => void }).teaserForgePlayRegion;
    };
  }, [playRegion]);

  const setPresetDuration = (duration: number): void => {
    onSettingsChange({
      teaserDuration: duration,
      endOffset: settings.startOffset + duration,
      regionEnd: settings.startOffset + duration
    });
  };

  const ticks = Array.from({ length: Math.max(2, Math.ceil(teaserDuration / 5) + 1) }, (_, index) => index * 5);
  const progress = Math.min(1, Math.max(0, currentTime / teaserDuration));

  return (
    <section className="timeline panel">
      <div className="timeline-top">
        <div className="time-readout">
          <strong>{formatTime(currentTime, 2)}</strong>
          <span>{formatTime(teaserDuration, 2)}</span>
        </div>
        <Transport
          playing={playing}
          loop={settings.loopRegion}
          volume={volume}
          disabled={disabled}
          onPlayPause={playPause}
          onStop={() => {
            waveSurferRef.current?.pause();
            waveSurferRef.current?.setTime(settings.startOffset);
            onCurrentTime(0);
          }}
          onJumpStart={() => {
            waveSurferRef.current?.setTime(settings.startOffset);
            onCurrentTime(0);
          }}
          onJumpEnd={() => {
            waveSurferRef.current?.setTime(settings.endOffset);
            onCurrentTime(teaserDuration);
          }}
          onLoopChange={(loopRegion) => onSettingsChange({ loopRegion })}
          onVolumeChange={setVolume}
        />
        <div className="preset-row">
          {PRESET_DURATIONS.map((duration) => (
            <button key={duration} className={Math.round(teaserDuration) === duration ? 'active' : ''} type="button" onClick={() => setPresetDuration(duration)}>
              {duration}s
            </button>
          ))}
          <button type="button" className="custom-pill">Custom</button>
        </div>
      </div>

      <div className="timeline-ruler">
        {ticks.map((tick) => (
          <span key={tick} style={{ left: `${Math.min(100, (tick / teaserDuration) * 100)}%` }}>
            {formatTime(tick)}
          </span>
        ))}
      </div>

      <div className="timeline-grid">
        <div className="track-label">Markers</div>
        <div className="track-lane marker-lane">
          <span style={{ left: '8%' }}>Intro</span>
          <span style={{ left: '45%' }}>Main Section</span>
          <span style={{ left: '84%' }}>Outro</span>
        </div>

        <div className="track-label">Audio Waveform</div>
        <div className="track-lane waveform-lane">
          <div className="playhead" style={{ left: `${progress * 100}%` }} />
          {disabled ? (
            <div className="synthetic-wave">
              {waveformBars.map((height, index) => <span key={index} style={{ height: `${height * 100}%` }} />)}
            </div>
          ) : (
            <div className="wavesurfer-host" ref={waveformRef} />
          )}
        </div>

        <div className="track-label">Text</div>
        <div className="track-lane clip-lane">
          <div className="clip text-clip" style={{ left: '2%', width: '54%' }}>{project.title}</div>
          <div className="clip text-clip secondary" style={{ left: '58%', width: '34%' }}>{project.subtitle || 'Subtitle'}</div>
        </div>

        <div className="track-label">Cover Art</div>
        <div className="track-lane clip-lane thumbnails">
          <div className="clip media-clip" style={{ left: '4%', width: '28%' }}>{cover?.name ?? 'No cover'}</div>
          <div className="clip media-clip" style={{ left: '38%', width: '28%' }}>{cover?.name ?? 'Cover art'}</div>
          <div className="clip media-clip" style={{ left: '72%', width: '22%' }}>{cover?.name ?? 'Cover art'}</div>
        </div>

        <div className="track-label">Video Cover</div>
        <div className="track-lane clip-lane thumbnails">
          <div className="clip video-clip" style={{ left: '3%', width: '24%' }}>{video?.name ?? 'No video'}</div>
          <div className="clip video-clip" style={{ left: '30%', width: '28%' }}>{video?.name ?? 'Video cover'}</div>
          <div className="clip video-clip" style={{ left: '62%', width: '32%' }}>{video?.name ?? 'Video cover'}</div>
        </div>

        <div className="track-label">Effects</div>
        <div className="track-lane effects-lane">
          {Object.entries(settings.effects).filter(([, value]) => value.enabled).map(([key], index) => (
            <div className="effect-pill" style={{ left: `${8 + index * 14}%` }} key={key}>{key.replace(/[A-Z]/g, ' $&')}</div>
          ))}
        </div>

        <div className="track-label">Export Markers</div>
        <div className="track-lane export-marker-lane">
          <div className="export-marker portrait" style={{ left: '1%', width: '28%' }}>9:16 export</div>
          <div className="export-marker square" style={{ left: '36%', width: '25%' }}>1:1 export</div>
          <div className="export-marker landscape" style={{ left: '70%', width: '28%' }}>16:9 export</div>
        </div>
      </div>
    </section>
  );
}
