export function formatTime(seconds: number, precision = 0): string {
  if (!Number.isFinite(seconds)) return '00:00';
  const safeSeconds = Math.max(0, seconds);
  const whole = Math.floor(safeSeconds);
  const minutes = Math.floor(whole / 60);
  const remaining = whole % 60;
  const fractional = safeSeconds - whole;

  if (precision > 0) {
    return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}.${Math.round(fractional * 10 ** precision)
      .toString()
      .padStart(precision, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

export function clampTime(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function parseNumber(value: string, fallback: number): number {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}
