import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import WaveSurfer from 'wavesurfer.js';
import { Copy, Eye, EyeOff, Lock, Scissors, StepBack, StepForward, Trash2, Unlock, Volume2, VolumeX, Wand2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type {
  AspectRatioKey,
  MediaAsset,
  ProjectConfig,
  TeaserSettings,
  TimelineClip,
  TimelineExportMarker,
  TimelineSelection,
  TimelineState,
  TimelineTrackId,
  TimelineTrackState
} from '../../../shared/types';
import { DEFAULT_TRACKS } from '../../../shared/types';
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
  onTimelineChange: (timeline: TimelineState) => void;
  onTimelineSelectionChange: (selection?: TimelineSelection) => void;
  onTimelineClipChange: (clipId: string, patch: Partial<TimelineClip>) => void;
  onTimelineMarkerChange: (markerId: string, patch: Partial<TimelineExportMarker>) => void;
  onTimelineTrackChange: (track: TimelineTrackId, patch: Partial<TimelineTrackState>) => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onSplitSelection: () => void;
  onNudgeSelection: (delta: number) => void;
  onExportMarker: (aspect: AspectRatioKey) => void;
  onPlaybackChange: (playing: boolean) => void;
}

type DragMode = 'move' | 'start' | 'end';
type DragKind = 'clip' | 'export-range';

interface DragState {
  kind: DragKind;
  id: string;
  mode: DragMode;
  startX: number;
  laneWidth: number;
  originalStart: number;
  originalEnd: number;
}

const PRESET_DURATIONS = [5, 10, 15, 20, 30, 45];
const MIN_ITEM_DURATION = 0.25;
const MIN_TIMELINE_SPAN = 45;
const MIN_TIMELINE_ZOOM = 1;
const MAX_TIMELINE_ZOOM = 4;
const TIMELINE_ZOOM_STEP = 0.25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function snapTime(value: number): number {
  return Math.round(value * 20) / 20;
}

function timeToLeft(start: number, span: number): string {
  return `${clamp((start / span) * 100, 0, 100)}%`;
}

function timeToWidth(start: number, end: number, span: number): string {
  return `${clamp(((end - start) / span) * 100, 0.8, 100)}%`;
}

function aspectChipClass(aspect: AspectRatioKey): string {
  if (aspect === '9x16') return 'portrait';
  if (aspect === '1x1') return 'square';
  return 'landscape';
}

function snapZoom(value: number): number {
  return clamp(Math.round(value * 4) / 4, MIN_TIMELINE_ZOOM, MAX_TIMELINE_ZOOM);
}

function selectionClipIds(selection?: TimelineSelection): string[] {
  if (!selection) return [];
  if (selection.type === 'clip' && selection.id) return [selection.id];
  if (selection.type === 'clips') return selection.ids ?? [];
  return [];
}

function clipClass(clip: TimelineClip): string {
  if (clip.kind === 'title' || clip.kind === 'subtitle') return `text-clip ${clip.kind === 'subtitle' ? 'secondary' : ''}`;
  if (clip.kind === 'cover-art') return 'media-clip';
  if (clip.kind === 'video-cover') return 'video-clip';
  return 'effect-clip';
}

