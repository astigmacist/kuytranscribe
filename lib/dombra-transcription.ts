export type StringLabel = 'I' | 'II';

export type DombraString = {
  label: StringLabel;
  open: number;
  note: string;
};

export type RawNote = {
  pitchMidi: number;
  startTimeSeconds: number;
  durationSeconds: number;
  amplitude: number;
  pitchBends?: number[];
};

export type DombraNote = RawNote & {
  name: string;
  string: StringLabel | '—';
  fret: number | null;
};

export type AccuracyProfile = 'balanced' | 'detail';

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const MAX_FRET = 24;

function midiToName(midi: number) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function getCandidates(note: RawNote, strings: readonly DombraString[]) {
  return strings
    .map((string) => ({ ...string, fret: note.pitchMidi - string.open }))
    .filter((candidate) => candidate.fret >= 0 && candidate.fret <= MAX_FRET);
}

function overlapRatio(left: RawNote, right: RawNote) {
  const start = Math.max(left.startTimeSeconds, right.startTimeSeconds);
  const end = Math.min(
    left.startTimeSeconds + left.durationSeconds,
    right.startTimeSeconds + right.durationSeconds,
  );
  return Math.max(0, end - start) / Math.max(.001, Math.min(left.durationSeconds, right.durationSeconds));
}

function removeOnsetDuplicates(notes: RawNote[], profile: AccuracyProfile) {
  const onsetWindow = profile === 'balanced' ? .065 : .045;
  const output: RawNote[] = [];
  let cursor = 0;

  while (cursor < notes.length) {
    const group = [notes[cursor]];
    let next = cursor + 1;
    while (
      next < notes.length
      && notes[next].startTimeSeconds - notes[cursor].startTimeSeconds <= onsetWindow
    ) {
      group.push(notes[next]);
      next += 1;
    }

    const unique = group
      .sort((left, right) => right.amplitude - left.amplitude)
      .filter((candidate, index, ranked) => {
        const stronger = ranked.slice(0, index);
        if (stronger.some((note) => note.pitchMidi === candidate.pitchMidi)) return false;

        return !stronger.some((note) => {
          const interval = candidate.pitchMidi - note.pitchMidi;
          const isLikelyHarmonic = interval === 12 || interval === 19 || interval === 24;
          return isLikelyHarmonic
            && candidate.amplitude < note.amplitude * .76
            && overlapRatio(candidate, note) > .55;
        });
      })
      .slice(0, 2);

    output.push(...unique);
    cursor = next;
  }

  return output.sort((left, right) => (
    left.startTimeSeconds - right.startTimeSeconds || left.pitchMidi - right.pitchMidi
  ));
}

function mergeFragments(notes: RawNote[], profile: AccuracyProfile) {
  const maxGap = profile === 'balanced' ? .055 : .035;
  const merged: RawNote[] = [];

  notes.forEach((note) => {
    const previous = merged.at(-1);
    const previousEnd = previous
      ? previous.startTimeSeconds + previous.durationSeconds
      : Number.NEGATIVE_INFINITY;

    if (
      previous
      && previous.pitchMidi === note.pitchMidi
      && note.startTimeSeconds - previousEnd >= -.025
      && note.startTimeSeconds - previousEnd <= maxGap
    ) {
      const end = Math.max(previousEnd, note.startTimeSeconds + note.durationSeconds);
      previous.durationSeconds = end - previous.startTimeSeconds;
      previous.amplitude = Math.max(previous.amplitude, note.amplitude);
      if (note.pitchBends?.length) {
        previous.pitchBends = [...(previous.pitchBends ?? []), ...note.pitchBends];
      }
      return;
    }

    merged.push({ ...note, pitchBends: note.pitchBends ? [...note.pitchBends] : undefined });
  });

  return merged;
}

function assignStrings(notes: RawNote[], strings: readonly DombraString[]): DombraNote[] {
  if (!notes.length) return [];

  const candidates = notes.map((note) => getCandidates(note, strings));
  const costs: number[][] = [];
  const parents: number[][] = [];

  candidates.forEach((noteCandidates, noteIndex) => {
    costs[noteIndex] = [];
    parents[noteIndex] = [];

    noteCandidates.forEach((candidate, candidateIndex) => {
      const positionCost = candidate.fret * .025 + (candidate.fret > 17 ? .4 : 0);

      if (noteIndex === 0) {
        costs[noteIndex][candidateIndex] = positionCost;
        parents[noteIndex][candidateIndex] = -1;
        return;
      }

      let bestCost = Number.POSITIVE_INFINITY;
      let bestParent = 0;
      candidates[noteIndex - 1].forEach((previous, previousIndex) => {
        const simultaneous = Math.abs(
          notes[noteIndex].startTimeSeconds - notes[noteIndex - 1].startTimeSeconds,
        ) < .07;
        const impossibleChord = simultaneous && previous.label === candidate.label ? 100 : 0;
        const fretMovement = Math.abs(previous.fret - candidate.fret) * .16;
        const stringChange = previous.label === candidate.label ? 0 : .24;
        const cost = costs[noteIndex - 1][previousIndex]
          + positionCost
          + fretMovement
          + stringChange
          + impossibleChord;

        if (cost < bestCost) {
          bestCost = cost;
          bestParent = previousIndex;
        }
      });

      costs[noteIndex][candidateIndex] = bestCost;
      parents[noteIndex][candidateIndex] = bestParent;
    });
  });

  let selected = costs.at(-1)?.reduce(
    (best, cost, index, row) => cost < row[best] ? index : best,
    0,
  ) ?? 0;
  const path = Array(notes.length).fill(0);

  for (let index = notes.length - 1; index >= 0; index -= 1) {
    path[index] = selected;
    selected = parents[index][selected] ?? 0;
  }

  return notes.map((note, index) => {
    const placement = candidates[index][path[index]];
    return {
      ...note,
      name: midiToName(note.pitchMidi),
      string: placement?.label ?? '—',
      fret: placement?.fret ?? null,
    };
  });
}

export function getPitchRange(strings: readonly DombraString[]) {
  const minimumMidi = Math.min(...strings.map((string) => string.open));
  const maximumMidi = Math.max(...strings.map((string) => string.open + MAX_FRET));
  const toHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
  return {
    minimumMidi,
    maximumMidi,
    minimumHz: toHz(minimumMidi - .5),
    maximumHz: toHz(maximumMidi + .5),
  };
}

export function refineDombraNotes(
  source: RawNote[],
  strings: readonly DombraString[],
  profile: AccuracyProfile,
): DombraNote[] {
  const minimumDuration = profile === 'balanced' ? .065 : .04;
  const minimumAmplitude = profile === 'balanced' ? .31 : .23;

  const playable = source
    .filter((note) => (
      note.durationSeconds >= minimumDuration
      && note.amplitude >= minimumAmplitude
      && getCandidates(note, strings).length > 0
    ))
    .sort((left, right) => (
      left.startTimeSeconds - right.startTimeSeconds || left.pitchMidi - right.pitchMidi
    ));

  return assignStrings(
    mergeFragments(removeOnsetDuplicates(playable, profile), profile),
    strings,
  );
}

export function retabDombraNotes(notes: RawNote[], strings: readonly DombraString[]) {
  return assignStrings(notes, strings);
}
