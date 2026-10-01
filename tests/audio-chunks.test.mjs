import test from 'node:test';
import assert from 'node:assert/strict';
import { placeChunkNotes, planAudioChunks } from '../lib/audio-chunks.ts';

const note = (startTimeSeconds, durationSeconds = .5) => ({
  startTimeSeconds,
  durationSeconds,
  pitchMidi: 62,
  amplitude: .8,
});

test('splits a five-minute recording into bounded overlapping chunks', () => {
  const chunks = planAudioChunks(300);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.durationSeconds <= 30));
  assert.equal(chunks[0].startTimeSeconds, 0);
  assert.equal(chunks.at(-1).startTimeSeconds + chunks.at(-1).durationSeconds, 300);
});

test('assigns overlap notes to only one neighboring chunk', () => {
  const chunks = planAudioChunks(60);
  const boundaryNote = 29.3;
  const fromFirst = placeChunkNotes([note(boundaryNote)], chunks[0]);
  const fromSecond = placeChunkNotes([note(boundaryNote - chunks[1].startTimeSeconds)], chunks[1]);
  assert.equal(fromFirst.length + fromSecond.length, 1);
  assert.equal((fromFirst[0] ?? fromSecond[0]).startTimeSeconds, boundaryNote);
});

test('keeps a short recording as one chunk', () => {
  const chunks = planAudioChunks(12.5);
  assert.deepEqual(chunks, [{
    index: 0,
    startTimeSeconds: 0,
    durationSeconds: 12.5,
    keepFromSeconds: 0,
    keepToSeconds: 12.5 + Number.EPSILON,
  }]);
});
