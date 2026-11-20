import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AudioLines,
  CheckCircle2,
  Clapperboard,
  Cpu,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Mic,
  Play,
  Plus,
  RefreshCw,
  Save,
  Scissors,
  Share2,
  Sparkles,
  Square,
  Tv,
  Upload,
  UserCheck,
  Users,
  Video,
  XCircle,
} from 'lucide-react';
import type {
  CinemaAspectRatio,
  CinemaCharacter,
  CinemaDialect,
  CinemaExportQuality,
  CinemaGenre,
  CinemaJobState,
  CinemaProject,
  CinemaProjectMode,
  CinemaScene,
  CinemaStudioTab,
  CinemaVoiceActor,
  InfinityPipelineStage,
  ProviderStatusReport,
} from '../types/cinema';
import {
  CINEMA_GENRES,
  DIALECT_OPTIONS,
  LANGUAGE_OPTIONS,
  VIDEO_CREATION_TOOLS,
} from '../types/cinema';
import {
  createEmptyCinemaProject,
  loadCinemaCredits,
  loadCinemaDraft,
  loadSavedActors,
  loadSavedCinemaProjects,
  saveActorsList,
  saveCinemaCredits,
  saveCinemaDraft,
  saveCinemaProjectsList,
} from '../utils/cinemaStorage';
import { fileToResizedDataUrl, sanitizeSvgClient, stripHashMarks } from '../utils/mediaExport';
import { CinemaPlayerExporter } from './CinemaPlayerExporter';
import { CinemaTimelineEditor } from './CinemaTimelineEditor';

interface Props {
  initialImageForVideo?: string;
  onConsumeInitialImage?: () => void;
  initialAudioSeed?: {
    title: string;
    lyrics: string;
    audioBase64?: string;
    genre?: string;
    durationSeconds?: number;
  } | null;
  onConsumeInitialAudio?: () => void;
  geminiMode?: 'fast' | 'balanced' | 'pro';
  studioTheme?: 'night' | 'day';
}

const STUDIO_NAV_TABS: Array<{ id: CinemaStudioTab; label: string }> = [
  { id: 'film', label: 'منصة الإنشاء (14 أداة)' },
  { id: 'actors', label: 'شخصياتي (الممثلون)' },
  { id: 'editor', label: 'استوديو المونتاج' },
  { id: 'projects', label: 'مشاريعي' },
  { id: 'gallery', label: 'معرض أعمالي' },
];

const PIPELINE_STEPS: Array<{ id: InfinityPipelineStage; label: string }> = [
  { id: 'analyzing', label: '1. التحليل' },
  { id: 'scripting', label: '2. السيناريو' },
  { id: 'characters', label: '3. الشخصيات' },
  { id: 'scenes', label: '4. المشاهد' },
  { id: 'audio', label: '5. الصوت والدبلجة' },
  { id: 'editing', label: '6. المونتاج' },
  { id: 'export_ready', label: '7. جاهز للتصدير' },
];

function getQualityArabicLabel(q?: string): string {
  switch ((q || '').toLowerCase()) {
    case '4k':
      return 'جودة فائقة الوضوح';
    case '2k':
      return 'جودة سينمائية مضاعفة';
    case '1080p':
      return 'جودة كاملة فائقة';
    default:
      return 'جودة عالية قياسية';
  }
}

function getAspectArabicLabel(ar?: string): string {
  if (ar === '9:16') return 'أبعاد طولية للجوال';
  if (ar === '1:1') return 'أبعاد مربعة';
  return 'أبعاد سينمائية عريضة';
}

async function extractVideoKeyframes(videoFile: File): Promise<{
  objectUrl: string;
  durationSec: number;
  frames: string[];
}> {
  const objectUrl = URL.createObjectURL(videoFile);
  const vid = document.createElement('video');
  vid.src = objectUrl;
  vid.muted = true;
  vid.playsInline = true;
  vid.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    vid.onloadedmetadata = () => resolve();
    vid.onerror = () => reject(new Error('تعذر قراءة ملف الفيديو المختار.'));
  });

  const durationSec = Math.max(3, Math.min(180, Math.round(vid.duration || 8)));
  const sampleTimes = [0.2, Math.max(0.5, durationSec * 0.45), Math.max(0.8, durationSec * 0.85)];
  const frames: string[] = [];

  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 512 / Math.max(vid.videoWidth || 640, vid.videoHeight || 360));
  canvas.width = Math.max(120, Math.round((vid.videoWidth || 640) * scale));
  canvas.height = Math.max(120, Math.round((vid.videoHeight || 360) * scale));
  const ctx = canvas.getContext('2d');

  for (const st of sampleTimes) {
    try {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1200);
        vid.onseeked = () => {
          clearTimeout(timer);
          resolve();
        };
        vid.currentTime = Math.min(st, Math.max(0.1, (vid.duration || 5) - 0.1));
      });
      if (ctx) {
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.78));
      }
    } catch {
      // skip frame if seek fails
    }
  }

  return { objectUrl, durationSec, frames };
}

function blobToBase64Raw(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const str = String(reader.result || '');
      const idx = str.indexOf(',');
      resolve(idx >= 0 ? str.slice(idx + 1) : str);
    };
    reader.onerror = () => reject(new Error('تعذر قراءة الملف الصوتي.'));
    reader.readAsDataURL(blob);
  });
}

