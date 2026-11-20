import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Disc3,
  Download,
  Film,
  Music,
  Pause,
  Play,
  RefreshCw,
  Sliders,
  Sparkles,
  Volume2,
  Wand2,
} from 'lucide-react';
import { DIALECT_OPTIONS, LANGUAGE_OPTIONS } from '../types/cinema';
import type { AudioMixSettings, MusicComposition } from '../utils/mediaExport';
import {
  MUSIC_EMOTION_OPTIONS,
  MUSIC_GENRE_OPTIONS,
  MUSIC_INSTRUMENT_FOCUS_OPTIONS,
  MUSIC_STRUCTURE_OPTIONS,
  formatTimeMMSS,
  renderMusicMasterBundle,
  safeFileName,
  saveBlob,
  stripHashMarks,
} from '../utils/mediaExport';

interface Props {
  generatedMusic: { comp: MusicComposition; wavUrl: string } | null;
  musicWebAudioPlaying: boolean;
  studioTheme?: 'night' | 'day';
  geminiMode?: 'fast' | 'balanced' | 'pro';
  onToggleDirectPlay: () => void;
  onDownloadWav: () => void;
  onMusicProduced: (comp: MusicComposition, promptLabel: string) => Promise<void>;
  onSendToMusicVideo: (comp: MusicComposition) => void;
}

const DEFAULT_MIX: AudioMixSettings = {
  vocalLevel: 1.08,
  instrumentLevel: 1.0,
  drumsBassLevel: 1.0,
  reverbAmount: 0.45,
};

const QUICK_TEMPLATES = [
  {
    label: 'أغنية حنين عاطفية',
    prompt: 'أغنية عربية دافئة ومؤثرة عن الشوق وذكريات المطر الليلي بإيقاع عذب وإحساس عميق',
    genre: 'أغنية رومانسية',
    emotion: 'شجن وحنين عميق',
    instrument: 'arabic_ensemble' as const,
    structure: 'full_song' as const,
    bpm: 84,
  },
  {
    label: 'موسيقى أفلام ملحمية',
    prompt: 'موسيقى تصويرية أوركسترالية ضخمة متصاعدة لفيلم تاريخي وبطولي مع كمنجات وإيقاع درامي',
    genre: 'موسيقى أفلام ومسلسلات',
    emotion: 'حماس وقوة ملحمية',
    instrument: 'orchestral_piano' as const,
    structure: 'cinema_score' as const,
    bpm: 102,
  },
  {
    label: 'طرب عربي أصيل',
    prompt: 'أغنية طرب أصيلة بالعود والناي والكمنجة والكورس الدافئ عن الفرح واللقاء',
    genre: 'طرب عربي أصيل',
    emotion: 'فرح وتفاؤل وإشراق',
    instrument: 'arabic_ensemble' as const,
    structure: 'tarab_extended' as const,
    bpm: 92,
  },
  {
    label: 'إيقاع شبابي عصري',
    prompt: 'أغنية بوب وإيقاع حماسي عصري متدرج للأمام مع كورس حيوي وطاقة إيجابية',
    genre: 'بوب عالمي حديث',
    emotion: 'حماس وقوة ملحمية',
    instrument: 'modern_pop' as const,
    structure: 'full_song' as const,
    bpm: 112,
  },
];

