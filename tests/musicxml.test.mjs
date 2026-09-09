import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicXml } from '../lib/musicxml.ts';
const note = (start, duration, pitch = 62) => ({ startTimeSeconds: start, durationSeconds: duration, pitchMidi: pitch, string: 'I', fret: 0 });
test('escapes filenames and exports string numbering', () => {
  const xml = createMusicXml([note(0, .5)], 'Күй & <домбыра>', 120);
  assert.ok(xml.includes('Күй &amp; &lt;домбыра&gt;'));
  assert.ok(xml.includes('<string>1</string>'));
});
test('keeps silence, polyphony and ties across bars', () => {
  const xml = createMusicXml([note(.5, 3), note(.5, 1, 67)], 'Күй', 120);
  assert.equal((xml.match(/<measure number=/g) || []).length, 2);
  assert.ok(xml.includes('<rest/>'));
  assert.ok(xml.includes('<voice>2</voice>'));
  assert.ok(xml.includes('<tie type="start"/>'));
  assert.ok(xml.includes('<tie type="stop"/>'));
  for (const measure of xml.matchAll(/<measure[^>]*>(.*?)<\/measure>/gs)) {
    for (const voice of measure[1].split(/<backup>.*?<\/backup>/s)) {
      const sum = [...voice.matchAll(/<duration>(\d+)<\/duration>/g)].reduce((n, match) => n + Number(match[1]), 0);
      assert.equal(sum, 1920);
    }
  }
});
