import { ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import type {
  AppSettings,
  AspectRatioKey,
  ExportBatchRequest,
  ExportProgressEvent,
  ExportRequest,
  ExportResult,
  FfmpegStatus,
  ProjectConfig
} from '../../shared/types';

const QUALITY_ARGS: Record<string, string[]> = {
  draft: ['-crf', '28', '-preset', 'veryfast'],
  'high-1080p': ['-crf', '20', '-preset', 'medium'],
  master: ['-crf', '16', '-preset', 'slow']
};

function safeBaseName(filePath: string): string {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.|\.$/g, '');
}

function outputPathFor(project: ProjectConfig, aspect: AspectRatioKey): string {
  if (!project.selectedSongPath) {
    throw new Error('Select a song before exporting.');
  }
  const outputFolder = project.settings.outputFolder ?? path.join(project.rootPath ?? path.dirname(project.selectedSongPath), 'teaser_exports');
  return path.join(outputFolder, `${safeBaseName(project.selectedSongPath)}_teaser_${aspect}.mp4`);
}

function ffmpegPath(settings?: AppSettings): string | undefined {
  return settings?.ffmpegPath || ffmpegStatic || undefined;
}

function runProcess(binary: string, args: string[], onLine?: (line: string) => void): Promise<{ code: number; log: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    const log: string[] = [];

    child.stdout.on('data', (chunk: Buffer) => {
      const line = chunk.toString();
      log.push(line);
      onLine?.(line);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const line = chunk.toString();
      log.push(line);
      onLine?.(line);
    });

    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, log: log.join('') }));
  });
}

async function getSettings(): Promise<AppSettings> {
  const { app } = await import('electron');
  const settingsFile = path.join(app.getPath('userData'), 'settings.json');
  try {
    return JSON.parse(await fs.readFile(settingsFile, 'utf8')) as AppSettings;
  } catch {
    return {};
  }
}

