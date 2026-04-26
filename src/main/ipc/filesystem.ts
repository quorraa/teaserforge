import { app, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppSettings, AspectRatioKey, ProjectConfig, TeaserSettings, TimelineTrackId, TimelineTrackState } from '../../shared/types';
import { DEFAULT_MEDIA_MOTION, DEFAULT_MEDIA_TRANSFORMS, DEFAULT_PROJECT, DEFAULT_TEXT_TRANSFORMS, DEFAULT_TIMELINE, DEFAULT_TRACKS } from '../../shared/types';
import { scanProjectFolder } from './mediaScan';

const PROJECT_DIR = '.teaserforge';
const PROJECT_FILE = 'project.json';
const SETTINGS_FILE = 'settings.json';
const ASPECT_KEYS: AspectRatioKey[] = ['9x16', '1x1', '16x9'];
const TRACK_KEYS: TimelineTrackId[] = ['text', 'cover', 'video', 'effects'];

function projectConfigPath(rootPath: string): string {
  return path.join(rootPath, PROJECT_DIR, PROJECT_FILE);
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function mergeMediaTransforms(saved?: Partial<TeaserSettings['mediaTransforms']>): TeaserSettings['mediaTransforms'] {
  return ASPECT_KEYS.reduce((next, aspect) => ({
    ...next,
    [aspect]: {
      ...DEFAULT_MEDIA_TRANSFORMS[aspect],
      ...saved?.[aspect]
    }
  }), {} as TeaserSettings['mediaTransforms']);
}

function mergeMediaMotion(saved?: Partial<TeaserSettings['mediaMotion']>): TeaserSettings['mediaMotion'] {
  return ASPECT_KEYS.reduce((next, aspect) => ({
    ...next,
    [aspect]: {
      ...DEFAULT_MEDIA_MOTION[aspect],
      ...saved?.[aspect],
      start: {
        ...DEFAULT_MEDIA_MOTION[aspect].start,
        ...saved?.[aspect]?.start
      },
      end: {
        ...DEFAULT_MEDIA_MOTION[aspect].end,
        ...saved?.[aspect]?.end
      }
    }
  }), {} as TeaserSettings['mediaMotion']);
}

function mergeTextTransforms(saved?: Partial<TeaserSettings['textTransforms']>): TeaserSettings['textTransforms'] {
  return ASPECT_KEYS.reduce((next, aspect) => ({
    ...next,
    [aspect]: {
      title: {
        ...DEFAULT_TEXT_TRANSFORMS[aspect].title,
        ...saved?.[aspect]?.title
      },
      subtitle: {
        ...DEFAULT_TEXT_TRANSFORMS[aspect].subtitle,
        ...saved?.[aspect]?.subtitle
      }
    }
  }), {} as TeaserSettings['textTransforms']);
}

function mergeTracks(saved?: Partial<Record<TimelineTrackId, TimelineTrackState>>): Record<TimelineTrackId, TimelineTrackState> {
  return TRACK_KEYS.reduce((next, track) => ({
    ...next,
    [track]: {
      ...DEFAULT_TRACKS[track],
      ...saved?.[track]
    }
  }), {} as Record<TimelineTrackId, TimelineTrackState>);
}

function mergeSettings(saved?: ProjectConfig['settings']): ProjectConfig['settings'] {
  const legacyFadeDuration = saved?.fadeDuration ?? DEFAULT_PROJECT.settings.fadeDuration;
  return {
    ...DEFAULT_PROJECT.settings,
    ...saved,
    fadeInDuration: saved?.fadeInDuration ?? legacyFadeDuration,
    fadeOutDuration: saved?.fadeOutDuration ?? legacyFadeDuration,
    fadeDurationsLinked: saved?.fadeDurationsLinked ?? true,
    mediaTransforms: mergeMediaTransforms(saved?.mediaTransforms),
    mediaMotion: mergeMediaMotion(saved?.mediaMotion),
    textTransforms: mergeTextTransforms(saved?.textTransforms)
  };
}

export function registerFilesystemIpc(): void {
  ipcMain.handle('filesystem:selectProjectFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select TeaserForge project folder',
      properties: ['openDirectory']
    });
    return result.canceled ? undefined : result.filePaths[0];
  });

  ipcMain.handle('filesystem:selectOutputFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select export output folder',
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? undefined : result.filePaths[0];
  });

  ipcMain.handle('filesystem:selectMediaFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Relink media file',
      properties: ['openFile'],
      filters: [
        { name: 'Media files', extensions: ['wav', 'mp3', 'flac', 'm4a', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'mov', 'm4v', 'webm'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    return result.canceled ? undefined : result.filePaths[0];
  });

  ipcMain.handle('filesystem:openPath', async (_event, targetPath: string) => {
    const { shell } = await import('electron');
    return shell.openPath(targetPath);
  });

  ipcMain.handle('filesystem:scanProjectFolder', async (_event, rootPath: string) => {
    return scanProjectFolder(rootPath);
  });

  ipcMain.handle('filesystem:loadProjectConfig', async (_event, rootPath: string) => {
    const saved = await readJson<ProjectConfig | undefined>(projectConfigPath(rootPath), undefined);
    return {
      ...DEFAULT_PROJECT,
      ...saved,
      rootPath,
      settings: mergeSettings(saved?.settings),
      timeline: {
        ...DEFAULT_TIMELINE,
        ...saved?.timeline,
        tracks: mergeTracks(saved?.timeline?.tracks),
        beatMarkers: saved?.timeline?.beatMarkers ?? DEFAULT_TIMELINE.beatMarkers
      },
      pairings: saved?.pairings ?? {}
    } satisfies ProjectConfig;
  });

  ipcMain.handle('filesystem:saveProjectConfig', async (_event, project: ProjectConfig) => {
    if (!project.rootPath) {
      throw new Error('Project root path is required before saving.');
    }
    const nextProject: ProjectConfig = {
      ...project,
      updatedAt: new Date().toISOString()
    };
    await writeJson(projectConfigPath(project.rootPath), nextProject);
    const settings = await readJson<AppSettings>(settingsPath(), {});
    await writeJson(settingsPath(), { ...settings, lastProjectPath: project.rootPath });
    return nextProject;
  });

  ipcMain.handle('filesystem:getAppSettings', async () => {
    return readJson<AppSettings>(settingsPath(), {});
  });

  ipcMain.handle('filesystem:saveAppSettings', async (_event, settings: AppSettings) => {
    await writeJson(settingsPath(), settings);
    return settings;
  });
}
