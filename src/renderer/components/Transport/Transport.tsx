import { Pause, Play, RotateCcw, SkipBack, SkipForward, Square } from 'lucide-react';

interface TransportProps {
  playing: boolean;
  loop: boolean;
  volume: number;
  disabled: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onJumpStart: () => void;
  onJumpEnd: () => void;
  onLoopChange: (loop: boolean) => void;
  onVolumeChange: (volume: number) => void;
}

export function Transport({
  playing,
  loop,
  volume,
  disabled,
  onPlayPause,
  onStop,
  onJumpStart,
  onJumpEnd,
  onLoopChange,
  onVolumeChange
}: TransportProps): JSX.Element {
  return (
    <div className="transport">
      <button className="icon-button" type="button" title="Jump to start" onClick={onJumpStart} disabled={disabled}>
        <SkipBack size={17} />
      </button>
      <button className="icon-button" type="button" title={playing ? 'Pause' : 'Play'} onClick={onPlayPause} disabled={disabled}>
        {playing ? <Pause size={17} /> : <Play size={17} />}
      </button>
      <button className="icon-button" type="button" title="Stop" onClick={onStop} disabled={disabled}>
        <Square size={15} />
      </button>
      <button className="icon-button" type="button" title="Jump to end" onClick={onJumpEnd} disabled={disabled}>
        <SkipForward size={17} />
      </button>
      <button className={`icon-button ${loop ? 'active' : ''}`} type="button" title="Loop selected region" onClick={() => onLoopChange(!loop)}>
        <RotateCcw size={16} />
      </button>
      <input
        className="volume-slider"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={(event) => onVolumeChange(Number(event.target.value))}
        title="Volume"
      />
    </div>
  );
}
