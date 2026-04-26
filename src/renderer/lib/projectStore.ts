import type { ProjectConfig } from '../../shared/types';
import { DEFAULT_PROJECT, DEFAULT_TIMELINE } from '../../shared/types';

const LEGACY_DEMO_TITLE = 'SPRING_CACHE_01';
const LEGACY_DEMO_SUBTITLE = 'midnight_uplink_alpha';

function cloneDefaultTimeline() {
  return {
    clips: DEFAULT_TIMELINE.clips.map((clip) => ({ ...clip })),
    exportMarkers: DEFAULT_TIMELINE.exportMarkers.map((marker) => ({ ...marker }))
  };
}

function normalizeTimeline(saved?: ProjectConfig['timeline']): ProjectConfig['timeline'] {
  const fallback = cloneDefaultTimeline();
  if (!saved) return fallback;

  return {
    clips: saved.clips?.length ? saved.clips.map((clip) => ({ ...clip, enabled: clip.enabled !== false })) : fallback.clips,
    exportMarkers: saved.exportMarkers?.length ? saved.exportMarkers.map((marker) => ({ ...marker })) : fallback.exportMarkers,
    selected: saved.selected
  };
}

export function createProjectForRoot(rootPath: string, rootName: string, saved?: ProjectConfig): ProjectConfig {
  const hasSavedProject = Boolean(saved?.updatedAt && saved.updatedAt !== DEFAULT_PROJECT.updatedAt);
  const savedTitle = saved?.title === LEGACY_DEMO_TITLE ? '' : saved?.title ?? '';
  const savedSubtitle = saved?.subtitle === LEGACY_DEMO_SUBTITLE ? '' : saved?.subtitle ?? '';

  return {
    ...DEFAULT_PROJECT,
    ...saved,
    rootPath,
    title: hasSavedProject ? savedTitle : '',
    subtitle: hasSavedProject ? savedSubtitle : '',
    pairings: saved?.pairings ?? {},
    settings: {
      ...DEFAULT_PROJECT.settings,
      ...saved?.settings
    },
    timeline: normalizeTimeline(saved?.timeline),
    updatedAt: saved?.updatedAt ?? new Date().toISOString()
  };
}

export function updatePairing(project: ProjectConfig, coverArtPath?: string, videoCoverPath?: string): ProjectConfig {
  if (!project.selectedSongPath) return project;
  return {
    ...project,
    coverArtPath,
    videoCoverPath,
    pairings: {
      ...project.pairings,
      [project.selectedSongPath]: {
        songPath: project.selectedSongPath,
        coverArtPath,
        videoCoverPath,
        updatedAt: new Date().toISOString()
      }
    }
  };
}
