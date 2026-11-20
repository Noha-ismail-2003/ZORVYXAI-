export type CinemaProjectMode =
  | 'film'
  | 'series'
  | 'scene'
  | 'text_to_video'
  | 'image_to_video'
  | 'video_edit'
  | 'story_to_movie'
  | 'script_to_film'
  | 'audio_to_video'
  | 'ai_animation'
  | 'trailer'
  | 'documentary'
  | 'music_video'
  | 'ad_video';

export type CinemaStudioTab =
  | 'film'
  | 'series'
  | 'scene'
  | 'text_to_video'
  | 'image_to_video'
  | 'video_edit'
  | 'story_to_movie'
  | 'script_to_film'
  | 'audio_to_video'
  | 'ai_animation'
  | 'trailer'
  | 'documentary'
  | 'music_video'
  | 'ad_video'
  | 'actors'
  | 'editor'
  | 'projects'
  | 'gallery';

export type CinemaGenre =
  | 'دراما'
  | 'رعب'
  | 'أكشن'
  | 'كوميديا'
  | 'خيال علمي'
  | 'مغامرات'
  | 'رومانسي'
  | 'وثائقي'
  | 'تاريخي'
  | 'أنيميشن';

export type CinemaShotType = 'wide' | 'medium' | 'closeup' | 'establishing' | 'over_shoulder' | 'aerial';
export type CinemaCameraMotion =
  | 'zoom_in'
  | 'zoom_out'
  | 'pan_left'
  | 'pan_right'
  | 'orbit'
  | 'aerial'
  | 'tracking'
  | 'slow_motion'
  | 'static';
export type CinemaLighting = 'cinematic' | 'horror' | 'neon' | 'golden' | 'natural' | 'romantic';
export type CinemaWeather = 'clear' | 'rain' | 'fog' | 'snow' | 'storm' | 'night_stars' | 'sunset';
export type CinemaTimeOfDay = 'day' | 'sunset' | 'night' | 'dawn';
export type CinemaTransition = 'crossfade' | 'fade_black' | 'wipe' | 'cut';
export type CinemaSfxType = 'none' | 'rain' | 'thunder' | 'heartbeat' | 'wind' | 'sparkles' | 'city' | 'waves' | 'explosion';
export type CinemaVfxOverlay = 'none' | 'lens_flare' | 'chase_lines' | 'explosion_sparks' | 'rain_reflections';
export type CinemaVoiceActor = 'female' | 'male' | 'child';
export type CinemaDialect =
  | 'fusha'
  | 'ammiya'
  | 'egyptian'
  | 'gulf'
  | 'levantine'
  | 'maghrebi'
  | 'english'
  | 'french'
  | 'spanish'
  | 'turkish';
export type CinemaAspectRatio = '16:9' | '9:16' | '1:1';
export type CinemaExportQuality = '720p' | '1080p' | '2k' | '4k';

export type InfinityPipelineStage =
  | 'idle'
  | 'analyzing'
  | 'scripting'
  | 'characters'
  | 'scenes'
  | 'audio'
  | 'editing'
  | 'export_ready';

export interface CinemaCharacter {
  id: string;
  name: string;
  role: string;
  age: string;
  faceDesc?: string;
  featuresDesc?: string;
  appearanceDesc: string;
  outfitDesc: string;
  hairColor: string;
  primaryColor: string;
  secondaryColor: string;
  voiceActor: CinemaVoiceActor;
  dialect: CinemaDialect;
  voiceName: string;
  speakingStyle: string;
  movementStyle?: string;
  personalityTraits?: string;
  speechPattern?: string;
  avatarSvg?: string;
  uploadedImageUrl?: string;
  isReusableActor?: boolean;
}

export interface CinemaDialogueLine {
  id: string;
  characterId: string;
  speakerName: string;
  text: string;
  emotion?: string;
  dialect?: CinemaDialect;
  language?: string;
  audioBase64?: string;
  durationSec?: number;
}

export interface CinemaScene {
  id: string;
  episodeNumber: number;
  sceneNumber: number;
  title: string;
  locationDesc: string;
  visualAction: string;
  backdropSvg?: string;
  overlaySvg?: string;
  uploadedImageUrl?: string;
  uploadedVideoUrl?: string;
  uploadedAudioBase64?: string;
  shotType: CinemaShotType;
  cameraMotion: CinemaCameraMotion;
  lighting: CinemaLighting;
  weather: CinemaWeather;
  timeOfDay: CinemaTimeOfDay;
  transition: CinemaTransition;
  vfxOverlay?: CinemaVfxOverlay;
  colorContrast?: number;
  colorSaturation?: number;
  colorBrightness?: number;
  speed: number;
  durationSeconds: number;
  trimStart: number;
  trimEnd: number;
  overlayText: string;
  musicMood: string;
  musicTrackEnabled: boolean;
  sfxType: CinemaSfxType;
  characterIds: string[];
  dialogues: CinemaDialogueLine[];
  enhanceVideoFilter?: boolean;
  removeBackgroundTint?: boolean;
  produced: boolean;
}

