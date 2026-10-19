# UzClip AI

UzClip AI is a local-first desktop editor for finding and exporting short clips from video. It uses an Electron and React interface, a local Python worker, SQLite project storage, FFmpeg for media operations, and Faster Whisper for optional on-device speech transcription.

## Features

- Import local MP4, MOV, MKV, WebM, M4V, and AVI files.
- Transcribe Uzbek or English speech, or let the model detect the language.
- Review and edit the timestamped transcript; clip suggestions are recalculated after an edit.
- Edit clip boundaries and horizontal crop position, then render a 9:16 MP4.
- Optionally burn captions into the export; SRT, VTT, and inspectable `.uzclip.json` metadata sidecars are generated.
- Preserve project and job history in SQLite. Transcription and render jobs can be cancelled; work that was running when the app closed is marked as interrupted and can be started again.
- Keep source video, transcript, project database, and downloaded models on the device. Model downloads are started explicitly by the user.

Clip scores are editing suggestions, not predictions or guarantees of social-media performance. The initial scorer uses transcript structure and a small Uzbek/English phrase list; it is not a semantic language model.

## Requirements

- Node.js 20 or newer and npm.
- Python 3.12 (the checked-in Python lock is validated on 3.12).
- FFmpeg and FFprobe on `PATH` for video import, audio extraction, and export.
- Disk space for a local speech model if transcription is used. The Tiny, Base, and Small Faster Whisper models download only after the user asks in the app.

FFmpeg is a separate system dependency and is not bundled. Install it using the trusted package source for your operating system, then verify that both `ffmpeg -version` and `ffprobe -version` work in a terminal.

## Develop locally

From the repository root:

```sh
npm ci
python -m venv .venv
```

Activate `.venv`, then install the exact Python versions in the checked-in lock file:

```sh
python -m pip install -r worker/requirements-lock.txt
```

On Windows PowerShell, activate with `.venv\\Scripts\\Activate.ps1`; on macOS and Linux, use `source .venv/bin/activate`.

Run the desktop development app:

```sh
npm run dev
```

The main process starts the Python worker over newline-delimited JSON on stdio. No network server or telemetry is used. Projects are stored under the operating system's UzClip AI application data folder.

Build the renderer and type-check it with:

```sh
npm run build
```

Create a desktop package for the current operating system with:

```sh
npm run dist
```

Build a separate installer on each target operating system. Electron Builder cannot turn the current OS's Python and native libraries into a correct binary for another OS. FFmpeg must still be installed separately by the end user.

## Known limits

- Automatic clip ranking is heuristic. Review and edit every suggested clip.
- Crop position is chosen manually; face tracking is not implemented.
- The current export uses CPU H.264 encoding and writes 1080×1920 output.
- Interrupted jobs restart from the beginning; partial transcription or render output is not resumed.
- Cross-platform installers, signing, and model-download behavior need verification on their target machines before release.
- Distributing a release requires reviewing third-party and FFmpeg licenses for the selected package and build configuration.
- In a restricted network, explicitly allow `huggingface.co`, `*.huggingface.co`, `hf.co`, and `*.hf.co` to download public models.
