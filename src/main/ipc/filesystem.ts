import { app, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppSettings, ProjectConfig } from '../../shared/types';
import { DEFAULT_PROJECT, DEFAULT_TIMELINE } from '../../shared/types';
import { scanProjectFolder } from './mediaScan';

const PROJECT_DIR = '.teaserforge';
const PROJECT_FILE = 'project.json';
const SETTINGS_FILE = 'settings.json';

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

  ipcMain.handle('filesystem:scanProjectFolder', async (_event, rootPath: string) => {
    return scanProjectFolder(rootPath);
  });

  ipcMain.handle('filesystem:loadProjectConfig', async (_event, rootPath: string) => {
    const saved = await readJson<ProjectConfig | undefined>(projectConfigPath(rootPath), undefined);
    return {
      ...DEFAULT_PROJECT,
      ...saved,
      rootPath,
      settings: {
        ...DEFAULT_PROJECT.settings,
        ...saved?.settings
      },
      timeline: saved?.timeline ?? DEFAULT_TIMELINE,
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
