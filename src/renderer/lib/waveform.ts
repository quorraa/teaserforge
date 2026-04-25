export function syntheticBars(count: number, seed: string): number[] {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }

  return Array.from({ length: count }, (_, index) => {
    const value = Math.sin(index * 1.7 + hash) * 0.5 + Math.sin(index * 0.31 + hash * 0.01) * 0.5;
    return Math.max(0.18, Math.min(1, Math.abs(value)));
  });
}