export function CinemaStudio({
  initialImageForVideo,
  onConsumeInitialImage,
  initialAudioSeed,
  onConsumeInitialAudio,
  geminiMode = 'balanced',
  studioTheme = 'night',
}: Props) {
  const [activeTab, setActiveTab] = useState<CinemaStudioTab>(
    initialImageForVideo ? 'image_to_video' : initialAudioSeed ? 'music_video' : 'film',
  );
  const [selectedTool, setSelectedTool] = useState<CinemaProjectMode>(
    initialImageForVideo ? 'image_to_video' : initialAudioSeed ? 'music_video' : 'film',
  );
  const [savedProjects, setSavedProjects] = useState<CinemaProject[]>(loadSavedCinemaProjects);
  const [savedActors, setSavedActors] = useState<CinemaCharacter[]>(loadSavedActors);
  const [project, setProject] = useState<CinemaProject>(() => createEmptyCinemaProject('film'));
  const [credits, setCredits] = useState(loadCinemaCredits);
  const [pendingDraft, setPendingDraft] = useState<CinemaProject | null>(() => {
    const d = loadCinemaDraft();
    return d && d.episodes.some((e) => e.scenes.some((s) => s.produced)) ? d : null;
  });

  // Infinity Master Command & Providers Status
  const [infinityCommand, setInfinityCommand] = useState('');
  const [providerStatus, setProviderStatus] = useState<ProviderStatusReport | null>(null);
  const [showProvidersDrawer, setShowProvidersDrawer] = useState(false);

  // Inputs for generation modes
  const [episodeCountInput, setEpisodeCountInput] = useState(10);
  const [scenesPerEpInput, setScenesPerEpInput] = useState(4);
  const [defaultDurationSec, setDefaultDurationSec] = useState(8);
  const [selectedActorIds, setSelectedActorIds] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState<'all' | 'film' | 'series' | 'done' | 'draft'>('all');

  // Image to Video
  const [imageUploadUrl, setImageUploadUrl] = useState(initialImageForVideo || '');
  const [imageSpeechText, setImageSpeechText] = useState('');
  const [imageVoiceActor, setImageVoiceActor] = useState<CinemaVoiceActor>('female');

  // Video to Video
  const [videoEditInstruction, setVideoEditInstruction] = useState('');
  const [videoEditDubLang, setVideoEditDubLang] = useState('العربية');
  const [videoEditDialect, setVideoEditDialect] = useState<CinemaDialect>('fusha');
  const [videoEditVoiceActor, setVideoEditVoiceActor] = useState<CinemaVoiceActor>('female');

  // Audio to Video
  const [audioBase64Input, setAudioBase64Input] = useState('');
  const [audioMimeInput, setAudioMimeInput] = useState('audio/wav');
  const [audioVisualStyle, setAudioVisualStyle] = useState('سينمائي واقعي وإضاءة درامية');
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const micRecRef = useRef<MediaRecorder | null>(null);
  const micChunksRef = useRef<Blob[]>([]);

  // Reusable actor creator
  const [newActorName, setNewActorName] = useState('');
  const [newActorRole, setNewActorRole] = useState('بطل سينمائي');
  const [newActorVoice, setNewActorVoice] = useState<CinemaVoiceActor>('female');
  const [newActorDesc, setNewActorDesc] = useState('');

  const [job, setJob] = useState<CinemaJobState>({
    id: '',
    label: '',
    detail: '',
    stage: 'idle',
    progress: 0,
    status: 'idle',
  });
  const [lastRetryAction, setLastRetryAction] = useState<(() => Promise<void>) | null>(null);
  const [notice, setNotice] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const imgFileRef = useRef<HTMLInputElement | null>(null);
  const vidFileRef = useRef<HTMLInputElement | null>(null);
  const audioFileRef = useRef<HTMLInputElement | null>(null);
  const charFileRef = useRef<HTMLInputElement | null>(null);
  const [charUploadTargetId, setCharUploadTargetId] = useState<string>('');

  useEffect(() => {
    void fetch('/api/providers/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setProviderStatus(data as ProviderStatusReport);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialImageForVideo) {
      setImageUploadUrl(initialImageForVideo);
      setSelectedTool('image_to_video');
      setActiveTab('image_to_video');
      onConsumeInitialImage?.();
    }
  }, [initialImageForVideo, onConsumeInitialImage]);

  useEffect(() => {
    if (initialAudioSeed) {
      setSelectedTool('music_video');
      setActiveTab('film');
      setProject((prev) => ({
        ...prev,
        mode: 'music_video',
        title: initialAudioSeed.title || prev.title,
        storyPrompt: `فيديو كليب موسيقي احترافي للأغنية:\n${initialAudioSeed.lyrics || initialAudioSeed.title}`,
      }));
      if (initialAudioSeed.audioBase64) {
        setAudioBase64Input(initialAudioSeed.audioBase64);
        setAudioMimeInput('audio/wav');
      }
      setNotice('تم استلام الأغنية من الاستوديو الموسيقي! يمكنكِ توليد الفيديو كليب الكامل الآن.');
      onConsumeInitialAudio?.();
    }
  }, [initialAudioSeed, onConsumeInitialAudio]);

  // Auto-save working draft
  useEffect(() => {
    if (project.title || project.storyPrompt || project.episodes.some((e) => e.scenes.some((s) => s.produced))) {
      saveCinemaDraft(project);
    }
  }, [project]);

  function selectTool(tool: CinemaProjectMode) {
    setSelectedTool(tool);
    if (tool === 'image_to_video') setActiveTab('image_to_video');
    else if (tool === 'video_edit') setActiveTab('video_edit');
    else if (tool === 'audio_to_video') setActiveTab('audio_to_video');
    else setActiveTab('film');
    setProject((prev) => ({ ...prev, mode: tool }));
  }

  function persistCurrentProject(nextProj: CinemaProject, alsoPublish?: boolean) {
    const stamped: CinemaProject = {
      ...nextProj,
      ...(typeof alsoPublish === 'boolean' ? { publishedInGallery: alsoPublish } : {}),
      updatedAt: Date.now(),
    };
    setProject(stamped);
    saveCinemaDraft(stamped);
    setSavedProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === stamped.id);
      const nextList = idx >= 0 ? prev.map((p, i) => (i === idx ? stamped : p)) : [stamped, ...prev];
      const ok = saveCinemaProjectsList(nextList);
      setNotice(
        ok
          ? alsoPublish
            ? 'تم نشر العمل في «معرض أعمالي» وحفظ المشروع.'
            : 'تم حفظ المشروع بنجاح ويمكنك استكماله في أي وقت.'
          : 'تم الحفظ في الجلسة الحالية (مساحة المتصفح ممتلئة جزئياً).',
      );
      return nextList;
    });
  }

  function saveActorToVault(char: CinemaCharacter) {
    const tagged: CinemaCharacter = { ...char, isReusableActor: true };
    setSavedActors((prev) => {
      const exists = prev.some((a) => a.id === tagged.id);
      const next = exists ? prev.map((a) => (a.id === tagged.id ? tagged : a)) : [tagged, ...prev];
      saveActorsList(next);
      return next;
    });
    setNotice(`تم حفظ الممثل الافتراضي «${char.name}» في خزنة شخصياتي لاستخدامه في أي فيلم أو مسلسل قادم!`);
  }

  function consumeFreeCredit(amount = 1) {
    setCredits((prev) => {
      const next = { ...prev, freeScenesUsed: prev.freeScenesUsed + amount };
      saveCinemaCredits(next);
      return next;
    });
  }

  function startNewController(): AbortController {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    return ctrl;
  }

  function cancelActiveJob() {
    abortRef.current?.abort();
    setJob((prev) => ({
      ...prev,
      status: 'cancelled',
      detail: 'تم إلغاء المهمة بناءً على طلبك.',
    }));
  }

  async function produceFullPlanAndScenes(overrideConfig?: {
    mode?: CinemaProjectMode;
    title?: string;
    genre?: CinemaGenre;
    episodeCount?: number;
    scenesPerEpisode?: number;
    dialect?: CinemaDialect;
    targetLanguage?: string;
    storyPrompt?: string;
    targetDurationMinutes?: number;
  }) {
    const targetMode = overrideConfig?.mode || selectedTool;
    const effectiveTitle = overrideConfig?.title ?? project.title;
    const effectiveGenre = overrideConfig?.genre ?? project.genre;
    const effectiveStory = overrideConfig?.storyPrompt ?? project.storyPrompt;
    const effectiveEpCount = overrideConfig?.episodeCount ?? (targetMode === 'series' ? episodeCountInput : 1);
    const effectiveScenesPerEp =
      overrideConfig?.scenesPerEpisode ?? (targetMode === 'scene' ? 1 : scenesPerEpInput);
    const effectiveDialect = overrideConfig?.dialect ?? project.dialect;
    const effectiveLang = overrideConfig?.targetLanguage ?? project.targetLanguage;

    if (!effectiveStory.trim() && !effectiveTitle.trim()) {
      setNotice('اكتبي اسم العمل أو فكرة القصة أو استخدمي شريط الأوامر الذكي أعلى الصفحة.');
      return;
    }

    const chosenActors = savedActors.filter((a) => selectedActorIds.includes(a.id));

    const runner = async () => {
      const ctrl = startNewController();
      setNotice('');
      setJob({
        id: `job-${Date.now()}`,
        label: 'محرك ZORVYX AI الشامل — جاري التنفيذ الآلي',
        detail: '١/٧ تحليل الفكرة والسيناريو وبناء الشخصيات الثابتة…',
        stage: 'scripting',
        progress: 14,
        status: 'running',
      });

      try {
        const planRes = await fetch('/api/cinema/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({
            mode: targetMode,
            title: effectiveTitle,
            genre: effectiveGenre,
            storyPrompt: effectiveStory,
            episodeCount: effectiveEpCount,
            scenesPerEpisode: effectiveScenesPerEp,
            defaultDurationSec,
            targetLanguage: effectiveLang,
            dialect: effectiveDialect,
            musicMood: effectiveGenre,
            seasonNumber: project.seasonNumber || 1,
            continuityMemory: project.continuityMemory || '',
            existingActors: chosenActors,
            geminiMode,
          }),
        });
        const planData = await planRes.json().catch(() => ({}));
        if (!planRes.ok) throw new Error(planData.error || 'تعذر إنشاء السيناريو والخطّة.');

        let workingProject: CinemaProject = {
          ...project,
          mode: targetMode,
          genre: effectiveGenre,
          dialect: effectiveDialect,
          targetLanguage: effectiveLang,
          storyPrompt: effectiveStory,
          targetDurationMinutes: overrideConfig?.targetDurationMinutes,
          title: planData.plan.title || effectiveTitle || 'عمل ZORVYX AI CINEMA',
          logline: planData.plan.logline || effectiveStory,
          continuityMemory: planData.plan.continuityMemory || project.continuityMemory || '',
          introTitle: planData.plan.title || effectiveTitle || 'عمل ZORVYX AI CINEMA',
          characters: planData.plan.characters || [],
          episodes: planData.plan.episodes || [],
          activeEpisodeNumber: 1,
          pipelineStage: 'characters',
          updatedAt: Date.now(),
        };
        setProject(workingProject);
        saveCinemaDraft(workingProject);

        // Step 3: Characters DNA portraits
        const totalChars = workingProject.characters.length;
        for (let ci = 0; ci < totalChars; ci++) {
          if (ctrl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          const ch = workingProject.characters[ci];
          if (ch.avatarSvg || ch.uploadedImageUrl) continue;
          setJob({
            id: `job-char-${ci}`,
            label: 'تصميم الشخصيات (بصمة الشخصية الثابتة)',
            detail: `٣/٧ تثبيت الملامح والملابس والشعر للشخصية: ${ch.name} (${ci + 1}/${totalChars})`,
            stage: 'characters',
            progress: 24 + Math.round(((ci + 1) / Math.max(1, totalChars)) * 16),
            status: 'running',
          });

          const prRes = await fetch('/api/cinema/character-portrait', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: ctrl.signal,
            body: JSON.stringify({ character: ch, genre: workingProject.genre, geminiMode }),
          });
          if (prRes.ok) {
            const prData = await prRes.json().catch(() => ({}));
            if (prData.avatarSvg) {
              workingProject = {
                ...workingProject,
                characters: workingProject.characters.map((c) =>
                  c.id === ch.id ? { ...c, avatarSvg: prData.avatarSvg } : c,
                ),
              };
              setProject(workingProject);
            }
          }
        }

        // Step 4 & 5: Produce Episode 1 scenes in parallel batches of 2 (visual backdrops + dubbed audio)
        const ep1 = workingProject.episodes[0];
        if (ep1) {
          const totalSc = ep1.scenes.length;
          const BATCH_SIZE = 2;
          for (let si = 0; si < totalSc; si += BATCH_SIZE) {
            if (ctrl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            const batch = ep1.scenes.slice(si, si + BATCH_SIZE);
            const batchTitles = batch.map((s) => s.title).join(' + ');
            const completedAfterBatch = Math.min(totalSc, si + batch.length);
            setJob({
              id: `job-sc-${si}`,
              label: `إنتاج مشاهد ${ep1.title}`,
              detail: `4/7 & 5/7 تصوير المشاهد وتوليد الأصوات (${completedAfterBatch}/${totalSc}): ${batchTitles}`,
              stage: si % 2 === 0 ? 'scenes' : 'audio',
              progress: 44 + Math.round((completedAfterBatch / Math.max(1, totalSc)) * 46),
              status: 'running',
            });

            const batchResults = await Promise.all(
              batch.map(async (sc, offset) => {
                const scRes = await fetch('/api/cinema/scene-produce', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  signal: ctrl.signal,
                  body: JSON.stringify({
                    scene: sc,
                    characters: workingProject.characters,
                    genre: workingProject.genre,
                    aspectRatio: workingProject.aspectRatio,
                    geminiMode,
                  }),
                });
                const scData = await scRes.json().catch(() => ({}));
                if (!scRes.ok) throw new Error(scData.error || `تعذر إنتاج المشهد ${si + offset + 1}.`);
                return { scId: sc.id, scData };
              }),
            );

            const resultMap = new Map(batchResults.map((r) => [r.scId, r.scData]));
            workingProject = {
              ...workingProject,
              pipelineStage: 'editing',
              episodes: workingProject.episodes.map((ep) =>
                ep.episodeNumber === ep1.episodeNumber
                  ? {
                      ...ep,
                      scenes: ep.scenes.map((item) => {
                        const scData = resultMap.get(item.id);
                        return scData
                          ? {
                              ...item,
                              backdropSvg: scData.backdropSvg || item.backdropSvg,
                              dialogues: scData.dialogues || item.dialogues,
                              durationSeconds: scData.durationSeconds || item.durationSeconds,
                              trimEnd: scData.durationSeconds || item.durationSeconds,
                              produced: true,
                            }
                          : item;
                      }),
                    }
                  : ep,
              ),
            };
            setProject(workingProject);
            saveCinemaDraft(workingProject);
            consumeFreeCredit(batch.length);
          }
        }

        workingProject = { ...workingProject, pipelineStage: 'export_ready' };
        persistCurrentProject(workingProject);
        setJob({
          id: 'done',
          label: 'اكتمل الإنتاج السينمائي بنجاح!',
          detail:
            workingProject.episodes.length > 1
              ? `تم تأليف ${workingProject.episodes.length} حلقة مع ذاكرة الأحداث وإنتاج الحلقة 1 بالكامل!`
              : 'تم إنتاج جميع المشاهد والشخصيات والأصوات والموسيقى ودمجها بالترتيب — جاهز للمشاهدة والتصدير بأعلى جودة!',
          stage: 'export_ready',
          progress: 100,
          status: 'done',
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setJob((prev) => ({ ...prev, status: 'cancelled', detail: 'تم إلغاء المهمة.' }));
        } else {
          setJob((prev) => ({
            ...prev,
            status: 'error',
            error: err instanceof Error ? err.message : 'حدث خطأ أثناء الإنتاج.',
            detail: 'تعذر إكمال الإنتاج.',
          }));
        }
      }
    };

    setLastRetryAction(() => runner);
    await runner();
  }

  async function runInfinityCommand() {
    const cmd = infinityCommand.trim();
    if (!cmd) {
      setNotice('اكتبي أمرك في محرك ZORVYX AI الشامل (مثلاً: اصنع لي مسلسلاً من ٢٠ حلقة أو فيلم رعب ٣٠ دقيقة).');
      return;
    }

    const ctrl = startNewController();
    setNotice('');
    setJob({
      id: `inf-${Date.now()}`,
      label: 'ZORVYX AI CINEMA — المحرك السينمائي الشامل',
      detail: '١/٧ تحليل أمرك وتحديد النوع والحلقات والأسلوب السينمائي…',
      stage: 'analyzing',
      progress: 8,
      status: 'running',
    });

    try {
      const res = await fetch('/api/cinema/infinity-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({ command: cmd, geminiMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذر تحليل الأمر.');

      const spec = data.spec || {};
      const validMode = (VIDEO_CREATION_TOOLS.some((t) => t.id === spec.mode) ? spec.mode : 'film') as CinemaProjectMode;
      const validGenre = (CINEMA_GENRES.includes(spec.genre) ? spec.genre : 'دراما') as CinemaGenre;
      const validDialect = (DIALECT_OPTIONS.some((d) => d.value === spec.dialect) ? spec.dialect : 'ammiya') as CinemaDialect;
      const epCnt = Math.min(20, Math.max(1, Number(spec.episodeCount) || 1));
      const scCnt = Math.min(8, Math.max(2, Number(spec.scenesPerEpisode) || 4));

      setSelectedTool(validMode);
      setEpisodeCountInput(epCnt);
      setScenesPerEpInput(scCnt);
      setActiveTab('film');

      await produceFullPlanAndScenes({
        mode: validMode,
        title: spec.title || '',
        genre: validGenre,
        episodeCount: epCnt,
        scenesPerEpisode: scCnt,
        dialect: validDialect,
        targetLanguage: spec.targetLanguage || 'العربية',
        storyPrompt: spec.storyOutline || cmd,
        targetDurationMinutes: spec.targetDurationMinutes,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setJob((prev) => ({ ...prev, status: 'cancelled', detail: 'تم إلغاء الأمر.' }));
      } else {
        setJob((prev) => ({
          ...prev,
          status: 'error',
          error: err instanceof Error ? err.message : 'تعذر تحليل الأمر.',
        }));
      }
    }
  }

  async function produceEpisodeByNumber(episodeNumber: number) {
    const ep = project.episodes.find((e) => e.episodeNumber === episodeNumber);
    if (!ep) return;

    const runner = async () => {
      const ctrl = startNewController();
      let working = { ...project, activeEpisodeNumber: episodeNumber };
      setProject(working);

      try {
        const BATCH_SIZE = 2;
        for (let si = 0; si < ep.scenes.length; si += BATCH_SIZE) {
          if (ctrl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          const batch = ep.scenes.slice(si, si + BATCH_SIZE);
          const batchTitles = batch.map((s) => s.title).join(' + ');
          const doneCount = Math.min(ep.scenes.length, si + batch.length);
          setJob({
            id: `ep-${episodeNumber}-sc-${si}`,
            label: `إنتاج ${ep.title}`,
            detail: `تصوير وأصوات المشاهد (${doneCount}/${ep.scenes.length}): ${batchTitles}`,
            stage: 'scenes',
            progress: Math.round((doneCount / Math.max(1, ep.scenes.length)) * 100),
            status: 'running',
          });

          const batchResults = await Promise.all(
            batch.map(async (sc) => {
              const scRes = await fetch('/api/cinema/scene-produce', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: ctrl.signal,
                body: JSON.stringify({
                  scene: sc,
                  characters: working.characters,
                  genre: working.genre,
                  aspectRatio: working.aspectRatio,
                  geminiMode,
                }),
              });
              const scData = await scRes.json().catch(() => ({}));
              if (!scRes.ok) throw new Error(scData.error || 'تعذر إنتاج المشهد.');
              return { scId: sc.id, scData };
            }),
          );

          const resultMap = new Map(batchResults.map((r) => [r.scId, r.scData]));
          working = {
            ...working,
            episodes: working.episodes.map((e) =>
              e.episodeNumber === episodeNumber
                ? {
                    ...e,
                    scenes: e.scenes.map((item) => {
                      const scData = resultMap.get(item.id);
                      return scData
                        ? {
                            ...item,
                            backdropSvg: scData.backdropSvg || item.backdropSvg,
                            dialogues: scData.dialogues || item.dialogues,
                            durationSeconds: scData.durationSeconds || item.durationSeconds,
                            trimEnd: scData.durationSeconds || item.durationSeconds,
                            produced: true,
                          }
                        : item;
                    }),
                  }
                : e,
            ),
          };
          setProject(working);
          consumeFreeCredit(batch.length);
        }
        persistCurrentProject(working);
        setJob({
          id: 'ep-done',
          label: `اكتملت ${ep.title}`,
          detail: 'جميع مشاهد الحلقة جاهزة للتشغيل والمونتاج والتصدير.',
          stage: 'export_ready',
          progress: 100,
          status: 'done',
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setJob((prev) => ({ ...prev, status: 'cancelled' }));
        } else {
          setJob((prev) => ({
            ...prev,
            status: 'error',
            error: err instanceof Error ? err.message : 'حدث خطأ أثناء إنتاج الحلقة.',
          }));
        }
      }
    };

    setLastRetryAction(() => runner);
    await runner();
  }

  async function produceSingleScene(episodeNumber: number, sceneId: string) {
    const ep = project.episodes.find((e) => e.episodeNumber === episodeNumber);
    const sc = ep?.scenes.find((s) => s.id === sceneId);
    if (!ep || !sc) return;

    const ctrl = startNewController();
    setJob({
      id: `single-${sceneId}`,
      label: `توليد المشهد: ${sc.title}`,
      detail: 'جاري رسم الخلفية السينمائية وتوليد الأصوات…',
      stage: 'scenes',
      progress: 45,
      status: 'running',
    });

    try {
      const scRes = await fetch('/api/cinema/scene-produce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          scene: sc,
          characters: project.characters,
          genre: project.genre,
          aspectRatio: project.aspectRatio,
          referenceImage: sc.uploadedImageUrl || '',
          geminiMode,
        }),
      });
      const scData = await scRes.json().catch(() => ({}));
      if (!scRes.ok) throw new Error(scData.error || 'تعذر توليد المشهد.');

      const next: CinemaProject = {
        ...project,
        episodes: project.episodes.map((e) =>
          e.episodeNumber === episodeNumber
            ? {
                ...e,
                scenes: e.scenes.map((item) =>
                  item.id === sceneId
                    ? {
                        ...item,
                        backdropSvg: scData.backdropSvg || item.backdropSvg,
                        dialogues: scData.dialogues || item.dialogues,
                        durationSeconds: scData.durationSeconds || item.durationSeconds,
                        trimEnd: scData.durationSeconds || item.durationSeconds,
                        produced: true,
                      }
                    : item,
                ),
              }
            : e,
        ),
      };
      persistCurrentProject(next);
      consumeFreeCredit(1);
      setJob({
        id: 'single-done',
        label: 'تم تحديث المشهد',
        detail: 'المشهد جاهز الآن في المعاينة والمونتاج.',
        stage: 'export_ready',
        progress: 100,
        status: 'done',
      });
    } catch (err) {
      setJob((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'تعذر توليد المشهد.',
      }));
    }
  }

  async function runImageToVideo() {
    if (!imageUploadUrl) {
      setNotice('ارفعي صورة أولاً لتحويلها إلى فيديو متحرك وناطق.');
      return;
    }
    const runner = async () => {
      const ctrl = startNewController();
      setJob({
        id: `img2vid-${Date.now()}`,
        label: 'تحويل الصورة إلى فيديو حي',
        detail: 'تحليل الصورة الأصلية والحفاظ على ملامحها وتوليد الحركة والصوت…',
        stage: 'scenes',
        progress: 35,
        status: 'running',
      });

      try {
        const charId = `char-photo-${Date.now()}`;
        const photoChar: CinemaCharacter = {
          id: charId,
          name: project.title || 'الشخصية الرئيسية',
          role: 'بطل الصورة',
          age: 'الأصلي',
          appearanceDesc: 'مطابق للصورة المرفوعة',
          outfitDesc: 'مطابق للصورة المرفوعة',
          hairColor: 'مطابق',
          primaryColor: '#38bdf8',
          secondaryColor: '#a78bfa',
          voiceActor: imageVoiceActor,
          dialect: project.dialect,
          voiceName: imageVoiceActor === 'male' ? 'Charon' : imageVoiceActor === 'child' ? 'Puck' : 'Kore',
          speakingStyle: project.genre,
          uploadedImageUrl: imageUploadUrl,
        };

        const scId = `sc-i2v-${Date.now()}`;
        const baseScene: CinemaScene = {
          id: scId,
          episodeNumber: 1,
          sceneNumber: 1,
          title: project.title || 'فيديو من صورة',
          locationDesc: project.storyPrompt || 'تحريك الخلفية وإبراز تعبيرات الصورة الأصلية بنعومة سينمائية',
          visualAction: project.storyPrompt || 'تحريك الوجه والعيون والخلفية مع كلام متزامن',
          uploadedImageUrl: imageUploadUrl,
          shotType: 'medium',
          cameraMotion: 'zoom_in',
          lighting: project.genre === 'رعب' ? 'horror' : 'cinematic',
          weather: 'clear',
          timeOfDay: 'sunset',
          transition: 'fade_black',
          vfxOverlay: 'lens_flare',
          speed: 1,
          durationSeconds: defaultDurationSec,
          trimStart: 0,
          trimEnd: defaultDurationSec,
          overlayText: '',
          musicMood: project.genre,
          musicTrackEnabled: true,
          sfxType: 'none',
          characterIds: [charId],
          dialogues: imageSpeechText.trim()
            ? [
                {
                  id: `dlg-i2v-${Date.now()}`,
                  characterId: charId,
                  speakerName: photoChar.name,
                  text: imageSpeechText.trim(),
                  dialect: project.dialect,
                  language: project.targetLanguage,
                },
              ]
            : [],
          produced: false,
        };

        const scRes = await fetch('/api/cinema/scene-produce', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({
            scene: baseScene,
            characters: [photoChar],
            genre: project.genre,
            aspectRatio: project.aspectRatio,
            referenceImage: imageUploadUrl,
            geminiMode,
          }),
        });
        const scData = await scRes.json().catch(() => ({}));
        if (!scRes.ok) throw new Error(scData.error || 'تعذر تحويل الصورة إلى فيديو.');

        const nextProj: CinemaProject = {
          ...project,
          mode: 'image_to_video',
          title: project.title || 'تحريك صورة بالذكاء الاصطناعي',
          introTitle: project.title || 'تحريك صورة بالذكاء الاصطناعي',
          characters: [photoChar],
          pipelineStage: 'export_ready',
          episodes: [
            {
              episodeNumber: 1,
              title: 'المشهد المتحرك',
              synopsis: project.storyPrompt || 'تحريك الصورة والحفاظ على هويتها',
              scenes: [
                {
                  ...baseScene,
                  backdropSvg: scData.backdropSvg,
                  dialogues: scData.dialogues || baseScene.dialogues,
                  durationSeconds: scData.durationSeconds || baseScene.durationSeconds,
                  trimEnd: scData.durationSeconds || baseScene.durationSeconds,
                  produced: true,
                },
              ],
            },
          ],
          activeEpisodeNumber: 1,
        };
        persistCurrentProject(nextProj);
        consumeFreeCredit(1);
        setJob({
          id: 'i2v-done',
          label: 'تم تحويل الصورة إلى فيديو',
          detail: 'تم تحريك الخلفية والشخصية مع الحفاظ على ملامح الصورة الأصلية ومزامنة الكلام.',
          stage: 'export_ready',
          progress: 100,
          status: 'done',
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setJob((prev) => ({ ...prev, status: 'cancelled' }));
        } else {
          setJob((prev) => ({
            ...prev,
            status: 'error',
            error: err instanceof Error ? err.message : 'حدث خطأ أثناء التحويل.',
          }));
        }
      }
    };

    setLastRetryAction(() => runner);
    await runner();
  }

  async function handleAudioToVideoRun() {
    if (!audioBase64Input) {
      setNotice('سجّلي صوتاً بالميكروفون أو ارفعي ملف صوتي أولاً.');
      return;
    }
    const ctrl = startNewController();
    setJob({
      id: `aud2vid-${Date.now()}`,
      label: 'تحويل الصوت إلى فيديو متزامن',
      detail: 'تحليل المقطع الصوتي وفهم محتواه وتوليد مشهد سينمائي متزامن…',
      stage: 'audio',
      progress: 40,
      status: 'running',
    });

    try {
      const res = await fetch('/api/cinema/audio-to-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          audioBase64: audioBase64Input,
          audioMimeType: audioMimeInput,
          visualStyle: audioVisualStyle,
          genre: project.genre,
          aspectRatio: project.aspectRatio,
          geminiMode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذر تحويل الصوت إلى فيديو.');
      const r = data.result || {};
      const dur = Number(r.durationSeconds) || 12;

      const scene: CinemaScene = {
        id: `sc-a2v-${Date.now()}`,
        episodeNumber: 1,
        sceneNumber: 1,
        title: r.title || 'فيديو من الصوت',
        locationDesc: r.locationDesc || audioVisualStyle,
        visualAction: r.visualAction || '',
        backdropSvg: r.backdropSvg,
        uploadedAudioBase64: audioBase64Input,
        shotType: 'wide',
        cameraMotion: (r.cameraMotion || 'zoom_in') as CinemaScene['cameraMotion'],
        lighting: (r.lighting || 'cinematic') as CinemaScene['lighting'],
        weather: (r.weather || 'clear') as CinemaScene['weather'],
        timeOfDay: 'night',
        transition: 'fade_black',
        vfxOverlay: (r.vfxOverlay || 'lens_flare') as CinemaScene['vfxOverlay'],
        speed: 1,
        durationSeconds: dur,
        trimStart: 0,
        trimEnd: dur,
        overlayText: r.title || '',
        musicMood: project.genre,
        musicTrackEnabled: false,
        sfxType: 'none',
        characterIds: [],
        dialogues: r.transcript
          ? [
              {
                id: `dlg-a2v-${Date.now()}`,
                characterId: 'audio-speaker',
                speakerName: 'الصوت الأصلي',
                text: r.transcript,
              },
            ]
          : [],
        produced: true,
      };

      const nextProj: CinemaProject = {
        ...project,
        mode: 'audio_to_video',
        title: project.title || r.title || 'فيديو من الصوت',
        introTitle: project.title || r.title || 'فيديو من الصوت',
        pipelineStage: 'export_ready',
        episodes: [
          {
            episodeNumber: 1,
            title: 'مشهد الصوت المتزامن',
            synopsis: r.transcript || r.locationDesc || '',
            scenes: [scene],
          },
        ],
        activeEpisodeNumber: 1,
      };
      persistCurrentProject(nextProj);
      consumeFreeCredit(1);
      setJob({
        id: 'a2v-done',
        label: 'تم توليد الفيديو المتزامن مع صوتك',
        detail: 'اضغطي «معاينة وتشغيل العمل» أو افتحي استوديو المونتاج للتصدير.',
        stage: 'export_ready',
        progress: 100,
        status: 'done',
      });
    } catch (err) {
      setJob((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'تعذر تحويل الصوت إلى فيديو.',
      }));
    }
  }

  async function toggleAudioRecorder() {
    if (isRecordingMic && micRecRef.current) {
      micRecRef.current.stop();
      setIsRecordingMic(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      micChunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) micChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(micChunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const b64 = await blobToBase64Raw(blob);
        setAudioBase64Input(b64);
        setAudioMimeInput(rec.mimeType || 'audio/webm');
        setNotice('تم تسجيل الصوت بنجاح! اضغطي «توليد الفيديو المتزامن مع الصوت» للإنشاء.');
      };
      micRecRef.current = rec;
      rec.start();
      setIsRecordingMic(true);
    } catch {
      setNotice('تعذر فتح الميكروفون؛ يمكنك رفع ملف صوتي من جهازك بدلاً من ذلك.');
    }
  }

  async function handleVideoUploadAndAnalyze(files: FileList | null) {
    if (!files || files.length === 0) return;
    const ctrl = startNewController();
    const fileArr = Array.from(files).slice(0, 6);

    setJob({
      id: `videdit-${Date.now()}`,
      label: 'تحليل وتعديل المقاطع المرفوعة',
      detail: `استخراج اللقطات من ${fileArr.length} فيديو وتحليلها بالذكاء الاصطناعي…`,
      stage: 'analyzing',
      progress: 25,
      status: 'running',
    });

    try {
      const builtScenes: CinemaScene[] = [];
      for (let i = 0; i < fileArr.length; i++) {
        if (ctrl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const file = fileArr[i];
        const extracted = await extractVideoKeyframes(file);

        setJob({
          id: `videdit-ai-${i}`,
          label: 'تحليل وتعديل الفيديو بالذكاء',
          detail: `تطبيق التعديلات والدبلجة وتحسين الجودة للمقطع ${i + 1}/${fileArr.length}`,
          stage: 'editing',
          progress: 35 + Math.round(((i + 1) / fileArr.length) * 60),
          status: 'running',
        });

        const res = await fetch('/api/cinema/video-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({
            frames: extracted.frames,
            instruction: videoEditInstruction || 'تحسين جودة الفيديو وتنسيقه سينمائياً',
            dubLanguage: videoEditDubLang,
            dialect: videoEditDialect,
            voiceActor: videoEditVoiceActor,
            geminiMode,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'تعذر تحليل الفيديو بالذكاء الاصطناعي.');

        const a = data.analysis || {};
        builtScenes.push({
          id: `sc-vid-${Date.now()}-${i}`,
          episodeNumber: 1,
          sceneNumber: i + 1,
          title: a.sceneTitle || file.name.replace(/\.[^.]+$/, ''),
          locationDesc: a.visualSummary || 'مقطع فيديو مرفوع ومعدّل',
          visualAction: videoEditInstruction || 'تحسين الألوان والمؤثرات والدبلجة',
          uploadedVideoUrl: extracted.objectUrl,
          overlaySvg: a.overlaySvg || undefined,
          shotType: 'wide',
          cameraMotion: 'static',
          lighting: (a.lighting || 'cinematic') as CinemaScene['lighting'],
          weather: (a.weather || 'clear') as CinemaScene['weather'],
          timeOfDay: 'day',
          transition: i === 0 ? 'fade_black' : 'crossfade',
          speed: 1,
          durationSeconds: extracted.durationSec,
          trimStart: 0,
          trimEnd: extracted.durationSec,
          overlayText: a.overlayText || '',
          musicMood: project.genre,
          musicTrackEnabled: true,
          sfxType: (a.sfxType || 'none') as CinemaScene['sfxType'],
          characterIds: [],
          enhanceVideoFilter: true,
          dialogues: a.dubbingScript
            ? [
                {
                  id: `dlg-ve-${Date.now()}-${i}`,
                  characterId: 'narrator',
                  speakerName: 'الدبلجة الذكية',
                  text: a.dubbingScript,
                  dialect: videoEditDialect,
                  language: videoEditDubLang,
                  audioBase64: a.audioBase64,
                  durationSec: Math.min(extracted.durationSec, 12),
                },
              ]
            : [],
          produced: true,
        });
      }

      const nextProj: CinemaProject = {
        ...project,
        mode: 'video_edit',
        title: project.title || builtScenes[0]?.title || 'تعديل ودمج فيديو',
        introTitle: project.title || '',
        pipelineStage: 'export_ready',
        episodes: [
          {
            episodeNumber: 1,
            title: 'المقاطع المعدلة والمدمجة',
            synopsis: videoEditInstruction || 'دمج وتعديل الفيديوهات بالذكاء الاصطناعي',
            scenes: builtScenes,
          },
        ],
        activeEpisodeNumber: 1,
      };
      persistCurrentProject(nextProj);
      consumeFreeCredit(1);
      setJob({
        id: 've-done',
        label: 'تم تجهيز الفيديو المعدّل',
        detail: `تم تحليل ودمج ${builtScenes.length} مقطع بنجاح! انتقلي إلى «استوديو المونتاج» للقص والتصدير.`,
        stage: 'export_ready',
        progress: 100,
        status: 'done',
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setJob((prev) => ({ ...prev, status: 'cancelled' }));
      } else {
        setJob((prev) => ({
          ...prev,
          status: 'error',
          error: err instanceof Error ? err.message : 'تعذر معالجة الفيديو.',
        }));
      }
    } finally {
      if (vidFileRef.current) vidFileRef.current.value = '';
    }
  }

  async function regenerateCharacterPortrait(char: CinemaCharacter) {
    setJob({
      id: `char-${char.id}`,
      label: `تحديث بورتريه ${char.name}`,
      detail: 'الحفاظ على ثبات الملامح والملابس ولون الشعر…',
      stage: 'characters',
      progress: 50,
      status: 'running',
    });
    try {
      const res = await fetch('/api/cinema/character-portrait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character: char, genre: project.genre, geminiMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذر توليد البورتريه.');
      persistCurrentProject({
        ...project,
        characters: project.characters.map((c) =>
          c.id === char.id ? { ...c, avatarSvg: data.avatarSvg } : c,
        ),
      });
      setJob({
        id: `char-done`,
        label: 'تم تثبيت الشخصية',
        detail: `تم حفظ ملامح وصوت ${char.name} لجميع المشاهد والحلقات.`,
        stage: 'export_ready',
        progress: 100,
        status: 'done',
      });
    } catch (err) {
      setJob({
        id: 'char-err',
        label: 'خطأ',
        detail: 'تعذر تحديث الشخصية.',
        progress: 0,
        status: 'error',
        error: err instanceof Error ? err.message : 'خطأ',
      });
    }
  }

  async function createCustomReusableActor() {
    if (!newActorName.trim()) {
      setNotice('اكتبي اسم الممثل الافتراضي أولاً.');
      return;
    }
    const actor: CinemaCharacter = {
      id: `actor-${Date.now()}`,
      name: newActorName.trim(),
      role: newActorRole.trim() || 'بطل العمل',
      age: 'شاب',
      appearanceDesc: newActorDesc.trim() || 'ملامح عربية سينمائية معبرة',
      faceDesc: newActorDesc.trim() || 'وجه سينمائي واضح الملامح',
      outfitDesc: 'إطلالة سينمائية أنيقة متناسقة',
      hairColor: 'أسود',
      primaryColor: '#38bdf8',
      secondaryColor: '#a78bfa',
      voiceActor: newActorVoice,
      dialect: project.dialect,
      voiceName: newActorVoice === 'male' ? 'Charon' : newActorVoice === 'child' ? 'Puck' : 'Kore',
      speakingStyle: 'أداء تمثيلي متقن',
      movementStyle: 'حركة واثقة وطبيعية',
      isReusableActor: true,
    };
    setNotice('جاري تصميم الملامح الثابتة للممثل الجديد…');
    try {
      const res = await fetch('/api/cinema/character-portrait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character: actor, genre: project.genre, geminiMode }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.avatarSvg) actor.avatarSvg = d.avatarSvg;
    } catch {
      // keep actor even if portrait call skipped
    }
    saveActorToVault(actor);
    setNewActorName('');
    setNewActorDesc('');
  }

  async function shareCinemaProject(sp: CinemaProject) {
    const shareText = `🎬 ${stripHashMarks(sp.title || 'عمل ZORVYX AI CINEMA')}\n${stripHashMarks(sp.logline || '')}\nتم الإنشاء عبر ZORVYX AI — صُنع وطُوّر بواسطة Noha Ismail Fathi Abu Arab`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: sp.title || 'ZORVYX AI CINEMA', text: shareText });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setNotice('تم نسخ بطاقة العمل السينمائي للمشاركة!');
    } catch {
      setNotice('يمكنك تنزيل الفيديو أو السيناريو مباشرة لمشاركته.');
    }
  }

  const activeEp =
    project.episodes.find((e) => e.episodeNumber === project.activeEpisodeNumber) || project.episodes[0];
  const galleryProjects = savedProjects.filter((p) => p.publishedInGallery);
  const remainingFree = Math.max(0, credits.monthlyFreeAllowance - credits.freeScenesUsed);
  const filteredSavedProjects = savedProjects.filter((p) => {
    if (projectFilter === 'film') return p.mode !== 'series';
    if (projectFilter === 'series') return p.mode === 'series';
    if (projectFilter === 'done') return p.episodes.some((e) => e.scenes.some((s) => s.produced));
    if (projectFilter === 'draft') return !p.episodes.some((e) => e.scenes.some((s) => s.produced));
    return true;
  });

  const activeToolMeta = VIDEO_CREATION_TOOLS.find((t) => t.id === selectedTool) || VIDEO_CREATION_TOOLS[0];

  return (
    <div className="cinema-studio-root">
      {/* Studio Banner + Live Multi-Provider Button */}
      <div className="cinema-studio-banner">
        <div className="cinema-banner-top">
          <div>
            <div className="cinema-brand-kicker">ZORVYX AI CINEMA — المحرك السينمائي الشامل</div>
            <h3 className="cinema-main-heading">استوديو صناعة الأفلام والمسلسلات والمؤثرات البصرية بالذكاء الاصطناعي</h3>
          </div>
          <div className="cinema-credits-meta">
            <span>الرصيد المجاني: {remainingFree} / {credits.monthlyFreeAllowance}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              className="mini-btn"
              onClick={() => setShowProvidersDrawer((prev) => !prev)}
            >
              <Cpu size={13} style={{ display: 'inline', marginLeft: 4 }} />
              حالة المحركات والمزودات {showProvidersDrawer ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {/* ZORVYX INFINITY ONE-CLICK MASTER PROMPT */}
        <div className="cinema-infinity-box">
          <div className="cinema-infinity-label">
            <Sparkles size={14} color="#38bdf8" />
            <span>أمر الإنتاج الذكي التلقائي — اكتبي طلبك كاملاً وسيحلله النظام وينفذه مباشرة (فيلم ٣٠ دقيقة، مسلسل ٢٠ حلقة، رسوم متحركة، إعلان…)</span>
          </div>
          <div className="cinema-infinity-row">
            <input
              className="field cinema-infinity-input"
              value={infinityCommand}
              onChange={(e) => setInfinityCommand(e.target.value)}
              placeholder="مثال: اصنع لي مسلسل رعب من ٢٠ حلقة باللهجة العامية عن بيت مسكون، أو فيلم تاريخي ملحمي..."
            />
            <button
              type="button"
              className="primary cinema-hero-cta"
              disabled={job.status === 'running'}
              onClick={() => void runInfinityCommand()}
            >
              <Clapperboard size={16} />
              اصنع فيلمك الآن ✨
            </button>
          </div>
        </div>

        {showProvidersDrawer && providerStatus && (
          <div className="cinema-providers-drawer">
            <div className="cinema-providers-grid">
              <div className="cinema-provider-pill active">
                <CheckCircle2 size={14} /> <strong>السيناريو:</strong> {providerStatus.scriptEngine.name}
              </div>
              <div className="cinema-provider-pill active">
                <CheckCircle2 size={14} /> <strong>الصورة والحركة:</strong> {providerStatus.visualsEngine.name}
              </div>
              <div className="cinema-provider-pill active">
                <CheckCircle2 size={14} /> <strong>الصوت والدبلجة:</strong> {providerStatus.voiceEngine.name}
              </div>
              <div className="cinema-provider-pill active">
                <CheckCircle2 size={14} /> <strong>المونتاج والتصدير:</strong> {providerStatus.editorEngine.name}
              </div>
            </div>
            <div className="tiny" style={{ marginTop: 8 }}>
              واجهات السحابة الخارجية الإضافية (تعمل تلقائياً عند توفر مفاتيحها في أسرار الخادم):{' '}
              {providerStatus.optionalCloudApis
                .map((api) => `${api.label} (${api.connected ? 'متصل ✓' : 'غير مربوط حالياً'})`)
                .join(' · ')}
            </div>
          </div>
        )}
      </div>

      {/* Interrupted Draft Recovery Bar */}
      {pendingDraft && (
        <div className="cinema-draft-banner">
          <span>
            توجد مسودة عمل سابقة لم تُغلق: <strong>{stripHashMarks(pendingDraft.title || 'مشروع قيد العمل')}</strong>
          </span>
          <div className="toolrow" style={{ margin: 0 }}>
            <button
              type="button"
              className="mini-btn"
              onClick={() => {
                setProject(pendingDraft);
                setPendingDraft(null);
                setActiveTab('editor');
              }}
            >
              استعادة المسودة والمتابعة ↩
            </button>
            <button type="button" className="mini-btn danger" onClick={() => setPendingDraft(null)}>
              إخفاء
            </button>
          </div>
        </div>
      )}

      {/* Main Studio Navigation Tabs */}
      <div className="cinema-nav-strip" role="tablist" aria-label="أقسام استوديو السينما">
        {STUDIO_NAV_TABS.map((tb) => {
          const isCreationTab =
            activeTab !== 'actors' &&
            activeTab !== 'editor' &&
            activeTab !== 'projects' &&
            activeTab !== 'gallery';
          const isCurrent = tb.id === 'film' ? isCreationTab : activeTab === tb.id;
          return (
            <button
              key={tb.id}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              className={`cinema-nav-btn ${isCurrent ? 'active' : ''}`}
              onClick={() => {
                if (tb.id === 'film') selectTool(selectedTool);
                else setActiveTab(tb.id);
              }}
            >
              {tb.label}
            </button>
          );
        })}
      </div>

      {/* 7-Stage Progress Tracker & Task Manager */}
      {job.status !== 'idle' && (
        <div className={`cinema-job-box ${job.status}`}>
          <div className="cinema-job-head">
            <div>
              <strong>{job.label}</strong>
              <div className="tiny">{job.error || job.detail}</div>
            </div>
            <div className="toolrow" style={{ margin: 0 }}>
              <span className="cinema-job-pct">{job.progress}%</span>
              {job.status === 'running' && (
                <button type="button" className="mini-btn danger" onClick={cancelActiveJob}>
                  <XCircle size={13} style={{ display: 'inline', marginLeft: 4 }} />
                  إلغاء العملية
                </button>
              )}
              {(job.status === 'error' || job.status === 'cancelled') && lastRetryAction && (
                <button type="button" className="mini-btn" onClick={() => void lastRetryAction()}>
                  <RefreshCw size={13} style={{ display: 'inline', marginLeft: 4 }} />
                  إعادة المحاولة
                </button>
              )}
            </div>
          </div>
          <div className="cinema-progress-track">
            <div className="cinema-progress-fill" style={{ width: `${job.progress}%` }} />
          </div>
          {job.stage && job.stage !== 'idle' && (
            <div className="wb-meta-line" style={{ marginTop: 8 }}>
              {PIPELINE_STEPS.map((st, idx) => {
                const currentIdx = PIPELINE_STEPS.findIndex((x) => x.id === job.stage);
                const isDone = job.status === 'done' || idx < currentIdx;
                const isCurrent = !isDone && idx === currentIdx;
                return (
                  <span
                    key={st.id}
                    style={{
                      color: isDone
                        ? studioTheme === 'day'
                          ? '#059669'
                          : '#6ee7b7'
                        : isCurrent
                          ? studioTheme === 'day'
                            ? '#0284c7'
                            : '#38bdf8'
                          : 'var(--wb-muted)',
                      fontWeight: isCurrent || isDone ? 700 : 500,
                    }}
                  >
                    {idx > 0 ? ' · ' : ''}
                    {isDone ? `✓ ${st.label}` : st.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {notice && <div className="statusbox info">{notice}</div>}

      {/* ================= CREATION WORKSPACE (14 VIDEO CREATION TOOLS) ================= */}
      {activeTab !== 'actors' &&
        activeTab !== 'editor' &&
        activeTab !== 'projects' &&
        activeTab !== 'gallery' && (
          <div className="cinema-workspace-section">
            {/* 14-Tool Selector Strip */}
            <div className="cinema-tools-strip" role="group" aria-label="أدوات صناعة الفيديو والسينما">
              {VIDEO_CREATION_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className={`cinema-tool-pill ${selectedTool === tool.id ? 'active' : ''}`}
                  onClick={() => selectTool(tool.id)}
                >
                  <span className="cinema-tool-name">{tool.label}</span>
                  <span className="cinema-tool-badge">{tool.badge}</span>
                </button>
              ))}
            </div>
            <div className="tiny" style={{ color: studioTheme === 'day' ? '#0284c7' : '#67e8f9' }}>
              <Activity size={13} style={{ display: 'inline', marginLeft: 5 }} />
              الأداة النشطة: <strong>{activeToolMeta.label}</strong> — {activeToolMeta.desc}
            </div>

            {/* TOOL BRANCH A: IMAGE TO VIDEO */}
            {selectedTool === 'image_to_video' && (
              <>
                <div className="cinema-upload-box">
                  <input
                    ref={imgFileRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = await fileToResizedDataUrl(file, 768);
                      setImageUploadUrl(url);
                      if (imgFileRef.current) imgFileRef.current.value = '';
                    }}
                  />
                  <div className="cinema-col-head">
                    <div>
                      <strong>رفع صورة وتحويلها إلى فيديو متحرك وناطق مع حفظ الهوية</strong>
                      <div className="tiny">تتحرك الخلفية والوجه والعيون مع مزامنة الكلام والحفاظ على ملامح الصورة الأصلية.</div>
                    </div>
                    <button type="button" className="secondary" onClick={() => imgFileRef.current?.click()}>
                      <Upload size={15} />
                      {imageUploadUrl ? 'تغيير الصورة' : 'رفع صورة من الجهاز'}
                    </button>
                  </div>
                  {imageUploadUrl && (
                    <img src={imageUploadUrl} alt="الصورة المرفوعة للتحريك" className="lens-preview-img" style={{ maxHeight: 220, marginTop: 10 }} />
                  )}
                </div>

                <div className="cinema-fields-3" style={{ marginTop: 4 }}>
                  <div>
                    <label className="mini-label">نوع الصوت للشخصية</label>
                    <select className="field" value={imageVoiceActor} onChange={(e) => setImageVoiceActor(e.target.value as CinemaVoiceActor)}>
                      <option value="female">صوت امرأة طبيعي</option>
                      <option value="male">صوت رجل طبيعي</option>
                      <option value="child">صوت طفل</option>
                    </select>
                  </div>
                  <div>
                    <label className="mini-label">اللهجة أو اللغة</label>
                    <select className="field" value={project.dialect} onChange={(e) => setProject({ ...project, dialect: e.target.value as CinemaDialect })}>
                      {DIALECT_OPTIONS.map((dl) => (
                        <option key={dl.value} value={dl.value}>{dl.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mini-label">المدة المطلوبة (ثواني)</label>
                    <input
                      type="number"
                      min={4}
                      max={60}
                      className="field"
                      value={defaultDurationSec}
                      onChange={(e) => setDefaultDurationSec(Math.min(60, Math.max(4, Number(e.target.value) || 8)))}
                    />
                  </div>
                </div>

                <label className="mini-label">ماذا تقول الشخصية في الصورة؟ (الكلام المنطوق بمزامنة الشفاه)</label>
                <textarea
                  className="field"
                  style={{ minHeight: 70 }}
                  value={imageSpeechText}
                  onChange={(e) => setImageSpeechText(e.target.value)}
                  placeholder="اكتبي الحوار أو النص الذي تنطقه الشخصية في الفيديو..."
                />

                <label className="mini-label">وصف الحركة والأجواء المطلوبة</label>
                <input
                  className="field"
                  value={project.storyPrompt}
                  onChange={(e) => setProject({ ...project, storyPrompt: e.target.value })}
                  placeholder="مثال: تقريب سينمائي ناعم مع نسيم خفيف وإضاءة ذهبية دافئة"
                />

                <div className="toolrow">
                  <button type="button" className="primary" disabled={job.status === 'running'} onClick={() => void runImageToVideo()}>
                    <ImageIcon size={16} />
                    تحويل الصورة إلى فيديو متحرك وناطق ✨
                  </button>
                  <button type="button" className="secondary" onClick={() => setActiveTab('editor')}>
                    تعديل في استوديو المونتاج
                  </button>
                </div>

                <CinemaPlayerExporter project={project} episodeNumber={1} />
              </>
            )}

            {/* TOOL BRANCH B: VIDEO TO VIDEO & EDITING */}
            {selectedTool === 'video_edit' && (
              <>
                <div className="cinema-upload-box">
                  <input
                    ref={vidFileRef}
                    type="file"
                    accept="video/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => void handleVideoUploadAndAnalyze(e.target.files)}
                  />
                  <div className="cinema-col-head">
                    <div>
                      <strong>رفع فيديو أو عدة مقاطع لتعديلها ودمجها وتغيير أجوائها بالذكاء</strong>
                      <div className="tiny">تعديل الإضاءة، تحسين الجودة، الدبلجة التلقائية لأي لهجة، ودمج المقاطع بالترتيب.</div>
                    </div>
                    <button type="button" className="primary" disabled={job.status === 'running'} onClick={() => vidFileRef.current?.click()}>
                      <Video size={16} />
                      اختيار فيديو / عدة مقاطع للدمج والتعديل
                    </button>
                  </div>
                </div>

                <div className="cinema-fields-3">
                  <div>
                    <label className="mini-label">لغة الدبلجة والترجمة التلقائية</label>
                    <select className="field" value={videoEditDubLang} onChange={(e) => setVideoEditDubLang(e.target.value)}>
                      {LANGUAGE_OPTIONS.map((lg) => (
                        <option key={lg} value={lg}>{lg}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mini-label">اللهجة / الأسلوب الصوتي</label>
                    <select className="field" value={videoEditDialect} onChange={(e) => setVideoEditDialect(e.target.value as CinemaDialect)}>
                      {DIALECT_OPTIONS.map((dl) => (
                        <option key={dl.value} value={dl.value}>{dl.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mini-label">نوع صوت الدبلجة</label>
                    <select className="field" value={videoEditVoiceActor} onChange={(e) => setVideoEditVoiceActor(e.target.value as CinemaVoiceActor)}>
                      <option value="female">امرأة</option>
                      <option value="male">رجل</option>
                      <option value="child">طفل</option>
                    </select>
                  </div>
                </div>

                <label className="mini-label">التعديل المطلوب على الفيديو</label>
                <textarea
                  className="field"
                  style={{ minHeight: 74 }}
                  value={videoEditInstruction}
                  onChange={(e) => setVideoEditInstruction(e.target.value)}
                  placeholder="مثال: أضف أجواء أمطار ليلية سينمائية وحسّن الألوان، ودبلج المحتوى إلى العامية مع ترجمة سفلية..."
                />

                <CinemaPlayerExporter project={project} episodeNumber={1} />
              </>
            )}

            {/* TOOL BRANCH C: AUDIO TO VIDEO */}
            {selectedTool === 'audio_to_video' && (
              <>
                <div className="cinema-upload-box">
                  <input
                    ref={audioFileRef}
                    type="file"
                    accept="audio/*"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const b64 = await blobToBase64Raw(f);
                      setAudioBase64Input(b64);
                      setAudioMimeInput(f.type || 'audio/mp3');
                      setNotice(`تم تحميل الملف الصوتي «${f.name}» بنجاح!`);
                      if (audioFileRef.current) audioFileRef.current.value = '';
                    }}
                  />
                  <div className="cinema-col-head">
                    <div>
                      <strong>تحويل الصوت أو التسجيل المباشر إلى فيديو متزامن</strong>
                      <div className="tiny">ارفعي أغنية أو تسجيل بودكاست أو سجّلي صوتك بالميكروفون وسيحلله المحرك الذكي ليصنع مشهداً متزامناً معه.</div>
                    </div>
                    <div className="toolrow" style={{ margin: 0 }}>
                      <button
                        type="button"
                        className={isRecordingMic ? 'mini-btn danger' : 'secondary'}
                        onClick={() => void toggleAudioRecorder()}
                      >
                        {isRecordingMic ? <Square size={14} /> : <Mic size={14} />}
                        {isRecordingMic ? 'إيقاف التسجيل ⏹' : 'تسجيل صوت بالميكروفون 🎤'}
                      </button>
                      <button type="button" className="secondary" onClick={() => audioFileRef.current?.click()}>
                        <AudioLines size={14} />
                        رفع ملف صوتي
                      </button>
                    </div>
                  </div>
                  {audioBase64Input && (
                    <div className="tiny" style={{ color: studioTheme === 'day' ? '#059669' : '#6ee7b7', marginTop: 8 }}>
                      ✓ المقطع الصوتي جاهز للمعالجة
                    </div>
                  )}
                </div>

                <div className="cinema-fields-2">
                  <div>
                    <label className="mini-label">الأسلوب البصري للمشاهد المولّدة</label>
                    <input
                      className="field"
                      value={audioVisualStyle}
                      onChange={(e) => setAudioVisualStyle(e.target.value)}
                      placeholder="مثال: مدينة مطيرة بأضواء نيون، أو غابة سحرية ذهبية"
                    />
                  </div>
                  <div>
                    <label className="mini-label">النمط</label>
                    <select className="field" value={project.genre} onChange={(e) => setProject({ ...project, genre: e.target.value as CinemaGenre })}>
                      {CINEMA_GENRES.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="toolrow">
                  <button
                    type="button"
                    className="primary"
                    disabled={job.status === 'running' || !audioBase64Input}
                    onClick={() => void handleAudioToVideoRun()}
                  >
                    <AudioLines size={16} />
                    توليد الفيديو المتزامن مع الصوت ✨
                  </button>
                  <button type="button" className="secondary" onClick={() => setActiveTab('editor')}>
                    فتح في استوديو المونتاج
                  </button>
                </div>

                <CinemaPlayerExporter project={project} episodeNumber={1} />
              </>
            )}

            {/* TOOL BRANCH D: ALL CINEMA / SERIES / STORY / SCRIPT / ANIMATION / TRAILER / DOC / AD / MUSIC VIDEO */}
            {selectedTool !== 'image_to_video' &&
              selectedTool !== 'video_edit' &&
              selectedTool !== 'audio_to_video' && (
                <>
                  <div className="cinema-fields-3">
                    <div>
                      <label className="mini-label">
                        {selectedTool === 'series' ? 'اسم المسلسل' : selectedTool === 'ad_video' ? 'اسم المنتج أو العلامة' : 'اسم الفيلم / العمل'}
                      </label>
                      <input
                        className="field"
                        value={project.title}
                        placeholder={selectedTool === 'series' ? 'مثال: صدى البيت المهجور' : 'مثال: عودة النور'}
                        onChange={(e) => setProject({ ...project, title: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="mini-label">النوع والتصنيف</label>
                      <select
                        className="field"
                        value={project.genre}
                        onChange={(e) => setProject({ ...project, genre: e.target.value as CinemaGenre })}
                      >
                        {CINEMA_GENRES.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mini-label">اللغة واللهجة الصوتية</label>
                      <select
                        className="field"
                        value={project.dialect}
                        onChange={(e) => setProject({ ...project, dialect: e.target.value as CinemaDialect })}
                      >
                        {DIALECT_OPTIONS.map((dl) => (
                          <option key={dl.value} value={dl.value}>{dl.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="cinema-fields-3">
                    {selectedTool === 'series' && (
                      <div>
                        <label className="mini-label">عدد الحلقات (حتى 20 حلقة)</label>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          className="field"
                          value={episodeCountInput}
                          onChange={(e) => setEpisodeCountInput(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                        />
                      </div>
                    )}
                    {selectedTool !== 'scene' && (
                      <div>
                        <label className="mini-label">
                          {selectedTool === 'series' ? 'المشاهد في كل حلقة' : 'عدد المشاهد المتسلسلة'}
                        </label>
                        <input
                          type="number"
                          min={2}
                          max={8}
                          className="field"
                          value={scenesPerEpInput}
                          onChange={(e) => setScenesPerEpInput(Math.min(8, Math.max(2, Number(e.target.value) || 4)))}
                        />
                      </div>
                    )}
                    <div>
                      <label className="mini-label">أبعاد التصوير وجودة التصدير</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <select
                          className="field"
                          value={project.aspectRatio}
                          onChange={(e) => setProject({ ...project, aspectRatio: e.target.value as CinemaAspectRatio })}
                        >
                          <option value="16:9">شاشة عريضة سينمائية</option>
                          <option value="9:16">شاشة طولية للجوال</option>
                          <option value="1:1">شاشة مربعة</option>
                        </select>
                        <select
                          className="field"
                          value={project.quality}
                          onChange={(e) => setProject({ ...project, quality: e.target.value as CinemaExportQuality })}
                        >
                          <option value="720p">جودة عالية قياسية</option>
                          <option value="1080p">جودة كاملة فائقة</option>
                          <option value="2k">جودة سينمائية مضاعفة</option>
                          <option value="4k">جودة فائقة الوضوح</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="mini-label">مدة المشهد الافتراضية (ثواني)</label>
                      <input
                        type="number"
                        min={5}
                        max={60}
                        className="field"
                        value={defaultDurationSec}
                        onChange={(e) => setDefaultDurationSec(Math.min(60, Math.max(5, Number(e.target.value) || 8)))}
                      />
                    </div>
                  </div>

                  {savedActors.length > 0 && (
                    <div className="cinema-actor-select-strip">
                      <span className="tiny">إشراك أبطال من خزنة «شخصياتي»:</span>
                      {savedActors.map((act) => {
                        const active = selectedActorIds.includes(act.id);
                        return (
                          <button
                            key={act.id}
                            type="button"
                            className={`mini-btn ${active ? 'active-chip' : ''}`}
                            onClick={() =>
                              setSelectedActorIds((prev) =>
                                prev.includes(act.id) ? prev.filter((x) => x !== act.id) : [...prev, act.id],
                              )
                            }
                          >
                            {active ? '✓ ' : '+ '}
                            {act.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedTool === 'series' && (
                    <div>
                      <label className="mini-label">ذاكرة الأحداث والاستمرارية (للحلقات المتتالية)</label>
                      <input
                        className="field"
                        value={project.continuityMemory || ''}
                        onChange={(e) => setProject({ ...project, continuityMemory: e.target.value })}
                        placeholder="ملخص الأحداث السابقة أو القوانين الثابتة للقصة التي يجب تذكرها في جميع الحلقات..."
                      />
                    </div>
                  )}

                  <label className="mini-label">
                    {selectedTool === 'script_to_film'
                      ? 'الصق السيناريو والحوار هنا وسيخرجه الذكاء مباشرة'
                      : selectedTool === 'story_to_movie'
                        ? 'اكتب الرواية أو القصة الطويلة لتحويلها إلى فيلم كامل'
                        : 'فكرة القصة أو الوصف التفصيلي للعمل'}
                  </label>
                  <textarea
                    className="field"
                    style={{ minHeight: 108 }}
                    value={project.storyPrompt}
                    onChange={(e) => setProject({ ...project, storyPrompt: e.target.value })}
                    placeholder="اكتبي القصة أو الحوار أو المشاهد المطلوبة بالتفصيل..."
                  />

                  <div className="toolrow">
                    <button
                      type="button"
                      className="primary"
                      disabled={job.status === 'running'}
                      onClick={() => void produceFullPlanAndScenes()}
                    >
                      <Sparkles size={16} />
                      {selectedTool === 'series'
                        ? `تأليف المسلسل (${episodeCountInput} حلقة) وإنتاج الحلقة 1 ✨`
                        : 'تنفيذ وإخراج العمل كاملاً (سيناريو + شخصيات + أصوات) ✨'}
                    </button>

                    <button type="button" className="secondary" onClick={() => persistCurrentProject(project)}>
                      <Save size={15} />
                      حفظ المشروع
                    </button>

                    <button type="button" className="secondary" onClick={() => persistCurrentProject(project, true)}>
                      نشر في المعرض
                    </button>

                    <button type="button" className="secondary" onClick={() => setActiveTab('editor')}>
                      <Scissors size={15} />
                      فتح في المونتاج
                    </button>
                  </div>

                  {/* Series Episodes Panel (up to 20 episodes) */}
                  {project.episodes.length > 1 && (
                    <div className="cinema-episodes-panel">
                      <div className="cinema-col-head">
                        <strong>
                          <Tv size={15} style={{ display: 'inline', marginLeft: 6 }} />
                          حلقات المسلسل ({project.episodes.length} حلقة) — الموسم {project.seasonNumber || 1}
                        </strong>
                        <span className="tiny">نفس الشخصيات وذاكرة الأحداث عبر كل الحلقات</span>
                      </div>
                      <div className="cinema-ep-grid">
                        {project.episodes.map((ep) => {
                          const isActive = ep.episodeNumber === (activeEp?.episodeNumber || 1);
                          const allProduced = ep.scenes.length > 0 && ep.scenes.every((s) => s.produced);
                          return (
                            <div key={ep.episodeNumber} className={`cinema-ep-card ${isActive ? 'active' : ''}`}>
                              <button
                                type="button"
                                className="cinema-ep-select"
                                onClick={() => setProject({ ...project, activeEpisodeNumber: ep.episodeNumber })}
                              >
                                <div className="cinema-ep-num">الحلقة {ep.episodeNumber}</div>
                                <div className="cinema-ep-title">{ep.title}</div>
                                <div className="tiny">{ep.scenes.length} مشاهد · {allProduced ? 'جاهزة ✓' : 'سيناريو جاهز'}</div>
                              </button>
                              {!allProduced && (
                                <button
                                  type="button"
                                  className="mini-btn"
                                  disabled={job.status === 'running'}
                                  onClick={() => void produceEpisodeByNumber(ep.episodeNumber)}
                                >
                                  إنتاج الحلقة الآن ✨
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Full Character DNA Consistency Bible */}
                  {project.characters.length > 0 && (
                    <div className="cinema-cast-section">
                      <div className="cinema-col-head">
                        <strong>
                          <UserCheck size={15} style={{ display: 'inline', marginLeft: 6 }} />
                          بصمة الشخصيات الثابتة (متطابقة في كل الحلقات)
                        </strong>
                        <input
                          ref={charFileRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const files = e.target.files;
                            if (!files || !files[0] || !charUploadTargetId) return;
                            const url = await fileToResizedDataUrl(files[0], 512);
                            persistCurrentProject({
                              ...project,
                              characters: project.characters.map((c) =>
                                c.id === charUploadTargetId ? { ...c, uploadedImageUrl: url } : c,
                              ),
                            });
                            if (charFileRef.current) charFileRef.current.value = '';
                          }}
                        />
                      </div>

                      <div className="cinema-cast-grid">
                        {project.characters.map((ch) => (
                          <div key={ch.id} className="cinema-cast-card">
                            <div className="cinema-cast-avatar">
                              {ch.uploadedImageUrl ? (
                                <img src={ch.uploadedImageUrl} alt={ch.name} />
                              ) : ch.avatarSvg ? (
                                <div dangerouslySetInnerHTML={{ __html: sanitizeSvgClient(ch.avatarSvg) }} />
                              ) : (
                                <div className="cinema-avatar-fallback">{ch.name.slice(0, 2)}</div>
                              )}
                            </div>
                            <div className="cinema-cast-body">
                              <input
                                className="field cinema-inline-title"
                                value={ch.name}
                                onChange={(e) =>
                                  setProject({
                                    ...project,
                                    characters: project.characters.map((c) =>
                                      c.id === ch.id ? { ...c, name: e.target.value } : c,
                                    ),
                                  })
                                }
                              />
                              <div className="tiny">{ch.role} · {ch.age} · الشعر: {ch.hairColor}</div>
                              <div className="tiny">الملامح: {ch.faceDesc || ch.appearanceDesc}</div>
                              <div className="tiny">الملابس: {ch.outfitDesc}</div>
                              {ch.movementStyle && <div className="tiny">الحركة: {ch.movementStyle}</div>}
                              <div className="cinema-fields-2" style={{ marginTop: 6 }}>
                                <select
                                  className="field"
                                  style={{ marginBottom: 0, fontSize: 12, minHeight: 34 }}
                                  value={ch.voiceActor}
                                  onChange={(e) =>
                                    setProject({
                                      ...project,
                                      characters: project.characters.map((c) =>
                                        c.id === ch.id ? { ...c, voiceActor: e.target.value as CinemaVoiceActor } : c,
                                      ),
                                    })
                                  }
                                >
                                  <option value="female">صوت امرأة</option>
                                  <option value="male">صوت رجل</option>
                                  <option value="child">صوت طفل</option>
                                </select>
                                <select
                                  className="field"
                                  style={{ marginBottom: 0, fontSize: 12, minHeight: 34 }}
                                  value={ch.dialect}
                                  onChange={(e) =>
                                    setProject({
                                      ...project,
                                      characters: project.characters.map((c) =>
                                        c.id === ch.id ? { ...c, dialect: e.target.value as CinemaDialect } : c,
                                      ),
                                    })
                                  }
                                >
                                  {DIALECT_OPTIONS.map((dl) => (
                                    <option key={dl.value} value={dl.value}>{dl.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="toolrow" style={{ margin: '6px 0 0' }}>
                                <button type="button" className="mini-btn" onClick={() => void regenerateCharacterPortrait(ch)}>
                                  تحديث الرسم
                                </button>
                                <button
                                  type="button"
                                  className="mini-btn"
                                  onClick={() => {
                                    setCharUploadTargetId(ch.id);
                                    charFileRef.current?.click();
                                  }}
                                >
                                  صورة حقيقية
                                </button>
                                <button type="button" className="mini-btn" onClick={() => saveActorToVault(ch)}>
                                  حفظ في شخصياتي ★
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <CinemaPlayerExporter project={project} episodeNumber={activeEp?.episodeNumber} />
                </>
              )}
          </div>
        )}

      {/* ================= REUSABLE VIRTUAL ACTORS VAULT ================= */}
      {activeTab === 'actors' && (
        <div className="cinema-workspace-section">
          <div className="cinema-col-head">
            <strong>
              <Users size={16} style={{ display: 'inline', marginLeft: 6 }} />
              خزنة الممثلين الافتراضيين الثابتين ({savedActors.length})
            </strong>
            <span className="tiny">أنشئي أبطالكِ هنا لاستخدام نفس الملامح والصوت في أي فيلم أو مسلسل جديد!</span>
          </div>

          <div className="cinema-upload-box">
            <div className="cinema-fields-3">
              <div>
                <label className="mini-label">اسم الممثل / البطلة</label>
                <input className="field" value={newActorName} onChange={(e) => setNewActorName(e.target.value)} placeholder="مثال: سيف الدين" />
              </div>
              <div>
                <label className="mini-label">الدور الافتراضي</label>
                <input className="field" value={newActorRole} onChange={(e) => setNewActorRole(e.target.value)} placeholder="محقق / مغامر / بطلة" />
              </div>
              <div>
                <label className="mini-label">طبقة الصوت</label>
                <select className="field" value={newActorVoice} onChange={(e) => setNewActorVoice(e.target.value as CinemaVoiceActor)}>
                  <option value="female">صوت امرأة</option>
                  <option value="male">صوت رجل</option>
                  <option value="child">صوت طفل</option>
                </select>
              </div>
            </div>
            <label className="mini-label">وصف الملامح والملابس والشخصية</label>
            <input
              className="field"
              value={newActorDesc}
              onChange={(e) => setNewActorDesc(e.target.value)}
              placeholder="مثال: شاب في الثلاثينات بعيون حادة ومعطف جلدي داكن ونبرة واثقة"
            />
            <button type="button" className="primary" onClick={() => void createCustomReusableActor()}>
              <Plus size={15} />
              إنشاء وحفظ الممثل في الخزنة ✨
            </button>
          </div>

          {savedActors.length === 0 ? (
            <div className="statusbox">
              خزنة الشخصيات فارغة حالياً — أضيفي ممثلاً أعلاه أو اضغطي «حفظ في شخصياتي ★» على أي بطل بعد توليد فيلمك.
            </div>
          ) : (
            <div className="cinema-cast-grid">
              {savedActors.map((act) => (
                <div key={act.id} className="cinema-cast-card">
                  <div className="cinema-cast-avatar">
                    {act.uploadedImageUrl ? (
                      <img src={act.uploadedImageUrl} alt={act.name} />
                    ) : act.avatarSvg ? (
                      <div dangerouslySetInnerHTML={{ __html: sanitizeSvgClient(act.avatarSvg) }} />
                    ) : (
                      <div className="cinema-avatar-fallback">{act.name.slice(0, 2)}</div>
                    )}
                  </div>
                  <div className="cinema-cast-body">
                    <strong>{act.name}</strong>
                    <div className="tiny">{act.role} · {act.voiceActor === 'male' ? 'رجل' : act.voiceActor === 'child' ? 'طفل' : 'امرأة'}</div>
                    <div className="tiny">{act.appearanceDesc}</div>
                    <div className="toolrow" style={{ margin: '8px 0 0' }}>
                      <button
                        type="button"
                        className="mini-btn"
                        onClick={() => {
                          setSelectedActorIds((prev) => (prev.includes(act.id) ? prev : [...prev, act.id]));
                          setActiveTab('film');
                          setNotice(`تم تحديد «${act.name}» للمشاركة في العمل القادم!`);
                        }}
                      >
                        استخدام في العمل القادم ✓
                      </button>
                      <button
                        type="button"
                        className="mini-btn danger"
                        onClick={() => {
                          const next = savedActors.filter((x) => x.id !== act.id);
                          setSavedActors(next);
                          saveActorsList(next);
                        }}
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= PRO VIDEO TIMELINE EDITOR ================= */}
      {activeTab === 'editor' && (
        <CinemaTimelineEditor
          project={project}
          onChange={setProject}
          onProduceSingleScene={(epNum, scId) => void produceSingleScene(epNum, scId)}
          busy={job.status === 'running'}
          geminiMode={geminiMode}
        />
      )}

      {/* ================= MY PROJECTS HUB (FILTERS + SHARE + RESUME) ================= */}
      {activeTab === 'projects' && (
        <div className="cinema-workspace-section">
          <div className="cinema-col-head" style={{ marginBottom: 8 }}>
            <strong>
              <FolderOpen size={16} style={{ display: 'inline', marginLeft: 6 }} />
              مشاريعي المحفوظة ({savedProjects.length})
            </strong>
            <div className="toolrow" style={{ margin: 0 }}>
              <button type="button" className="primary" onClick={() => persistCurrentProject(project)}>
                <Save size={15} />
                حفظ المشروع المفتوح
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setProject(createEmptyCinemaProject('film'));
                  selectTool('film');
                }}
              >
                <Plus size={15} />
                مشروع جديد
              </button>
            </div>
          </div>

          <div className="toolrow" style={{ margin: '0 0 8px' }}>
            {(
              [
                ['all', 'الكل'],
                ['film', 'أفلامي ومقاطعي'],
                ['series', 'مسلسلاتي'],
                ['done', 'المكتملة'],
                ['draft', 'مسوداتي'],
              ] as const
            ).map(([fk, fl]) => (
              <button
                key={fk}
                type="button"
                className={`mini-btn ${projectFilter === fk ? 'active-chip' : ''}`}
                onClick={() => setProjectFilter(fk)}
              >
                {fl}
              </button>
            ))}
          </div>

          {filteredSavedProjects.length === 0 ? (
            <div className="statusbox">
              لا توجد مشاريع في هذا التصنيف حالياً.
            </div>
          ) : (
            <div className="cinema-projects-grid">
              {filteredSavedProjects.map((sp) => (
                <div key={sp.id} className="cinema-project-card">
                  <div className="cinema-project-title">{stripHashMarks(sp.title || 'مشروع بدون عنوان')}</div>
                  <div className="tiny">
                    {sp.genre} · {sp.episodes.length} حلقة · {getQualityArabicLabel(sp.quality)} · {getAspectArabicLabel(sp.aspectRatio)}
                  </div>
                  <div className="tiny" style={{ marginTop: 4 }}>
                    {stripHashMarks(sp.logline || sp.storyPrompt || '').slice(0, 90)}
                  </div>
                  <div className="toolrow" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => {
                        setProject(sp);
                        setActiveTab('editor');
                      }}
                    >
                      <Play size={12} style={{ display: 'inline', marginLeft: 4 }} />
                      فتح ومونتاج
                    </button>
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => void shareCinemaProject(sp)}
                    >
                      <Share2 size={12} style={{ display: 'inline', marginLeft: 4 }} />
                      مشاركة
                    </button>
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => persistCurrentProject(sp, !sp.publishedInGallery)}
                    >
                      {sp.publishedInGallery ? 'إزالة من المعرض' : 'نشر في المعرض'}
                    </button>
                    <button
                      type="button"
                      className="mini-btn danger"
                      onClick={() => {
                        const filtered = savedProjects.filter((p) => p.id !== sp.id);
                        setSavedProjects(filtered);
                        saveCinemaProjectsList(filtered);
                      }}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= SHOWCASE GALLERY ================= */}
      {activeTab === 'gallery' && (
        <div className="cinema-workspace-section">
          <div className="cinema-col-head" style={{ marginBottom: 12 }}>
            <strong>
              <Layers size={16} style={{ display: 'inline', marginLeft: 6 }} />
              معرض أعمالي السينمائية ({galleryProjects.length})
            </strong>
            <button type="button" className="primary" onClick={() => persistCurrentProject(project, true)}>
              <Clapperboard size={15} />
              نشر العمل الحالي في المعرض
            </button>
          </div>

          {galleryProjects.length === 0 ? (
            <div className="statusbox">
              معرض أعمالك فارغ حالياً — اضغطي «نشر العمل الحالي في المعرض» بعد إنتاج فيلمك أو مسلسلك ليظهر هنا للمشاهدة السريعة.
            </div>
          ) : (
            <div className="cinema-projects-grid">
              {galleryProjects.map((gp) => (
                <div key={gp.id} className="cinema-project-card">
                  <div className="cinema-project-title">{stripHashMarks(gp.title || 'عمل منشور')}</div>
                  <div className="tiny">
                    {gp.genre} · {gp.episodes.reduce((sum, e) => sum + e.scenes.length, 0)} مشاهد · {getQualityArabicLabel(gp.quality)}
                  </div>
                  <div className="tiny" style={{ marginTop: 6 }}>
                    الشخصيات: {gp.characters.map((c) => c.name).join('، ') || 'متنوعة'}
                  </div>
                  <div className="toolrow" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="primary"
                      style={{ padding: '7px 14px', fontSize: 12 }}
                      onClick={() => {
                        setProject(gp);
                        setActiveTab('editor');
                      }}
                    >
                      <Film size={13} />
                      مشاهدة وتصدير العمل
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="cinema-copyright-bar">
        ZORVYX AI — صُنع وطُوّر بواسطة Noha Ismail Fathi Abu Arab
      </div>
    </div>
  );
}
