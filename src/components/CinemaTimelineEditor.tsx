import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CopyPlus,
  Plus,
  Scissors,
  Sliders,
  Trash2,
  Volume2,
} from 'lucide-react';
import type {
  CinemaAspectRatio,
  CinemaDialect,
  CinemaExportQuality,
  CinemaProject,
  CinemaScene,
} from '../types/cinema';
import {
  CAMERA_MOTION_OPTIONS,
  DIALECT_OPTIONS,
  LANGUAGE_OPTIONS,
  LIGHTING_OPTIONS,
  SFX_OPTIONS,
  SHOT_TYPE_OPTIONS,
  TIME_OPTIONS,
  TRANSITION_OPTIONS,
  VFX_OVERLAY_OPTIONS,
  WEATHER_OPTIONS,
} from '../types/cinema';
import { CinemaPlayerExporter } from './CinemaPlayerExporter';

interface Props {
  project: CinemaProject;
  onChange: (next: CinemaProject) => void;
  onProduceSingleScene: (episodeNumber: number, sceneId: string) => void;
  busy: boolean;
  geminiMode?: 'fast' | 'balanced' | 'pro';
}

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

function getSpeedArabicLabel(speed?: number): string {
  if (!speed || speed === 1) return 'سرعة طبيعية';
  if (speed <= 0.5) return 'بطيء جداً';
  if (speed < 1) return 'بطيء هادئ';
  if (speed >= 2) return 'سريع مضاعف';
  return 'سريع';
}

