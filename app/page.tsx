'use client';

import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type Status = 'idle' | 'ready' | 'processing' | 'done' | 'error';
type ViewMode = 'tab' | 'score' | 'notes';

type TranscribedNote = {
  pitchMidi: number;
  startTimeSeconds: number;
  durationSeconds: number;
  amplitude: number;
  pitchBends?: number[];
  name: string;
  string: 'I' | 'II' | '—';
  fret: number | null;
};

const TUNINGS = {
  standard: {
    name: 'Дәстүрлі · D3 — G3',
    strings: [
      { label: 'I' as const, open: 55, note: 'G3' },
      { label: 'II' as const, open: 50, note: 'D3' },
    ],
  },
  qonyr: {
    name: 'Қоңыр · C3 — G3',
    strings: [
      { label: 'I' as const, open: 55, note: 'G3' },
      { label: 'II' as const, open: 48, note: 'C3' },
    ],
  },
  tel: {
    name: 'Тел · D3 — D4',
    strings: [
      { label: 'I' as const, open: 62, note: 'D4' },
      { label: 'II' as const, open: 50, note: 'D3' },
    ],
  },
};

type TuningKey = keyof typeof TUNINGS;

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

const DEMO_SOURCE = [
  [62, 0, .42], [64, .46, .38], [66, .88, .76], [67, 1.7, .34],
  [69, 2.08, .72], [67, 2.86, .36], [66, 3.26, .36], [64, 3.66, .7],
  [62, 4.42, .4], [57, 4.88, .38], [62, 5.32, .78], [64, 6.16, .38],
  [66, 6.58, .38], [69, 7.02, .82], [71, 7.9, .38], [69, 8.34, .38],
  [67, 8.78, .72], [66, 9.56, .38], [64, 10, .38], [62, 10.44, .9],
  [57, 11.4, .44], [59, 11.9, .4], [61, 12.34, .4], [62, 12.78, 1.08],
] as const;

function midiToName(midi: number) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function applyTuning(
  source: Array<Omit<TranscribedNote, 'name' | 'string' | 'fret'>>,
  tuningKey: TuningKey,
): TranscribedNote[] {
  const tuning = TUNINGS[tuningKey];
  return source.map((note) => {
    const candidates = tuning.strings
      .map((string) => ({ ...string, fret: note.pitchMidi - string.open }))
      .filter((candidate) => candidate.fret >= 0 && candidate.fret <= 24)
      .sort((a, b) => a.fret - b.fret);
    const best = candidates[0];
    return {
      ...note,
      name: midiToName(note.pitchMidi),
      string: best?.label ?? '—',
      fret: best?.fret ?? null,
    };
  });
}

