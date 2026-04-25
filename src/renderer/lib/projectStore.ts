import type { ProjectConfig } from '../../shared/types';
import { DEFAULT_PROJECT } from '../../shared/types';

export function createProjectForRoot(rootPath: string, rootName: string, saved?: ProjectConfig): ProjectConfig {
  const hasSavedTitle = Boolean(saved?.updatedAt && saved.updatedAt !== DEFAULT_PROJECT.updatedAt);
  return {
    ...DEFAULT_PROJECT,
    ...saved,
    rootPath,
    title: hasSavedTitle ? saved?.title ?? rootName : rootName,
    subtitle: saved?.subtitle ?? '',
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
