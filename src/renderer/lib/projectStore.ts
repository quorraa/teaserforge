import type { AspectRatioKey, ProjectConfig, TeaserSettings, TimelineTrackId, TimelineTrackState } from '../../shared/types';
import { DEFAULT_MEDIA_TRANSFORMS, DEFAULT_PROJECT, DEFAULT_TEXT_TRANSFORMS, DEFAULT_TIMELINE, DEFAULT_TRACKS } from '../../shared/types';

const LEGACY_DEMO_TITLE = 'SPRING_CACHE_01';
const LEGACY_DEMO_SUBTITLE = 'midnight_uplink_alpha';
const ASPECT_KEYS: AspectRatioKey[] = ['9x16', '1x1', '16x9'];
const TRACK_KEYS: TimelineTrackId[] = ['text', 'cover', 'video', 'effects'];

function mergeMediaTransforms(saved?: Partial<TeaserSettings['mediaTransforms']>): TeaserSettings['mediaTransforms'] {
  return ASPECT_KEYS.reduce((next, aspect) => ({
    ...next,
    [aspect]: {
      ...DEFAULT_MEDIA_TRANSFORMS[aspect],
      ...saved?.[aspect]
    }
  }), {} as TeaserSettings['mediaTransforms']);
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

function cloneDefaultTimeline() {
  return {
    clips: DEFAULT_TIMELINE.clips.map((clip) => ({ ...clip })),
    exportMarkers: DEFAULT_TIMELINE.exportMarkers.map((marker) => ({ ...marker })),
    tracks: mergeTracks(),
    beatMarkers: [...DEFAULT_TIMELINE.beatMarkers]
  };
}

function normalizeTimeline(saved?: ProjectConfig['timeline']): ProjectConfig['timeline'] {
  const fallback = cloneDefaultTimeline();
  if (!saved) return fallback;

  return {
    clips: saved.clips?.length ? saved.clips.map((clip) => ({ ...clip, enabled: clip.enabled !== false })) : fallback.clips,
    exportMarkers: saved.exportMarkers?.length ? saved.exportMarkers.map((marker) => ({ ...marker })) : fallback.exportMarkers,
    tracks: mergeTracks(saved.tracks),
    beatMarkers: saved.beatMarkers ?? fallback.beatMarkers,
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
      ...saved?.settings,
      mediaTransforms: mergeMediaTransforms(saved?.settings?.mediaTransforms),
      textTransforms: mergeTextTransforms(saved?.settings?.textTransforms)
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
