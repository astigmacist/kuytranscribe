type Note = { pitchMidi: number; startTimeSeconds: number; durationSeconds: number; string: 'I' | 'II' | '—'; fret: number | null };
const DIVISIONS = 480;
const BAR = DIVISIONS * 4;
const GRID = DIVISIONS / 4;
const lengths = [[1920, 'whole'], [960, 'half'], [480, 'quarter'], [240, 'eighth'], [120, '16th']] as const;
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);

/** Quantized 4/4 draft. Independent voices preserve polyphony and silence. */
export function createMusicXml(notes: Note[], title: string, bpm: number) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('Invalid tempo');
  const tick = (seconds: number) => Math.round(seconds * bpm / 60 * DIVISIONS / GRID) * GRID;
  const events = notes.filter((n) => Number.isInteger(n.pitchMidi) && n.pitchMidi >= 0 && n.pitchMidi <= 127 &&
    Number.isFinite(n.startTimeSeconds) && n.startTimeSeconds >= 0 && Number.isFinite(n.durationSeconds) && n.durationSeconds > 0)
    .map((note) => ({ note, start: tick(note.startTimeSeconds), end: Math.max(tick(note.startTimeSeconds) + GRID, tick(note.startTimeSeconds + note.durationSeconds)) }))
    .sort((a, b) => a.start - b.start || a.note.pitchMidi - b.note.pitchMidi);
  const voices: typeof events[] = [];
  for (const event of events) {
    let voice = voices.find((items) => items[items.length - 1].end <= event.start);
    if (!voice) { voice = []; voices.push(voice); }
    voice.push(event);
  }
  if (!voices.length) voices.push([]);
  const lastTick = Math.max(BAR, ...events.map((e) => e.end));
  const measures: string[] = [];
  for (let bar = 0; bar < Math.ceil(lastTick / BAR); bar += 1) {
    const start = bar * BAR, end = start + BAR;
    const content: string[] = [];
    if (bar === 0) content.push(`<attributes><divisions>${DIVISIONS}</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><sound tempo="${bpm}"/></direction>`);
    voices.forEach((voice, index) => {
      if (index) content.push(`<backup><duration>${BAR}</duration></backup>`);
      let cursor = start;
      const emit = (from: number, to: number, event?: typeof events[number]) => {
        while (from < to) {
          const [duration, type] = lengths.find(([length]) => length <= to - from)!;
          const n = event?.note;
          const pitch = n ? `<pitch><step>${['C','C','D','D','E','F','F','G','G','A','A','B'][n.pitchMidi % 12]}</step>${[1,3,6,8,10].includes(n.pitchMidi % 12) ? '<alter>1</alter>' : ''}<octave>${Math.floor(n.pitchMidi / 12) - 1}</octave></pitch>` : '<rest/>';
          const stop = !!event && from > event.start;
          const tie = !!event && from + duration < event.end;
          const ties = `${stop ? '<tie type="stop"/>' : ''}${tie ? '<tie type="start"/>' : ''}`;
          const notation = n ? `<notations>${stop ? '<tied type="stop"/>' : ''}${tie ? '<tied type="start"/>' : ''}${n.fret !== null && n.string !== '—' ? `<technical><string>${n.string === 'I' ? 1 : 2}</string><fret>${n.fret}</fret></technical>` : ''}</notations>` : '';
          content.push(`<note>${pitch}<duration>${duration}</duration>${ties}<voice>${index + 1}</voice><type>${type}</type>${notation}</note>`);
          from += duration;
        }
      };
      voice.filter((event) => event.start < end && event.end > start).forEach((event) => {
        const from = Math.max(start, event.start), to = Math.min(end, event.end);
        if (from > cursor) emit(cursor, from);
        emit(from, to, event); cursor = to;
      });
      if (cursor < end) emit(cursor, end);
    });
    measures.push(`<measure number="${bar + 1}">${content.join('')}</measure>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>${escapeXml(title)}</work-title></work><part-list><score-part id="P1"><part-name>Домбыра</part-name></score-part></part-list><part id="P1">${measures.join('\n')}</part></score-partwise>`;
}