export interface CinemaEpisode {
  episodeNumber: number;
  title: string;
  synopsis: string;
  continuityNotes?: string;
  scenes: CinemaScene[];
}

export interface CinemaProject {
  id: string;
  mode: CinemaProjectMode;
  title: string;
  logline: string;
  genre: CinemaGenre;
  seasonNumber?: number;
  continuityMemory?: string;
  targetDurationMinutes?: number;
  aspectRatio: CinemaAspectRatio;
  quality: CinemaExportQuality;
  targetLanguage: string;
  dialect: CinemaDialect;
  introTitle: string;
  introSubtitle: string;
  outroCredits: string;
  castList: string;
  showLogoWatermark: boolean;
  showSubtitles: boolean;
  storyPrompt: string;
  characters: CinemaCharacter[];
  episodes: CinemaEpisode[];
  activeEpisodeNumber: number;
  pipelineStage?: InfinityPipelineStage;
  publishedInGallery?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CinemaJobState {
  id: string;
  label: string;
  detail: string;
  stage?: InfinityPipelineStage;
  progress: number;
  status: 'idle' | 'running' | 'done' | 'cancelled' | 'error';
  error?: string;
}

export interface ProviderStatusReport {
  scriptEngine: { name: string; active: boolean; mode: string };
  visualsEngine: { name: string; active: boolean; mode: string };
  voiceEngine: { name: string; active: boolean; mode: string };
  musicEngine: { name: string; active: boolean; mode: string };
  editorEngine: { name: string; active: boolean; mode: string };
  optionalCloudApis: Array<{ id: string; label: string; connected: boolean; envVar: string }>;
}

export const CINEMA_GENRES: CinemaGenre[] = [
  'دراما',
  'رعب',
  'أكشن',
  'كوميديا',
  'خيال علمي',
  'مغامرات',
  'رومانسي',
  'وثائقي',
  'تاريخي',
  'أنيميشن',
];

export const VIDEO_CREATION_TOOLS: Array<{ id: CinemaProjectMode; label: string; badge: string; desc: string }> = [
  { id: 'film', label: 'صناعة فيلم كامل', badge: 'شامل', desc: 'تحليل القصة، الشخصيات، المشاهد، الأصوات والمونتاج.' },
  { id: 'series', label: 'صناعة مسلسل (حتى ٢٠ حلقة)', badge: 'مسلسلات', desc: 'مواسم وحلقات مترابطة مع ذاكرة أحداث مستمرة.' },
  { id: 'text_to_video', label: 'نص إلى فيديو', badge: 'سريع', desc: 'حوّل أي وصف نصي إلى مشاهد فيديو متكاملة.' },
  { id: 'image_to_video', label: 'صورة إلى فيديو', badge: 'ملامح ثابتة', desc: 'حرّك صورتك واجعلها تتحدث بواقعية مع حفظ الهوية.' },
  { id: 'video_edit', label: 'فيديو إلى فيديو', badge: 'دمج وتعديل', desc: 'تعديل الإضاءة والجو والدبلجة ودمج عدة مقاطع.' },
  { id: 'story_to_movie', label: 'رواية إلى فيلم', badge: 'روائي', desc: 'حوّل رواية أو قصة طويلة إلى سيناريو ومشاهد مصورة.' },
  { id: 'script_to_film', label: 'سيناريو إلى فيلم', badge: 'مباشر', desc: 'أدخل السيناريو والحوار لإخراجه فوراً بالصوت والصورة.' },
  { id: 'audio_to_video', label: 'صوت إلى فيديو', badge: 'مزامنة', desc: 'ارفع صوتاً أو سجّل بالميكروفون ليولّد الذكاء مشاهد متزامنة معه.' },
  { id: 'ai_animation', label: 'أفلام كرتون وأنيميشن', badge: 'رسوم متحركة', desc: 'مسلسلات وأفلام كرتونية ملونة للأطفال والعائلة.' },
  { id: 'trailer', label: 'صانع الإعلان التشويقي', badge: 'ترويجي', desc: 'مقطع تشويقي سريع الإيقاع بمؤثرات وإثارة.' },
  { id: 'documentary', label: 'صانع الأفلام الوثائقية', badge: 'وثائقي', desc: 'سرد تاريخي وعلمي متزن بتصوير جوي وتعليق رصين.' },
  { id: 'music_video', label: 'صانع الفيديو كليب', badge: 'كليب غنائي', desc: 'مشاهد إيقاعية متناسقة مع الأغاني والموسيقى.' },
  { id: 'ad_video', label: 'صانع الإعلانات التجارية', badge: 'إعلان', desc: 'فيديو إعلاني احترافي للمنتجات والخدمات.' },
  { id: 'scene', label: 'مشهد سينمائي منفرد', badge: 'لقطة', desc: 'إخراج مشهد مركز بدقة عالية وتفاصيل دقيقة.' },
];

export const SHOT_TYPE_OPTIONS: Array<{ value: CinemaShotType; label: string }> = [
  { value: 'wide', label: 'لقطة واسعة شاملة' },
  { value: 'medium', label: 'لقطة متوسطة متوازنة' },
  { value: 'closeup', label: 'لقطة مقربة للوجه' },
  { value: 'aerial', label: 'تصوير جوي من الأعلى' },
  { value: 'establishing', label: 'لقطة تأسيس المكان' },
  { value: 'over_shoulder', label: 'من فوق الكتف' },
];

export const CAMERA_MOTION_OPTIONS: Array<{ value: CinemaCameraMotion; label: string }> = [
  { value: 'zoom_in', label: 'تقريب سينمائي تدريجي' },
  { value: 'zoom_out', label: 'إبعاد تدريجي للكاميرا' },
  { value: 'aerial', label: 'تحليق وتصوير جوي سينمائي' },
  { value: 'tracking', label: 'تتبع حركة الشخصية' },
  { value: 'slow_motion', label: 'حركة بطيئة ناعمة' },
  { value: 'pan_left', label: 'تحريك أفقي لليسار' },
  { value: 'pan_right', label: 'تحريك أفقي لليمين' },
  { value: 'orbit', label: 'حركة دائرية محيطة' },
  { value: 'static', label: 'كاميرا ثابتة' },
];

export const LIGHTING_OPTIONS: Array<{ value: CinemaLighting; label: string }> = [
  { value: 'cinematic', label: 'إضاءة سينمائية متوازنة' },
  { value: 'horror', label: 'إضاءة رعب داكنة وتوتر' },
  { value: 'neon', label: 'إضاءة نيون مستقبلية زرقاء وبنفسجية' },
  { value: 'golden', label: 'الساعة الذهبية الدافئة' },
  { value: 'natural', label: 'إضاءة نهارية طبيعية' },
  { value: 'romantic', label: 'إضاءة رومانسية ناعمة' },
];

export const WEATHER_OPTIONS: Array<{ value: CinemaWeather; label: string }> = [
  { value: 'clear', label: 'سماء صافية' },
  { value: 'rain', label: 'أمطار متساقطة' },
  { value: 'fog', label: 'ضباب كثيف غامض' },
  { value: 'snow', label: 'تساقط ثلوج' },
  { value: 'storm', label: 'عاصفة وبرق' },
  { value: 'night_stars', label: 'ليلة نجوم متلألئة' },
  { value: 'sunset', label: 'غروب دافئ' },
];

export const TIME_OPTIONS: Array<{ value: CinemaTimeOfDay; label: string }> = [
  { value: 'day', label: 'نهار' },
  { value: 'sunset', label: 'غروب' },
  { value: 'night', label: 'ليل' },
  { value: 'dawn', label: 'فجر' },
];

export const TRANSITION_OPTIONS: Array<{ value: CinemaTransition; label: string }> = [
  { value: 'crossfade', label: 'مزج سينمائي ناعم' },
  { value: 'fade_black', label: 'تلاشي عبر الأسود' },
  { value: 'wipe', label: 'مسح جانبي سينمائي' },
  { value: 'cut', label: 'قطع مباشر' },
];

export const SFX_OPTIONS: Array<{ value: CinemaSfxType; label: string }> = [
  { value: 'none', label: 'بدون مؤثر إضافي' },
  { value: 'heartbeat', label: 'نبض قلب مشوق' },
  { value: 'rain', label: 'صوت مطر خفيف' },
  { value: 'thunder', label: 'رعد وعاصفة' },
  { value: 'wind', label: 'رياح وغابات' },
  { value: 'waves', label: 'أمواج البحر' },
  { value: 'city', label: 'أجواء مدينة ليلية' },
  { value: 'sparkles', label: 'بريق سحري ناعم' },
  { value: 'explosion', label: 'انفجار ومؤثر أكشن' },
];

export const VFX_OVERLAY_OPTIONS: Array<{ value: CinemaVfxOverlay; label: string }> = [
  { value: 'none', label: 'تلقائي حسب المشهد' },
  { value: 'lens_flare', label: 'توهج عدسة سينمائي' },
  { value: 'chase_lines', label: 'خطوط سرعة ومطاردة' },
  { value: 'explosion_sparks', label: 'شرارات ومؤثرات انفجار' },
  { value: 'rain_reflections', label: 'انعكاسات أرضية ولمعان' },
];

export const DIALECT_OPTIONS: Array<{ value: CinemaDialect; label: string }> = [
  { value: 'fusha', label: 'العربية الفصحى' },
  { value: 'ammiya', label: 'اللهجة العامية العربية' },
  { value: 'egyptian', label: 'اللهجة المصرية' },
  { value: 'gulf', label: 'اللهجة الخليجية' },
  { value: 'levantine', label: 'اللهجة الشامية' },
  { value: 'maghrebi', label: 'اللهجة المغاربية' },
  { value: 'english', label: 'اللغة الإنجليزية' },
  { value: 'french', label: 'اللغة الفرنسية' },
  { value: 'spanish', label: 'اللغة الإسبانية' },
  { value: 'turkish', label: 'اللغة التركية' },
];

export const LANGUAGE_OPTIONS = [
  'العربية',
  'الإنجليزية',
  'الفرنسية',
  'الإسبانية',
  'التركية',
  'الألمانية',
];
