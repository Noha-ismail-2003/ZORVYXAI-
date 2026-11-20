export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
  artwork?: ArtSpec;
  imageDataUrl?: string;
}

export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export interface ImageEditRecipe {
  brightness: number; // -40 .. 40
  contrast: number; // -40 .. 50
  saturation: number; // -80 .. 80
  warmth: number; // -50 .. 50
  clarity: number; // 0 .. 100
  vignette: number; // 0 .. 100
  grain: number; // 0 .. 60
  blurBgIntensity: number; // 0 .. 100 (radial portrait bokeh)
  colorWashColor?: string;
  colorWashOpacity?: number; // 0 .. 0.45
  lightingAngle?: 'top_left' | 'top_right' | 'center' | 'bottom_rim' | 'none';
  lightingColor?: string;
  lightingIntensity?: number; // 0 .. 0.65
  frameStyle?: 'none' | 'cinema_bars' | 'gold_border' | 'gallery_mat';
  atmosphereEffect?: 'none' | 'rain' | 'snow' | 'sparks' | 'bokeh' | 'sunbeams' | 'mist';
  bgAction?: 'none' | 'remove' | 'replace' | 'blur';
  subjectRegion?: { cx: number; cy: number; rx: number; ry: number };
  sharpenIntensity?: number; // 0 .. 100
  denoiseIntensity?: number; // 0 .. 100
  presetName?: string;
  addedTypography?: string;
}

export interface ArtSpec {
  title: string;
  description: string;
  palette: string[];
  svg: string;
  overlaySvg?: string;
  replacementBackdropSvg?: string;
  rasterDataUrl?: string;
  referenceImageDataUrl?: string;
  atmosphere?: 'daylight' | 'golden' | 'night' | 'studio_light' | 'studio_dark';
  aspectRatio?: ImageAspectRatio;
  artStyle?: string;
  lightingStyle?: string;
  cameraAngle?: string;
  negativePrompt?: string;
  editRecipe?: ImageEditRecipe;
  is3D?: boolean;
  isLogo?: boolean;
  isPhotoEdit?: boolean;
  style?: string;
}

export interface CvData {
  fullName: string;
  jobTitle: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  experience: string;
  education: string;
  skills: string;
  languages: string;
}

export interface MusicNote {
  freq: number;
  durationBeats: number;
  wave: 'sine' | 'triangle' | 'sawtooth';
  gain: number;
}

export interface MusicChord {
  freqs: number[];
  durationBeats: number;
}

export interface AudioMixSettings {
  vocalLevel: number; // 0.3 .. 1.6
  instrumentLevel: number; // 0.2 .. 1.6
  drumsBassLevel: number; // 0.0 .. 1.6
  reverbAmount: number; // 0.0 .. 1.5
}

export interface MusicComposition {
  title: string;
  mood: string;
  bpm: number;
  keyScale: string;
  lyrics: string;
  mode?: 'instrumental' | 'song';
  genre?: string;
  emotion?: string;
  dialect?: string;
  language?: string;
  backingChoir?: boolean;
  instrumentFocus?: 'arabic_ensemble' | 'orchestral_piano' | 'modern_pop' | 'acoustic_guitar' | 'trap_synth';
  songStructure?: 'full_song' | 'short_reel' | 'tarab_extended' | 'cinema_score';
  drumStyle?: 'trap' | 'boom_bap' | 'pop' | 'arabic' | 'rock' | 'lofi' | 'orchestral';
  voiceGender?: 'female' | 'male';
  voicePreset?: string;
  singerProfile?: {
    id: string;
    name: string;
    voiceName: string;
    gender: 'female' | 'male';
    timbreLabel: string;
    reason: string;
  };
  vocalAudioBase64?: string;
  vocalSegments?: Array<{ label: string; audioBase64: string; durationSec: number }>;
  durationSeconds?: number;
  mixSettings?: AudioMixSettings;
  notes: MusicNote[];
  verseNotes?: MusicNote[];
  chorusNotes?: MusicNote[];
  chords: MusicChord[];
}

export interface VideoCharacter {
  name: string;
  style: 'hero' | 'astronaut' | 'robot' | 'princess' | 'scholar' | 'cat' | 'bird' | 'custom';
  action: 'walk' | 'wave' | 'float' | 'fly' | 'stand';
  x: number;
  y: number;
  scale: number;
  primaryColor: string;
  secondaryColor: string;
  imageDataUrl?: string;
  isSubjectPhoto?: boolean;
}

export interface QueuedVideoCharacter {
  id: string;
  name: string;
  style: VideoCharacter['style'];
  action: VideoCharacter['action'];
  primaryColor: string;
  secondaryColor: string;
  imageDataUrl?: string;
  isSubjectPhoto?: boolean;
}

export interface VideoElement {
  shape: 'orb' | 'ring' | 'cube' | 'star' | 'wave' | 'beam' | 'particle';
  x: number;
  y: number;
  z: number;
  size: number;
  speedX: number;
  speedY: number;
  color: string;
  orbit: boolean;
  pulse: boolean;
}

export interface VideoCaption {
  timeStart: number;
  timeEnd: number;
  text: string;
}

export interface VideoBeatCharacterState {
  name: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  action: 'walk' | 'run' | 'wave' | 'talk' | 'float' | 'fly' | 'stand' | 'jump';
  facing: 'left' | 'right';
  scale?: number;
  targetScale?: number;
  rotation?: number;
  targetRotation?: number;
  motionEffect?: 'none' | 'bounce' | 'spin' | 'splash' | 'zoom' | 'float' | 'shake';
  emotion?: string;
}

export interface VideoProp {
  kind: 'car' | 'rocket' | 'tree' | 'building' | 'palace' | 'planet' | 'mountain' | 'cloud' | 'table' | 'gift' | 'crown' | 'boat' | 'fireworks';
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  scale?: number;
  color?: string;
}

export interface VideoBeat {
  timeStart: number;
  timeEnd: number;
  beatTitle: string;
  environmentDetail: string;
  cameraShot: 'wide' | 'medium' | 'closeup' | 'pan_left' | 'pan_right' | 'zoom_in';
  particleTheme?: 'none' | 'splash' | 'sparkles' | 'petals' | 'fire' | 'mist';
  speakerName?: string;
  dialogueLine?: string;
  voiceGender?: 'female' | 'male';
  audioBase64?: string;
  characterStates: VideoBeatCharacterState[];
  props?: VideoProp[];
}

export interface VideoScene {
  title: string;
  summary: string;
  durationSeconds: number;
  bgTop: string;
  bgBottom: string;
  accentColor: string;
  secondaryColor: string;
  cameraMotion: string;
  is3D: boolean;
  environment?: 'space' | 'city' | 'nature' | 'ocean' | 'desert' | 'palace' | 'fantasy' | 'studio';
  backdropSvg?: string;
  keyframeSvgs?: string[];
  beats?: VideoBeat[];
  voiceGender?: 'female' | 'male';
  voicePreset?: string;
  voiceScript?: string;
  voiceAudioBase64?: string;
  moodMusic?: {
    chordFreqs?: number[];
    tempoBpm?: number;
  };
  characters?: VideoCharacter[];
  elements: VideoElement[];
  captions: VideoCaption[];
}

export interface StudioVoicePreset {
  id: string;
  label: string;
  gender: 'female' | 'male';
}

