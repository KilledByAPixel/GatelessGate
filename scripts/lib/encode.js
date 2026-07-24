// WAV -> mp3 via system ffmpeg. Gemini returns raw PCM, so encoding is a required
// stage rather than a nicety; keeping it separate from the bake means format
// experiments (bitrate, opus) re-encode from cached raw audio and never re-pay the API.
import { execFileSync, spawnSync } from 'node:child_process';

// A freshly installed ffmpeg isn't on PATH in already-open shells, which would
// otherwise block a bake for no reason. $FFMPEG overrides.
export const FFMPEG = process.env.FFMPEG || 'ffmpeg';

export function haveFfmpeg() {
  const r = spawnSync(FFMPEG, ['-version'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

export const FFMPEG_HINT =
  `ffmpeg not found (tried "${FFMPEG}"). Install it (winget install ffmpeg) and open a new `
  + 'shell, or set FFMPEG to its full path. Raw audio is kept either way, so '
  + '--encode-only finishes the job later without re-baking.';

// Mono, and VBR-free so the manifest's byte sizes stay predictable across re-runs.
export function toMp3(src, dest, bitrate = '64k') {
  execFileSync(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', src,
    '-codec:a', 'libmp3lame', '-b:a', bitrate, '-ac', '1',
    dest,
  ]);
}

export function toOpus(src, dest, bitrate = '24k') {
  execFileSync(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', src,
    '-codec:a', 'libopus', '-b:a', bitrate, '-ac', '1',
    dest,
  ]);
}