export function CinemaTimelineEditor({
  project,
  onChange,
  onProduceSingleScene,
  busy,
  geminiMode = 'balanced',
}: Props) {
  const activeEp =
    project.episodes.find((e) => e.episodeNumber === project.activeEpisodeNumber) || project.episodes[0];
  const scenes = activeEp?.scenes || [];
  const [selectedSceneId, setSelectedSceneId] = useState<string>(scenes[0]?.id || '');
  const [dubbingLineId, setDubbingLineId] = useState<string | null>(null);
  const [editorMsg, setEditorMsg] = useState('');

  const selectedScene = scenes.find((s) => s.id === selectedSceneId) || scenes[0];

  function updateEpisodeScenes(updater: (prev: CinemaScene[]) => CinemaScene[]) {
    const epNum = activeEp?.episodeNumber || 1;
    onChange({
      ...project,
      updatedAt: Date.now(),
      episodes: project.episodes.map((ep) =>
        ep.episodeNumber === epNum ? { ...ep, scenes: updater(ep.scenes) } : ep,
      ),
    });
  }

  function patchSelectedScene(patch: Partial<CinemaScene>) {
    if (!selectedScene) return;
    updateEpisodeScenes((prev) =>
      prev.map((sc) => (sc.id === selectedScene.id ? { ...sc, ...patch } : sc)),
    );
  }

  function moveScene(idx: number, delta: number) {
    const target = idx + delta;
    if (target < 0 || target >= scenes.length) return;
    updateEpisodeScenes((prev) => {
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      return next.map((sc, i) => ({ ...sc, sceneNumber: i + 1 }));
    });
  }

  function splitSelectedScene() {
    if (!selectedScene) return;
    const mid = Number((selectedScene.durationSeconds / 2).toFixed(1));
    if (mid < 1.5) {
      setEditorMsg('مدة المشهد قصيرة جداً للقسمة (الحد الأدنى 3 ثوانٍ).');
      return;
    }
    const halfDialogues = Math.ceil(selectedScene.dialogues.length / 2);
    const part1: CinemaScene = {
      ...selectedScene,
      durationSeconds: mid,
      trimEnd: mid,
      dialogues: selectedScene.dialogues.slice(0, halfDialogues),
    };
    const part2: CinemaScene = {
      ...selectedScene,
      id: `${selectedScene.id}-split-${Date.now()}`,
      title: `${selectedScene.title} (الجزء 2)`,
      durationSeconds: Number((selectedScene.durationSeconds - mid).toFixed(1)),
      trimStart: 0,
      trimEnd: Number((selectedScene.durationSeconds - mid).toFixed(1)),
      dialogues: selectedScene.dialogues.slice(halfDialogues),
    };
    const idx = scenes.findIndex((s) => s.id === selectedScene.id);
    updateEpisodeScenes((prev) => {
      const next = [...prev];
      next.splice(idx, 1, part1, part2);
      return next.map((sc, i) => ({ ...sc, sceneNumber: i + 1 }));
    });
    setSelectedSceneId(part1.id);
    setEditorMsg('تم تقسيم المشهد إلى جزأين متسلسلين.');
  }

  function duplicateSelectedScene() {
    if (!selectedScene) return;
    const copy: CinemaScene = {
      ...selectedScene,
      id: `${selectedScene.id}-copy-${Date.now()}`,
      title: `${selectedScene.title} (نسخة)`,
    };
    const idx = scenes.findIndex((s) => s.id === selectedScene.id);
    updateEpisodeScenes((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next.map((sc, i) => ({ ...sc, sceneNumber: i + 1 }));
    });
    setSelectedSceneId(copy.id);
  }

  function deleteSelectedScene() {
    if (!selectedScene || scenes.length <= 1) {
      setEditorMsg('يجب بقاء مشهد واحد على الأقل داخل الحلقة.');
      return;
    }
    const remaining = scenes.filter((s) => s.id !== selectedScene.id);
    updateEpisodeScenes(() => remaining.map((sc, i) => ({ ...sc, sceneNumber: i + 1 })));
    setSelectedSceneId(remaining[0]?.id || '');
  }

  function addEmptyScene() {
    const num = scenes.length + 1;
    const newSc: CinemaScene = {
      id: `sc-${Date.now()}-${num}`,
      episodeNumber: activeEp?.episodeNumber || 1,
      sceneNumber: num,
      title: `مشهد ${num}`,
      locationDesc: 'مشهد سينمائي جديد',
      visualAction: 'استكمال الأحداث بين الشخصيات',
      shotType: 'medium',
      cameraMotion: 'zoom_in',
      lighting: project.genre === 'رعب' ? 'horror' : 'cinematic',
      weather: 'clear',
      timeOfDay: 'night',
      transition: 'crossfade',
      speed: 1,
      durationSeconds: 8,
      trimStart: 0,
      trimEnd: 8,
      overlayText: '',
      musicMood: project.genre,
      musicTrackEnabled: true,
      sfxType: 'none',
      characterIds: project.characters.slice(0, 2).map((c) => c.id),
      dialogues: [],
      produced: false,
    };
    updateEpisodeScenes((prev) => [...prev, newSc]);
    setSelectedSceneId(newSc.id);
  }

  function addDialogueLine() {
    if (!selectedScene) return;
    const firstChar = project.characters[0];
    const lineId = `dl-${Date.now()}`;
    patchSelectedScene({
      dialogues: [
        ...selectedScene.dialogues,
        {
          id: lineId,
          characterId: firstChar?.id || 'char-1',
          speakerName: firstChar?.name || 'الراوي',
          text: '',
          dialect: project.dialect,
          language: project.targetLanguage,
        },
      ],
    });
  }

  async function regenerateDialogueDub(lineId: string, translateFirst: boolean) {
    if (!selectedScene) return;
    const line = selectedScene.dialogues.find((d) => d.id === lineId);
    if (!line || !line.text.trim()) {
      setEditorMsg('اكتبي نص الحوار أولاً قبل توليد الصوت أو الدبلجة.');
      return;
    }
    const char = project.characters.find((c) => c.id === line.characterId) || project.characters[0];
    setDubbingLineId(lineId);
    setEditorMsg(translateFirst ? 'جاري الترجمة والدبلجة وتوليد الصوت الطبيعي…' : 'جاري توليد الصوت بالذكاء الاصطناعي…');
    try {
      const r = await fetch('/api/cinema/dub-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: line.text,
          targetLanguage: translateFirst ? line.language || project.targetLanguage : '',
          dialect: line.dialect || char?.dialect || project.dialect,
          voiceActor: char?.voiceActor || 'female',
          voiceName: char?.voiceName,
          genre: project.genre,
          geminiMode,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'تعذر توليد الصوت.');

      patchSelectedScene({
        dialogues: selectedScene.dialogues.map((d) =>
          d.id === lineId
            ? {
                ...d,
                text: data.text || d.text,
                audioBase64: data.audioBase64,
                durationSec: data.durationSec || d.durationSec,
              }
            : d,
        ),
      });
      setEditorMsg('تم تحديث الصوت والدبلجة لهذا السطر بنجاح.');
    } catch (e) {
      setEditorMsg(e instanceof Error ? e.message : 'تعذر توليد الصوت.');
    } finally {
      setDubbingLineId(null);
    }
  }

  return (
    <div className="cinema-editor-shell">
      <div className="cinema-editor-top">
        <div>
          <h4 style={{ margin: '0 0 4px', color: '#f8fafc', fontSize: 16 }}>
            استوديو المونتاج الاحترافي — {project.title || 'مشروع جديد'}
          </h4>
          <div className="tiny">
            {activeEp?.title || 'الحلقة ١'} · {scenes.length} مشاهد · دقة التصدير: {getQualityArabicLabel(project.quality)} · {getAspectArabicLabel(project.aspectRatio)}
          </div>
        </div>

        <div className="cinema-global-export-controls">
          <select
            className="field cinema-compact-select"
            value={project.quality}
            onChange={(e) => onChange({ ...project, quality: e.target.value as CinemaExportQuality })}
            aria-label="جودة التصدير"
          >
            <option value="720p">جودة عالية قياسية</option>
            <option value="1080p">جودة كاملة فائقة</option>
            <option value="2k">جودة سينمائية مضاعفة</option>
            <option value="4k">جودة فائقة الوضوح (عند دعم الجهاز)</option>
          </select>

          <select
            className="field cinema-compact-select"
            value={project.aspectRatio}
            onChange={(e) => onChange({ ...project, aspectRatio: e.target.value as CinemaAspectRatio })}
            aria-label="أبعاد الفيديو"
          >
            <option value="16:9">شاشة عريضة سينمائية</option>
            <option value="9:16">شاشة عمودية للهاتف</option>
            <option value="1:1">شاشة مربعة</option>
          </select>
        </div>
      </div>

      {/* Live Preview & Export Engine */}
      <CinemaPlayerExporter project={project} episodeNumber={activeEp?.episodeNumber} />

      {/* Multi-Track Visual Timeline */}
      <div className="cinema-timeline-board">
        <div className="cinema-timeline-header">
          <strong>مسارات المونتاج المتعددة وخط الزمن</strong>
          <div className="toolrow" style={{ margin: 0 }}>
            <button type="button" className="mini-btn" onClick={addEmptyScene}>
              <Plus size={12} style={{ display: 'inline', marginLeft: 3 }} /> إضافة مشهد
            </button>
            <button type="button" className="mini-btn" onClick={splitSelectedScene}>
              <Scissors size={12} style={{ display: 'inline', marginLeft: 3 }} /> قص / تقسيم
            </button>
            <button type="button" className="mini-btn" onClick={duplicateSelectedScene}>
              <CopyPlus size={12} style={{ display: 'inline', marginLeft: 3 }} /> تكرار
            </button>
            <button type="button" className="mini-btn danger" onClick={deleteSelectedScene}>
              <Trash2 size={12} style={{ display: 'inline', marginLeft: 3 }} /> حذف
            </button>
          </div>
        </div>

        {/* Track 1: Video / Scenes */}
        <div className="cinema-track-row">
          <div className="cinema-track-label">مسار الفيديو</div>
          <div className="cinema-track-clips">
            {scenes.map((sc, idx) => (
              <button
                key={sc.id}
                type="button"
                className={`cinema-clip-block ${selectedScene?.id === sc.id ? 'active' : ''}`}
                style={{ flexGrow: Math.max(1, Math.round(sc.durationSeconds / 2)) }}
                onClick={() => setSelectedSceneId(sc.id)}
              >
                <span className="cinema-clip-title">
                  {idx + 1}. {sc.title}
                </span>
                <span className="cinema-clip-meta">
                  {sc.durationSeconds}ث · {getSpeedArabicLabel(sc.speed)} · {TRANSITION_OPTIONS.find((t) => t.value === sc.transition)?.label || sc.transition}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Track 2: Voices & Dubbing */}
        <div className="cinema-track-row">
          <div className="cinema-track-label">الصوت والدبلجة</div>
          <div className="cinema-track-clips">
            {scenes.map((sc) => (
              <div
                key={sc.id}
                className="cinema-audio-block"
                style={{ flexGrow: Math.max(1, Math.round(sc.durationSeconds / 2)) }}
                onClick={() => setSelectedSceneId(sc.id)}
              >
                {sc.dialogues.length > 0
                  ? `${sc.dialogues.length} حوار · ${sc.dialogues.filter((d) => d.audioBase64).length} صوت جاهز`
                  : 'صامت (بدون حوار)'}
              </div>
            ))}
          </div>
        </div>

        {/* Track 3: Music & SFX */}
        <div className="cinema-track-row">
          <div className="cinema-track-label">الموسيقى والمؤثرات</div>
          <div className="cinema-track-clips">
            {scenes.map((sc) => (
              <div
                key={sc.id}
                className="cinema-music-block"
                style={{ flexGrow: Math.max(1, Math.round(sc.durationSeconds / 2)) }}
                onClick={() => setSelectedSceneId(sc.id)}
              >
                {sc.musicTrackEnabled ? `موسيقى ${sc.musicMood}` : 'بدون موسيقى'} · {SFX_OPTIONS.find((s) => s.value === sc.sfxType)?.label || 'بدون مؤثر'}
              </div>
            ))}
          </div>
        </div>
      </div>

      {editorMsg && <div className="statusbox info">{editorMsg}</div>}

      {/* Inspector for Selected Scene + Intro/Outro Credits */}
      {selectedScene && (
        <div className="cinema-inspector-grid">
          <div className="cinema-inspector-col">
            <div className="cinema-col-head">
              <strong>
                <Sliders size={14} style={{ display: 'inline', marginLeft: 6 }} />
                تعديل المشهد المحدد: {selectedScene.title}
              </strong>
              <div className="toolrow" style={{ margin: 0 }}>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => moveScene(scenes.findIndex((s) => s.id === selectedScene.id), -1)}
                  aria-label="تقديم المشهد"
                >
                  <ArrowRight size={13} />
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => moveScene(scenes.findIndex((s) => s.id === selectedScene.id), 1)}
                  aria-label="تأخير المشهد"
                >
                  <ArrowLeft size={13} />
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  disabled={busy}
                  onClick={() => onProduceSingleScene(activeEp.episodeNumber, selectedScene.id)}
                >
                  إعادة توليد المشهد بالذكاء ✨
                </button>
              </div>
            </div>

            <div className="cinema-fields-2">
              <div>
                <label className="mini-label">عنوان المشهد</label>
                <input
                  className="field"
                  value={selectedScene.title}
                  onChange={(e) => patchSelectedScene({ title: e.target.value })}
                />
              </div>
              <div>
                <label className="mini-label">نص وعنوان ظاهر على الشاشة</label>
                <input
                  className="field"
                  value={selectedScene.overlayText}
                  placeholder="مثال: الحلقة الأولى — البداية"
                  onChange={(e) => patchSelectedScene({ overlayText: e.target.value })}
                />
              </div>
            </div>

            <label className="mini-label">موقع التصوير ووصف الخلفية</label>
            <textarea
              className="field"
              style={{ minHeight: 68 }}
              value={selectedScene.locationDesc}
              onChange={(e) => patchSelectedScene({ locationDesc: e.target.value })}
            />

            <div className="cinema-fields-3">
              <div>
                <label className="mini-label">نوع التصوير</label>
                <select
                  className="field"
                  value={selectedScene.shotType}
                  onChange={(e) => patchSelectedScene({ shotType: e.target.value as CinemaScene['shotType'] })}
                >
                  {SHOT_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mini-label">حركة الكاميرا</label>
                <select
                  className="field"
                  value={selectedScene.cameraMotion}
                  onChange={(e) => patchSelectedScene({ cameraMotion: e.target.value as CinemaScene['cameraMotion'] })}
                >
                  {CAMERA_MOTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mini-label">الإضاءة السينمائية</label>
                <select
                  className="field"
                  value={selectedScene.lighting}
                  onChange={(e) => patchSelectedScene({ lighting: e.target.value as CinemaScene['lighting'] })}
                >
                  {LIGHTING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mini-label">الطقس</label>
                <select
                  className="field"
                  value={selectedScene.weather}
                  onChange={(e) => patchSelectedScene({ weather: e.target.value as CinemaScene['weather'] })}
                >
                  {WEATHER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mini-label">الوقت</label>
                <select
                  className="field"
                  value={selectedScene.timeOfDay}
                  onChange={(e) => patchSelectedScene({ timeOfDay: e.target.value as CinemaScene['timeOfDay'] })}
                >
                  {TIME_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mini-label">الانتقال</label>
                <select
                  className="field"
                  value={selectedScene.transition}
                  onChange={(e) => patchSelectedScene({ transition: e.target.value as CinemaScene['transition'] })}
                >
                  {TRANSITION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="cinema-fields-3">
              <div>
                <label className="mini-label">المدة (ثواني)</label>
                <input
                  type="number"
                  min={2}
                  max={120}
                  className="field"
                  value={selectedScene.durationSeconds}
                  onChange={(e) => {
                    const dur = Math.min(120, Math.max(2, Number(e.target.value) || 6));
                    patchSelectedScene({ durationSeconds: dur, trimEnd: dur });
                  }}
                />
              </div>
              <div>
                <label className="mini-label">سرعة التشغيل ({getSpeedArabicLabel(selectedScene.speed)})</label>
                <select
                  className="field"
                  value={selectedScene.speed}
                  onChange={(e) => patchSelectedScene({ speed: Number(e.target.value) })}
                >
                  <option value={0.5}>بطيء جداً سينمائي (نصف السرعة)</option>
                  <option value={0.75}>بطيء هادئ</option>
                  <option value={1}>سرعة طبيعية</option>
                  <option value={1.25}>سريع قليلاً</option>
                  <option value={1.5}>سريع</option>
                  <option value={2}>سريع مضاعف</option>
                </select>
              </div>
              <div>
                <label className="mini-label">المؤثر الصوتي</label>
                <select
                  className="field"
                  value={selectedScene.sfxType}
                  onChange={(e) => patchSelectedScene({ sfxType: e.target.value as CinemaScene['sfxType'] })}
                >
                  {SFX_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="cinema-fields-2">
              <div>
                <label className="mini-label">قص البداية (ثانية: {selectedScene.trimStart}ث)</label>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, selectedScene.durationSeconds - 2)}
                  step={0.5}
                  value={selectedScene.trimStart}
                  onChange={(e) => patchSelectedScene({ trimStart: Number(e.target.value) })}
                  className="cinema-scrubber"
                />
              </div>
              <div>
                <label className="mini-label">قص النهاية (ثانية: {selectedScene.trimEnd || selectedScene.durationSeconds}ث)</label>
                <input
                  type="range"
                  min={Math.min(selectedScene.durationSeconds, selectedScene.trimStart + 1.5)}
                  max={selectedScene.durationSeconds}
                  step={0.5}
                  value={selectedScene.trimEnd || selectedScene.durationSeconds}
                  onChange={(e) => patchSelectedScene({ trimEnd: Number(e.target.value) })}
                  className="cinema-scrubber"
                />
              </div>
            </div>

            <div className="cinema-fields-3" style={{ marginTop: 6 }}>
              <div>
                <label className="mini-label">المؤثرات البصرية والسينمائية</label>
                <select
                  className="field"
                  value={selectedScene.vfxOverlay || 'none'}
                  onChange={(e) => patchSelectedScene({ vfxOverlay: e.target.value as CinemaScene['vfxOverlay'] })}
                >
                  {VFX_OVERLAY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mini-label">التباين ({Math.round((selectedScene.colorContrast ?? 1.04) * 100)}%)</label>
                <input
                  type="range"
                  min={0.7}
                  max={1.45}
                  step={0.05}
                  value={selectedScene.colorContrast ?? 1.04}
                  onChange={(e) => patchSelectedScene({ colorContrast: Number(e.target.value) })}
                  className="cinema-scrubber"
                />
              </div>
              <div>
                <label className="mini-label">تشبع الألوان ({Math.round((selectedScene.colorSaturation ?? 1.06) * 100)}%)</label>
                <input
                  type="range"
                  min={0.5}
                  max={1.6}
                  step={0.05}
                  value={selectedScene.colorSaturation ?? 1.06}
                  onChange={(e) => patchSelectedScene({ colorSaturation: Number(e.target.value) })}
                  className="cinema-scrubber"
                />
              </div>
            </div>

            <div className="cinema-toggle-row">
              <label className="cinema-check-label">
                <input
                  type="checkbox"
                  checked={selectedScene.musicTrackEnabled}
                  onChange={(e) => patchSelectedScene({ musicTrackEnabled: e.target.checked })}
                />
                موسيقى تصويرية للمشهد
              </label>
              <label className="cinema-check-label">
                <input
                  type="checkbox"
                  checked={Boolean(selectedScene.enhanceVideoFilter)}
                  onChange={(e) => patchSelectedScene({ enhanceVideoFilter: e.target.checked })}
                />
                تحسين ألوان وجودة الصورة/الفيديو
              </label>
            </div>
          </div>

          {/* Dialogues, Dubbing & Intro/Outro Credits */}
          <div className="cinema-inspector-col">
            <div className="cinema-col-head">
              <strong>
                <Volume2 size={14} style={{ display: 'inline', marginLeft: 6 }} />
                الحوارات والأصوات والدبلجة التلقائية
              </strong>
              <button type="button" className="mini-btn" onClick={addDialogueLine}>
                + سطر حوار
              </button>
            </div>

            {selectedScene.dialogues.length === 0 ? (
              <div className="tiny" style={{ padding: '12px 0' }}>
                لا توجد سطور حوار في هذا المشهد بعد — اضغطي «+ سطر حوار» لإضافة كلام ودبلجة بصوت أي شخصية.
              </div>
            ) : (
              <div className="cinema-dialogue-list">
                {selectedScene.dialogues.map((line) => (
                  <div key={line.id} className="cinema-dialogue-item">
                    <div className="cinema-fields-3" style={{ marginBottom: 6 }}>
                      <select
                        className="field"
                        style={{ marginBottom: 0 }}
                        value={line.characterId}
                        onChange={(e) => {
                          const ch = project.characters.find((c) => c.id === e.target.value);
                          patchSelectedScene({
                            dialogues: selectedScene.dialogues.map((d) =>
                              d.id === line.id
                                ? { ...d, characterId: e.target.value, speakerName: ch?.name || d.speakerName }
                                : d,
                            ),
                          });
                        }}
                      >
                        {project.characters.map((ch) => (
                          <option key={ch.id} value={ch.id}>{ch.name} ({ch.voiceActor === 'child' ? 'طفل' : ch.voiceActor === 'male' ? 'رجل' : 'امرأة'})</option>
                        ))}
                        {project.characters.length === 0 && <option value="char-1">الراوي</option>}
                      </select>

                      <select
                        className="field"
                        style={{ marginBottom: 0 }}
                        value={line.dialect || project.dialect}
                        onChange={(e) =>
                          patchSelectedScene({
                            dialogues: selectedScene.dialogues.map((d) =>
                              d.id === line.id ? { ...d, dialect: e.target.value as CinemaDialect } : d,
                            ),
                          })
                        }
                      >
                        {DIALECT_OPTIONS.map((dl) => (
                          <option key={dl.value} value={dl.value}>{dl.label}</option>
                        ))}
                      </select>

                      <select
                        className="field"
                        style={{ marginBottom: 0 }}
                        value={line.language || project.targetLanguage}
                        onChange={(e) =>
                          patchSelectedScene({
                            dialogues: selectedScene.dialogues.map((d) =>
                              d.id === line.id ? { ...d, language: e.target.value } : d,
                            ),
                          })
                        }
                      >
                        {LANGUAGE_OPTIONS.map((lg) => (
                          <option key={lg} value={lg}>{lg}</option>
                        ))}
                      </select>
                    </div>

                    <textarea
                      className="field"
                      style={{ minHeight: 54, marginBottom: 6 }}
                      value={line.text}
                      placeholder="اكتبي جملة الحوار هنا..."
                      onChange={(e) =>
                        patchSelectedScene({
                          dialogues: selectedScene.dialogues.map((d) =>
                            d.id === line.id ? { ...d, text: e.target.value } : d,
                          ),
                        })
                      }
                    />

                    <div className="toolrow" style={{ margin: 0, justifyContent: 'space-between' }}>
                      <div className="toolrow" style={{ margin: 0 }}>
                        <button
                          type="button"
                          className="mini-btn"
                          disabled={dubbingLineId === line.id}
                          onClick={() => void regenerateDialogueDub(line.id, false)}
                        >
                          {dubbingLineId === line.id ? 'جاري التوليد…' : line.audioBase64 ? 'تحديث الصوت 🔊' : 'توليد الصوت 🎤'}
                        </button>
                        <button
                          type="button"
                          className="mini-btn"
                          disabled={dubbingLineId === line.id}
                          onClick={() => void regenerateDialogueDub(line.id, true)}
                        >
                          دبلجة وترجمة للغة المحددة 🌍
                        </button>
                      </div>
                      <button
                        type="button"
                        className="mini-btn danger"
                        onClick={() =>
                          patchSelectedScene({
                            dialogues: selectedScene.dialogues.filter((d) => d.id !== line.id),
                          })
                        }
                      >
                        حذف السطر
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <hr className="cinema-divider" />
            <strong style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>
              المقدمة والنهاية والشعار وأسماء الممثلين والترجمة
            </strong>
            <div className="cinema-fields-2">
              <div>
                <label className="mini-label">عنوان المقدمة الافتتاحية</label>
                <input
                  className="field"
                  value={project.introTitle}
                  placeholder={project.title || 'اسم الفيلم أو المسلسل'}
                  onChange={(e) => onChange({ ...project, introTitle: e.target.value })}
                />
              </div>
              <div>
                <label className="mini-label">العنوان الفرعي للمقدمة</label>
                <input
                  className="field"
                  value={project.introSubtitle}
                  onChange={(e) => onChange({ ...project, introSubtitle: e.target.value })}
                />
              </div>
            </div>

            <div className="cinema-fields-2">
              <div>
                <label className="mini-label">نص شارة النهاية</label>
                <input
                  className="field"
                  value={project.outroCredits}
                  onChange={(e) => onChange({ ...project, outroCredits: e.target.value })}
                />
              </div>
              <div>
                <label className="mini-label">أسماء الممثلين (تظهر في النهاية)</label>
                <input
                  className="field"
                  value={project.castList}
                  placeholder={project.characters.map((c) => c.name).join(' · ') || 'أسماء الأبطال'}
                  onChange={(e) => onChange({ ...project, castList: e.target.value })}
                />
              </div>
            </div>

            <div className="cinema-toggle-row">
              <label className="cinema-check-label">
                <input
                  type="checkbox"
                  checked={project.showLogoWatermark}
                  onChange={(e) => onChange({ ...project, showLogoWatermark: e.target.checked })}
                />
                إظهار شعار ZORVYX AI CINEMA في الفيديو
              </label>
              <label className="cinema-check-label">
                <input
                  type="checkbox"
                  checked={project.showSubtitles}
                  onChange={(e) => onChange({ ...project, showSubtitles: e.target.checked })}
                />
                إظهار الترجمة النصية التلقائية أسفل المشهد
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