function getDemo(tuningKey: TuningKey) {
  return applyTuning(
    DEMO_SOURCE.map(([pitchMidi, startTimeSeconds, durationSeconds], index) => ({
      pitchMidi,
      startTimeSeconds,
      durationSeconds,
      amplitude: .74 + (index % 4) * .05,
    })),
    tuningKey,
  );
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '00:00';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function cleanTitle(filename: string) {
  return filename.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
}

function estimateTempo(notes: TranscribedNote[]) {
  const intervals = notes
    .slice(1)
    .map((note, index) => note.startTimeSeconds - notes[index].startTimeSeconds)
    .filter((interval) => interval > .16 && interval < 1.5)
    .sort((a, b) => a - b);
  if (!intervals.length) return 92;
  const median = intervals[Math.floor(intervals.length / 2)];
  let bpm = 60 / median;
  while (bpm < 65) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm);
}

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function createMusicXml(notes: TranscribedNote[], title: string, bpm: number) {
  const divisions = 480;
  const noteXml = notes.map((note) => {
    const pitchClass = note.pitchMidi % 12;
    const steps = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
    const alters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
    const duration = Math.max(60, Math.round(note.durationSeconds * bpm / 60 * divisions));
    return `      <note>
        <pitch><step>${steps[pitchClass]}</step>${alters[pitchClass] ? '<alter>1</alter>' : ''}<octave>${Math.floor(note.pitchMidi / 12) - 1}</octave></pitch>
        <duration>${duration}</duration><voice>1</voice><type>quarter</type>
        <lyric><text>${note.string}/${note.fret ?? '—'}</text></lyric>
      </note>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${title}</work-title></work>
  <part-list><score-part id="P1"><part-name>Домбыра</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>${divisions}</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <direction><sound tempo="${bpm}"/></direction>
${noteXml}
  </measure></part>
</score-partwise>`;
}

export default function Home() {
  const [language, setLanguage] = useState<'RU' | 'KZ'>('RU');
  const [status, setStatus] = useState<Status>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [notes, setNotes] = useState<TranscribedNote[]>([]);
  const [tuning, setTuning] = useState<TuningKey>('standard');
  const [accuracy, setAccuracy] = useState('balanced');
  const [view, setView] = useState<ViewMode>('tab');
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDemo, setIsDemo] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  const title = file ? cleanTitle(file.name) : 'Кеңес';
  const displayNotes = useMemo(
    () => notes.length ? applyTuning(notes, tuning) : getDemo(tuning),
    [notes, tuning],
  );
  const effectiveDuration = duration || Math.max(...displayNotes.map((note) => note.startTimeSeconds + note.durationSeconds), 13.86);
  const bpm = useMemo(() => estimateTempo(displayNotes), [displayNotes]);
  const bars = useMemo(
    () => Array.from({ length: 72 }, (_, i) => 18 + ((i * 29 + (i % 7) * 13) % 66)),
    [],
  );

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const chooseFile = async (selected?: File) => {
    if (!selected) return;
    if (!selected.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|flac)$/i.test(selected.name)) {
      setError('Выберите аудиофайл MP3, WAV, M4A, OGG или FLAC.');
      setStatus('error');
      return;
    }
    if (selected.size > 120 * 1024 * 1024) {
      setError('Файл слишком большой. Максимальный размер — 120 МБ.');
      setStatus('error');
      return;
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const nextUrl = URL.createObjectURL(selected);
    setFile(selected);
    setAudioUrl(nextUrl);
    setNotes([]);
    setProgress(0);
    setCurrentTime(0);
    setIsDemo(false);
    setError('');
    setStatus('ready');

    try {
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(await selected.arrayBuffer());
      setDuration(decoded.duration);
      await context.close();
      if (decoded.duration > 600) {
        setError('Для MVP используйте запись длительностью до 10 минут.');
        setStatus('error');
      }
    } catch {
      setError('Не удалось прочитать запись. Попробуйте WAV или MP3.');
      setStatus('error');
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void chooseFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.currentTarget.classList.remove('dragging');
    void chooseFile(event.dataTransfer.files?.[0]);
  };

  const removeFile = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setFile(null);
    setAudioUrl('');
    setDuration(0);
    setNotes([]);
    setStatus('idle');
    setProgress(0);
    setCurrentTime(0);
    setIsDemo(true);
  };

  const transcribe = async () => {
    if (!file || status === 'processing') return;
    setStatus('processing');
    setError('');
    setProgress(.02);

    try {
      const decodeContext = new AudioContext();
      const decoded = await decodeContext.decodeAudioData(await file.arrayBuffer());
      const frameCount = Math.ceil(decoded.duration * 22050);
      const offline = new OfflineAudioContext(1, frameCount, 22050);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const resampled = await offline.startRendering();
      await decodeContext.close();
      setProgress(.09);

      const {
        BasicPitch,
        addPitchBendsToNoteEvents,
        noteFramesToTime,
        outputToNotesPoly,
      } = await import('@spotify/basic-pitch');

      const frames: number[][] = [];
      const onsets: number[][] = [];
      const contours: number[][] = [];
      const engine = new BasicPitch('/model/model.json');

      await engine.evaluateModel(
        resampled,
        (nextFrames, nextOnsets, nextContours) => {
          frames.push(...nextFrames);
          onsets.push(...nextOnsets);
          contours.push(...nextContours);
        },
        (value) => setProgress(.1 + value * .82),
      );

      const threshold = accuracy === 'detail' ? .22 : .3;
      const raw = noteFramesToTime(
        addPitchBendsToNoteEvents(
          contours,
          outputToNotesPoly(frames, onsets, threshold, .25, 5),
        ),
      )
        .filter((note) => note.durationSeconds >= .045 && note.pitchMidi >= 45 && note.pitchMidi <= 92)
        .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

      if (!raw.length) throw new Error('NO_NOTES');
      setNotes(applyTuning(raw, tuning));
      setProgress(1);
      setView('tab');
      setStatus('done');
    } catch (reason) {
      console.error(reason);
      setError(
        reason instanceof Error && reason.message === 'NO_NOTES'
          ? 'Ноты не найдены. Попробуйте более громкую сольную запись домбры.'
          : 'Распознавание не завершилось. Попробуйте короткий WAV/MP3 без фоновой музыки.',
      );
      setStatus('error');
      setProgress(0);
    }
  };

  const openDemo = () => {
    setNotes(getDemo(tuning));
    setFile(null);
    setAudioUrl('');
    setDuration(13.86);
    setStatus('done');
    setProgress(1);
    setIsDemo(true);
    setView('tab');
    setCurrentTime(0);
  };

  const playSynthDemo = () => {
    if (isPlaying) return;
    const context = new AudioContext();
    const startAt = context.currentTime + .05;
    displayNotes.forEach((note) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 440 * 2 ** ((note.pitchMidi - 69) / 12);
      gain.gain.setValueAtTime(0, startAt + note.startTimeSeconds);
      gain.gain.linearRampToValueAtTime(.08, startAt + note.startTimeSeconds + .012);
      gain.gain.exponentialRampToValueAtTime(.001, startAt + note.startTimeSeconds + note.durationSeconds);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(startAt + note.startTimeSeconds);
      oscillator.stop(startAt + note.startTimeSeconds + note.durationSeconds + .03);
    });
    setIsPlaying(true);
    const started = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - started) / 1000;
      setCurrentTime(Math.min(elapsed, effectiveDuration));
      if (elapsed < effectiveDuration) requestAnimationFrame(tick);
      else {
        setIsPlaying(false);
        setCurrentTime(0);
        void context.close();
      }
    };
    requestAnimationFrame(tick);
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) {
      playSynthDemo();
      return;
    }
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const exportMidi = async () => {
    const { Midi } = await import('@tonejs/midi');
    const midi = new Midi();
    midi.header.setTempo(bpm);
    const track = midi.addTrack();
    track.name = title;
    displayNotes.forEach((note) => track.addNote({
      midi: note.pitchMidi,
      time: note.startTimeSeconds,
      duration: note.durationSeconds,
      velocity: Math.max(.1, Math.min(1, note.amplitude)),
    }));
    const midiBytes = midi.toArray();
    const midiBuffer = new ArrayBuffer(midiBytes.byteLength);
    new Uint8Array(midiBuffer).set(midiBytes);
    downloadBlob(midiBuffer, `${title}.mid`, 'audio/midi');
  };

  const exportMusicXml = () => {
    downloadBlob(createMusicXml(displayNotes, title, bpm), `${title}.musicxml`, 'application/vnd.recordare.musicxml+xml');
  };

  const activeProgress = Math.min(100, Math.round(progress * 100));
  const playPercent = Math.min(100, (currentTime / Math.max(effectiveDuration, 1)) * 100);
  const visibleNotes = displayNotes.slice(0, 72);
  const maxPitch = Math.max(...displayNotes.map((note) => note.pitchMidi), 69);
  const minPitch = Math.min(...displayNotes.map((note) => note.pitchMidi), 50);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="KüyTranscribe — главная">
          <span className="brand-mark">К</span>
          <span>KüyTranscribe</span>
          <span className="beta">MVP</span>
        </a>
        <nav className="nav-links" aria-label="Основная навигация">
          <a className="active" href="#workspace">Студия</a>
          <a href="#workflow">Как это работает</a>
          <a href="https://github.com/spotify/basic-pitch" target="_blank" rel="noreferrer">Технология</a>
        </nav>
        <button
          className="language"
          type="button"
          onClick={() => setLanguage((current) => current === 'RU' ? 'KZ' : 'RU')}
          aria-label="Переключить язык"
        >
          {language} <span>↻</span>
        </button>
      </header>

      <section className="hero" id="workspace">
        <div className="hero-copy">
          <div className="eyebrow"><span /> Цифровая мастерская домбры</div>
          <h1>Услышим күй.<br /><em>Запишем каждую ноту.</em></h1>
          <p>Загрузите сольную запись домбры — сервис превратит исполнение в ноты, MIDI и понятную табулатуру для двух струн.</p>
        </div>
        <div className="hero-aside">
          <span>01</span>
          <p>Обработка проходит<br />прямо в браузере</p>
        </div>
      </section>

      <section className="workspace-grid">
        <article className="upload-card">
          <div className="card-heading">
            <span className="step">01</span>
            <div>
              <h2>Добавьте запись</h2>
              <p>Чистое звучание одной домбры даст лучший результат</p>
            </div>
          </div>

          {file ? (
            <div className="selected-file">
              <div className="file-vinyl"><span>♪</span></div>
              <div className="file-copy">
                <small>Аудиозапись готова</small>
                <strong>{file.name}</strong>
                <span>{(file.size / 1024 / 1024).toFixed(1)} МБ · {formatTime(duration)}</span>
              </div>
              <button type="button" onClick={removeFile} aria-label="Удалить файл">×</button>
            </div>
          ) : (
            <label
              className="dropzone"
              htmlFor="audio-file"
              onDragOver={(event) => {
                event.preventDefault();
                event.currentTarget.classList.add('dragging');
              }}
              onDragLeave={(event) => event.currentTarget.classList.remove('dragging')}
              onDrop={onDrop}
            >
              <input id="audio-file" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" onChange={onFileChange} />
              <span className="upload-icon">↑</span>
              <strong>Перетащите аудиофайл сюда</strong>
              <span>или выберите с устройства</span>
              <small>MP3, WAV, M4A, OGG, FLAC · до 10 минут</small>
            </label>
          )}

          <div className="settings-row">
            <label>
              <span>Строй домбры</span>
              <select value={tuning} onChange={(event) => setTuning(event.target.value as TuningKey)}>
                {Object.entries(TUNINGS).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}
              </select>
            </label>
            <label>
              <span>Точность</span>
              <select value={accuracy} onChange={(event) => setAccuracy(event.target.value)}>
                <option value="balanced">Сбалансированная</option>
                <option value="detail">Больше деталей</option>
              </select>
            </label>
          </div>

          {status === 'processing' && (
            <div className="progress-box" role="status">
              <div><span>Нейросеть слушает исполнение</span><strong>{activeProgress}%</strong></div>
              <i><span style={{ width: `${activeProgress}%` }} /></i>
              <small>{activeProgress < 12 ? 'Подготавливаем аудио…' : activeProgress < 92 ? 'Определяем высоту и начало нот…' : 'Собираем табулатуру…'}</small>
            </div>
          )}

          {error && <p className="error-message" role="alert">{error}</p>}

          <button
            className="primary-button"
            type="button"
            disabled={!file || status === 'processing' || status === 'error'}
            onClick={() => void transcribe()}
          >
            <span>{status === 'processing' ? 'Распознаём…' : status === 'done' && !isDemo ? 'Распознать заново' : 'Распознать күй'}</span>
            <span>↗</span>
          </button>
          <p className="privacy-note">Файл остаётся на вашем устройстве и не публикуется</p>
        </article>

        <article className="score-card">
          <div className="score-toolbar">
            <div>
              <span className={`live-dot ${status === 'processing' ? 'pulse' : ''}`} />
              <span>{status === 'done' && !isDemo ? 'Расшифровка готова' : status === 'processing' ? 'Идёт анализ' : 'Демонстрационная расшифровка'}</span>
            </div>
            <button type="button" onClick={openDemo}>Открыть демо <span>↗</span></button>
          </div>

          <div className="track-title">
            <div>
              <small>{file ? 'Загруженная запись' : 'Халық күйі'}</small>
              <h2>{title}</h2>
            </div>
            <div className="track-meta">
              <span>♩ {bpm} BPM</span><span>{displayNotes.length} нот</span><span>{formatTime(effectiveDuration)}</span>
            </div>
          </div>

          <div className="waveform" aria-label="Форма звуковой волны" onClick={(event) => {
            if (!audioRef.current || !audioUrl) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const next = ((event.clientX - bounds.left) / bounds.width) * effectiveDuration;
            audioRef.current.currentTime = next;
            setCurrentTime(next);
          }}>
            {bars.map((height, i) => (
              <i key={i} className={i / bars.length * 100 <= playPercent ? 'heard' : ''} style={{ height: `${height}%` }} />
            ))}
            <span className="playhead" style={{ left: `${playPercent}%` }} />
          </div>

          <div className="view-tabs" role="tablist" aria-label="Вид расшифровки">
            <button className={view === 'tab' ? 'active' : ''} onClick={() => setView('tab')} role="tab">Табулатура</button>
            <button className={view === 'score' ? 'active' : ''} onClick={() => setView('score')} role="tab">Нотный лист</button>
            <button className={view === 'notes' ? 'active' : ''} onClick={() => setView('notes')} role="tab">Список нот</button>
          </div>

          <div className="transcription-view">
            {view === 'tab' && (
              <div className="tab-scroll">
                <div className="tab-sequence" style={{ minWidth: `${Math.max(700, visibleNotes.length * 56)}px` }}>
                  <div className="tab-string top"><b>I · {TUNINGS[tuning].strings[0].note}</b></div>
                  <div className="tab-string bottom"><b>II · {TUNINGS[tuning].strings[1].note}</b></div>
                  {visibleNotes.map((note, index) => {
                    const left = 68 + index * 56;
                    return (
                      <div className={`tab-note ${note.string === 'I' ? 'on-top' : note.string === 'II' ? 'on-bottom' : 'unplaced'}`} style={{ left }} key={`${note.startTimeSeconds}-${index}`}>
                        <small>{note.name}</small>
                        <strong>{note.fret ?? '×'}</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {view === 'score' && (
              <div className="staff-scroll">
                <div className="staff-sheet" style={{ minWidth: `${Math.max(700, visibleNotes.length * 45)}px` }}>
                  <span className="clef">𝄞</span>
                  {[0, 1, 2, 3, 4].map((line) => <i className="staff-line" style={{ top: 42 + line * 18 }} key={line} />)}
                  {visibleNotes.map((note, index) => {
                    const normalized = (note.pitchMidi - minPitch) / Math.max(1, maxPitch - minPitch);
                    return (
                      <span
                        className="staff-note"
                        style={{ left: 78 + index * 45, top: 104 - normalized * 72 }}
                        title={note.name}
                        key={`${note.startTimeSeconds}-${index}`}
                      >
                        <b>●</b><i /><small>{note.name}</small>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {view === 'notes' && (
              <div className="notes-table-wrap">
                <table className="notes-table">
                  <thead><tr><th>№</th><th>Время</th><th>Нота</th><th>Струна</th><th>Лад</th><th>Длит.</th></tr></thead>
                  <tbody>
                    {visibleNotes.map((note, index) => (
                      <tr key={`${note.startTimeSeconds}-${index}`}>
                        <td>{String(index + 1).padStart(2, '0')}</td>
                        <td>{note.startTimeSeconds.toFixed(2)} с</td>
                        <td><strong>{note.name}</strong></td>
                        <td>{note.string}</td>
                        <td>{note.fret ?? '—'}</td>
                        <td>{note.durationSeconds.toFixed(2)} с</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="score-footer">
            <button className="play-button" type="button" onClick={togglePlayback} aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}>
              {isPlaying ? 'Ⅱ' : '▶'}
            </button>
            <div className="timeline"><span style={{ width: `${playPercent}%` }} /><i style={{ left: `${playPercent}%` }} /></div>
            <time>{formatTime(currentTime)} / {formatTime(effectiveDuration)}</time>
          </div>
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            />
          )}

          <div className="export-bar">
            <span>Экспорт расшифровки</span>
            <div>
              <button type="button" onClick={() => void exportMidi()}>MIDI ↓</button>
              <button type="button" onClick={exportMusicXml}>MusicXML ↓</button>
              <button type="button" onClick={() => window.print()}>PDF / печать ↓</button>
            </div>
          </div>
        </article>
      </section>

      <section className="workflow" id="workflow">
        <div><span>01</span><strong>Загрузите</strong><p>Сольную запись домбры без голоса и фоновой музыки.</p></div>
        <div><span>02</span><strong>Проверьте</strong><p>Сравните ноты с табулатурой для выбранного строя.</p></div>
        <div><span>03</span><strong>Сохраните</strong><p>Экспортируйте MIDI, MusicXML или нотный лист в PDF.</p></div>
      </section>

      <section className="trust-strip">
        <span>Открытая технология</span>
        <a href="https://github.com/spotify/basic-pitch" target="_blank" rel="noreferrer">Spotify Basic Pitch ↗</a>
        <i />
        <span>Стандартный строй</span>
        <strong>D3 — G3</strong>
        <i />
        <span>Обработка</span>
        <strong>локально в браузере</strong>
      </section>
    </main>
  );
}
