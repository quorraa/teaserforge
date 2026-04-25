import type { AspectRatioKey, ExportTarget, ProjectConfig } from '../../shared/types';
import { ASPECT_RATIOS } from '../../shared/types';

export const EXPORT_TARGETS: ExportTarget[] = ASPECT_RATIOS.map((preset) => ({
  aspect: preset.key,
  width: preset.width,
  height: preset.height
}));

export function safeWindowsName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.|\.$/g, '');
}

export function defaultExportName(project: ProjectConfig, aspect: AspectRatioKey): string {
  const songName = project.selectedSongPath?.split(/[\\/]/).pop() ?? 'teaser';
  const basename = songName.replace(/\.[^.]+$/, '');
  return `${safeWindowsName(basename)}_teaser_${aspect}.mp4`;
}

export function defaultOutputHint(project: ProjectConfig, aspect: AspectRatioKey): string {
  const separator = project.rootPath?.includes('\\') ? '\\' : '/';
  const folder = project.settings.outputFolder ?? (project.rootPath ? `${project.rootPath}${separator}teaser_exports` : 'Select output folder');
  return `${folder}${separator}${defaultExportName(project, aspect)}`;
}
