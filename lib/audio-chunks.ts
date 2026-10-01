import type { RawNote } from './dombra-transcription';

export const MAX_AUDIO_DURATION_SECONDS = 15 * 60;
export const MAX_AUDIO_FILE_BYTES = 300 * 1024 * 1024;
export const ANALYSIS_SAMPLE_RATE = 22050;
export const ANALYSIS_CHUNK_SECONDS = 30;
export const ANALYSIS_OVERLAP_SECONDS = 1.5;

export type AudioChunk = {
  index: number;
  startTimeSeconds: number;
  durationSeconds: number;
  keepFromSeconds: number;
  keepToSeconds: number;
};

export function planAudioChunks(
  totalDurationSeconds: number,
  chunkDurationSeconds = ANALYSIS_CHUNK_SECONDS,
  overlapSeconds = ANALYSIS_OVERLAP_SECONDS,
): AudioChunk[] {
  if (!Number.isFinite(totalDurationSeconds) || totalDurationSeconds <= 0) return [];
  if (chunkDurationSeconds <= 0 || overlapSeconds < 0 || overlapSeconds >= chunkDurationSeconds) {
    throw new Error('Invalid audio chunk configuration');
  }

  const stepSeconds = chunkDurationSeconds - overlapSeconds;
  const chunks: AudioChunk[] = [];

  for (let start = 0; start < totalDurationSeconds; start += stepSeconds) {
    const end = Math.min(totalDurationSeconds, start + chunkDurationSeconds);
    const isFirst = chunks.length === 0;
    const isLast = end >= totalDurationSeconds;
    const nextStart = start + stepSeconds;

    chunks.push({
      index: chunks.length,
      startTimeSeconds: start,
      durationSeconds: end - start,
      keepFromSeconds: isFirst ? 0 : start + overlapSeconds / 2,
      keepToSeconds: isLast
        ? totalDurationSeconds + Number.EPSILON
        : nextStart + overlapSeconds / 2,
    });

    if (isLast) break;
  }

  return chunks;
}

export function placeChunkNotes(notes: RawNote[], chunk: AudioChunk): RawNote[] {
  return notes
    .map((note) => ({
      ...note,
      startTimeSeconds: note.startTimeSeconds + chunk.startTimeSeconds,
    }))
    .filter((note) => (
      note.startTimeSeconds >= chunk.keepFromSeconds
      && note.startTimeSeconds < chunk.keepToSeconds
    ));
}
