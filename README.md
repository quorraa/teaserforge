# TeaserForge

TeaserForge is a local-first Electron desktop app for building music teaser videos from a folder of songs, cover art, and video cover art.

## Stack

- Electron + React + TypeScript + Vite
- Secure preload IPC for filesystem, settings, media scanning, and export
- WaveSurfer.js for waveform playback and draggable snippet regions
- FFmpeg for final teaser rendering
- JSON project state saved under `.teaserforge/project.json`

## Setup

```bash
npm install
npm run dev
```

Build and run the packaged preview:

```bash
npm run build
npm run start
```

## Using The App

1. Click the folder button in the Media Browser and choose a project folder.
2. TeaserForge scans the folder tree automatically and groups root audio files, `COVER_ART`, and `VIDEO_COVER_ART`.
3. Select a song. The app ranks likely cover/video matches by basename, `_suno`, `spotify`, punctuation normalization, and fuzzy token matches.
4. Drag assets into the preview or override them from the inspector.
5. Use the timeline waveform region to select the teaser snippet.
6. Preview 9:16, 1:1, and 16:9 at the same time.
7. Export the selected format or all three formats from the Export tab.

Default outputs use safe Windows filenames like:

```text
midnight_uplink_alpha_teaser_9x16.mp4
midnight_uplink_alpha_teaser_1x1.mp4
midnight_uplink_alpha_teaser_16x9.mp4
```

## FFmpeg

TeaserForge checks for a bundled FFmpeg fallback through npm packages. To use a specific binary, open the Inspector `Settings` tab and enter the full path, for example:

```text
C:\ffmpeg\bin\ffmpeg.exe
```

The Export tab shows FFmpeg status and export progress. If FFmpeg is missing or an export fails, the app reports the error in the editor.

## Demo Mode

If no prior project is configured, TeaserForge opens a demo project that mirrors the requested `SPRING_CACHE_01` folder structure. Demo files are placeholders so playback/export are disabled until a real local folder is selected.

The sample project data is also available in `demo/SPRING_CACHE_01.project.json`.