export const VIDEO_VOICE_PRESETS: StudioVoicePreset[] = [
  { id: 'kore_warm', label: 'صوت امرأة — نبرة هادئة ودافئة (ليلى)', gender: 'female' },
  { id: 'zephyr_bright', label: 'صوت امرأة — نبرة حيوية ومشرقة (سارة)', gender: 'female' },
  { id: 'kore_narrative', label: 'صوت امرأة — نبرة قصصية فخمة (نور)', gender: 'female' },
  { id: 'charon_calm', label: 'صوت رجل — نبرة رصينة وهادئة (عمر)', gender: 'male' },
  { id: 'puck_dynamic', label: 'صوت رجل — نبرة شبابية حماسية (طارق)', gender: 'male' },
  { id: 'fenrir_deep', label: 'صوت رجل — نبرة عميقة ووثائقية (كريم)', gender: 'male' },
];

export const MUSIC_GENRE_OPTIONS = [
  'أغنية رومانسية',
  'حزين ومؤثر',
  'حماسي وملحمي',
  'موسيقى أفلام ومسلسلات',
  'طرب عربي أصيل',
  'خليجي عصري',
  'مصري شعبي ورومانسي',
  'شامي أصيل',
  'بوب عالمي حديث',
  'راب وهيب هوب',
  'موسيقى هادئة وسينمائية',
  'طابع عالمي معاصر',
];

export const MUSIC_EMOTION_OPTIONS = [
  'شجن وحنين عميق',
  'حب ورومانسية دافئة',
  'حماس وقوة ملحمية',
  'فرح وتفاؤل وإشراق',
  'غموض وإثارة سينمائية',
  'هدوء وسكينة وتأمل',
];

export const MUSIC_INSTRUMENT_FOCUS_OPTIONS: Array<{
  value: NonNullable<MusicComposition['instrumentFocus']>;
  label: string;
}> = [
  { value: 'arabic_ensemble', label: 'تخت شرقي (عود وناي وكمنجة)' },
  { value: 'orchestral_piano', label: 'بيانو كبير وأوتار أوركسترالية' },
  { value: 'modern_pop', label: 'بيانو كهربائي وسنث وإيقاع عصري' },
  { value: 'acoustic_guitar', label: 'جيتار صوتي ناعم وباص دافئ' },
  { value: 'trap_synth', label: 'إيقاع تراب عميق وآلات إلكترونية' },
];

export const MUSIC_STRUCTURE_OPTIONS: Array<{
  value: NonNullable<MusicComposition['songStructure']>;
  label: string;
}> = [
  { value: 'full_song', label: 'أغنية متكاملة (مقدمة + مقطع + كورس + خاتمة)' },
  { value: 'tarab_extended', label: 'طرب وتقسيم آلي ممتد' },
  { value: 'cinema_score', label: 'توزيع سينمائي تصاعدي' },
  { value: 'short_reel', label: 'مقطع مركز وسريع للمنصات' },
];

export const IMAGE_ASPECT_OPTIONS: Array<{ value: ImageAspectRatio; label: string; w: number; h: number }> = [
  { value: '1:1', label: 'مربع متوازن (١:١)', w: 1024, h: 1024 },
  { value: '16:9', label: 'سينمائي عريض (١٦:٩)', w: 1280, h: 720 },
  { value: '9:16', label: 'طولي للقصص والجوال (٩:١٦)', w: 720, h: 1280 },
  { value: '4:3', label: 'لوحة كلاسيكية (٤:٣)', w: 1200, h: 900 },
  { value: '3:4', label: 'بوستر وغلاف احترافي (٣:٤)', w: 900, h: 1200 },
];

export const IMAGE_STYLE_OPTIONS = [
  'تصوير سينمائي واقعي فائق',
  'تصميم إعلاني وتجاري فاخر',
  'مجسم ثلاثي الأبعاد ناعم الإضاءة',
  'هوية بصرية وشعار احترافي',
  'لوحة فنية زيتية ومتحفية',
  'رسوم أنمي يابانية فائقة التفاصيل',
  'تصوير بورتريه واستوديو أنيق',
  'خيال علمي ومؤثرات مستقبلية',
];

export const IMAGE_LIGHTING_OPTIONS = [
  'إضاءة استوديو ناعمة ومتوازنة',
  'الساعة الذهبية الدافئة عند الغروب',
  'إضاءة درامية عالية التباين',
  'إضاءة نيون ليلية متوهجة',
  'ضوء نهاري طبيعي مشرق',
];

export const IMAGE_CAMERA_OPTIONS = [
  'تكوين احترافي متوازن',
  'لقطة مقربة مع عزل الخلفية',
  'زاوية سينمائية واسعة',
  'تصوير جوي من الأعلى',
  'عدسة مقربة لإبراز أدق التفاصيل',
];

export function formatTimeMMSS(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function safeFileName(v: string): string {
  return (v || 'zorvyx-file').replace(/[^\w\u0600-\u06FF-]+/g, '-').replace(/^-+|-+$/g, '') || 'zorvyx-file';
}

export function escHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
}

export function stripHashMarks(text: string): string {
  return String(text || '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/#/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inferMimeFromFilename(filename: string, fallbackType: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.csv')) return 'text/csv;charset=utf-8';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html;charset=utf-8';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.svg')) return 'image/svg+xml;charset=utf-8';
  return fallbackType || 'application/octet-stream';
}

export function isIosSafariOrMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

let sharedAudioCtx: AudioContext | null = null;

export function getGlobalAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

export function unlockGlobalAudioContext(): AudioContext | null {
  const ctx = getGlobalAudioContext();
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  try {
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    // ignore
  }
  return ctx;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function triggerDirectBlobDownload(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function saveBlob(blob: Blob, filename: string): void {
  const exactType = inferMimeFromFilename(filename, blob.type);
  const typedBlob = blob.type === exactType ? blob : new Blob([blob], { type: exactType });

  // On iPhone/iPad, upload bytes to same-origin /api/export-store so Safari receives Content-Disposition: attachment + exact MIME type
  if (isIosSafariOrMobile() && typedBlob.size <= 12 * 1024 * 1024) {
    void (async () => {
      try {
        const base64 = await blobToBase64(typedBlob);
        const r = await fetch('/api/export-store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, filename, mimeType: exactType }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && typeof j.url === 'string' && j.url) {
          const a = document.createElement('a');
          a.href = j.url;
          a.download = filename;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          return;
        }
      } catch {
        // Fall through to native share / blob download
      }
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof File !== 'undefined') {
        try {
          const file = new File([typedBlob], filename, { type: exactType });
          if (!navigator.canShare || navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: filename });
            return;
          }
        } catch {
          // Fall through to blob anchor
        }
      }
      triggerDirectBlobDownload(typedBlob, filename);
    })();
    return;
  }

  triggerDirectBlobDownload(typedBlob, filename);
}

