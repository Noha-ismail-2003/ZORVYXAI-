import { useEffect, useRef, useState } from 'react';
import { Download, Pause, Play, SkipBack, SkipForward, Sparkles, Video, Volume2, VolumeX } from 'lucide-react';
import { getGlobalAudioContext, safeFileName, saveBlob, stripHashMarks, unlockGlobalAudioContext } from '../utils/mediaExport';

interface ExplainerScene {
  sceneTitle: string;
  narration: string;
  keyPoints: string[];
  visualStyle: string;
  accentColor: string;
  durationSec: number;
  audioBase64?: string;
}

interface GeneratedExplainerVideo {
  videoTitle: string;
  subtitle: string;
  summary: string;
  scenes: ExplainerScene[];
}

interface Props {
  geminiMode?: 'fast' | 'balanced' | 'pro';
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const clean = b64.replace(/^data:[^;]+;base64,/, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

export function TopicVideoExplainerPanel({ geminiMode = 'balanced' }: Props) {
  const [topic, setTopic] = useState('');
  const [sceneCount, setSceneCount] = useState(5);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [video, setVideo] = useState<GeneratedExplainerVideo | null>(null);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sceneProgress, setSceneProgress] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const animStartRef = useRef<number>(0);
  const narrationDoneRef = useRef<boolean>(true);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackTokenRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      playbackTokenRef.current += 1;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopVoice();
    };
  }, []);

  function stopVoice() {
    playbackTokenRef.current += 1;
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.onended = null;
        activeSourceRef.current.stop();
      } catch {
        // ignore
      }
      activeSourceRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    narrationDoneRef.current = true;
  }

  async function playSceneNarration(scene: ExplainerScene, token: number) {
    narrationDoneRef.current = false;

    if (!voiceEnabled || !scene.narration) {
      narrationDoneRef.current = true;
      return;
    }

    const ctx = unlockGlobalAudioContext() || getGlobalAudioContext();
    if (scene.audioBase64 && ctx) {
      try {
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        if (playbackTokenRef.current !== token) return;
        const ab = base64ToArrayBuffer(scene.audioBase64);
        const decoded = await ctx.decodeAudioData(ab);
        if (playbackTokenRef.current !== token) return;
        const src = ctx.createBufferSource();
        src.buffer = decoded;
        src.connect(ctx.destination);
        activeSourceRef.current = src;
        src.onended = () => {
          if (activeSourceRef.current === src) activeSourceRef.current = null;
          if (playbackTokenRef.current === token) {
            narrationDoneRef.current = true;
          }
        };
        src.start(0);
        return;
      } catch {
        // fallback cleanly to chunked speechSynthesis below
      }
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const sentences = scene.narration
        .split(/(?<=[.!؟،\n])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const chunks = sentences.length > 0 ? sentences : [scene.narration];
      let idx = 0;

      const speakNext = () => {
        if (playbackTokenRef.current !== token) return;
        if (idx >= chunks.length) {
          narrationDoneRef.current = true;
          return;
        }
        const utter = new SpeechSynthesisUtterance(chunks[idx]);
        utter.lang = 'ar-SA';
        utter.rate = 0.94;
        utter.onend = () => {
          idx += 1;
          speakNext();
        };
        utter.onerror = () => {
          idx += 1;
          speakNext();
        };
        window.speechSynthesis.speak(utter);
      };
      speakNext();
      return;
    }

    narrationDoneRef.current = true;
  }

  function drawSceneFrame(
    ctx: CanvasRenderingContext2D,
    vid: GeneratedExplainerVideo,
    idx: number,
    progress: number,
    tick: number,
  ) {
    const W = 1280;
    const H = 720;
    const scene = vid.scenes[idx] || vid.scenes[0];
    const accent = scene.accentColor || '#67e8f9';

    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#090b1a');
    bgGrad.addColorStop(0.55, '#131632');
    bgGrad.addColorStop(1, '#080c1c');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const rad = ctx.createRadialGradient(290, 320, 20, 290, 320, 310);
    rad.addColorStop(0, `${accent}44`);
    rad.addColorStop(1, 'transparent');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, W, 74);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 72, W * ((idx + progress) / vid.scenes.length), 4);

    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 26px Tahoma, Arial, sans-serif';
    ctx.fillText(vid.videoTitle.slice(0, 56), W - 46, 46);

    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = accent;
    ctx.font = 'bold 20px Tahoma, Arial, sans-serif';
    ctx.fillText(`0${idx + 1} / 0${vid.scenes.length}`, 46, 46);

    const vx = 270;
    const vy = 350;
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = 3;

    if (scene.visualStyle === 'bars') {
      const heights = [120, 195, 155, 235, 180];
      heights.forEach((bh, bi) => {
        const barH = bh * Math.min(1, progress * 2.2) + Math.sin(tick * 2 + bi) * 8;
        ctx.globalAlpha = 0.25 + bi * 0.14;
        ctx.fillRect(120 + bi * 62, 480 - barH, 42, barH);
      });
    } else if (scene.visualStyle === 'steps' || scene.visualStyle === 'timeline') {
      for (let s = 0; s < 4; s++) {
        const active = progress >= s * 0.22;
        ctx.globalAlpha = active ? 0.9 : 0.25;
        ctx.beginPath();
        ctx.arc(135 + s * 88, 420 - s * 42, 22 + Math.sin(tick * 3 + s) * 2, 0, Math.PI * 2);
        ctx.fill();
        if (s < 3) {
          ctx.beginPath();
          ctx.moveTo(135 + s * 88, 420 - s * 42);
          ctx.lineTo(135 + (s + 1) * 88, 420 - (s + 1) * 42);
          ctx.stroke();
        }
      }
    } else {
      for (let ring = 1; ring <= 3; ring++) {
        ctx.globalAlpha = 0.22 + (3 - ring) * 0.14;
        ctx.beginPath();
        ctx.arc(vx, vy, ring * 64 + Math.sin(tick * 2 + ring) * 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.arc(vx, vy, 34, 0, Math.PI * 2);
      ctx.fill();
      for (let p = 0; p < 5; p++) {
        const a = tick * 0.9 + (p * Math.PI * 2) / 5;
        const px = vx + Math.cos(a) * 140;
        const py = vy + Math.sin(a) * 140;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(vx, vy);
        ctx.lineTo(px, py);
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillStyle = accent;
    ctx.font = 'bold 38px Tahoma, Arial, sans-serif';
    wrapRtlText(ctx, scene.sceneTitle, W - 56, 155, 670, 48);

    scene.keyPoints.forEach((kp, ki) => {
      const visibleAt = ki * 0.16;
      const alpha = Math.min(1, Math.max(0.2, (progress - visibleAt) * 4));
      ctx.save();
      ctx.globalAlpha = alpha;
      const boxY = 232 + ki * 92;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.strokeStyle = `${accent}66`;
      ctx.lineWidth = 1.5;
      ctx.fillRect(540, boxY, 684, 74);
      ctx.strokeRect(540, boxY, 684, 74);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(1196, boxY + 37, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.font = '23px Tahoma, Arial, sans-serif';
      wrapRtlText(ctx, kp, 1170, boxY + 45, 600, 30);
      ctx.restore();
    });

    ctx.fillStyle = 'rgba(6, 8, 18, 0.9)';
    ctx.fillRect(46, 548, W - 92, 144);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.strokeRect(46, 548, W - 92, 144);
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '22px Tahoma, Arial, sans-serif';
    wrapRtlText(ctx, scene.narration, W - 74, 588, W - 148, 33);
  }

  useEffect(() => {
    if (!video || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    if (!playing) {
      drawSceneFrame(ctx, video, sceneIdx, 0.65, 1.2);
      return;
    }

    const currentScene = video.scenes[sceneIdx];
    const durMs = Math.max(7000, (currentScene?.durationSec || 8) * 1000);
    animStartRef.current = performance.now();
    stopVoice();
    const token = playbackTokenRef.current;
    void playSceneNarration(currentScene, token);

    const step = (now: number) => {
      if (playbackTokenRef.current !== token) return;
      const elapsed = now - animStartRef.current;
      const p = Math.min(1, elapsed / durMs);
      setSceneProgress(p);
      drawSceneFrame(ctx, video, sceneIdx, p, now / 1000);

      // Never cut off narration: wait until BOTH visual duration and voice narration finish (with 35s max safety guard)
      const readyToAdvance = p >= 1 && (narrationDoneRef.current || elapsed > durMs + 18000);

      if (!readyToAdvance) {
        rafRef.current = requestAnimationFrame(step);
      } else if (sceneIdx + 1 < video.scenes.length) {
        setSceneIdx((prev) => prev + 1);
      } else {
        setPlaying(false);
        setSceneProgress(1);
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [video, sceneIdx, playing]);

  async function generateExplainer(overrideTopic?: string) {
    const cleanTopic = (overrideTopic ?? topic).trim();
    if (!cleanTopic) {
      setStatusMsg('اكتبي الموضوع أو الدرس الذي تريدين شرحه بفيديو أولاً.');
      return;
    }
    unlockGlobalAudioContext();
    stopVoice();
    setPlaying(false);
    setLoading(true);
    setStatusMsg('جاري إعداد الشرح الكامل والمشاهد والتعليق الصوتي…');
    try {
      const r = await fetch('/api/video-explainer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: cleanTopic, sceneCount, geminiMode }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'تعذر إنشاء شرح الفيديو.');
      if (data.rejected) {
        setStatusMsg(data.message || 'هذه الأيقونة مخصصة حصراً لشرح المواضيع والأفكار على شكل فيديو.');
        return;
      }
      if (data.video) {
        setVideo(data.video as GeneratedExplainerVideo);
        setSceneIdx(0);
        setSceneProgress(0);
        setStatusMsg('');
        setPlaying(true);
      }
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : 'حدث خطأ أثناء توليد الفيديو.');
    } finally {
      setLoading(false);
    }
  }

  async function exportWebmVideo() {
    if (!video || !canvasRef.current || exporting) return;
    setExporting(true);
    setPlaying(false);
    stopVoice();
    setStatusMsg('جاري تصدير الفيديو الكامل مع الصوت بجودة HD… قد يستغرق الأمر بضع ثوانٍ.');

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('تعذر تهيئة لوحة التصدير.');

      const videoStream = canvas.captureStream(24);
      const audioCtx = unlockGlobalAudioContext() || getGlobalAudioContext();
      const decodedBuffers: Array<AudioBuffer | null> = [];

      if (audioCtx) {
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        for (const sc of video.scenes) {
          if (sc.audioBase64) {
            try {
              const buf = await audioCtx.decodeAudioData(base64ToArrayBuffer(sc.audioBase64));
              decodedBuffers.push(buf);
            } catch {
              decodedBuffers.push(null);
            }
          } else {
            decodedBuffers.push(null);
          }
        }
      }

      const hasAudio = Boolean(audioCtx && decodedBuffers.some(Boolean));
      let combinedStream: MediaStream = videoStream;
      let audioDest: MediaStreamAudioDestinationNode | null = null;

      if (hasAudio && audioCtx) {
        audioDest = audioCtx.createMediaStreamDestination();
        combinedStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...audioDest.stream.getAudioTracks(),
        ]);
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : 'video/mp4';
      const recorder = new MediaRecorder(combinedStream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      const done = new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          saveBlob(blob, `${safeFileName(video.videoTitle)}.webm`);
          resolve();
        };
      });

      recorder.start();
      const fps = 24;
      for (let i = 0; i < video.scenes.length; i++) {
        const audioBuf = decodedBuffers[i];
        const sec = audioBuf ? Math.max(audioBuf.duration + 0.4, video.scenes[i].durationSec || 6) : video.scenes[i].durationSec || 6;
        if (audioBuf && audioCtx && audioDest) {
          const src = audioCtx.createBufferSource();
          src.buffer = audioBuf;
          src.connect(audioDest);
          src.start();
        }
        const frames = Math.max(24, Math.round(sec * fps));
        for (let f = 0; f < frames; f++) {
          drawSceneFrame(ctx, video, i, f / frames, i * 4 + f / fps);
          await new Promise((res) => setTimeout(res, 1000 / fps));
        }
      }
      recorder.stop();
      await done;
      setStatusMsg('تم تصدير وتنزيل فيديو الشرح الكامل مع الصوت بنجاح.');
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : 'تعذر تصدير الفيديو في هذا المتصفح.');
    } finally {
      setExporting(false);
    }
  }

  const currentScene = video?.scenes[sceneIdx];

  return (
    <div className="explainer-shell">
      <div className="char-sender-box">
        <div className="tiny" style={{ marginBottom: 8 }}>
          اكتبي أي موضوع معرفي أو علمي وسأحوّله إلى فيديو تفاعلي كامل يشرح الموضوع من البداية إلى النهاية بالصوت والمشاهد دون نقصان:
        </div>
        <div className="history-chips" style={{ marginBottom: 10 }}>
          {[
            'كيف يعمل الذكاء الاصطناعي وتعلّم الآلة ببساطة',
            'أهم أسرار إدارة الوقت وزيادة التركيز اليومي',
            'دورة الماء في الطبيعة وأهميتها للحياة على الأرض',
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              className="history-chip"
              disabled={loading}
              onClick={() => {
                setTopic(preset);
                void generateExplainer(preset);
              }}
            >
              {preset}
            </button>
          ))}
        </div>

        <textarea
          className="field"
          style={{ minHeight: 90, marginTop: 4 }}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="اكتبي عنوان الموضوع أو الدرس المطلوب شرحه بفيديو كامل (مثلاً: كيف تبدأ مشروعك الصغير، قوانين نيوتن، فوائد القراءة)..."
        />

        <div className="toolrow">
          <select
            className="field"
            style={{ width: 'auto', minWidth: 170, margin: 0 }}
            value={sceneCount}
            onChange={(e) => setSceneCount(Number(e.target.value))}
          >
            <option value={4}>فيديو سريع (4 مشاهد)</option>
            <option value={5}>فيديو متوسط (5 مشاهد)</option>
            <option value={6}>فيديو مفصل (6 مشاهد)</option>
          </select>

          <button
            type="button"
            className="secondary"
            onClick={() => {
              const next = !voiceEnabled;
              setVoiceEnabled(next);
              if (!next) stopVoice();
            }}
          >
            {voiceEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            {voiceEnabled ? 'التعليق الصوتي: مفعّل' : 'التعليق الصوتي: صامت'}
          </button>

          <button
            type="button"
            className="primary"
            disabled={loading}
            onClick={() => void generateExplainer()}
          >
            <Sparkles size={15} />
            {loading ? 'جاري إنتاج الفيديو الكامل…' : 'اشرح الموضوع بفيديو كامل'}
          </button>
        </div>
      </div>

      {statusMsg && <div className="statusbox info">{statusMsg}</div>}

      {video && (
        <div className="explainer-stage-card">
          <div className="wb-row-between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong style={{ fontSize: 16, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Video size={18} color="#f472b6" />
                {stripHashMarks(video.videoTitle)}
              </strong>
              <div className="tiny">{stripHashMarks(video.subtitle)}</div>
            </div>
            <button
              type="button"
              className="secondary"
              disabled={exporting}
              onClick={() => void exportWebmVideo()}
            >
              <Download size={14} />
              {exporting ? 'جاري التصدير…' : 'تحميل الفيديو كاملاً (WebM)'}
            </button>
          </div>

          <canvas ref={canvasRef} width={1280} height={720} className="explainer-canvas" />

          <div className="tasks-progress-track" style={{ marginTop: 10 }}>
            <div
              className="tasks-progress-fill"
              style={{
                width: `${Math.round(((sceneIdx + sceneProgress) / video.scenes.length) * 100)}%`,
              }}
            />
          </div>

          <div className="toolrow" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button
              type="button"
              className="secondary"
              disabled={sceneIdx === 0}
              onClick={() => {
                stopVoice();
                setSceneIdx((i) => Math.max(0, i - 1));
              }}
            >
              <SkipForward size={15} />
              السابق
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (playing) {
                  stopVoice();
                  setPlaying(false);
                } else {
                  unlockGlobalAudioContext();
                  if (sceneIdx >= video.scenes.length - 1 && sceneProgress >= 0.99) {
                    setSceneIdx(0);
                    setSceneProgress(0);
                  }
                  setPlaying(true);
                }
              }}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
              {playing ? 'إيقاف مؤقت' : 'تشغيل الشرح الكامل'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={sceneIdx >= video.scenes.length - 1}
              onClick={() => {
                stopVoice();
                setSceneIdx((i) => Math.min(video.scenes.length - 1, i + 1));
              }}
            >
              التالي
              <SkipBack size={15} />
            </button>
          </div>

          <div className="explainer-scenes-strip">
            {video.scenes.map((sc, i) => (
              <button
                key={i}
                type="button"
                className={`explainer-scene-pill ${i === sceneIdx ? 'active' : ''}`}
                onClick={() => {
                  stopVoice();
                  setSceneIdx(i);
                  setPlaying(true);
                }}
              >
                <span className="explainer-scene-num">مشهد {i + 1}</span>
                <span>{sc.sceneTitle}</span>
              </button>
            ))}
          </div>

          {currentScene && (
            <div className="result" style={{ marginTop: 12 }}>
              <strong style={{ color: '#f472b6', display: 'block', marginBottom: 6 }}>
                نص الشرح الصوتي للمشهد {sceneIdx + 1}: {currentScene.sceneTitle}
              </strong>
              <div>{currentScene.narration}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function wrapRtlText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  let cy = y;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = words[i];
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}
