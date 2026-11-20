import type { CinemaAspectRatio, CinemaCharacter, CinemaExportQuality, CinemaProject } from '../types/cinema';

const PROJECTS_KEY = 'zorvyx_cinema_projects_v1';
const DRAFT_KEY = 'zorvyx_cinema_active_draft_v1';
const ACTORS_KEY = 'zorvyx_cinema_actors_v1';
const CREDITS_KEY = 'zorvyx_cinema_credits_v1';

export interface CinemaCreditState {
  freeScenesUsed: number;
  monthlyFreeAllowance: number;
  selectedPlan: 'free_studio' | 'pro_cloud_optional';
}

export function loadCinemaCredits(): CinemaCreditState {
  try {
    const raw = localStorage.getItem(CREDITS_KEY);
    if (!raw) {
      return { freeScenesUsed: 0, monthlyFreeAllowance: 50, selectedPlan: 'free_studio' };
    }
    return {
      freeScenesUsed: 0,
      monthlyFreeAllowance: 50,
      selectedPlan: 'free_studio',
      ...JSON.parse(raw),
    };
  } catch {
    return { freeScenesUsed: 0, monthlyFreeAllowance: 50, selectedPlan: 'free_studio' };
  }
}

export function saveCinemaCredits(next: CinemaCreditState): void {
  try {
    localStorage.setItem(CREDITS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage limits
  }
}

export function getExportDimensions(
  quality: CinemaExportQuality,
  aspectRatio: CinemaAspectRatio,
): { width: number; height: number; bitrate: number } {
  const baseHeights: Record<CinemaExportQuality, number> = {
    '720p': 720,
    '1080p': 1080,
    '2k': 1440,
    '4k': 2160,
  };
  const h = baseHeights[quality] || 1080;

  let width = 1280;
  let height = 720;

  if (aspectRatio === '16:9') {
    height = h;
    width = Math.round((h * 16) / 9);
  } else if (aspectRatio === '9:16') {
    width = h;
    height = Math.round((h * 16) / 9);
  } else {
    width = h;
    height = h;
  }

  // Ensure even dimensions for H.264/VP9 MediaRecorder encoders
  width = width % 2 === 0 ? width : width + 1;
  height = height % 2 === 0 ? height : height + 1;

  const bitrate =
    quality === '4k'
      ? 14_000_000
      : quality === '2k'
        ? 9_000_000
        : quality === '1080p'
          ? 5_500_000
          : 3_200_000;

  return { width, height, bitrate };
}

function compactProjectForStorage(proj: CinemaProject, stripAudio: boolean): CinemaProject {
  return {
    ...proj,
    episodes: proj.episodes.map((ep) => ({
      ...ep,
      scenes: ep.scenes.map((sc) => ({
        ...sc,
        uploadedVideoUrl: sc.uploadedVideoUrl?.startsWith('blob:') ? undefined : sc.uploadedVideoUrl,
        uploadedAudioBase64: stripAudio ? undefined : sc.uploadedAudioBase64,
        dialogues: sc.dialogues.map((d) => ({
          ...d,
          audioBase64: stripAudio ? undefined : d.audioBase64,
        })),
      })),
    })),
  };
}

export function loadSavedCinemaProjects(): CinemaProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveCinemaProjectsList(projects: CinemaProject[]): boolean {
  const limited = projects.slice(0, 16);
  try {
    localStorage.setItem(
      PROJECTS_KEY,
      JSON.stringify(limited.map((p) => compactProjectForStorage(p, false))),
    );
    return true;
  } catch {
    try {
      localStorage.setItem(
        PROJECTS_KEY,
        JSON.stringify(limited.map((p) => compactProjectForStorage(p, true))),
      );
      return true;
    } catch {
      return false;
    }
  }
}

export function saveCinemaDraft(proj: CinemaProject): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(compactProjectForStorage(proj, false)));
  } catch {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(compactProjectForStorage(proj, true)));
    } catch {
      // ignore storage limits
    }
  }
}

export function loadCinemaDraft(): CinemaProject | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CinemaProject;
    return parsed && parsed.id ? parsed : null;
  } catch {
    return null;
  }
}

export function loadSavedActors(): CinemaCharacter[] {
  try {
    const raw = localStorage.getItem(ACTORS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveActorsList(actors: CinemaCharacter[]): void {
  const limited = actors.slice(0, 24);
  try {
    localStorage.setItem(ACTORS_KEY, JSON.stringify(limited));
  } catch {
    // ignore storage quota
  }
}

export function createEmptyCinemaProject(mode: CinemaProject['mode'] = 'film'): CinemaProject {
  const now = Date.now();
  const id = `proj-${now}`;
  return {
    id,
    mode,
    title: '',
    logline: '',
    genre: 'دراما',
    seasonNumber: 1,
    continuityMemory: '',
    aspectRatio: '16:9',
    quality: '1080p',
    targetLanguage: 'العربية',
    dialect: 'fusha',
    introTitle: '',
    introSubtitle: 'إنتاج استوديو زورفيكس للسينما',
    outroCredits: 'زورفيكس للذكاء الاصطناعي — صُنع وطُوّر بواسطة Noha Ismail Fathi Abu Arab',
    castList: '',
    showLogoWatermark: true,
    showSubtitles: true,
    storyPrompt: '',
    characters: [],
    episodes: [
      {
        episodeNumber: 1,
        title: 'الحلقة 1',
        synopsis: '',
        continuityNotes: '',
        scenes: [
          {
            id: `sc-${now}-1`,
            episodeNumber: 1,
            sceneNumber: 1,
            title: 'المشهد الافتتاحي',
            locationDesc: 'مشهد سينمائي خارجي واسع بإضاءة درامية',
            visualAction: 'افتتاح القصة وتقديم الشخصيات',
            shotType: 'wide',
            cameraMotion: 'zoom_in',
            lighting: 'cinematic',
            weather: 'clear',
            timeOfDay: 'sunset',
            transition: 'fade_black',
            vfxOverlay: 'none',
            colorContrast: 1.04,
            colorSaturation: 1.06,
            colorBrightness: 1.0,
            speed: 1,
            durationSeconds: 8,
            trimStart: 0,
            trimEnd: 8,
            overlayText: '',
            musicMood: 'دراما',
            musicTrackEnabled: true,
            sfxType: 'none',
            characterIds: [],
            dialogues: [],
            produced: false,
          },
        ],
      },
    ],
    activeEpisodeNumber: 1,
    pipelineStage: 'idle',
    publishedInGallery: false,
    createdAt: now,
    updatedAt: now,
  };
}