export function MusicStudioPanel({
  generatedMusic,
  musicWebAudioPlaying,
  studioTheme = 'night',
  geminiMode = 'balanced',
  onToggleDirectPlay,
  onDownloadWav,
  onMusicProduced,
  onSendToMusicVideo,
}: Props) {
  const [musicMode, setMusicMode] = useState<'song' | 'instrumental'>('song');
  const [topicPrompt, setTopicPrompt] = useState('');
  const [genre, setGenre] = useState<string>(MUSIC_GENRE_OPTIONS[0]);
  const [emotion, setEmotion] = useState<string>(MUSIC_EMOTION_OPTIONS[0]);
  const [dialect, setDialect] = useState<string>('ammiya');
  const [language, setLanguage] = useState<string>('العربية');
  const [instrumentFocus, setInstrumentFocus] = useState<NonNullable<MusicComposition['instrumentFocus']>>('arabic_ensemble');
  const [songStructure, setSongStructure] = useState<NonNullable<MusicComposition['songStructure']>>('full_song');
  const [bpm, setBpm] = useState<number>(88);
  const [backingChoir, setBackingChoir] = useState<boolean>(true);
  const [lyrics, setLyrics] = useState('');
  const [excludedSingerIds, setExcludedSingerIds] = useState<string[]>([]);
  const [excludedVoiceNames, setExcludedVoiceNames] = useState<string[]>([]);

  const [writingLyrics, setWritingLyrics] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [remixing, setRemixing] = useState(false);
  const [showMixer, setShowMixer] = useState(true);
  const [status, setStatus] = useState('');

  const [mixSettings, setMixSettings] = useState<AudioMixSettings>(DEFAULT_MIX);
  const [stems, setStems] = useState<{ fullMixUrl: string; instrumentalUrl: string; vocalUrl?: string } | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [playbackSec, setPlaybackSec] = useState(0);
  const [audioDurationSec, setAudioDurationSec] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const coverCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const createdStemUrlsRef = useRef<string[]>([]);

  const lyricLines = useMemo(() => {
    const raw = generatedMusic?.comp.lyrics || '';
    return stripHashMarks(raw)
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
  }, [generatedMusic?.comp.lyrics]);

  const activeLyricIndex = useMemo(() => {
    if (lyricLines.length === 0 || !audioDurationSec) return -1;
    const effective = Math.max(0, playbackSec - 1.2);
    const bodyDur = Math.max(4, audioDurationSec - 3.5);
    const idx = Math.floor((effective / bodyDur) * lyricLines.length);
    return Math.min(lyricLines.length - 1, Math.max(0, idx));
  }, [lyricLines.length, playbackSec, audioDurationSec]);

  useEffect(() => {
    return () => {
      for (const u of createdStemUrlsRef.current) {
        URL.revokeObjectURL(u);
      }
      createdStemUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    let active = true;
    const comp = generatedMusic?.comp;
    if (!comp) {
      setStems(null);
      return;
    }

    const baseMix: AudioMixSettings = comp.mixSettings || DEFAULT_MIX;
    setMixSettings(baseMix);
    setPlaybackSec(0);
    setIsAudioPlaying(false);
    setAudioDurationSec(comp.durationSeconds || 32);

    setStems({
      fullMixUrl: generatedMusic.wavUrl,
      instrumentalUrl: generatedMusic.wavUrl,
    });

    void renderMusicMasterBundle(comp, baseMix).then((bundle) => {
      if (!active) {
        URL.revokeObjectURL(bundle.fullMixUrl);
        URL.revokeObjectURL(bundle.instrumentalUrl);
        if (bundle.vocalUrl) URL.revokeObjectURL(bundle.vocalUrl);
        return;
      }
      for (const old of createdStemUrlsRef.current) URL.revokeObjectURL(old);
      createdStemUrlsRef.current = [bundle.fullMixUrl, bundle.instrumentalUrl];
      if (bundle.vocalUrl) createdStemUrlsRef.current.push(bundle.vocalUrl);
      setStems(bundle);
    });

    return () => {
      active = false;
    };
  }, [generatedMusic]);

  useEffect(() => {
    const canvas = coverCanvasRef.current;
    const comp = generatedMusic?.comp;
    if (!canvas || !comp) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const drum = comp.drumStyle || 'pop';

    const themeColors: Record<string, [string, string, string]> = {
      arabic: ['#2b1035', '#7c2d12', '#fbbf24'],
      orchestral: ['#0f172a', '#1e1b4b', '#38bdf8'],
      trap: ['#111827', '#4c1d95', '#f43f5e'],
      lofi: ['#1e293b', '#064e3b', '#6ee7b7'],
      pop: ['#1e1b4b', '#312e81', '#a78bfa'],
    };
    const [c1, c2, acc] = themeColors[drum] || themeColors.pop;

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, c1);
    bg.addColorStop(0.55, c2);
    bg.addColorStop(1, '#070914');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const rg = ctx.createRadialGradient(W * 0.5, H * 0.44, 18, W * 0.5, H * 0.44, W * 0.46);
    rg.addColorStop(0, `${acc}55`);
    rg.addColorStop(0.55, `${acc}18`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.strokeStyle = `${acc}44`;
    ctx.lineWidth = 2;
    [54, 82, 110, 138].forEach((rad) => {
      ctx.beginPath();
      ctx.arc(W * 0.5, H * 0.43, rad, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.43, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    const bars = 28;
    for (let i = 0; i < bars; i++) {
      const bx = W * 0.14 + (i / (bars - 1)) * (W * 0.72);
      const bh = 8 + Math.abs(Math.sin(i * 0.7 + comp.bpm)) * 30;
      ctx.fillStyle = `${acc}bb`;
      ctx.fillRect(bx - 2, H * 0.7 - bh / 2, 4, bh);
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 21px Tahoma, Arial, sans-serif';
    ctx.fillText(stripHashMarks(comp.title).slice(0, 26), W / 2, H * 0.84);
    ctx.fillStyle = acc;
    ctx.font = '13px Tahoma, Arial, sans-serif';
    ctx.fillText(stripHashMarks(comp.genre || comp.mood || 'ZORVYX AI Music Studio'), W / 2, H * 0.92);
    ctx.restore();
  }, [generatedMusic]);

  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas || !generatedMusic?.comp) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const comp = generatedMusic.comp;
    const barCount = 52;

    const drawFrame = (nowMs: number) => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const active = isAudioPlaying || musicWebAudioPlaying;
      const t = active ? nowMs * 0.0045 : playbackSec * 1.4;
      const progRatio = audioDurationSec > 0 ? Math.min(1, playbackSec / audioDurationSec) : 0;

      for (let i = 0; i < barCount; i++) {
        const u = i / (barCount - 1);
        const env = Math.sin(u * Math.PI);
        const pulse = active
          ? Math.abs(Math.sin(t * 2.1 + i * 0.43) * 0.65 + Math.cos(t * 3.4 - i * 0.25) * 0.35)
          : 0.25 + 0.32 * Math.abs(Math.sin(i * 0.58 + comp.bpm));
        const bh = Math.max(6, (8 + pulse * (H - 18)) * (0.45 + 0.55 * env));
        const bw = Math.max(4, Math.floor((W - 24) / barCount) - 3);
        const bx = 12 + u * (W - 24 - bw);
        const by = (H - bh) / 2;

        const isPlayed = u <= progRatio;
        const grad = ctx.createLinearGradient(0, by, 0, by + bh);
        if (isPlayed || active) {
          grad.addColorStop(0, studioTheme === 'day' ? '#0284c7' : '#38bdf8');
          grad.addColorStop(0.5, '#8b5cf6');
          grad.addColorStop(1, '#ec4899');
        } else {
          grad.addColorStop(0, studioTheme === 'day' ? 'rgba(71, 85, 105, 0.35)' : 'rgba(148, 163, 184, 0.35)');
          grad.addColorStop(1, studioTheme === 'day' ? 'rgba(71, 85, 105, 0.16)' : 'rgba(100, 116, 139, 0.2)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 3);
        ctx.fill();
      }

      if (active) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    drawFrame(performance.now());
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [generatedMusic, isAudioPlaying, musicWebAudioPlaying, playbackSec, audioDurationSec, studioTheme]);

  function applyQuickTemplate(tpl: (typeof QUICK_TEMPLATES)[number]) {
    setTopicPrompt(tpl.prompt);
    setGenre(tpl.genre);
    setEmotion(tpl.emotion);
    setInstrumentFocus(tpl.instrument);
    setSongStructure(tpl.structure);
    setBpm(tpl.bpm);
    setExcludedSingerIds([]);
    setExcludedVoiceNames([]);
    setMusicMode(tpl.instrument === 'orchestral_piano' && tpl.structure === 'cinema_score' ? 'instrumental' : 'song');
    setStatus(`تم تطبيق قالب «${tpl.label}» بنجاح — يمكنكِ توليد الكلمات أو إنشاء العمل فوراً.`);
  }

  async function writeLyricsWithAI() {
    const topic = topicPrompt.trim() || `${genre} بنبرة ${emotion}`;
    setWritingLyrics(true);
    setStatus('جاري تأليف أبيات غنائية موزونة تليق بمشروعك…');
    try {
      const r = await fetch('/api/music/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          genre,
          emotion,
          dialect,
          language,
          geminiMode,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'تعذر تأليف الكلمات.');
      setLyrics(stripHashMarks(d.lyrics || ''));
      setStatus('تم تأليف كلمات الأغنية بنجاح! يمكنكِ تعديل أي كلمة أو الضغط على إنشاء الأغنية فوراً.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'تعذر تأليف الكلمات.');
    } finally {
      setWritingLyrics(false);
    }
  }

  async function runMusicGeneration(nextExcludedIds: string[], nextExcludedVoices: string[], switchingSinger = false) {
    const cleanPrompt =
      topicPrompt.trim() ||
      lyrics.trim().slice(0, 120) ||
      `${genre} بإحساس ${emotion}`;

    setGenerating(true);
    setStatus(
      switchingSinger
        ? 'جاري ترشيح مطرب مختلف تماماً وإعادة الغناء والمكساج باللحن المناسب…'
        : musicMode === 'song'
          ? 'جاري اختيار الصوت الأنسب للأغنية تلقائياً، تلحين المقام، تسجيل الغناء والكورال، ومكساج الاستوديو…'
          : 'جاري تأليف المقام وتوزيع الآلات والإيقاعات ومكساج المقطوعة…',
    );
    try {
      const r = await fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'music',
          geminiMode,
          prompt: cleanPrompt,
          musicMode,
          genre,
          emotion,
          dialect,
          language,
          bpm,
          backingChoir,
          instrumentFocus,
          songStructure,
          lyrics: (switchingSinger && generatedMusic?.comp.lyrics ? generatedMusic.comp.lyrics : lyrics).trim(),
          excludedSingerIds: nextExcludedIds,
          excludedVoiceNames: nextExcludedVoices,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'تعذر إنشاء العمل الموسيقي.');
      const comp: MusicComposition = data.composition;
      await onMusicProduced(comp, `${musicMode === 'song' ? 'أغنية' : 'موسيقى'}: ${comp.title}`);
      const singerNotice = comp.singerProfile ? ` بصوت (${comp.singerProfile.name})` : '';
      setStatus(
        musicMode === 'song'
          ? `تم إنتاج الأغنية الكاملة «${comp.title}»${singerNotice} بمكساج استوديو احترافي جاهز للتنزيل!`
          : `تم تأليف وتوزيع المقطوعة الآلية «${comp.title}» بنجاح!`,
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'حدث خطأ أثناء الإنتاج الموسيقي.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateMusic() {
    await runMusicGeneration(excludedSingerIds, excludedVoiceNames, false);
  }

  async function handleSwitchDifferentSinger() {
    const cur = generatedMusic?.comp.singerProfile;
    const nextIds = cur?.id ? Array.from(new Set([...excludedSingerIds, cur.id])) : excludedSingerIds;
    const nextVoices = cur?.voiceName ? Array.from(new Set([...excludedVoiceNames, cur.voiceName])) : excludedVoiceNames;
    const safeIds = nextIds.length >= 6 && cur?.id ? [cur.id] : nextIds;
    const safeVoices = nextVoices.length >= 5 && cur?.voiceName ? [cur.voiceName] : nextVoices;
    setExcludedSingerIds(safeIds);
    setExcludedVoiceNames(safeVoices);
    await runMusicGeneration(safeIds, safeVoices, true);
  }

  async function handleApplyLiveMix() {
    if (!generatedMusic?.comp || remixing) return;
    setRemixing(true);
    setStatus('جاري إعادة المكساج وتحديث المسارات الصوتية الثلاثة…');
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsAudioPlaying(false);
      }
      const bundle = await renderMusicMasterBundle(generatedMusic.comp, mixSettings);
      for (const old of createdStemUrlsRef.current) URL.revokeObjectURL(old);
      createdStemUrlsRef.current = [bundle.fullMixUrl, bundle.instrumentalUrl];
      if (bundle.vocalUrl) createdStemUrlsRef.current.push(bundle.vocalUrl);
      setStems(bundle);
      setStatus('تم تحديث توازن الصوت والآلات والصدى بنجاح! اضغطي تشغيل للاستماع للمكس الجديد.');
    } catch {
      setStatus('تعذر تحديث المكساج حالياً.');
    } finally {
      setRemixing(false);
    }
  }

  async function downloadStemUrl(url: string, suffix: string) {
    if (!generatedMusic?.comp) return;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      saveBlob(blob, `${safeFileName(generatedMusic.comp.title)}-${suffix}.wav`);
    } catch {
      onDownloadWav();
    }
  }

  const activeFullUrl = stems?.fullMixUrl || generatedMusic?.wavUrl || '';

  return (
    <div className="wb-split-grid">
      {/* Right Control Rail */}
      <aside className="wb-rail">
        {/* Music Production Mode Segmented Switch */}
        <div className="wb-section">
          <div className="wb-row-between">
            <span className="mini-label" style={{ margin: 0 }}>نظام الإنتاج الموسيقي</span>
            <span className="wb-meta-line">ZORVYX AI Music Studio</span>
          </div>
          <div className="wb-segmented" role="group" aria-label="نمط الموسيقى">
            <button
              type="button"
              className={`wb-seg-btn ${musicMode === 'song' ? 'active' : ''}`}
              onClick={() => setMusicMode('song')}
            >
              <Music size={14} />
              أغنية كاملة (صوت + لحن)
            </button>
            <button
              type="button"
              className={`wb-seg-btn ${musicMode === 'instrumental' ? 'active' : ''}`}
              onClick={() => setMusicMode('instrumental')}
            >
              <Sliders size={14} />
              موسيقى آلية فقط
            </button>
          </div>
        </div>

        <hr className="wb-hr" />

        {/* Quick Starters */}
        <div className="wb-section">
          <span className="mini-label" style={{ margin: 0 }}>قوالب التلحين الفوري</span>
          <div className="wb-quick-list">
            {QUICK_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                className={`wb-quick-btn ${topicPrompt === tpl.prompt ? 'active' : ''}`}
                onClick={() => applyQuickTemplate(tpl)}
              >
                <Sparkles size={13} />
                <span>{tpl.label}</span>
              </button>
            ))}
          </div>
        </div>

        <hr className="wb-hr" />

        {/* Genre, Emotion, Instruments, Structure */}
        <div className="wb-grid-2">
          <div>
            <label className="mini-label">النمط الغنائي</label>
            <select
              className="field"
              style={{ marginTop: 4, marginBottom: 0 }}
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            >
              {MUSIC_GENRE_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mini-label">الإحساس والمزاج</label>
            <select
              className="field"
              style={{ marginTop: 4, marginBottom: 0 }}
              value={emotion}
              onChange={(e) => setEmotion(e.target.value)}
            >
              {MUSIC_EMOTION_OPTIONS.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mini-label">الآلات الأساسية</label>
            <select
              className="field"
              style={{ marginTop: 4, marginBottom: 0 }}
              value={instrumentFocus}
              onChange={(e) => setInstrumentFocus(e.target.value as NonNullable<MusicComposition['instrumentFocus']>)}
            >
              {MUSIC_INSTRUMENT_FOCUS_OPTIONS.map((inst) => (
                <option key={inst.value} value={inst.value}>
                  {inst.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mini-label">البنية والتوزيع</label>
            <select
              className="field"
              style={{ marginTop: 4, marginBottom: 0 }}
              value={songStructure}
              onChange={(e) => setSongStructure(e.target.value as NonNullable<MusicComposition['songStructure']>)}
            >
              {MUSIC_STRUCTURE_OPTIONS.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Language, Dialect, Tempo */}
        <div className="wb-grid-2">
          <div>
            <label className="mini-label">اللغة</label>
            <select
              className="field"
              style={{ marginTop: 4, marginBottom: 0 }}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGE_OPTIONS.map((lg) => (
                <option key={lg} value={lg}>
                  {lg}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mini-label">اللهجة الغنائية</label>
            <select
              className="field"
              style={{ marginTop: 4, marginBottom: 0 }}
              value={dialect}
              onChange={(e) => setDialect(e.target.value)}
            >
              {DIALECT_OPTIONS.map((dl) => (
                <option key={dl.value} value={dl.value}>
                  {dl.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="wb-section">
          <div className="wb-row-between">
            <label className="mini-label" style={{ margin: 0 }}>سرعة الإيقاع</label>
            <span className="wb-meta-line">{bpm} نبضة / دقيقة</span>
          </div>
          <input
            type="range"
            min={64}
            max={140}
            step={2}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="cinema-scrubber"
          />
        </div>

        {musicMode === 'song' && (
          <div className="wb-section">
            <label className="cinema-check-label">
              <input
                type="checkbox"
                checked={backingChoir}
                onChange={(e) => setBackingChoir(e.target.checked)}
              />
              إضافة كورال وهارموني غنائي داعم في اللازمة
            </label>
            <div className="wb-meta-line">
              يرشح الذكاء الاصطناعي خامة المطرب أو المطربة الأنسب تلقائياً حسب المقام والإحساس.
            </div>
          </div>
        )}

        <hr className="wb-hr" />

        {/* Topic & Lyrics */}
        <div className="wb-section">
          <label className="mini-label" style={{ margin: 0 }}>فكرة الأغنية أو الأجواء الموسيقية</label>
          <textarea
            className="field"
            style={{ minHeight: 82, margin: 0 }}
            value={topicPrompt}
            onChange={(e) => setTopicPrompt(e.target.value)}
            placeholder="مثال: أغنية رومانسية دافئة بالعامية عن الحنين والمطر الليلي بتوزيع عود وناي وكورال…"
          />
        </div>

        {musicMode === 'song' && (
          <div className="wb-section">
            <div className="wb-row-between">
              <strong style={{ fontSize: 13 }}>كلمات الأغنية</strong>
              <button
                type="button"
                className="mini-btn"
                disabled={writingLyrics}
                onClick={() => void writeLyricsWithAI()}
              >
                <Wand2 size={12} style={{ display: 'inline', marginLeft: 4 }} />
                {writingLyrics ? 'جاري التأليف…' : 'تأليف الكلمات بجيميناي ✨'}
              </button>
            </div>
            <textarea
              className="field"
              style={{ minHeight: 112, margin: 0 }}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="كل بيت في سطر مستقل ليُغنّى بانسيابية وإحساس عالٍ…"
            />
          </div>
        )}

        <button
          type="button"
          className="primary"
          style={{ width: '100%', justifyContent: 'center', minHeight: 46 }}
          disabled={generating}
          onClick={() => void handleGenerateMusic()}
        >
          <Sparkles size={16} />
          {generating
            ? 'جاري التأليف والتسجيل والمكساج…'
            : musicMode === 'song'
              ? 'إنشاء الأغنية الكاملة ♫'
              : 'تأليف المقطوعة الموسيقية ♫'}
        </button>

        {status && <div className="statusbox info" style={{ marginTop: 0 }}>{status}</div>}
      </aside>

      {/* Left Master DAW Stage */}
      <section className="wb-stage">
        {!generatedMusic ? (
          <div className="wb-empty-stage">
            <div className="wb-empty-icon">
              <Music size={26} />
            </div>
            <h4>محطة الإنتاج الصوتي والموسيقى</h4>
            <p>
              حدّدي النمط والإحساس أو اختاري أحد قوالب التلحين الفوري من اللوحة الجانبية؛ ليقوم استوديو ZORVYX AI بتلحين المقام، واختيار خامة المطرب تلقائياً، وبناء 3 مسارات ستيريو جاهزة للمكساج والتنزيل.
            </p>
            <div className="wb-meta-line">
              تلحين مقامات أصلية · 7 خامات غنائية · مكساج 4 قنوات · تصدير الماستر والكاريوكي وصوت المغني
            </div>
          </div>
        ) : (
          <div className="pro-music-master-deck" style={{ marginTop: 0 }}>
            <div className="pro-music-top-grid">
              <div className="pro-album-wrap">
                <canvas
                  ref={coverCanvasRef}
                  width={260}
                  height={260}
                  className={`pro-album-canvas ${isAudioPlaying || musicWebAudioPlaying ? 'playing' : ''}`}
                />
              </div>

              <div className="pro-music-main-col">
                <div className="wb-row-between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px', fontSize: 18 }}>
                      <Disc3 size={16} style={{ display: 'inline', marginLeft: 6 }} />
                      {stripHashMarks(generatedMusic.comp.title)}
                    </h4>
                    <div className="wb-meta-line">
                      المقام: {generatedMusic.comp.keyScale} · {generatedMusic.comp.bpm} نبضة/دقيقة ·{' '}
                      {generatedMusic.comp.genre || generatedMusic.comp.drumStyle} ·{' '}
                      {formatTimeMMSS(audioDurationSec || generatedMusic.comp.durationSeconds || 32)}
                    </div>
                    {generatedMusic.comp.singerProfile && generatedMusic.comp.mode !== 'instrumental' && (
                      <div className="wb-meta-line" style={{ marginTop: 3 }}>
                        الصوت المختار تلقائياً: <strong>{generatedMusic.comp.singerProfile.name}</strong> ·{' '}
                        {generatedMusic.comp.singerProfile.timbreLabel}
                      </div>
                    )}
                  </div>

                  <div className="toolrow" style={{ margin: 0 }}>
                    {generatedMusic.comp.mode !== 'instrumental' && (
                      <button
                        type="button"
                        className="mini-btn active-chip"
                        disabled={generating}
                        onClick={() => void handleSwitchDifferentSinger()}
                      >
                        <RefreshCw size={12} style={{ display: 'inline', marginLeft: 4 }} />
                        تغيير لمطرب مختلف 🎙
                      </button>
                    )}
                    <button
                      type="button"
                      className="mini-btn"
                      disabled={generating}
                      onClick={() => void handleGenerateMusic()}
                    >
                      <RefreshCw size={12} style={{ display: 'inline', marginLeft: 4 }} />
                      إعادة التوزيع ✨
                    </button>
                  </div>
                </div>

                <div className="pro-waveform-stage">
                  <canvas
                    ref={waveCanvasRef}
                    width={680}
                    height={92}
                    className="pro-waveform-canvas"
                  />
                </div>

                <div className="pro-audio-bar">
                  <audio
                    ref={audioRef}
                    controls
                    src={activeFullUrl}
                    style={{ width: '100%' }}
                    onPlay={() => setIsAudioPlaying(true)}
                    onPause={() => setIsAudioPlaying(false)}
                    onEnded={() => {
                      setIsAudioPlaying(false);
                      setPlaybackSec(0);
                    }}
                    onLoadedMetadata={(e) => {
                      const dur = e.currentTarget.duration;
                      if (dur && Number.isFinite(dur)) setAudioDurationSec(dur);
                    }}
                    onTimeUpdate={(e) => {
                      setPlaybackSec(e.currentTarget.currentTime);
                    }}
                  />
                  <button type="button" className="secondary" onClick={onToggleDirectPlay}>
                    {musicWebAudioPlaying ? <Pause size={15} /> : <Play size={15} />}
                    {musicWebAudioPlaying ? 'إيقاف البث المباشر' : 'تشغيل مباشر عبر المعالج الصوتي 🔊'}
                  </button>
                </div>
              </div>
            </div>

            {lyricLines.length > 0 && (
              <div className="pro-synced-lyrics-box">
                <div className="pro-deck-title">
                  <Volume2 size={13} />
                  <span>{generatedMusic.comp.mode === 'instrumental' ? 'وصف الأجواء والآلات' : 'كلمات الأغنية المتزامنة مع اللحن'}</span>
                </div>
                <div className="pro-synced-lyrics-lines">
                  {lyricLines.map((line, i) => (
                    <div
                      key={`${i}-${line.slice(0, 12)}`}
                      className={`pro-lyric-line ${i === activeLyricIndex ? 'active' : ''}`}
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pro-mixer-box">
              <div className="cinema-col-head" style={{ marginBottom: showMixer ? 10 : 0 }}>
                <strong style={{ fontSize: 13 }}>
                  <Sliders size={14} style={{ display: 'inline', marginLeft: 5 }} />
                  وحدة المزج والهندسة الصوتية المباشرة
                </strong>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => setShowMixer((p) => !p)}
                >
                  {showMixer ? 'إخفاء وحدة المزج ▲' : 'فتح وحدة المزج ▼'}
                </button>
              </div>

              {showMixer && (
                <>
                  <div className="pro-sliders-grid">
                    {generatedMusic.comp.vocalAudioBase64 && (
                      <label className="pro-slider-item">
                        <span>مستوى صوت المغني ({Math.round(mixSettings.vocalLevel * 100)}%)</span>
                        <input
                          type="range"
                          min={0.3}
                          max={1.6}
                          step={0.05}
                          value={mixSettings.vocalLevel}
                          onChange={(e) => setMixSettings((p) => ({ ...p, vocalLevel: Number(e.target.value) }))}
                        />
                      </label>
                    )}
                    <label className="pro-slider-item">
                      <span>الآلات واللحن ({Math.round(mixSettings.instrumentLevel * 100)}%)</span>
                      <input
                        type="range"
                        min={0.2}
                        max={1.6}
                        step={0.05}
                        value={mixSettings.instrumentLevel}
                        onChange={(e) => setMixSettings((p) => ({ ...p, instrumentLevel: Number(e.target.value) }))}
                      />
                    </label>
                    <label className="pro-slider-item">
                      <span>الإيقاع والباص ({Math.round(mixSettings.drumsBassLevel * 100)}%)</span>
                      <input
                        type="range"
                        min={0}
                        max={1.6}
                        step={0.05}
                        value={mixSettings.drumsBassLevel}
                        onChange={(e) => setMixSettings((p) => ({ ...p, drumsBassLevel: Number(e.target.value) }))}
                      />
                    </label>
                    <label className="pro-slider-item">
                      <span>صدى القاعة والأجواء ({Math.round(mixSettings.reverbAmount * 100)}%)</span>
                      <input
                        type="range"
                        min={0}
                        max={1.4}
                        step={0.05}
                        value={mixSettings.reverbAmount}
                        onChange={(e) => setMixSettings((p) => ({ ...p, reverbAmount: Number(e.target.value) }))}
                      />
                    </label>
                  </div>

                  <div className="toolrow" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="secondary"
                      disabled={remixing}
                      onClick={() => void handleApplyLiveMix()}
                    >
                      {remixing ? 'جاري تحديث المكس…' : 'تحديث المزج وتوازن الصوت 🎚'}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="toolrow" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="primary"
                onClick={() => void downloadStemUrl(activeFullUrl, 'الماستر-الكامل')}
              >
                <Download size={15} />
                تنزيل الأغنية الكاملة ↓
              </button>
              {stems?.instrumentalUrl && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void downloadStemUrl(stems.instrumentalUrl, 'اللحن-الآلي')}
                >
                  تنزيل اللحن فقط (كاريوكي) ↓
                </button>
              )}
              {stems?.vocalUrl && generatedMusic.comp.vocalAudioBase64 && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void downloadStemUrl(stems.vocalUrl!, 'صوت-المغني')}
                >
                  تنزيل صوت المغني فقط ↓
                </button>
              )}
              <button
                type="button"
                className="secondary"
                onClick={() => onSendToMusicVideo(generatedMusic.comp)}
              >
                <Film size={15} />
                تحويل إلى فيديو كليب 🎬
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
