import type { MatchCandidate, MediaAsset } from '../../shared/types';

const TAG_TOKENS = new Set(['suno', 'spotify', 'cover', 'art', 'needsrework', 'needrework', 'master', 'final']);

function stem(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

export function displayStem(nameOrPath: string): string {
  const base = nameOrPath.split(/[\\/]/).pop() ?? nameOrPath;
  return stem(base)
    .replace(/^\[[^\]]+\]/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return stem(value)
    .replace(/^\[[^\]]+\]/, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/9x16|16x9|1x1/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !TAG_TOKENS.has(token));
}

function compact(value: string, keepTags = false): string {
  const sourceTokens = keepTags
    ? stem(value)
        .replace(/^\[[^\]]+\]/, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
    : tokens(value);
  return sourceTokens.join('');
}

function tokenScore(songName: string, assetName: string): number {
  const songTokens = tokens(songName);
  const assetTokens = tokens(assetName);
  if (songTokens.length === 0 || assetTokens.length === 0) return 0;

  const songSet = new Set(songTokens);
  const assetSet = new Set(assetTokens);
  let shared = 0;
  for (const token of songSet) {
    if (assetSet.has(token)) shared += 1;
  }

  const denominator = Math.max(songSet.size, assetSet.size);
  const orderedBonus = assetTokens.join(' ').includes(songTokens.slice(0, 2).join(' ')) ? 8 : 0;
  return (shared / denominator) * 76 + orderedBonus;
}

export function rankAssetMatches(song: MediaAsset | undefined, candidates: MediaAsset[]): MatchCandidate[] {
  if (!song) return [];

  const songStem = stem(song.name).replace(/^\[[^\]]+\]/, '');
  const songRaw = songStem.toLowerCase();
  const songCompact = compact(song.name);

  return candidates
    .map((asset) => {
      const assetStem = stem(asset.name);
      const assetRaw = assetStem.toLowerCase();
      const assetCompactWithTags = compact(asset.name, true);
      const assetCompact = compact(asset.name);
      let score = tokenScore(song.name, asset.name);
      let reason = 'Fuzzy basename match';

      if (assetRaw === songRaw) {
        score = 100;
        reason = 'Exact basename match';
      } else if (assetCompact === songCompact && assetCompact.length > 0) {
        score = 92;
        reason = 'Dots/underscores normalized';
      } else if (assetCompactWithTags === `${songCompact}suno` || assetCompactWithTags.startsWith(`${songCompact}suno`)) {
        score = 88;
        reason = 'Matched _suno variant';
      } else if (assetCompactWithTags === `${songCompact}spotify` || assetCompactWithTags.startsWith(`${songCompact}spotify`)) {
        score = 84;
        reason = 'Matched spotify variant';
      } else if (assetCompact.includes(songCompact) || songCompact.includes(assetCompact)) {
        score = Math.max(score, 72);
        reason = 'Normalized partial match';
      }

      return { asset, score: Math.round(score), reason };
    })
    .filter((candidate) => candidate.score >= 38)
    .sort((left, right) => right.score - left.score || left.asset.name.localeCompare(right.asset.name));
}

export function bestAssetMatch(song: MediaAsset | undefined, candidates: MediaAsset[]): MediaAsset | undefined {
  return rankAssetMatches(song, candidates)[0]?.asset;
}