function escapeDrawtext(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function buildFilter(project: ProjectConfig, request: ExportRequest): string {
  const { width, height } = request.target;
  const settings = project.settings;
  const title = escapeDrawtext(project.title || safeBaseName(project.selectedSongPath ?? 'TeaserForge'));
  const subtitle = escapeDrawtext(project.subtitle || '');
  const fontSize = Math.max(24, Math.round(settings.fontSize * (width / 1080)));
  const subtitleSize = Math.max(18, Math.round(fontSize * 0.42));
  const margin = Math.round(Math.min(width, height) * 0.07);
  const glowAlpha = Math.min(1, Math.max(0, settings.glowAmount / 80)).toFixed(2);
  const filterParts: string[] = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,format=rgba[bg]`
  ];

  let current = '[bg]';
  if (settings.titleVisible) {
    filterParts.push(
      `${current}drawtext=text='${title}':x=(w-text_w)/2:y=h-${margin * 3}:fontsize=${fontSize}:fontcolor=white:shadowcolor=0x7b2dff@${glowAlpha}:shadowx=0:shadowy=0:box=0[title]`
    );
    current = '[title]';
  }

  if (settings.subtitleVisible && subtitle.length > 0) {
    filterParts.push(
      `${current}drawtext=text='${subtitle}':x=(w-text_w)/2:y=h-${margin * 2}:fontsize=${subtitleSize}:fontcolor=0xcde9ff:shadowcolor=0x00d8ff@${glowAlpha}:shadowx=0:shadowy=0[sub]`
    );
    current = '[sub]';
  }

  if (settings.progressBar) {
    const barY = height - margin;
    const elapsed = `min(max(t/${settings.teaserDuration},0),1)`;
    filterParts.push(
      `${current}drawbox=x=${margin}:y=${barY}:w=${width - margin * 2}:h=6:color=0xffffff@0.18:t=fill,drawbox=x=${margin}:y=${barY}:w='(${width - margin * 2})*${elapsed}':h=6:color=0x00d8ff@0.95:t=fill[bar]`
    );
    current = '[bar]';
  }

  if (settings.waveformDisplay) {
    const waveformY = height - margin * 2 + 18;
    filterParts.push(
      `${current}drawbox=x=${margin}:y=${waveformY}:w=${width - margin * 2}:h=2:color=0xa66cff@0.65:t=fill[outv]`
    );
  } else {
    filterParts.push(`${current}null[outv]`);
  }

  return filterParts.join(';');
}

function buildArgs(request: ExportRequest): string[] {
  const { project, target } = request;
  const settings = project.settings;
  const songPath = project.selectedSongPath;
  const coverPath = settings.backgroundType !== 'static-cover' && project.videoCoverPath ? project.videoCoverPath : project.coverArtPath;
  if (!songPath) throw new Error('Select a song before exporting.');
  if (!coverPath) throw new Error('Select cover art or video cover art before exporting.');

  const isVideo = /\.(mp4|mov|m4v|webm)$/i.test(coverPath);
  const outputPath = outputPathFor(project, target.aspect);
  const duration = Math.max(1, settings.endOffset - settings.startOffset || settings.teaserDuration);
  const audioFilters: string[] = [];
  if (settings.normalizeAudio) audioFilters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
  if (settings.fadeAudio) {
    const fadeDuration = Math.max(0.05, Math.min(settings.fadeDuration, duration / 2));
    audioFilters.push(`afade=t=in:st=0:d=${fadeDuration}`);
    audioFilters.push(`afade=t=out:st=${Math.max(0, duration - fadeDuration)}:d=${fadeDuration}`);
  }

  const args = ['-y'];
  if (isVideo) {
    args.push('-stream_loop', settings.videoLoopMode === 'loop' ? '-1' : '0', '-i', coverPath);
  } else {
    args.push('-loop', '1', '-i', coverPath);
  }
  args.push('-ss', String(settings.startOffset), '-t', String(duration), '-i', songPath);
  args.push('-filter_complex', buildFilter(project, request));
  args.push('-map', '[outv]', '-map', '1:a:0');
  if (audioFilters.length > 0) args.push('-af', audioFilters.join(','));
  args.push('-r', String(settings.frameRate), '-t', String(duration));
  args.push(...(QUALITY_ARGS[settings.exportQuality] ?? QUALITY_ARGS['high-1080p']));
  args.push('-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:v', 'libx264', '-c:a', 'aac', '-b:a', '192k', outputPath);
  return args;
}

async function exportOne(request: ExportRequest, emit: (event: ExportProgressEvent) => void): Promise<ExportResult> {
  const settings = await getSettings();
  const binary = ffmpegPath(settings);
  if (!binary) throw new Error('FFmpeg is not configured and no bundled fallback was found.');

  const id = `${Date.now()}-${request.target.aspect}`;
  const outputPath = outputPathFor(request.project, request.target.aspect);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  emit({ id, aspect: request.target.aspect, status: 'running', percent: 5, message: `Exporting ${request.target.aspect}...`, outputPath });

  const args = buildArgs(request);
  const duration = Math.max(1, request.project.settings.endOffset - request.project.settings.startOffset || request.project.settings.teaserDuration);
  const result = await runProcess(binary, args, (line) => {
    const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line);
    if (!match) return;
    const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    emit({
      id,
      aspect: request.target.aspect,
      status: 'running',
      percent: Math.min(99, Math.max(5, Math.round((seconds / duration) * 100))),
      message: line.trim().slice(0, 180),
      outputPath
    });
  });

  const success = result.code === 0;
  emit({
    id,
    aspect: request.target.aspect,
    status: success ? 'complete' : 'failed',
    percent: success ? 100 : 0,
    message: success ? `Saved ${path.basename(outputPath)}` : `FFmpeg failed for ${request.target.aspect}`,
    outputPath
  });

  return { id, aspect: request.target.aspect, outputPath, success, log: result.log };
}

export async function checkFfmpeg(): Promise<FfmpegStatus> {
  const settings = await getSettings();
  const binary = ffmpegPath(settings);
  if (!binary) {
    return { available: false, message: 'FFmpeg is not configured.' };
  }
  try {
    const result = await runProcess(binary, ['-version']);
    const firstLine = result.log.split(/\r?\n/)[0] ?? '';
    return { available: result.code === 0, path: binary, version: firstLine, message: firstLine || 'FFmpeg found.' };
  } catch (error) {
    return { available: false, path: binary, message: error instanceof Error ? error.message : 'FFmpeg check failed.' };
  }
}

export function registerExportIpc(): void {
  ipcMain.handle('export:checkFfmpeg', async () => checkFfmpeg());
  ipcMain.handle('export:runBatch', async (event, request: ExportBatchRequest) => {
    const results: ExportResult[] = [];
    for (const target of request.targets) {
      const result = await exportOne({ project: request.project, target }, (progress) => {
        event.sender.send('export:progress', progress);
      });
      results.push(result);
    }
    return results;
  });
}
