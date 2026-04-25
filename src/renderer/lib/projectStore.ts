import type { ProjectConfig } from '../../shared/types';
import { DEFAULT_PROJECT } from '../../shared/types';

const LEGACY_DEMO_TITLE = 'SPRING_CACHE_01';
const LEGACY_DEMO_SUBTITLE = 'midnight_uplink_alpha';

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