export function Timeline({
  project,
  selectedSong,
  cover,
  video,
  isDemo,
  currentTime,
  onCurrentTime,
  onSettingsChange,
  onTimelineChange,
  onTimelineSelectionChange,
  onTimelineClipChange,
  onTimelineMarkerChange,
  onTimelineTrackChange,
  onDeleteSelection,
  onDuplicateSelection,
  onSplitSelection,
  onNudgeSelection,
  onExportMarker,
  onPlaybackChange
}: TimelineProps) {
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const regionRef = useRef<any>(null);
  const currentTimeRef = useRef(currentTime);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.86);
  const [audioDuration, setAudioDuration] = useState(0);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const settings = project.settings;
  const settingsRef = useRef(settings);
  const selected = project.timeline.selected;
  const selectedIds = selectionClipIds(selected);
  const tracks = {
    ...DEFAULT_TRACKS,
    ...project.timeline.tracks
  };
  const allTimelineEnds = [
    settings.endOffset,
    ...project.timeline.clips.map((clip) => clip.end)
  ];
  const teaserDuration = Math.max(1, settings.endOffset - settings.startOffset || settings.teaserDuration);
  const fadeInDuration = clamp(settings.fadeInDuration ?? settings.fadeDuration ?? 0, 0, teaserDuration / 2);
  const fadeOutDuration = clamp(settings.fadeOutDuration ?? settings.fadeDuration ?? 0, 0, teaserDuration / 2);
  const timelineSpan = Math.max(MIN_TIMELINE_SPAN, Math.ceil(Math.max(...allTimelineEnds, teaserDuration, audioDuration)));
  const disabled = !selectedSong;

  const waveformBars = useMemo(() => syntheticBars(140, selectedSong?.name ?? project.title), [project.title, selectedSong?.name]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    if (!waveformRef.current || !selectedSong || isDemo) return;

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      url: teaserForgeApi.mediaUrl(selectedSong.path),
      height: 78,
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

  useEffect(() => {
    if (!playing || waveSurferRef.current) return;

    const interval = window.setInterval(() => {
      const latestSettings = settingsRef.current;
      const duration = Math.max(1, latestSettings.endOffset - latestSettings.startOffset || latestSettings.teaserDuration);
      const nextTime = currentTimeRef.current + 0.05;

      if (nextTime >= duration) {
        if (latestSettings.loopRegion || latestSettings.loop) {
          currentTimeRef.current = 0;
          onCurrentTime(0);
          return;
        }
        currentTimeRef.current = duration;
        onCurrentTime(duration);
        setPlaying(false);
        onPlaybackChange(false);
        return;
      }

      currentTimeRef.current = nextTime;
      onCurrentTime(nextTime);
    }, 50);

    return () => window.clearInterval(interval);
  }, [onCurrentTime, onPlaybackChange, playing]);

  const snapToGuides = useCallback((value: number): number => {
    const guides = [
      settings.startOffset,
      settings.endOffset,
      settings.startOffset + currentTime,
      ...project.timeline.beatMarkers,
      ...project.timeline.clips.flatMap((clip) => [clip.start, clip.end])
    ];
    const closeGuide = guides.find((guide) => Math.abs(guide - value) <= 0.12);
    return snapTime(closeGuide ?? value);
  }, [currentTime, project.timeline.beatMarkers, project.timeline.clips, settings.endOffset, settings.startOffset]);

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event: PointerEvent): void => {
      const delta = ((event.clientX - dragState.startX) / dragState.laneWidth) * timelineSpan;
      const originalDuration = dragState.originalEnd - dragState.originalStart;
      let start = dragState.originalStart;
      let end = dragState.originalEnd;

      if (dragState.mode === 'move') {
        start = clamp(dragState.originalStart + delta, 0, Math.max(0, timelineSpan - originalDuration));
        end = start + originalDuration;
      } else if (dragState.mode === 'start') {
        start = clamp(dragState.originalStart + delta, 0, dragState.originalEnd - MIN_ITEM_DURATION);
      } else {
        end = clamp(dragState.originalEnd + delta, dragState.originalStart + MIN_ITEM_DURATION, timelineSpan);
      }

      const patch = { start: snapToGuides(start), end: snapToGuides(end) };
      if (dragState.kind === 'clip') {
        onTimelineClipChange(dragState.id, patch);
      } else {
        onSettingsChange({
          startOffset: patch.start,
          endOffset: patch.end,
          regionStart: patch.start,
          regionEnd: patch.end,
          teaserDuration: Math.max(1, patch.end - patch.start)
        });
      }
    };

    const handlePointerUp = (): void => setDragState(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragState, onSettingsChange, onTimelineClipChange, snapToGuides, timelineSpan]);

  const playPause = useCallback(() => {
    const wavesurfer = waveSurferRef.current;
    if (!wavesurfer) {
      const nextPlaying = !playing;
      setPlaying(nextPlaying);
      onPlaybackChange(nextPlaying);
      return;
    }
    if (wavesurfer.isPlaying()) {
      wavesurfer.pause();
      return;
    }
    wavesurfer.play(settings.startOffset, settings.endOffset);
  }, [onPlaybackChange, playing, settings.endOffset, settings.startOffset]);

  const playRegion = useCallback(() => {
    if (waveSurferRef.current) {
      waveSurferRef.current.play(settings.startOffset, settings.endOffset);
      return;
    }
    setPlaying(true);
    onPlaybackChange(true);
  }, [onPlaybackChange, settings.endOffset, settings.startOffset]);

  const stepFrame = useCallback((direction: -1 | 1): void => {
    const delta = 1 / settings.frameRate;
    const nextTime = clamp(currentTimeRef.current + delta * direction, 0, teaserDuration);
    currentTimeRef.current = nextTime;
    onCurrentTime(nextTime);
    waveSurferRef.current?.setTime(settings.startOffset + nextTime);
  }, [onCurrentTime, settings.frameRate, settings.startOffset, teaserDuration]);

  useEffect(() => {
    (window as Window & { teaserForgePlayRegion?: () => void }).teaserForgePlayRegion = playRegion;
    return () => {
      delete (window as Window & { teaserForgePlayRegion?: () => void }).teaserForgePlayRegion;
    };
  }, [playRegion]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isEditable = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '') || target?.isContentEditable;
      if (isEditable) return;

      if (event.code === 'Space') {
        event.preventDefault();
        playPause();
      } else if (event.key === ',') {
        event.preventDefault();
        stepFrame(-1);
      } else if (event.key === '.') {
        event.preventDefault();
        stepFrame(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playPause, stepFrame]);

  const setPresetDuration = (duration: number): void => {
    onSettingsChange({
      teaserDuration: duration,
      endOffset: settings.startOffset + duration,
      regionEnd: settings.startOffset + duration
    });
  };

  const setZoom = (zoom: number): void => {
    setTimelineZoom(snapZoom(zoom));
  };

  const adjustZoom = (delta: number): void => {
    setTimelineZoom((currentZoom) => snapZoom(currentZoom + delta));
  };

  useEffect(() => {
    const scrollElement = timelineScrollRef.current;
    if (!scrollElement) return;

    const handleTimelineWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setTimelineZoom((currentZoom) => snapZoom(currentZoom + (event.deltaY < 0 ? TIMELINE_ZOOM_STEP : -TIMELINE_ZOOM_STEP)));
    };

    scrollElement.addEventListener('wheel', handleTimelineWheel, { passive: false });
    return () => scrollElement.removeEventListener('wheel', handleTimelineWheel);
  }, []);


  const beginDrag = (
    event: ReactPointerEvent<HTMLElement>,
    kind: DragKind,
    id: string,
    mode: DragMode,
    start: number,
    end: number
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    const lane = event.currentTarget.closest('.track-lane');
    const laneWidth = lane?.getBoundingClientRect().width ?? 1;
    setDragState({
      kind,
      id,
      mode,
      startX: event.clientX,
      laneWidth,
      originalStart: start,
      originalEnd: end
    });
  };

  const seekToClientX = (clientX: number, lane: HTMLElement): void => {
    const rect = lane.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const absoluteTime = ratio * timelineSpan;
    const nextTime = clamp(absoluteTime - settings.startOffset, 0, teaserDuration);
    currentTimeRef.current = nextTime;
    onCurrentTime(nextTime);
    waveSurferRef.current?.setTime(absoluteTime);
  };

  const beginAudioSeek = (event: ReactPointerEvent<HTMLElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    const lane = event.currentTarget.closest('.waveform-lane');
    if (!(lane instanceof HTMLElement)) return;
    seekToClientX(event.clientX, lane);

    const handlePointerMove = (moveEvent: PointerEvent): void => seekToClientX(moveEvent.clientX, lane);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', handlePointerMove), { once: true });
  };

  const setFadeFromClientX = (type: 'in' | 'out', clientX: number, lane: HTMLElement): void => {
    const rect = lane.getBoundingClientRect();
    const absoluteTime = clamp(((clientX - rect.left) / rect.width) * timelineSpan, settings.startOffset, settings.endOffset);
    const nextDuration = Math.round(clamp(type === 'in'
      ? absoluteTime - settings.startOffset
      : settings.endOffset - absoluteTime, 0, teaserDuration / 2) * 100) / 100;
    const fadeDurationsLinked = settings.fadeDurationsLinked ?? true;

    if (fadeDurationsLinked) {
      onSettingsChange({
        fadeAudio: true,
        fadeDuration: nextDuration,
        fadeInDuration: nextDuration,
        fadeOutDuration: nextDuration
      });
      return;
    }

    const nextFadeInDuration = type === 'in' ? nextDuration : fadeInDuration;
    const nextFadeOutDuration = type === 'out' ? nextDuration : fadeOutDuration;
    onSettingsChange({
      fadeAudio: true,
      fadeDuration: Math.max(nextFadeInDuration, nextFadeOutDuration),
      fadeInDuration: nextFadeInDuration,
      fadeOutDuration: nextFadeOutDuration
    });
  };

  const beginFadeDrag = (event: ReactPointerEvent<HTMLElement>, type: 'in' | 'out'): void => {
    event.preventDefault();
    event.stopPropagation();
    const lane = event.currentTarget.closest('.waveform-lane');
    if (!(lane instanceof HTMLElement)) return;
    setFadeFromClientX(type, event.clientX, lane);
    const handlePointerMove = (moveEvent: PointerEvent): void => setFadeFromClientX(type, moveEvent.clientX, lane);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', handlePointerMove), { once: true });
  };

  const selectClip = (event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>, clip: TimelineClip): void => {
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      const nextIds = selectedIds.includes(clip.id)
        ? selectedIds.filter((id) => id !== clip.id)
        : [...selectedIds, clip.id];
      onTimelineSelectionChange(nextIds.length === 1 ? { type: 'clip', id: nextIds[0] } : { type: 'clips', ids: nextIds });
      return;
    }
    onTimelineSelectionChange({ type: 'clip', id: clip.id });
  };

  const selectMarker = (marker: TimelineExportMarker): void => {
    onTimelineSelectionChange({ type: 'export-marker', id: marker.id });
  };

  const selectExportRange = (): void => {
    onTimelineSelectionChange({ type: 'export-range', id: 'export-range' });
  };

  const clipLabel = (clip: TimelineClip): string => {
    if (clip.kind === 'title') return project.title || 'Title';
    if (clip.kind === 'subtitle') return project.subtitle || 'Subtitle / Artist';
    if (clip.kind === 'cover-art') return cover?.name ?? 'Cover art';
    if (clip.kind === 'video-cover') return video?.name ?? 'Video cover';
    return clip.label;
  };

  const renderClip = (clip: TimelineClip) => (
    <div
      key={clip.id}
      className={`clip editable-clip ${clipClass(clip)} ${selectedIds.includes(clip.id) ? 'selected' : ''} ${clip.enabled && tracks[clip.track].visible ? '' : 'disabled'} ${tracks[clip.track].locked ? 'locked' : ''}`}
      style={{ left: timeToLeft(clip.start, timelineSpan), width: timeToWidth(clip.start, clip.end, timelineSpan) }}
      role="button"
      tabIndex={0}
      title={`${clip.label}: ${formatTime(clip.start)} - ${formatTime(clip.end)}`}
      onClick={(event) => {
        event.stopPropagation();
        selectClip(event, clip);
      }}
      onPointerDown={(event) => {
        if (!tracks[clip.track].locked) beginDrag(event, 'clip', clip.id, 'move', clip.start, clip.end);
      }}
    >
      <span
        className="clip-handle start"
        onPointerDown={(event) => {
          if (!tracks[clip.track].locked) beginDrag(event, 'clip', clip.id, 'start', clip.start, clip.end);
        }}
      />
      <span className="clip-label">{clipLabel(clip)}</span>
      <span
        className="clip-handle end"
        onPointerDown={(event) => {
          if (!tracks[clip.track].locked) beginDrag(event, 'clip', clip.id, 'end', clip.start, clip.end);
        }}
      />
    </div>
  );

  const renderTrack = (track: TimelineTrackId) => (tracks[track].visible ? project.timeline.clips.filter((clip) => clip.track === track).map(renderClip) : null);

  const ticks = Array.from({ length: Math.max(2, Math.ceil(timelineSpan / 5) + 1) }, (_, index) => index * 5);
  const progress = clamp((settings.startOffset + currentTime) / timelineSpan, 0, 1);
  const trackLabels: Array<[TimelineTrackId, string]> = [
    ['text', 'Text'],
    ['cover', 'Cover Art'],
    ['video', 'Video Cover'],
    ['effects', 'Effects']
  ];
  const renderTrackLabel = (track: TimelineTrackId, label: string) => {
    const state = tracks[track];
    return (
      <div className="track-label track-label-controls" key={track}>
        <span>{label}</span>
        <button type="button" title={state.visible ? 'Hide track' : 'Show track'} onClick={() => onTimelineTrackChange(track, { visible: !state.visible })}>
          {state.visible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
        <button type="button" title={state.muted ? 'Unmute track' : 'Mute track'} onClick={() => onTimelineTrackChange(track, { muted: !state.muted })}>
          {state.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
        </button>
        <button type="button" title={state.locked ? 'Unlock track' : 'Lock track'} onClick={() => onTimelineTrackChange(track, { locked: !state.locked })}>
          {state.locked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
      </div>
    );
  };

  const detectBeatMarkers = (): void => {
    const decoded = waveSurferRef.current?.getDecodedData();
    const duration = audioDuration || timelineSpan;
    let markers: number[] = [];

    if (decoded) {
      const channel = decoded.getChannelData(0);
      const sampleRate = decoded.sampleRate;
      const windowSize = Math.max(1024, Math.floor(sampleRate * 0.08));
      const energy: Array<{ time: number; value: number }> = [];
      for (let index = 0; index < channel.length; index += windowSize) {
        let sum = 0;
        for (let offset = 0; offset < windowSize && index + offset < channel.length; offset += 1) {
          const sample = channel[index + offset];
          sum += sample * sample;
        }
        energy.push({ time: index / sampleRate, value: Math.sqrt(sum / windowSize) });
      }
      const average = energy.reduce((sum, item) => sum + item.value, 0) / Math.max(1, energy.length);
      markers = energy
        .filter((item, index) => item.value > average * 1.3 && item.value > (energy[index - 1]?.value ?? 0) && item.value >= (energy[index + 1]?.value ?? 0))
        .map((item) => snapTime(item.time))
        .filter((time, index, list) => index === 0 || time - list[index - 1] > 0.35)
        .slice(0, 96);
    }

    if (markers.length === 0) {
      markers = Array.from({ length: Math.floor(duration / 2) }, (_, index) => snapTime(index * 2)).filter((time) => time > 0);
    }

    onTimelineChange({
      ...project.timeline,
      beatMarkers: markers
    });
  };

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
            setPlaying(false);
            onPlaybackChange(false);
            currentTimeRef.current = 0;
            onCurrentTime(0);
          }}
          onJumpStart={() => {
            waveSurferRef.current?.setTime(settings.startOffset);
            currentTimeRef.current = 0;
            onCurrentTime(0);
          }}
          onJumpEnd={() => {
            waveSurferRef.current?.setTime(settings.endOffset);
            currentTimeRef.current = teaserDuration;
            onCurrentTime(teaserDuration);
          }}
          onLoopChange={(loopRegion) => onSettingsChange({ loopRegion })}
          onVolumeChange={setVolume}
        />
        <div className="timeline-selection-readout">
          {selectedIds.length > 1 ? `${selectedIds.length} clips selected` : selected ? 'Selection active' : 'Click clips or export markers to edit timing'}
        </div>
        <div className="timeline-edit-actions">
          <button className="icon-button" type="button" title="Step one frame back" onClick={() => stepFrame(-1)} disabled={disabled}>
            <StepBack size={14} />
          </button>
          <button className="icon-button" type="button" title="Step one frame forward" onClick={() => stepFrame(1)} disabled={disabled}>
            <StepForward size={14} />
          </button>
          <button className="icon-button" type="button" title="Split selected clip at playhead" onClick={onSplitSelection} disabled={selectedIds.length === 0}>
            <Scissors size={14} />
          </button>
          <button className="icon-button" type="button" title="Duplicate selected clip" onClick={onDuplicateSelection} disabled={selectedIds.length === 0}>
            <Copy size={14} />
          </button>
          <button className="icon-button" type="button" title="Delete selected clip" onClick={onDeleteSelection} disabled={selectedIds.length === 0}>
            <Trash2 size={14} />
          </button>
          <button className="icon-button" type="button" title="Detect beat markers" onClick={detectBeatMarkers}>
            <Wand2 size={14} />
          </button>
        </div>
        <div className="timeline-zoom-controls" aria-label="Timeline zoom controls">
          <button className="icon-button" type="button" title="Zoom out timeline" onClick={() => adjustZoom(-TIMELINE_ZOOM_STEP)} disabled={timelineZoom <= MIN_TIMELINE_ZOOM}>
            <ZoomOut size={14} />
          </button>
          <input
            aria-label="Timeline zoom"
            type="range"
            min={MIN_TIMELINE_ZOOM}
            max={MAX_TIMELINE_ZOOM}
            step={TIMELINE_ZOOM_STEP}
            value={timelineZoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <span>{Math.round(timelineZoom * 100)}%</span>
          <button className="icon-button" type="button" title="Zoom in timeline" onClick={() => adjustZoom(TIMELINE_ZOOM_STEP)} disabled={timelineZoom >= MAX_TIMELINE_ZOOM}>
            <ZoomIn size={14} />
          </button>
        </div>
        <div className="preset-row">
          {PRESET_DURATIONS.map((duration) => (
            <button key={duration} className={Math.round(teaserDuration) === duration ? 'active' : ''} type="button" onClick={() => setPresetDuration(duration)}>
              {duration}s
            </button>
          ))}
          <button type="button" className="custom-pill">Custom</button>
        </div>
      </div>

      <div className="timeline-editor" onClick={() => onTimelineSelectionChange(undefined)}>
        <div className="timeline-ruler-label" />
        <div className="timeline-labels">
          <div className="track-label">Markers</div>
          <div className="track-label">Audio Waveform</div>
          {trackLabels.map(([track, label]) => renderTrackLabel(track, label))}
          <div className="track-label">Export Range</div>
        </div>

        <div className="timeline-scroll" ref={timelineScrollRef}>
          <div className="timeline-content" style={{ width: `${timelineZoom * 100}%` }}>
            <div className="timeline-ruler" onPointerDown={(event) => {
              const lane = event.currentTarget;
              seekToClientX(event.clientX, lane);
            }}>
              {ticks.map((tick) => (
                <span key={tick} style={{ left: `${Math.min(100, (tick / timelineSpan) * 100)}%` }}>
                  {formatTime(tick)}
                </span>
              ))}
            </div>

            <div className="timeline-lanes">
              <div className="track-lane marker-lane">
                {project.timeline.beatMarkers.map((time) => (
                  <i key={time} className="beat-marker" style={{ left: timeToLeft(time, timelineSpan) }} />
                ))}
                <span style={{ left: '8%' }}>Intro</span>
                <span style={{ left: '45%' }}>Main Section</span>
                <span style={{ left: '84%' }}>Outro</span>
              </div>

              <div className="track-lane waveform-lane">
                <div className="playhead" style={{ left: `${progress * 100}%` }} />
                {settings.fadeAudio && fadeInDuration > 0 && (
                  <div
                    className="audio-fade-zone fade-in-zone"
                    style={{ left: timeToLeft(settings.startOffset, timelineSpan), width: timeToWidth(settings.startOffset, settings.startOffset + fadeInDuration, timelineSpan) }}
                  />
                )}
                {settings.fadeAudio && fadeOutDuration > 0 && (
                  <div
                    className="audio-fade-zone fade-out-zone"
                    style={{ left: timeToLeft(settings.endOffset - fadeOutDuration, timelineSpan), width: timeToWidth(settings.endOffset - fadeOutDuration, settings.endOffset, timelineSpan) }}
                  />
                )}
                {isDemo || !selectedSong ? (
                  <div className="synthetic-wave">
                    {waveformBars.map((height, index) => <span key={index} style={{ height: `${height * 100}%` }} />)}
                  </div>
                ) : (
                  <div className="wavesurfer-host" ref={waveformRef} />
                )}
                <div
                  className="audio-fade-handle fade-in"
                  style={{ left: timeToLeft(settings.startOffset + fadeInDuration, timelineSpan) }}
                  title="Drag fade-in duration"
                  onPointerDown={(event) => beginFadeDrag(event, 'in')}
                />
                <div
                  className="audio-fade-handle fade-out"
                  style={{ left: timeToLeft(settings.endOffset - fadeOutDuration, timelineSpan) }}
                  title="Drag fade-out duration"
                  onPointerDown={(event) => beginFadeDrag(event, 'out')}
                />
                <div className="audio-seek-layer" title="Click or drag to scrub audio" onPointerDown={beginAudioSeek} />
              </div>

              <div className="track-lane clip-lane">{renderTrack('text')}</div>

              <div className="track-lane clip-lane thumbnails">{renderTrack('cover')}</div>

              <div className="track-lane clip-lane thumbnails">{renderTrack('video')}</div>

              <div className="track-lane effects-lane">{renderTrack('effects')}</div>

              <div className="track-lane export-marker-lane">
                <div
                  className={`export-range ${selected?.type === 'export-range' ? 'selected' : ''}`}
                  style={{ left: timeToLeft(settings.startOffset, timelineSpan), width: timeToWidth(settings.startOffset, settings.endOffset, timelineSpan) }}
                  role="button"
                  tabIndex={0}
                  title={`Export range: ${formatTime(settings.startOffset)} - ${formatTime(settings.endOffset)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectExportRange();
                  }}
                  onPointerDown={(event) => beginDrag(event, 'export-range', 'export-range', 'move', settings.startOffset, settings.endOffset)}
                >
                  <span
                    className="clip-handle start"
                    onPointerDown={(event) => beginDrag(event, 'export-range', 'export-range', 'start', settings.startOffset, settings.endOffset)}
                  />
                  <span className="export-range-label">{formatTime(settings.startOffset)} - {formatTime(settings.endOffset)}</span>
                  <div className="export-range-chips">
                    {(['9x16', '1x1', '16x9'] as AspectRatioKey[]).map((aspect) => (
                      <button
                        key={aspect}
                        className={`export-chip ${aspectChipClass(aspect)} ${settings.primaryAspect === aspect ? 'active' : ''}`}
                        type="button"
                        title={`Select ${aspect}. Double-click to export.`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSettingsChange({ primaryAspect: aspect });
                          selectExportRange();
                        }}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          if (!isDemo) onExportMarker(aspect);
                        }}
                      >
                        {aspect}
                      </button>
                    ))}
                  </div>
                  <span
                    className="clip-handle end"
                    onPointerDown={(event) => beginDrag(event, 'export-range', 'export-range', 'end', settings.startOffset, settings.endOffset)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
