// WAV -> mp3 via system ffmpeg. Gemini returns raw PCM, so encoding is a required
// stage rather than a nicety; keeping it separate from the bake means format
// experiments (bitrate; the opus trial mp3 won over) re-encode from cached raw
// audio and never re-pay the API.
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

// Loudness-normalize one WAV to a fixed target, re-emitting 24 kHz mono 16-bit so the
// output stays byte-compatible with concatWavs. Applied per chunk before joining:
// it evens out the level differences between independently generated chunks, which is
// the thing most likely to make a seam audible. EBU R128 single pass — accurate enough
// for level-matching; a two-pass measure would be overkill here.
export function loudnormWav(src, dest, { I = -16, TP = -1.5, LRA = 11 } = {}) {
  execFileSync(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', src,
    '-af', `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}`,
    '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le',
    dest,
  ]);
}