export function saveDataUrl(dataUrl: string, filename: string): void {
  const parts = dataUrl.split(',');
  if (parts.length === 2 && parts[0].includes(';base64')) {
    try {
      const mimeMatch = parts[0].match(/^data:([^;]+);base64/i);
      const mime = inferMimeFromFilename(filename, mimeMatch ? mimeMatch[1] : 'application/octet-stream');
      const bin = atob(parts[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      saveBlob(new Blob([bytes], { type: mime }), filename);
      return;
    } catch {
      // Fallback below
    }
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadSvgAsPng(svgString: string, filename: string): Promise<void> {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('تعذر تحويل الصورة إلى صورة نقطية.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('تعذر تهيئة لوحة الرسم.');
    ctx.fillStyle = '#0b0b19';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!pngBlob) throw new Error('تعذر حفظ ملف الصورة.');
    saveBlob(pngBlob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function sanitizeSvgClient(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

export async function svgToPngDataUrl(svgString: string, size = 512): Promise<string> {
  const clean = sanitizeSvgClient(svgString);
  const blob = new Blob([clean], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('تعذر تحويل التصميم إلى صورة شخصية.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('تعذر تهيئة اللوحة.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function fileToResizedDataUrl(file: File, maxDim = 512): Promise<string> {
  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة.'));
    reader.readAsDataURL(file);
  });

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('صيغة الصورة غير مدعومة.'));
    img.src = rawUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
  const w = Math.max(32, Math.round(img.width * scale));
  const h = Math.max(32, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return rawUrl;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}

function buildScalePalette(chords: MusicChord[]): number[] {
  const basePitchClasses = new Set<number>();
  for (const ch of chords) {
    for (const f of ch.freqs || []) {
      if (f > 40 && f < 2000) {
        const midi = Math.round(69 + 12 * Math.log2(f / 440));
        basePitchClasses.add(((midi % 12) + 12) % 12);
      }
    }
  }
  if (basePitchClasses.size < 3) {
    // Fallback consonant A minor / C major diatonic collection
    [0, 2, 4, 5, 7, 9, 11].forEach((pc) => basePitchClasses.add(pc));
  }
  const palette: number[] = [];
  for (let midi = 48; midi <= 84; midi++) {
    const pc = ((midi % 12) + 12) % 12;
    if (basePitchClasses.has(pc)) {
      palette.push(440 * Math.pow(2, (midi - 69) / 12));
    }
  }
  return palette.length > 0 ? palette : [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
}

function snapFreqToScale(rawFreq: number, palette: number[]): number {
  const clamped = Math.min(Math.max(rawFreq || 330, 130), 980);
  let best = palette[0];
  let bestDist = Infinity;
  for (const p of palette) {
    const d = Math.abs(Math.log2(p / clamped));
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

const DEFAULT_MIX_SETTINGS: AudioMixSettings = {
  vocalLevel: 1.0,
  instrumentLevel: 1.0,
  drumsBassLevel: 1.0,
  reverbAmount: 0.75,
};

function writeKarplusStrongPluck(
  outL: Float32Array,
  outR: Float32Array,
  startSample: number,
  sampleCount: number,
  freq: number,
  sampleRate: number,
  gain: number,
  panL: number,
  panR: number,
  brightness = 0.48,
  damp = 0.9965,
  seedInit = 42,
) {
  const period = Math.max(12, Math.min(2048, Math.round(sampleRate / Math.max(55, freq))));
  const ring = new Float32Array(period);
  let rng = (seedInit * 2654435761) >>> 0;
  // Warm low-passed pick excitation instead of harsh white noise
  let prev = 0;
  for (let i = 0; i < period; i++) {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    const white = (rng / 0x80000000) - 1;
    const smooth = prev * (1 - brightness) + white * brightness;
    prev = smooth;
    ring[i] = smooth;
  }
  // Remove DC offset from ring
  let mean = 0;
  for (let i = 0; i < period; i++) mean += ring[i];
  mean /= period;
  for (let i = 0; i < period; i++) ring[i] -= mean;

  const limit = Math.min(outL.length - startSample, sampleCount);
  const fadeOut = Math.min(Math.floor(sampleRate * 0.08), Math.floor(limit * 0.25));
  let ptr = 0;
  for (let i = 0; i < limit; i++) {
    const nextPtr = (ptr + 1) % period;
    const filtered = (ring[ptr] * 0.56 + ring[nextPtr] * 0.44) * damp;
    ring[ptr] = filtered;
    ptr = nextPtr;
    const env = i > limit - fadeOut && fadeOut > 0 ? (limit - i) / fadeOut : 1;
    const body = filtered * gain * env;
    outL[startSample + i] += body * panL;
    outR[startSample + i] += body * panR;
  }
}

function renderInstrumentalSamplesStereo(
  comp: MusicComposition,
  sampleRate: number,
  targetSeconds: number,
  vocalStartSec = 2.6,
  vocalEndSec = 0,
  mix: AudioMixSettings = DEFAULT_MIX_SETTINGS,
): [Float32Array, Float32Array] {
  const bpm = Math.min(Math.max(comp.bpm || 86, 62), 146);
  const beatDur = 60 / bpm;
  const barSec = beatDur * 4;
  const totalSamples = Math.floor(sampleRate * targetSeconds);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const drumsLeft = new Float32Array(totalSamples);
  const drumsRight = new Float32Array(totalSamples);

  const hasVocals = Boolean(comp.mode === 'song' && comp.vocalAudioBase64 && mix.vocalLevel > 0.02);
  const instMasterScale = (hasVocals ? 0.72 : 0.96) * Math.max(0.15, mix.instrumentLevel);
  const drumMasterScale = (hasVocals ? 0.76 : 0.98) * Math.max(0, mix.drumsBassLevel);
  const instFocus = comp.instrumentFocus || (comp.drumStyle === 'arabic' ? 'arabic_ensemble' : comp.drumStyle === 'trap' ? 'trap_synth' : 'orchestral_piano');

  const rawChords = comp.chords?.length
    ? comp.chords
    : [
        { freqs: [220, 261.63, 329.63], durationBeats: 4 },
        { freqs: [174.61, 220, 261.63], durationBeats: 4 },
        { freqs: [196.0, 246.94, 293.66], durationBeats: 4 },
        { freqs: [164.81, 196.0, 246.94], durationBeats: 4 },
      ];
  const scalePalette = buildScalePalette(rawChords);
  const chords = rawChords.map((ch) => ({
    durationBeats: Math.max(ch.durationBeats || 4, 2),
    freqs: (ch.freqs?.length ? ch.freqs : [220, 261.63, 329.63]).map((f) => snapFreqToScale(f, scalePalette)),
  }));

  const defaultNotes: MusicNote[] = [
    { freq: 329.63, durationBeats: 1, wave: 'sine', gain: 0.34 },
    { freq: 392.0, durationBeats: 1, wave: 'triangle', gain: 0.32 },
    { freq: 440.0, durationBeats: 1.5, wave: 'sine', gain: 0.35 },
    { freq: 392.0, durationBeats: 0.5, wave: 'triangle', gain: 0.28 },
    { freq: 329.63, durationBeats: 2, wave: 'sine', gain: 0.32 },
  ];
  const verseNotes = comp.verseNotes?.length ? comp.verseNotes : comp.notes?.length ? comp.notes : defaultNotes;
  const chorusNotes = comp.chorusNotes?.length
    ? comp.chorusNotes
    : verseNotes.map((n, idx) => ({
        ...n,
        freq: idx % 2 === 0 ? Math.min(n.freq * 1.25, 784) : n.freq,
        gain: Math.min(0.42, (n.gain || 0.3) * 1.15),
      }));

  // 1. Expressive Legato Lead Melody (Flowing Ney, Warm Acoustic Oud/Guitar, Concert Grand Piano, Strings)
  // Eliminates choppy staccato pecking by sustaining lyrical phrases with smooth attack/release overlap & pitch glide
  let cursorSample = 0;
  let noteIdx = 0;
  let prevNoteFreq = snapFreqToScale(verseNotes[0]?.freq || 329.63, scalePalette);
  while (cursorSample < totalSamples) {
    const timeSec = cursorSample / sampleRate;
    const progress = cursorSample / totalSamples;
    const currentBar = Math.floor(timeSec / barSec);
    const isIntro = timeSec < Math.min(barSec, 2.4);
    const isChorus = progress > 0.32 && progress < 0.82 && currentBar % 4 >= 2;
    const activePhrase = isChorus ? chorusNotes : verseNotes;
    const note = activePhrase[noteIdx % activePhrase.length];

    // Favor sustained flowing durations (minimum 1 beat) so melodies breathe and glide instead of staccato ticks
    const allowedBeats = [1, 1.5, 2, 3];
    const rawBeats = Math.max(1, note.durationBeats || 1.5);
    const quantizedBeats = allowedBeats.reduce((a, b) => (Math.abs(b - rawBeats) < Math.abs(a - rawBeats) ? b : a));
    const durSec = quantizedBeats * beatDur;
    const count = Math.floor(durSec * sampleRate);

    // Musical breathing rests between phrases so instrumentation sounds human
    const isPhraseRest = noteIdx % 5 === 4 && (!hasVocals || Math.abs(timeSec - vocalStartSec) > 0.5);
    if (!isPhraseRest) {
      const inVocalWindow = hasVocals && vocalEndSec > vocalStartSec && timeSec >= vocalStartSec - 0.2 && timeSec <= vocalEndSec + 0.35;
      const vocalDuckLead = inVocalWindow ? (isChorus ? 0.32 : 0.20) : 1.0;
      const sectionGain = (isIntro ? 0.90 : progress > 0.88 ? 0.74 : isChorus ? 1.08 : 0.94) * vocalDuckLead;

      const rawFreq = snapFreqToScale(note.freq || 330, scalePalette);
      const scaleFreq = inVocalWindow && rawFreq > 440 ? rawFreq * 0.5 : rawFreq;
      const octaveShift = !inVocalWindow && isChorus && scaleFreq < 290 ? 2.0 : 1.0;
      const targetFreq = Math.min(scaleFreq * octaveShift, 740);
      const startGlideFreq = Math.abs(Math.log2(targetFreq / prevNoteFreq)) < 0.6 ? prevNoteFreq : targetFreq;
      prevNoteFreq = targetFreq;

      const gain = Math.min(Math.max((note.gain ?? 0.3) * sectionGain * instMasterScale, 0.03), 0.34);
      const pan = Math.max(0.3, Math.min(0.7, 0.5 + ((targetFreq - 340) / 760) * 0.18));
      const panL = Math.cos(pan * Math.PI * 0.5) * 1.15;
      const panR = Math.sin(pan * Math.PI * 0.5) * 1.15;

      // Subtle phrase-downbeat Oud/Guitar resonance ONLY on long phrase anchors (never repetitive half-beat ticks)
      const useDownbeatPluck =
        !inVocalWindow &&
        (instFocus === 'arabic_ensemble' || instFocus === 'acoustic_guitar') &&
        noteIdx % 2 === 0 &&
        quantizedBeats >= 1.5;

      if (useDownbeatPluck) {
        const sustainCount = Math.min(totalSamples - cursorSample, Math.floor(Math.max(durSec * 1.45, 0.9) * sampleRate));
        writeKarplusStrongPluck(
          left,
          right,
          cursorSample,
          sustainCount,
          targetFreq,
          sampleRate,
          gain * 0.78,
          panL,
          panR,
          instFocus === 'acoustic_guitar' ? 0.32 : 0.24,
          0.9974,
          noteIdx + 23,
        );
      }

      // Smooth warm legato overlay (Ney/Strings/Concert Grand) for continuous musical flow
      const useBowedOrNey = instFocus === 'arabic_ensemble' || instFocus === 'orchestral_piano' || inVocalWindow;
      let lpL = 0;
      let lpR = 0;
      const overlapDur = durSec * 1.24;
      const sustainLimit = Math.min(totalSamples - cursorSample, Math.floor(overlapDur * sampleRate));
      const glideSamples = Math.max(1, Math.floor(sampleRate * 0.045));
      for (let i = 0; i < sustainLimit; i++) {
        const t = i / sampleRate;
        const glideT = Math.min(1, i / glideSamples);
        const smoothGlide = glideT * glideT * (3 - 2 * glideT);
        const curFreq = startGlideFreq + (targetFreq - startGlideFreq) * smoothGlide;

        const vibDepth = useBowedOrNey ? 0.0046 : 0.0016;
        const vibrato = 1 + Math.sin(2 * Math.PI * 5.0 * t) * Math.min(1, t * 2.0) * vibDepth;
        const wL = 2 * Math.PI * curFreq * vibrato * 0.9988 * t;
        const wR = 2 * Math.PI * curFreq * vibrato * 1.0012 * t;

        let sL = 0;
        let sR = 0;
        if (useBowedOrNey) {
          const attack = Math.min(1, t / 0.14);
          const tail = Math.max(0, 1 - Math.pow(t / overlapDur, 2.1));
          const env = attack * tail * 0.86;
          const reedL = Math.sin(wL) * 0.68 + Math.sin(2 * wL) * 0.22 + Math.sin(3 * wL) * 0.07;
          const reedR = Math.sin(wR) * 0.68 + Math.sin(2 * wR) * 0.22 + Math.sin(3 * wR) * 0.07;
          lpL = lpL * 0.42 + reedL * 0.58;
          lpR = lpR * 0.42 + reedR * 0.58;
          sL = lpL * env;
          sR = lpR * env;
        } else {
          const attack = Math.min(1, t / 0.022);
          const decay = Math.exp((-t * 1.25) / Math.max(durSec, 0.7));
          const tail = Math.max(0, 1 - Math.pow(t / overlapDur, 2.4));
          const env = attack * decay * tail;
          const pL = Math.sin(wL) * 0.72 + Math.sin(2 * wL) * (0.21 * Math.exp(-t * 2.6)) + Math.sin(3 * wL) * (0.07 * Math.exp(-t * 4.8));
          const pR = Math.sin(wR) * 0.72 + Math.sin(2 * wR) * (0.21 * Math.exp(-t * 2.6)) + Math.sin(3 * wR) * (0.07 * Math.exp(-t * 4.8));
          lpL = lpL * 0.36 + pL * 0.64;
          lpR = lpR * 0.36 + pR * 0.64;
          sL = lpL * env;
          sR = lpR * env;
        }

        const idx = cursorSample + i;
        const overlayScale = useDownbeatPluck ? 0.52 : 0.94;
        left[idx] += sL * gain * overlayScale * panL;
        right[idx] += sR * gain * overlayScale * panR;
      }
    }
    cursorSample += count;
    noteIdx++;
  }

  // 2. Lush Warm Low-Pass String Ensemble + Deep Cello Bass (ZERO repetitive plucked arpeggios)
  let chordCursor = 0;
  let chordIndex = 0;
  let strLpL = 0;
  let strLpR = 0;
  while (chordCursor < totalSamples) {
    const chord = chords[chordIndex % chords.length];
    const durSec = chord.durationBeats * beatDur;
    const count = Math.floor(durSec * sampleRate);
    const rawRoot = chord.freqs[0] || 220;
    const bassFreq = rawRoot > 130 ? rawRoot * 0.5 : Math.max(55, rawRoot);
    const cFreqs = chord.freqs;
    const secStart = chordCursor / sampleRate;
    const progress = chordCursor / totalSamples;
    const isChorus = progress > 0.32 && progress < 0.82 && Math.floor(secStart / barSec) % 4 >= 2;
    const padBoost = isChorus ? 1.22 : 1.0;

    for (let i = 0; i < count && chordCursor + i < totalSamples; i++) {
      const t = i / sampleRate;
      const swell = 0.76 + 0.24 * Math.sin((t / Math.max(durSec, 1)) * Math.PI);
      const padEnv = Math.min(1, t / 0.68) * Math.max(0.5, 1 - (t / durSec) * 0.22) * swell * padBoost;
      const bassEnv = Math.min(1, t / 0.045) * Math.exp(-t * 0.52);

      let sumL = 0;
      let sumR = 0;
      for (let fi = 0; fi < cFreqs.length; fi++) {
        const f = cFreqs[fi];
        const p1 = (f * 0.9972 * t) % 1;
        const p2 = (f * 1.0028 * t) % 1;
        const tri1 = 1 - 4 * Math.abs(Math.round(p1 - 0.25) - (p1 - 0.25));
        const tri2 = 1 - 4 * Math.abs(Math.round(p2 - 0.25) - (p2 - 0.25));
        sumL += tri1 * 0.45 + Math.sin(2 * Math.PI * f * t) * 0.45 + Math.sin(4 * Math.PI * f * 0.9985 * t) * 0.1;
        sumR += tri2 * 0.45 + Math.sin(2 * Math.PI * f * t) * 0.45 + Math.sin(4 * Math.PI * f * 1.0015 * t) * 0.1;
      }
      const cutoffAlpha = 0.075 + 0.065 * swell;
      strLpL = strLpL + cutoffAlpha * (sumL - strLpL);
      strLpR = strLpR + cutoffAlpha * (sumR - strLpR);

      const nF = Math.max(cFreqs.length, 1);
      const bass =
        (Math.sin(2 * Math.PI * bassFreq * t) * 0.88 + Math.sin(4 * Math.PI * bassFreq * t) * 0.12) *
        0.24 *
        bassEnv *
        drumMasterScale;

      const idx = chordCursor + i;
      left[idx] += (strLpL / nF) * 0.34 * padEnv * instMasterScale;
      right[idx] += (strLpR / nF) * 0.34 * padEnv * instMasterScale;
      drumsLeft[idx] += bass;
      drumsRight[idx] += bass;
    }
    chordCursor += count;
    chordIndex++;
  }

  // 3. Soft Balanced Percussion (Darbuka / Warm Kick & Soft Brush Snare — zero harsh hi-hat ticks)
  const drumStyle = comp.drumStyle || (instFocus === 'arabic_ensemble' ? 'arabic' : instFocus === 'trap_synth' ? 'trap' : 'pop');
  if (drumStyle !== 'orchestral' && drumMasterScale > 0.01) {
    const stepDur = beatDur / 2;
    const stepSamples = Math.max(340, Math.floor(stepDur * sampleRate));
    const totalSteps = Math.floor(totalSamples / stepSamples);
    let noiseSeed = 1337;
    const nextNoise = () => {
      noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0;
      return (noiseSeed / 0x80000000) - 1;
    };

    for (let s = 0; s < totalSteps; s++) {
      const timeSec = (s * stepSamples) / sampleRate;
      if (timeSec < Math.min(barSec * 0.75, 1.8) && hasVocals) continue;
      const barIdx = Math.floor(s / 8);
      const stepInBar = s % 8;
      const isFillStep = barIdx % 4 === 3 && stepInBar === 6;
      const startSample = s * stepSamples;

      if (stepInBar === 0 && barIdx > 0 && barIdx % 4 === 0) {
        const crashLen = Math.min(Math.floor(sampleRate * 1.0), totalSamples - startSample);
        let hpC = 0;
        let prevN = 0;
        for (let i = 0; i < crashLen; i++) {
          const t = i / sampleRate;
          const n = nextNoise();
          hpC = 0.82 * (hpC + n - prevN);
          prevN = n;
          const env = Math.exp(-t * 3.4) * Math.min(1, t / 0.02);
          const c = hpC * env * 0.048 * drumMasterScale;
          drumsLeft[startSample + i] += c * 0.9;
          drumsRight[startSample + i] += c * 1.1;
        }
      }

      const isKick =
        drumStyle === 'trap'
          ? stepInBar === 0 || stepInBar === 3 || stepInBar === 6
          : drumStyle === 'arabic'
            ? stepInBar === 0 || stepInBar === 4
            : stepInBar === 0 || stepInBar === 4;

      const isSnareOrTak =
        isFillStep ||
        (drumStyle === 'trap'
          ? stepInBar === 2 || stepInBar === 6
          : drumStyle === 'arabic'
            ? stepInBar === 2 || stepInBar === 5
            : stepInBar === 2 || stepInBar === 6);

      if (isKick) {
        const kickLen = Math.min(Math.floor(sampleRate * (drumStyle === 'trap' ? 0.36 : 0.25)), totalSamples - startSample);
        for (let i = 0; i < kickLen; i++) {
          const t = i / sampleRate;
          const pitchDrop =
            drumStyle === 'trap'
              ? 96 * Math.exp(-t * 20) + 42
              : drumStyle === 'arabic'
                ? 98 * Math.exp(-t * 25) + 60
                : 88 * Math.exp(-t * 24) + 46;
          const env = Math.min(1, t / 0.01) * Math.exp(-t * (drumStyle === 'trap' ? 6.2 : 9.4));
          const k = Math.sin(2 * Math.PI * pitchDrop * t) * env * (drumStyle === 'trap' ? 0.28 : 0.23) * drumMasterScale;
          drumsLeft[startSample + i] += k;
          drumsRight[startSample + i] += k;
        }
      }

      if (isSnareOrTak) {
        const rimLen = Math.min(Math.floor(sampleRate * 0.1), totalSamples - startSample);
        const rimGain = isFillStep ? 0.08 : 0.07;
        let snLp = 0;
        for (let i = 0; i < rimLen; i++) {
          const t = i / sampleRate;
          const n = nextNoise();
          snLp = snLp * 0.65 + n * 0.35;
          const bodyEnv = Math.min(1, t / 0.008) * Math.exp(-t * 24);
          const tone =
            (Math.sin(2 * Math.PI * (drumStyle === 'arabic' ? 240 : 185) * t) * 0.55 * bodyEnv +
              snLp * 0.32 * bodyEnv) *
            rimGain *
            drumMasterScale;
          drumsLeft[startSample + i] += tone * 0.94;
          drumsRight[startSample + i] += tone * 1.06;
        }
      }
    }
  }

  // 4. Warm Diffused Concert Hall Reverb on Melodic Instruments + Clean Tight Drum Bus
  const wetL = new Float32Array(totalSamples);
  const wetR = new Float32Array(totalSamples);
  const reverbMix = Math.min(Math.max(mix.reverbAmount ?? 0.75, 0), 1.5);
  const lTaps = [
    Math.floor(sampleRate * 0.023),
    Math.floor(sampleRate * 0.041),
    Math.floor(sampleRate * 0.067),
    Math.floor(sampleRate * 0.103),
    Math.floor(sampleRate * 0.149),
  ];
  const rTaps = [
    Math.floor(sampleRate * 0.029),
    Math.floor(sampleRate * 0.049),
    Math.floor(sampleRate * 0.079),
    Math.floor(sampleRate * 0.119),
    Math.floor(sampleRate * 0.163),
  ];
  let dampL = 0;
  let dampR = 0;
  for (let i = 0; i < totalSamples; i++) {
    let rL = 0;
    let rR = 0;
    for (let k = 0; k < 5; k++) {
      const weight = 0.22 / (k + 1.3);
      if (i >= lTaps[k]) rL += right[i - lTaps[k]] * weight;
      if (i >= rTaps[k]) rR += left[i - rTaps[k]] * weight;
    }
    dampL = dampL * 0.76 + rL * 0.24;
    dampR = dampR * 0.76 + rR * 0.24;
    wetL[i] = left[i] * 0.88 + dampL * 0.48 * reverbMix + drumsLeft[i];
    wetR[i] = right[i] * 0.88 + dampR * 0.48 * reverbMix + drumsRight[i];
  }

  return [wetL, wetR];
}

function parseWavBase64ToFloat32(b64: string): { samples: Float32Array; sampleRate: number } | null {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.length < 44) return null;
    const view = new DataView(bytes.buffer);
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const wave = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);

    if (riff !== 'RIFF' || wave !== 'WAVE') {
      const sampleCount = Math.floor(bytes.length / 2);
      const out = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        out[i] = view.getInt16(i * 2, true) / 32768;
      }
      return { samples: out, sampleRate: 24000 };
    }

    let offset = 12;
    let sampleRate = 24000;
    let numChannels = 1;
    let bitsPerSample = 16;
    let dataOffset = -1;
    let dataSize = 0;

    while (offset + 8 <= bytes.length) {
      const chunkId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
      const chunkSize = view.getUint32(offset + 4, true);
      if (chunkId === 'fmt ') {
        numChannels = Math.max(1, view.getUint16(offset + 10, true));
        sampleRate = view.getUint32(offset + 12, true) || 24000;
        bitsPerSample = view.getUint16(offset + 22, true) || 16;
      } else if (chunkId === 'data') {
        dataOffset = offset + 8;
        dataSize = Math.min(chunkSize, bytes.length - dataOffset);
        break;
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }

    if (dataOffset < 0 || dataSize <= 0) return null;
    const bytesPerSample = Math.max(1, Math.floor(bitsPerSample / 8));
    const frameCount = Math.floor(dataSize / (bytesPerSample * numChannels));
    const out = new Float32Array(frameCount);

    for (let i = 0; i < frameCount; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const pos = dataOffset + (i * numChannels + ch) * bytesPerSample;
        if (bitsPerSample === 16 && pos + 1 < bytes.length) {
          sum += view.getInt16(pos, true) / 32768;
        } else if (bitsPerSample === 8 && pos < bytes.length) {
          sum += (bytes[pos] - 128) / 128;
        } else if (bitsPerSample === 32 && pos + 3 < bytes.length) {
          sum += view.getFloat32(pos, true);
        }
      }
      out[i] = sum / numChannels;
    }
    return { samples: out, sampleRate };
  } catch {
    return null;
  }
}

function encodeStereoWavBlobUrl(left: Float32Array, right: Float32Array, sampleRate: number): string {
  const totalSamples = Math.min(left.length, right.length);
  const fadeSamples = Math.min(Math.floor(sampleRate * 1.1), Math.floor(totalSamples * 0.08));
  for (let i = 0; i < fadeSamples; i++) {
    const f = i / fadeSamples;
    left[i] *= f;
    right[i] *= f;
    left[totalSamples - 1 - i] *= f;
    right[totalSamples - 1 - i] *= f;
  }

  const numChannels = 2;
  const blockAlign = numChannels * 2;
  const dataBytes = totalSamples * blockAlign;
  const wavBytes = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(wavBytes);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < totalSamples; i++) {
    const lMastered = Math.max(-0.96, Math.min(0.96, Math.tanh(left[i] * 1.14) * 0.94));
    const rMastered = Math.max(-0.96, Math.min(0.96, Math.tanh(right[i] * 1.14) * 0.94));
    view.setInt16(44 + i * 4, lMastered * 32767, true);
    view.setInt16(44 + i * 4 + 2, rMastered * 32767, true);
  }

  const blob = new Blob([wavBytes], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function polishAndResampleVocal(
  b64: string,
  targetSampleRate: number,
  vocalLevel: number,
): Float32Array | null {
  const decoded = parseWavBase64ToFloat32(b64);
  if (!decoded || decoded.samples.length === 0) return null;

  const vData = decoded.samples;
  const ratio = decoded.sampleRate / targetSampleRate;
  const len = Math.floor(vData.length / ratio);
  const resampled = new Float32Array(len);
  let hpState = 0;
  let prevIn = 0;
  let lpState = 0;
  let compEnv = 0;
  let peak = 0.001;

  for (let i = 0; i < len; i++) {
    const exactIdx = i * ratio;
    const i0 = Math.min(vData.length - 1, Math.floor(exactIdx));
    const i1 = Math.min(vData.length - 1, i0 + 1);
    const frac = exactIdx - i0;
    const rawVal = vData[i0] * (1 - frac) + vData[i1] * frac;

    hpState = 0.978 * (hpState + rawVal - prevIn);
    prevIn = rawVal;
    lpState = lpState * 0.18 + hpState * 0.82;

    const absVal = Math.abs(lpState);
    compEnv = absVal > compEnv ? compEnv * 0.92 + absVal * 0.08 : compEnv * 0.996 + absVal * 0.004;
    const compGain = compEnv > 0.24 ? 0.24 / (compEnv + 0.04) : 1.0;
    const polished = Math.tanh(lpState * Math.min(1.3, 0.72 + compGain * 0.52) * 1.15);
    resampled[i] = polished;
    if (Math.abs(polished) > peak) peak = Math.abs(polished);
  }
  const normGain = Math.min(1.65, 0.90 / peak) * Math.max(0.2, vocalLevel);
  for (let i = 0; i < len; i++) {
    resampled[i] *= normGain;
  }
  return resampled;
}

function buildProcessedVocalBuses(
  comp: MusicComposition,
  totalSamples: number,
  sampleRate: number,
  introOffsetSec: number,
  bpm: number,
  reverbAmount: number,
  vocalLevel: number,
): { vocalL: Float32Array; vocalR: Float32Array; vocalBus: Float32Array; actualVocalEndSec: number } | null {
  if (comp.mode !== 'song') return null;

  const vocalBus = new Float32Array(totalSamples);
  const fadeSamples = Math.floor(sampleRate * 0.16);
  const segments =
    comp.vocalSegments && comp.vocalSegments.length > 0
      ? comp.vocalSegments.filter((s) => Boolean(s.audioBase64))
      : comp.vocalAudioBase64
        ? [{ label: 'المقطع الرئيسي', audioBase64: comp.vocalAudioBase64, durationSec: 0 }]
        : [];

  if (segments.length === 0) return null;

  const barSec = (60 / Math.max(bpm, 60)) * 4;
  let cursorSample = Math.floor(introOffsetSec * sampleRate);
  let placedAny = false;

  segments.forEach((seg, idx) => {
    const resampled = polishAndResampleVocal(seg.audioBase64, sampleRate, vocalLevel);
    if (!resampled || resampled.length === 0) return;
    placedAny = true;

    const placeLen = resampled.length;
    for (let i = 0; i < placeLen && cursorSample + i < vocalBus.length; i++) {
      const edge =
        i < fadeSamples
          ? i / fadeSamples
          : i > placeLen - fadeSamples
            ? Math.max(0, (placeLen - i) / fadeSamples)
            : 1;
      vocalBus[cursorSample + i] += resampled[i] * edge;
    }

    // Leave a musical interlude breath between Verse 1 and Chorus aligned softly to bars
    if (idx < segments.length - 1) {
      const interludeGapSec = Math.min(Math.max(barSec * 0.65, 1.4), 2.8);
      cursorSample += placeLen + Math.floor(interludeGapSec * sampleRate);
    } else {
      cursorSample += placeLen;
    }
  });

  if (!placedAny) return null;
  const actualVocalEndSec = cursorSample / sampleRate;

  // Step C: Vocal Plate Reverb + Rhythmic Quarter-Note Ping-Pong Stereo Delay + Backing Choir Harmonies
  const vocalL = new Float32Array(totalSamples);
  const vocalR = new Float32Array(totalSamples);
  const revAmt = Math.min(Math.max(reverbAmount, 0), 1.5);
  const beatSamples = Math.floor((60 / Math.max(bpm, 60)) * sampleRate);
  const delayL = Math.min(Math.floor(beatSamples * 0.5), Math.floor(sampleRate * 0.45));
  const delayR = Math.min(beatSamples, Math.floor(sampleRate * 0.85));

  const tap1 = Math.floor(sampleRate * 0.025);
  const tap2 = Math.floor(sampleRate * 0.049);
  const tap3 = Math.floor(sampleRate * 0.083);
  const tap4 = Math.floor(sampleRate * 0.124);
  let revLpL = 0;
  let revLpR = 0;

  for (let i = 0; i < totalSamples; i++) {
    const dry = vocalBus[i];
    const rawRevL =
      (i >= tap1 ? vocalBus[i - tap1] * 0.17 : 0) +
      (i >= tap2 ? vocalBus[i - tap2] * 0.13 : 0) +
      (i >= tap3 ? vocalBus[i - tap3] * 0.09 : 0) +
      (i >= tap4 ? vocalBus[i - tap4] * 0.05 : 0);
    const rawRevR =
      (i >= tap1 + 150 ? vocalBus[i - tap1 - 150] * 0.17 : 0) +
      (i >= tap2 + 200 ? vocalBus[i - tap2 - 200] * 0.13 : 0) +
      (i >= tap3 + 270 ? vocalBus[i - tap3 - 270] * 0.09 : 0) +
      (i >= tap4 + 340 ? vocalBus[i - tap4 - 340] * 0.05 : 0);
    revLpL = revLpL * 0.74 + rawRevL * 0.26;
    revLpR = revLpR * 0.74 + rawRevR * 0.26;

    const pingPongL = i >= delayL ? vocalBus[i - delayL] * 0.1 * revAmt : 0;
    const pingPongR = i >= delayR ? vocalBus[i - delayR] * 0.08 * revAmt : 0;

    const choirSpreadL =
      comp.backingChoir !== false && i >= Math.floor(sampleRate * 0.036)
        ? vocalBus[i - Math.floor(sampleRate * 0.036)] * 0.20
        : 0;
    const choirSpreadR =
      comp.backingChoir !== false && i >= Math.floor(sampleRate * 0.054)
        ? vocalBus[i - Math.floor(sampleRate * 0.054)] * 0.20
        : 0;

    vocalL[i] = dry * 0.94 + revLpL * 0.78 * revAmt + pingPongL + choirSpreadL;
    vocalR[i] = dry * 0.94 + revLpR * 0.78 * revAmt + pingPongR + choirSpreadR;
  }

  return { vocalL, vocalR, vocalBus, actualVocalEndSec };
}

export function compositionToWavUrl(comp: MusicComposition): string {
  const targetSeconds = Math.min(Math.max(Number(comp.durationSeconds) || 40, 10), 300);
  const sampleRate = targetSeconds > 120 ? 22050 : 24000;
  const mix = comp.mixSettings || DEFAULT_MIX_SETTINGS;
  const [left, right] = renderInstrumentalSamplesStereo(comp, sampleRate, targetSeconds, 2.6, 0, mix);
  return encodeStereoWavBlobUrl(left, right, sampleRate);
}

export async function renderMusicMasterBundle(
  comp: MusicComposition,
  mixOverride?: AudioMixSettings,
): Promise<{ fullMixUrl: string; instrumentalUrl: string; vocalUrl?: string }> {
  const mix = mixOverride || comp.mixSettings || DEFAULT_MIX_SETTINGS;
  const bpm = Math.min(Math.max(comp.bpm || 86, 62), 146);
  const barSec = (60 / bpm) * 4;
  const introOffsetSec = Math.min(barSec, 2.2);

  let measuredVocalSec = 0;
  if (comp.mode === 'song' && comp.vocalSegments && comp.vocalSegments.length > 0) {
    const validSegs = comp.vocalSegments.filter((s) => Boolean(s.audioBase64));
    validSegs.forEach((s, idx) => {
      const dec = parseWavBase64ToFloat32(s.audioBase64);
      const sec = dec && dec.samples.length > 0 ? dec.samples.length / dec.sampleRate : (s.durationSec || 0);
      measuredVocalSec += sec + (idx < validSegs.length - 1 ? Math.min(Math.max(barSec * 0.65, 1.4), 2.8) : 0);
    });
  } else if (comp.mode === 'song' && comp.vocalAudioBase64) {
    const decoded = parseWavBase64ToFloat32(comp.vocalAudioBase64);
    measuredVocalSec = decoded && decoded.samples.length > 0 ? decoded.samples.length / decoded.sampleRate : 0;
  }

  const vocalEndSec = measuredVocalSec > 0 ? introOffsetSec + measuredVocalSec : 0;
  const rawRequestedSec = Number(comp.durationSeconds) || 40;
  const targetSeconds =
    measuredVocalSec > 0
      ? Math.min(Math.max(rawRequestedSec, vocalEndSec + 4.5, 22), 120)
      : Math.min(Math.max(rawRequestedSec, 18), 300);
  const sampleRate = targetSeconds > 120 ? 22050 : 24000;

  const [instL, instR] = renderInstrumentalSamplesStereo(comp, sampleRate, targetSeconds, introOffsetSec, vocalEndSec, mix);
  const instrumentalUrl = encodeStereoWavBlobUrl(new Float32Array(instL), new Float32Array(instR), sampleRate);

  const totalSamples = instL.length;
  const vocalData = buildProcessedVocalBuses(comp, totalSamples, sampleRate, introOffsetSec, bpm, mix.reverbAmount, mix.vocalLevel);
  if (!vocalData) {
    return { fullMixUrl: instrumentalUrl, instrumentalUrl };
  }

  const vocalUrl = encodeStereoWavBlobUrl(new Float32Array(vocalData.vocalL), new Float32Array(vocalData.vocalR), sampleRate);
  const fullL = new Float32Array(totalSamples);
  const fullR = new Float32Array(totalSamples);
  let duckEnv = 0;
  for (let i = 0; i < totalSamples; i++) {
    duckEnv = duckEnv * 0.996 + Math.abs(vocalData.vocalBus[i]) * 0.004;
    const beatDuck = 1 - Math.min(0.42, duckEnv * 2.0);
    fullL[i] = instL[i] * beatDuck + vocalData.vocalL[i] * 0.98;
    fullR[i] = instR[i] * beatDuck + vocalData.vocalR[i] * 0.98;
  }
  const fullMixUrl = encodeStereoWavBlobUrl(fullL, fullR, sampleRate);
  return { fullMixUrl, instrumentalUrl, vocalUrl };
}

export async function renderMusicToWavUrl(comp: MusicComposition, mixOverride?: AudioMixSettings): Promise<string> {
  const bundle = await renderMusicMasterBundle(comp, mixOverride);
  return bundle.fullMixUrl;
}

export function buildStandaloneVideoHtml(scene: VideoScene): string {
  const safeJson = JSON.stringify(scene).replace(/<\/script>/gi, '<\\/script>');
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escHtml(scene.title || 'ZORVYX AI Video')}</title>
<style>body{margin:0;background:#0b0b19;color:#fff;font-family:Tahoma,Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;min-height:100vh;padding:16px}canvas{max-width:95vw;border-radius:16px;border:1px solid #2b2b49;box-shadow:0 20px 60px #0009}audio{max-width:95vw;width:640px}</style>
</head>
<body>
<canvas id="c" width="1280" height="720"></canvas>
${scene.voiceAudioBase64 ? `<audio controls autoplay src="data:audio/wav;base64,${scene.voiceAudioBase64}"></audio>` : ''}
<script>
const scene=${safeJson};
const c=document.getElementById('c'),ctx=c.getContext('2d');
const charImgs={};
(scene.characters||[]).forEach((ch)=>{if(ch.imageDataUrl&&!charImgs[ch.imageDataUrl]){const im=new Image();im.src=ch.imageDataUrl;charImgs[ch.imageDataUrl]=im;}});
const bgImgs=[];
const rawSvgs=(scene.keyframeSvgs&&scene.keyframeSvgs.length)?scene.keyframeSvgs:(scene.backdropSvg?[scene.backdropSvg]:[]);
rawSvgs.forEach((svg)=>{const b=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});const im=new Image();im.src=URL.createObjectURL(b);bgImgs.push(im);});
let start=performance.now();
function draw(now){
  const t=((now-start)/1000)%scene.durationSeconds;
  const g=ctx.createLinearGradient(0,0,0,720);
  g.addColorStop(0,scene.bgTop||'#17152f');g.addColorStop(1,scene.bgBottom||'#0b0b19');
  ctx.fillStyle=g;ctx.fillRect(0,0,1280,720);
  if(bgImgs.length>0){
    const seg=Math.max(scene.durationSeconds/bgImgs.length,4);
    const idx=Math.floor(t/seg)%bgImgs.length;
    const im=bgImgs[idx];
    if(im&&im.complete&&im.naturalWidth>0){ctx.save();ctx.globalAlpha=0.95;ctx.drawImage(im,0,0,1280,720);ctx.restore();}
  }
  (scene.elements||[]).forEach((el,i)=>{
    const p=el.pulse?1+0.15*Math.sin(t*3+i):1;
    const x=((el.x*1280+t*el.speedX*40+(el.orbit?Math.cos(t+i)*50:0))%1280+1280)%1280;
    const y=((el.y*720+t*el.speedY*40+(el.orbit?Math.sin(t+i)*35:0))%720+720)%720;
    ctx.save();ctx.translate(x,y);ctx.scale(p,p);ctx.fillStyle=el.color||scene.accentColor;ctx.strokeStyle=el.color||scene.accentColor;
    if(el.shape==='ring'||el.shape==='cube'){ctx.lineWidth=3;ctx.strokeRect(-el.size/2,-el.size/2,el.size,el.size);}
    else{ctx.beginPath();ctx.arc(0,0,el.size/2,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  });
  (scene.characters||[]).forEach((ch,i)=>{
    const beat=(scene.beats||[]).find(b=>t>=b.timeStart&&t<=b.timeEnd);
    const st=beat&&(beat.characterStates||[]).find(s=>s.name===ch.name);
    const prog=beat?Math.max(0,Math.min(1,(t-beat.timeStart)/Math.max(beat.timeEnd-beat.timeStart,0.5))):0;
    const ease=prog*prog*(3-2*prog);
    const act=st?st.action:ch.action;
    const bx=st?(st.x+(st.targetX-st.x)*ease):ch.x;
    const byNorm=st?(st.y+(st.targetY-st.y)*ease):ch.y;
    const scStart=st?.scale||ch.scale||1;
    const scEnd=st?.targetScale||scStart;
    const sc=scStart+(scEnd-scStart)*ease;
    const rotStart=st?.rotation||0;
    const rotEnd=st?.targetRotation||0;
    const rot=(rotStart+(rotEnd-rotStart)*ease)*Math.PI/180;
    const mx=st?0:(act==='walk'?Math.sin(t*0.7+i*1.5)*120:act==='fly'?Math.cos(t*0.9+i)*150:0);
    const by=act==='float'||act==='fly'?Math.sin(t*2.5+i)*18:act==='walk'||act==='run'?Math.abs(Math.sin(t*5))*-10:0;
    const px=bx*1280+mx,py=byNorm*720+by;
    ctx.save();ctx.translate(px,py);ctx.scale(sc*(st?.facing==='left'?-1:1),sc);
    const im=ch.imageDataUrl?charImgs[ch.imageDataUrl]:null;
    if(im&&im.complete&&im.naturalWidth>0){
      const tilt=rot||(act==='walk'||act==='run'?Math.sin(t*5)*0.08:act==='wave'?Math.sin(t*5)*0.09:0);
      ctx.rotate(tilt);
      const sz=ch.isSubjectPhoto?190:136,ar=im.naturalWidth/im.naturalHeight;
      const dw=ar>=1?sz:sz*ar,dh=ar>=1?sz/ar:sz;
      ctx.save();ctx.beginPath();ctx.roundRect(-dw/2,-dh/2,dw,dh,ch.isSubjectPhoto?28:18);ctx.clip();ctx.drawImage(im,-dw/2,-dh/2,dw,dh);ctx.restore();
      if(!ch.isSubjectPhoto){ctx.strokeStyle=ch.primaryColor||'#67e8f9';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(-dw/2,-dh/2,dw,dh,18);ctx.stroke();}
    } else {
      ctx.fillStyle=ch.primaryColor||'#67e8f9';ctx.beginPath();ctx.roundRect(-18,-12,36,56,12);ctx.fill();
      ctx.fillStyle='#fde68a';ctx.beginPath();ctx.arc(0,-34,20,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#0f172a';ctx.beginPath();ctx.arc(-7,-36,3,0,Math.PI*2);ctx.arc(7,-36,3,0,Math.PI*2);ctx.fill();
      if(beat&&beat.speakerName===ch.name){ctx.fillStyle='#7f1d1d';ctx.beginPath();ctx.ellipse(0,-24,5,2+Math.abs(Math.sin(t*14))*4,0,0,Math.PI*2);ctx.fill();}
    }
    ctx.restore();
    if(beat&&beat.speakerName===ch.name&&beat.dialogueLine){
      ctx.save();ctx.fillStyle='rgba(255,255,255,0.95)';ctx.beginPath();ctx.roundRect(px-140,py-165,280,54,14);ctx.fill();
      ctx.fillStyle='#0f172a';ctx.font='bold 16px Tahoma,Arial';ctx.textAlign='center';ctx.fillText(beat.dialogueLine.slice(0,42),px,py-133);ctx.restore();
    }
  });
  const beatCap=(scene.beats||[]).find(b=>t>=b.timeStart&&t<=b.timeEnd);
  const cap=(scene.captions||[]).find(cp=>t>=cp.timeStart&&t<=cp.timeEnd);
  const txt=((beatCap&&beatCap.dialogueLine)||(cap&&cap.text)||'').replace(/#/g,'');
  if(txt){ctx.fillStyle='rgba(11,11,25,0.78)';ctx.fillRect(140,606,1000,74);ctx.fillStyle='#f7f7ff';ctx.font='bold 28px Tahoma,Arial';ctx.textAlign='center';ctx.fillText(txt,640,652);}
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
</script>
</body>
</html>`;
}
