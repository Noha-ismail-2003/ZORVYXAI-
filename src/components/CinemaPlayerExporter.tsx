import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Film, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type {
  CinemaCharacter,
  CinemaDialogueLine,
  CinemaProject,
  CinemaScene,
} from '../types/cinema';
import { getExportDimensions } from '../utils/cinemaStorage';
import {
  escHtml,
  formatTimeMMSS,
  getGlobalAudioContext,
  safeFileName,
  sanitizeSvgClient,
  saveBlob,
  stripHashMarks,
  unlockGlobalAudioContext,
} from '../utils/mediaExport';

interface Props {
  project: CinemaProject;
  episodeNumber?: number;
}

interface TimelineEntry {
  kind: 'intro' | 'scene' | 'outro';
  startSec: number;
  endSec: number;
  scene?: CinemaScene;
  sceneIndex?: number;
}

interface DialogueTiming {
  line: CinemaDialogueLine;
  startSec: number;
  endSec: number;
}

function svgToHtmlImage(svgText: string, w: number, h: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const clean = sanitizeSvgClient(svgText);
    if (!clean) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.width = w;
    img.height = h;
    const blob = new Blob([clean], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function loadUrlImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
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

function getGenreProgression(genre: string): number[][] {
  switch (genre) {
    case 'رعب':
      return [
        [146.83, 174.61, 220.0],
        [138.59, 164.81, 207.65],
        [130.81, 155.56, 196.0],
        [146.83, 174.61, 207.65],
      ];
    case 'أكشن':
      return [
        [196.0, 233.08, 293.66],
        [174.61, 220.0, 261.63],
        [155.56, 196.0, 233.08],
        [174.61, 220.0, 293.66],
      ];
    case 'كوميديا':
      return [
        [261.63, 329.63, 392.0],
        [220.0, 261.63, 329.63],
        [174.61, 220.0, 261.63],
        [196.0, 246.94, 293.66],
      ];
    case 'خيال علمي':
      return [
        [220.0, 293.66, 329.63],
        [196.0, 246.94, 329.63],
        [174.61, 220.0, 293.66],
        [164.81, 246.94, 329.63],
      ];
    case 'رومانسي':
      return [
        [220.0, 261.63, 329.63],
        [174.61, 220.0, 261.63],
        [261.63, 329.63, 392.0],
        [196.0, 246.94, 293.66],
      ];
    case 'تاريخي':
      return [
        [196.0, 246.94, 293.66],
        [164.81, 196.0, 246.94],
        [220.0, 261.63, 329.63],
        [196.0, 246.94, 329.66],
      ];
    case 'أنيميشن':
      return [
        [293.66, 369.99, 440.0],
        [246.94, 293.66, 369.99],
        [196.0, 246.94, 293.66],
        [220.0, 277.18, 329.63],
      ];
    default:
      return [
        [220.0, 261.63, 329.63],
        [174.61, 220.0, 261.63],
        [196.0, 246.94, 293.66],
        [164.81, 220.0, 261.63],
      ];
  }
}

export function CinemaPlayerExporter({ project, episodeNumber }: Props) {
  const targetEpisode = useMemo(() => {
    const epNum = episodeNumber || project.activeEpisodeNumber || 1;
    return project.episodes.find((e) => e.episodeNumber === epNum) || project.episodes[0];
  }, [project.episodes, project.activeEpisodeNumber, episodeNumber]);

  const scenes = targetEpisode?.scenes || [];

  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];
    let cursor = 0;
    const hasIntro = Boolean((project.introTitle || project.title || '').trim());
    if (hasIntro) {
      entries.push({ kind: 'intro', startSec: 0, endSec: 2.8 });
      cursor = 2.8;
    }
    scenes.forEach((sc, idx) => {
      const trimStart = Math.max(0, sc.trimStart || 0);
      const rawEnd = Math.max(trimStart + 1.5, sc.trimEnd || sc.durationSeconds || 8);
      const span = Math.max(1.5, (rawEnd - trimStart) / Math.max(0.5, sc.speed || 1));
      entries.push({
        kind: 'scene',
        startSec: cursor,
        endSec: cursor + span,
        scene: sc,
        sceneIndex: idx,
      });
      cursor += span;
    });
    const hasOutro = Boolean((project.outroCredits || project.castList || '').trim());
    if (hasOutro && scenes.length > 0) {
      entries.push({ kind: 'outro', startSec: cursor, endSec: cursor + 3.2 });
      cursor += 3.2;
    }
    return entries;
  }, [scenes, project.introTitle, project.title, project.outroCredits, project.castList]);

  const totalDuration = useMemo(() => {
    const last = timeline[timeline.length - 1];
    return Math.max(3, last ? last.endSec : 6);
  }, [timeline]);

  const dialogueTimingsByScene = useMemo(() => {
    const map = new Map<string, DialogueTiming[]>();
    for (const sc of scenes) {
      const trimStart = Math.max(0, sc.trimStart || 0);
      const rawEnd = Math.max(trimStart + 1.5, sc.trimEnd || sc.durationSeconds || 8);
      const span = Math.max(1.5, (rawEnd - trimStart) / Math.max(0.5, sc.speed || 1));
      const lines = sc.dialogues || [];
      if (lines.length === 0) {
        map.set(sc.id, []);
        continue;
      }
      const totalWeights = lines.reduce((sum, l) => sum + Math.max(1.5, l.durationSec || 2.5), 0);
      let c = 0.25;
      const timings: DialogueTiming[] = lines.map((line) => {
        const portion = (Math.max(1.5, line.durationSec || 2.5) / totalWeights) * Math.max(1, span - 0.5);
        const startSec = c;
        const endSec = Math.min(span, c + portion);
        c = endSec;
        return { line, startSec, endSec };
      });
      map.set(sc.id, timings);
    }
    return map;
  }, [scenes]);

  const previewDims = useMemo(() => {
    if (project.aspectRatio === '9:16') return { w: 540, h: 960 };
    if (project.aspectRatio === '1:1') return { w: 720, h: 720 };
    return { w: 960, h: 540 };
  }, [project.aspectRatio]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const playStartPerfRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const isMutedRef = useRef<boolean>(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');

  // Asset caches
  const backdropCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const charImgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const overlayCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const videoElemCacheRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const activeAudioNodesRef = useRef<AudioNode[]>([]);
  const mediaRecAbortRef = useRef<boolean>(false);

  useEffect(() => {
    void loadUrlImage('/assets/aistudio/file_00000000d6f48210967f2a13492a2ae2_cfdde145.png').then((img) => {
      if (img) logoImgRef.current = img;
    });
  }, []);

  // Preload backdrops, overlays, character images, and uploaded videos cleanly
  useEffect(() => {
    let cancelled = false;

    async function preloadAssets() {
      const hiW = Math.max(1280, previewDims.w);
      const hiH = Math.round((hiW * previewDims.h) / previewDims.w);

      for (const ch of project.characters) {
        const key = `${ch.id}:${ch.uploadedImageUrl || ch.avatarSvg?.length || 0}`;
        if (charImgCacheRef.current.has(key)) continue;
        if (ch.uploadedImageUrl) {
          const img = await loadUrlImage(ch.uploadedImageUrl);
          if (!cancelled && img) charImgCacheRef.current.set(key, img);
        } else if (ch.avatarSvg) {
          const img = await svgToHtmlImage(ch.avatarSvg, 768, 768);
          if (!cancelled && img) charImgCacheRef.current.set(key, img);
        }
      }

      for (const sc of scenes) {
        if (sc.backdropSvg && !backdropCacheRef.current.has(sc.id)) {
          const img = await svgToHtmlImage(sc.backdropSvg, hiW, hiH);
          if (!cancelled && img) backdropCacheRef.current.set(sc.id, img);
        }
        if (sc.uploadedImageUrl && !backdropCacheRef.current.has(`${sc.id}:img`)) {
          const img = await loadUrlImage(sc.uploadedImageUrl);
          if (!cancelled && img) backdropCacheRef.current.set(`${sc.id}:img`, img);
        }
        if (sc.overlaySvg && !overlayCacheRef.current.has(sc.id)) {
          const img = await svgToHtmlImage(sc.overlaySvg, hiW, hiH);
          if (!cancelled && img) overlayCacheRef.current.set(sc.id, img);
        }
        if (sc.uploadedVideoUrl && !videoElemCacheRef.current.has(sc.uploadedVideoUrl)) {
          const vid = document.createElement('video');
          vid.src = sc.uploadedVideoUrl;
          vid.muted = true;
          vid.playsInline = true;
          vid.crossOrigin = 'anonymous';
          vid.preload = 'auto';
          vid.load();
          videoElemCacheRef.current.set(sc.uploadedVideoUrl, vid);
        }
      }
      if (!cancelled) {
        drawFrameAtTime(currentTimeRef.current);
      }
    }

    void preloadAssets();
    return () => {
      cancelled = true;
    };
  }, [project.characters, scenes, previewDims.w, previewDims.h]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    drawFrameAtTime(currentTimeRef.current);
    return () => {
      stopAllPlaybackAudio();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [timeline]);

  function stopAllPlaybackAudio() {
    for (const node of activeAudioNodesRef.current) {
      try {
        if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
          (node as AudioScheduledSourceNode).stop();
        }
        node.disconnect();
      } catch {
        // ignore
      }
    }
    activeAudioNodesRef.current = [];
    for (const v of videoElemCacheRef.current.values()) {
      try {
        v.pause();
      } catch {
        // ignore
      }
    }
  }

  async function scheduleCinemaAudio(
    fromSec: number,
    destNode?: AudioNode,
  ): Promise<void> {
    stopAllPlaybackAudio();
    if (isMutedRef.current && !destNode) return;
    const ctx = unlockGlobalAudioContext() || getGlobalAudioContext();
    if (!ctx) return;

    const targetOut = destNode || ctx.destination;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-14, ctx.currentTime);
    compressor.knee.setValueAtTime(16, ctx.currentTime);
    compressor.ratio.setValueAtTime(4, ctx.currentTime);
    compressor.attack.setValueAtTime(0.01, ctx.currentTime);
    compressor.release.setValueAtTime(0.2, ctx.currentTime);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(isMutedRef.current && !destNode ? 0 : 0.94, ctx.currentTime);
    compressor.connect(masterGain);
    masterGain.connect(targetOut);
    activeAudioNodesRef.current.push(compressor, masterGain);

    const baseNow = ctx.currentTime + 0.05;

    // 1. Evolving Warm Low-Pass Cinematic Score Progression synchronized per scene
    const progression = getGenreProgression(project.genre);
    const musicBus = ctx.createGain();
    musicBus.gain.setValueAtTime(0.115, baseNow);
    const scoreFilter = ctx.createBiquadFilter();
    scoreFilter.type = 'lowpass';
    scoreFilter.frequency.setValueAtTime(760, baseNow);
    musicBus.connect(scoreFilter);
    scoreFilter.connect(compressor);
    activeAudioNodesRef.current.push(musicBus, scoreFilter);

    for (const entry of timeline) {
      if (entry.kind !== 'scene' || !entry.scene) continue;
      if (entry.endSec <= fromSec) continue;
      const sc = entry.scene;
      if (!sc.musicTrackEnabled) continue;

      const relStart = Math.max(0, entry.startSec - fromSec);
      const relEnd = Math.max(relStart + 0.4, entry.endSec - fromSec);
      const sceneDur = relEnd - relStart;
      const barStep = Math.max(2.2, Math.min(3.5, sceneDur / Math.max(2, Math.round(sceneDur / 2.8))));

      let barCursor = relStart;
      let barIdx = (entry.sceneIndex || 0) * 2;
      while (barCursor < relEnd - 0.15) {
        const segEnd = Math.min(relEnd, barCursor + barStep);
        const chord = progression[barIdx % progression.length];
        const subBass = (chord[0] || 220) * 0.5;
        const padNotes = [subBass, ...chord];
        padNotes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const voiceGain = ctx.createGain();
          osc.type = idx === 0 ? 'sine' : idx % 2 === 1 ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(freq, baseNow + barCursor);
          const peakGain = idx === 0 ? 0.22 / padNotes.length : 0.25 / padNotes.length;
          voiceGain.gain.setValueAtTime(0.001, baseNow + barCursor);
          voiceGain.gain.linearRampToValueAtTime(peakGain, baseNow + barCursor + Math.min(0.65, (segEnd - barCursor) * 0.4));
          voiceGain.gain.linearRampToValueAtTime(0.001, baseNow + segEnd);
          osc.connect(voiceGain);
          voiceGain.connect(musicBus);
          osc.start(baseNow + barCursor);
          osc.stop(baseNow + segEnd + 0.05);
          activeAudioNodesRef.current.push(osc, voiceGain);
        });
        barCursor = segEnd - 0.18;
        barIdx++;
      }

      // Ambient procedural SFX
      if (sc.sfxType === 'heartbeat') {
        const beatStep = 0.85;
        for (let bt = relStart; bt < relEnd - 0.3; bt += beatStep) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(64, baseNow + bt);
          osc.frequency.exponentialRampToValueAtTime(34, baseNow + bt + 0.22);
          g.gain.setValueAtTime(0.001, baseNow + bt);
          g.gain.linearRampToValueAtTime(0.28, baseNow + bt + 0.03);
          g.gain.exponentialRampToValueAtTime(0.001, baseNow + bt + 0.24);
          osc.connect(g);
          g.connect(masterGain);
          osc.start(baseNow + bt);
          osc.stop(baseNow + bt + 0.28);
          activeAudioNodesRef.current.push(osc, g);
        }
      } else if (sc.sfxType === 'rain' || sc.sfxType === 'wind' || sc.sfxType === 'waves') {
        const dur = Math.min(20, relEnd - relStart);
        const len = Math.max(1024, Math.floor(ctx.sampleRate * dur));
        const noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const chData = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          chData[i] = Math.random() * 2 - 1;
        }
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.value = sc.sfxType === 'rain' ? 1400 : sc.sfxType === 'waves' ? 420 : 680;
        filt.Q.value = sc.sfxType === 'wind' ? 2.4 : 0.9;
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.075, baseNow + relStart);
        src.connect(filt);
        filt.connect(nGain);
        nGain.connect(masterGain);
        src.start(baseNow + relStart);
        src.stop(baseNow + relEnd);
        activeAudioNodesRef.current.push(src, filt, nGain);
      } else if (sc.sfxType === 'explosion') {
        const boomOsc = ctx.createOscillator();
        const boomGain = ctx.createGain();
        boomOsc.type = 'sine';
        boomOsc.frequency.setValueAtTime(115, baseNow + relStart + 0.15);
        boomOsc.frequency.exponentialRampToValueAtTime(28, baseNow + relStart + 1.1);
        boomGain.gain.setValueAtTime(0.001, baseNow + relStart + 0.15);
        boomGain.gain.linearRampToValueAtTime(0.45, baseNow + relStart + 0.19);
        boomGain.gain.exponentialRampToValueAtTime(0.001, baseNow + relStart + 1.25);
        boomOsc.connect(boomGain);
        boomGain.connect(compressor);
        boomOsc.start(baseNow + relStart + 0.15);
        boomOsc.stop(baseNow + relStart + 1.3);
        activeAudioNodesRef.current.push(boomOsc, boomGain);
      }

      // 1b. If scene carries user uploadedAudioBase64 (Audio-to-Video mode), play it synced to scene start
      if (sc.uploadedAudioBase64) {
        try {
          const cleanB64 = sc.uploadedAudioBase64.replace(/^data:[^;]+;base64,/, '');
          const decoded = await ctx.decodeAudioData(base64ToArrayBuffer(cleanB64));
          const offsetInside = Math.max(0, fromSec - entry.startSec);
          const delay = Math.max(0, entry.startSec - fromSec);
          if (offsetInside < decoded.duration) {
            const aSrc = ctx.createBufferSource();
            aSrc.buffer = decoded;
            const aGain = ctx.createGain();
            aGain.gain.setValueAtTime(1.0, baseNow + delay);
            aSrc.connect(aGain);
            aGain.connect(compressor);
            aSrc.start(baseNow + delay, offsetInside, Math.max(0.2, entry.endSec - entry.startSec));
            activeAudioNodesRef.current.push(aSrc, aGain);
          }
        } catch {
          // ignore unsupported browser audio codec gracefully
        }
      }
    }

    // 2. Schedule dialogue WAV tracks accurately aligned to timeline
    for (const entry of timeline) {
      if (entry.kind !== 'scene' || !entry.scene) continue;
      const sc = entry.scene;
      const timings = dialogueTimingsByScene.get(sc.id) || [];
      for (const dt of timings) {
        if (!dt.line.audioBase64) continue;
        const absStart = entry.startSec + dt.startSec;
        const absEnd = entry.startSec + dt.endSec;
        if (absEnd <= fromSec) continue;

        try {
          const decoded = await ctx.decodeAudioData(base64ToArrayBuffer(dt.line.audioBase64));
          const offsetInsideAudio = Math.max(0, fromSec - absStart);
          const delayFromNow = Math.max(0, absStart - fromSec);
          if (offsetInsideAudio >= decoded.duration) continue;

          const src = ctx.createBufferSource();
          src.buffer = decoded;
          const dlgGain = ctx.createGain();
          dlgGain.gain.setValueAtTime(1.08, baseNow + delayFromNow);
          src.connect(dlgGain);
          dlgGain.connect(compressor);
          src.playbackRate.value = Math.min(1.5, Math.max(0.7, sc.speed || 1));
          src.start(baseNow + delayFromNow, offsetInsideAudio);
          activeAudioNodesRef.current.push(src, dlgGain);
        } catch {
          // ignore malformed WAV buffer gracefully
        }
      }
    }
  }

  function drawCharacterFigure(
    ctx: CanvasRenderingContext2D,
    char: CinemaCharacter,
    x: number,
    y: number,
    boxSize: number,
    tSec: number,
    isSpeaking: boolean,
  ) {
    const imgKey = `${char.id}:${char.uploadedImageUrl || char.avatarSvg?.length || 0}`;
    const img = charImgCacheRef.current.get(imgKey);

    const energetic = /سريع|حيو|ركض|مرح|كرتون|أكشن/.test(char.movementStyle || '');
    const bob = Math.sin(tSec * (isSpeaking ? 4.4 : energetic ? 3.2 : 1.9)) * (isSpeaking ? 3.2 : energetic ? 3.0 : 1.8);
    const speakBoost = isSpeaking ? 1.04 : 0.98;
    const breathScale = speakBoost + Math.sin(tSec * 2.2) * 0.012 + (isSpeaking ? Math.sin(tSec * 9.5) * 0.01 : 0);
    const headTilt = isSpeaking ? Math.sin(tSec * 2.5) * 0.022 : Math.sin(tSec * 1.0) * 0.009;

    ctx.save();
    ctx.translate(x, y + bob);

    // Grounded soft contact shadow
    ctx.fillStyle = 'rgba(2, 4, 14, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, boxSize * 0.5, boxSize * 0.42, boxSize * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(headTilt);
    ctx.scale(breathScale, breathScale);

    // Cinematic Key & Rim Aura behind active character
    const auraRadius = isSpeaking ? boxSize * 0.72 : boxSize * 0.56;
    const aura = ctx.createRadialGradient(0, -boxSize * 0.06, boxSize * 0.14, 0, -boxSize * 0.06, auraRadius);
    aura.addColorStop(0, `${char.primaryColor || '#67e8f9'}${isSpeaking ? '5c' : '22'}`);
    aura.addColorStop(1, 'transparent');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, -boxSize * 0.06, auraRadius, 0, Math.PI * 2);
    ctx.fill();

    if (img) {
      // Preserve aspect ratio smoothly inside a feathered rounded cinematic frame — NEVER paste red ovals on portraits!
      const natW = img.naturalWidth || img.width || boxSize;
      const natH = img.naturalHeight || img.height || boxSize;
      const ar = natW / Math.max(1, natH);
      const maxBox = boxSize * 1.04;
      const dw = ar >= 1 ? maxBox : maxBox * ar;
      const dh = ar >= 1 ? maxBox / ar : maxBox;
      const fx = -dw / 2;
      const fy = -dh / 2 - boxSize * 0.05;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(fx, fy, dw, dh, Math.round(boxSize * 0.12));
      ctx.clip();
      ctx.drawImage(img, fx, fy, dw, dh);
      // Soft atmospheric bottom integration gradient
      const integ = ctx.createLinearGradient(0, fy + dh * 0.68, 0, fy + dh);
      integ.addColorStop(0, 'rgba(6,8,18,0)');
      integ.addColorStop(1, 'rgba(6,8,18,0.42)');
      ctx.fillStyle = integ;
      ctx.fillRect(fx, fy + dh * 0.68, dw, dh * 0.32);
      ctx.restore();

      ctx.strokeStyle = isSpeaking ? (char.primaryColor || '#fde047') : 'rgba(255,255,255,0.28)';
      ctx.lineWidth = isSpeaking ? 3.2 : 1.6;
      ctx.beginPath();
      ctx.roundRect(fx, fy, dw, dh, Math.round(boxSize * 0.12));
      ctx.stroke();

      // Subtle animated speech voice visualizer equalizer bars next to speaking frame
      if (isSpeaking) {
        for (let bar = 0; bar < 4; bar++) {
          const bh = 6 + (8 + (bar % 2) * 6) * Math.abs(Math.sin(tSec * 13 + bar * 1.2));
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.roundRect(fx + dw + 6 + bar * 5, fy + dh * 0.5 - bh / 2, 3.5, Math.max(5, bh), 2);
          ctx.fill();
        }
      }
    } else {
      ctx.fillStyle = char.secondaryColor || '#1e293b';
      ctx.beginPath();
      ctx.roundRect(-boxSize * 0.28, boxSize * 0.06, boxSize * 0.56, boxSize * 0.36, 20);
      ctx.fill();

      ctx.fillStyle = '#e2b89b';
      ctx.beginPath();
      ctx.arc(0, -boxSize * 0.1, boxSize * 0.18, 0, Math.PI * 2);
      ctx.fill();

      const blink = (tSec % 4.1) > 3.96;
      ctx.fillStyle = '#0f172a';
      if (blink) {
        ctx.fillRect(-boxSize * 0.08, -boxSize * 0.13, boxSize * 0.045, 2);
        ctx.fillRect(boxSize * 0.035, -boxSize * 0.13, boxSize * 0.045, 2);
      } else {
        ctx.beginPath();
        ctx.arc(-boxSize * 0.06, -boxSize * 0.13, 3.2, 0, Math.PI * 2);
        ctx.arc(boxSize * 0.06, -boxSize * 0.13, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (isSpeaking) {
        const mouthOpen = 2.4 + Math.abs(Math.sin(tSec * 14.5) * Math.cos(tSec * 7.2)) * 5.8;
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath();
        ctx.ellipse(0, -boxSize * 0.01, boxSize * 0.042, mouthOpen, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Reset tilt for crisp readable name label
    ctx.rotate(-headTilt);
    ctx.fillStyle = isSpeaking ? 'rgba(15, 23, 42, 0.92)' : 'rgba(8, 10, 22, 0.82)';
    ctx.beginPath();
    ctx.roundRect(-64, boxSize * 0.44, 128, 24, 7);
    ctx.fill();
    ctx.fillStyle = isSpeaking ? '#fde047' : '#f8fafc';
    ctx.font = 'bold 12px Tahoma, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char.name.slice(0, 18), 0, boxSize * 0.44 + 12);

    ctx.restore();
  }

  function drawWeatherAndLighting(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    sc: CinemaScene,
    tSec: number,
  ) {
    // Cinematic Lighting Grade + Volumetric Rays
    ctx.save();
    if (sc.lighting === 'horror') {
      const g = ctx.createRadialGradient(W / 2, H / 2, W * 0.18, W / 2, H / 2, W * 0.75);
      g.addColorStop(0, 'rgba(12, 25, 34, 0.08)');
      g.addColorStop(1, 'rgba(3, 5, 10, 0.64)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else if (sc.lighting === 'neon') {
      const ng = ctx.createLinearGradient(0, 0, W, H);
      ng.addColorStop(0, 'rgba(56, 189, 248, 0.18)');
      ng.addColorStop(1, 'rgba(217, 70, 239, 0.18)');
      ctx.fillStyle = ng;
      ctx.fillRect(0, 0, W, H);
    } else if (sc.lighting === 'golden') {
      const gg = ctx.createRadialGradient(W * 0.8, H * 0.18, 20, W * 0.8, H * 0.18, W * 0.85);
      gg.addColorStop(0, 'rgba(251, 191, 36, 0.28)');
      gg.addColorStop(1, 'rgba(234, 88, 12, 0.08)');
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, W, H);
    } else if (sc.lighting === 'romantic') {
      const rg = ctx.createRadialGradient(W * 0.5, H * 0.35, 20, W * 0.5, H * 0.35, W * 0.8);
      rg.addColorStop(0, 'rgba(244, 114, 182, 0.18)');
      rg.addColorStop(1, 'rgba(15, 12, 30, 0.28)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    } else {
      // Subtle volumetric cinema light rays drifting gently across frame
      ctx.globalCompositeOperation = 'screen';
      const sweep = Math.sin(tSec * 0.6) * W * 0.08;
      const beam = ctx.createLinearGradient(W * 0.15 + sweep, 0, W * 0.55 + sweep, H);
      beam.addColorStop(0, 'rgba(125, 211, 252, 0.09)');
      beam.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
      beam.addColorStop(1, 'transparent');
      ctx.fillStyle = beam;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Ambient floating dust motes / cinematic sparkles for rich filmic depth
    for (let i = 0; i < 16; i++) {
      const mx = (i * 107 + Math.sin(tSec * 0.7 + i) * 28 + tSec * 14) % W;
      const my = (i * 67 + Math.cos(tSec * 0.5 + i * 2) * 18) % H;
      const ma = 0.12 + 0.18 * Math.abs(Math.sin(tSec * 1.4 + i));
      ctx.fillStyle = sc.lighting === 'golden' ? `rgba(253, 224, 71, ${ma.toFixed(2)})` : `rgba(224, 242, 254, ${ma.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(mx, my, 1.4 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }

    // Weather Particle Layer
    if (sc.weather === 'rain' || sc.weather === 'storm') {
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.45)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 65; i++) {
        const px = ((i * 97 + tSec * 140) % (W + 80)) - 40;
        const py = ((i * 53 + tSec * 720) % (H + 60)) - 30;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - 8, py + 22);
        ctx.stroke();
      }
      if (sc.weather === 'storm' && Math.sin(tSec * 7.3) > 0.94) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.fillRect(0, 0, W, H);
      }
    } else if (sc.weather === 'snow') {
      ctx.fillStyle = 'rgba(248, 250, 252, 0.78)';
      for (let i = 0; i < 48; i++) {
        const px = (i * 83 + Math.sin(tSec * 1.4 + i) * 35) % W;
        const py = (i * 41 + tSec * 58) % H;
        ctx.beginPath();
        ctx.arc(px, py, 2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (sc.weather === 'fog') {
      const fog = ctx.createLinearGradient(0, H * 0.45, 0, H);
      fog.addColorStop(0, 'rgba(203, 213, 225, 0.02)');
      fog.addColorStop(1, 'rgba(203, 213, 225, 0.34)');
      ctx.fillStyle = fog;
      ctx.fillRect(0, H * 0.45, W, H * 0.55);
    } else if (sc.weather === 'night_stars') {
      for (let i = 0; i < 36; i++) {
        const alpha = 0.25 + 0.65 * Math.abs(Math.sin(tSec * 2 + i));
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc((i * 131) % W, (i * 61) % (H * 0.52), 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // CGI & VFX Layers (Lens Flare, Chase Speed Lines, Explosion Sparks, Rain Floor Reflections)
    if (sc.vfxOverlay === 'lens_flare') {
      ctx.globalCompositeOperation = 'screen';
      const fx = W * (0.25 + 0.45 * Math.abs(Math.sin(tSec * 0.35)));
      const fy = H * 0.22;
      const flare = ctx.createRadialGradient(fx, fy, 4, fx, fy, W * 0.28);
      flare.addColorStop(0, 'rgba(255, 248, 220, 0.55)');
      flare.addColorStop(0.35, 'rgba(56, 189, 248, 0.2)');
      flare.addColorStop(1, 'transparent');
      ctx.fillStyle = flare;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    } else if (sc.vfxOverlay === 'chase_lines') {
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.22)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 18; i++) {
        const ly = ((i * 59 + tSec * 90) % H);
        const lx = ((i * 173 + tSec * 900) % (W + 220)) - 220;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + 140, ly);
        ctx.stroke();
      }
    } else if (sc.vfxOverlay === 'explosion_sparks') {
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 26; i++) {
        const ang = (i / 26) * Math.PI * 2 + tSec * 0.8;
        const dist = ((tSec * 140 + i * 23) % (W * 0.45));
        const sx = W * 0.5 + Math.cos(ang) * dist;
        const sy = H * 0.58 + Math.sin(ang) * dist * 0.6;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(251, 146, 60, 0.72)' : 'rgba(253, 224, 71, 0.65)';
        ctx.beginPath();
        ctx.arc(sx, sy, 2.2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (sc.vfxOverlay === 'rain_reflections') {
      const refl = ctx.createLinearGradient(0, H * 0.74, 0, H);
      refl.addColorStop(0, 'rgba(56, 189, 248, 0.02)');
      refl.addColorStop(0.5, 'rgba(167, 139, 250, 0.14)');
      refl.addColorStop(1, 'rgba(56, 189, 248, 0.22)');
      ctx.fillStyle = refl;
      ctx.fillRect(0, H * 0.74, W, H * 0.26);
    }
    ctx.restore();
  }

  function renderFrameToCanvas(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    atSec: number,
  ) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, W, H);
    const entry =
      timeline.find((e) => atSec >= e.startSec && atSec <= e.endSec) ||
      timeline[timeline.length - 1];
    if (!entry) return;

    if (entry.kind === 'intro') {
      const prog = Math.min(1, Math.max(0, (atSec - entry.startSec) / Math.max(0.5, entry.endSec - entry.startSec)));
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#070914');
      bg.addColorStop(1, '#14172b');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const alpha = prog < 0.2 ? prog / 0.2 : prog > 0.85 ? (1 - prog) / 0.15 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.textAlign = 'center';
      ctx.fillStyle = '#38bdf8';
      ctx.font = `bold ${Math.round(W * 0.02)}px Tahoma, Arial, sans-serif`;
      ctx.fillText(`ZORVYX AI CINEMA  ·  ${project.genre}`, W / 2, H * 0.36);

      ctx.fillStyle = '#f8fafc';
      ctx.font = `bold ${Math.round(W * 0.048)}px Tahoma, Arial, sans-serif`;
      ctx.fillText(stripHashMarks(project.introTitle || project.title || 'عمل سينمائي جديد').slice(0, 42), W / 2, H * 0.48);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = `${Math.round(W * 0.022)}px Tahoma, Arial, sans-serif`;
      ctx.fillText(stripHashMarks(project.introSubtitle || targetEpisode?.title || ''), W / 2, H * 0.59);
      ctx.restore();
      return;
    }

    if (entry.kind === 'outro') {
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#05060f');
      bg.addColorStop(1, '#111526');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#67e8f9';
      ctx.font = `bold ${Math.round(W * 0.032)}px Tahoma, Arial, sans-serif`;
      ctx.fillText(stripHashMarks(project.outroCredits || 'النهاية'), W / 2, H * 0.42);

      if (project.castList || project.characters.length > 0) {
        const names = project.castList || project.characters.map((c) => `${c.name} (${c.role})`).join('  ·  ');
        ctx.fillStyle = '#cbd5e1';
        ctx.font = `${Math.round(W * 0.02)}px Tahoma, Arial, sans-serif`;
        ctx.fillText(stripHashMarks(names).slice(0, 85), W / 2, H * 0.54);
      }

      ctx.fillStyle = '#94a3b8';
      ctx.font = `${Math.round(W * 0.016)}px Tahoma, Arial, sans-serif`;
      ctx.fillText('تم الإخراج والمونتاج بواسطة ZORVYX AI CINEMA', W / 2, H * 0.72);
      ctx.restore();
      return;
    }

    const sc = entry.scene!;
    const sceneLocalSec = Math.max(0, atSec - entry.startSec);
    const sceneSpan = Math.max(1, entry.endSec - entry.startSec);
    const sceneProg = Math.min(1, sceneLocalSec / sceneSpan);

    // 1. Background / Video / Uploaded Photo with real cinematic Camera Motion & Color Grading
    ctx.save();
    let zoom =
      sc.shotType === 'closeup'
        ? 1.24
        : sc.shotType === 'medium'
          ? 1.1
          : sc.shotType === 'aerial'
            ? 1.14
            : 1.0;
    let panX = 0;
    let panY = 0;
    if (sc.cameraMotion === 'zoom_in') zoom += sceneProg * 0.14;
    else if (sc.cameraMotion === 'zoom_out') zoom += (1 - sceneProg) * 0.14;
    else if (sc.cameraMotion === 'aerial') {
      zoom += 0.08 + Math.sin(sceneProg * Math.PI) * 0.08;
      panX = (sceneProg - 0.5) * W * 0.08;
      panY = (0.5 - sceneProg) * H * 0.07;
    } else if (sc.cameraMotion === 'tracking') {
      zoom += 0.09;
      panX = Math.sin(sceneProg * Math.PI * 1.5) * W * 0.06;
    } else if (sc.cameraMotion === 'slow_motion') {
      zoom += sceneProg * 0.06;
    } else if (sc.cameraMotion === 'pan_left') panX = (0.5 - sceneProg) * W * 0.09;
    else if (sc.cameraMotion === 'pan_right') panX = (sceneProg - 0.5) * W * 0.09;
    else if (sc.cameraMotion === 'orbit') {
      panX = Math.sin(sceneProg * Math.PI * 2) * W * 0.03;
      panY = Math.cos(sceneProg * Math.PI * 2) * H * 0.02;
    }

    const cContrast = sc.colorContrast ?? (sc.enhanceVideoFilter ? 1.12 : 1.0);
    const cSat = sc.colorSaturation ?? (sc.enhanceVideoFilter ? 1.16 : 1.0);
    const cBright = sc.colorBrightness ?? (sc.enhanceVideoFilter ? 1.04 : 1.0);
    if (sc.enhanceVideoFilter || cContrast !== 1 || cSat !== 1 || cBright !== 1) {
      ctx.filter = `contrast(${cContrast}) saturate(${cSat}) brightness(${cBright})`;
    }

    ctx.translate(W / 2 + panX, H / 2 + panY);
    ctx.scale(zoom, zoom);

    const uploadedVid = sc.uploadedVideoUrl ? videoElemCacheRef.current.get(sc.uploadedVideoUrl) : null;
    const uploadedImg = backdropCacheRef.current.get(`${sc.id}:img`);
    const backdropImg = backdropCacheRef.current.get(sc.id);

    if (uploadedVid && uploadedVid.readyState >= 2) {
      const targetVidTime = (sc.trimStart || 0) + sceneLocalSec * (sc.speed || 1);
      if (Math.abs(uploadedVid.currentTime - targetVidTime) > 0.25 && !isPlayingRef.current) {
        try {
          uploadedVid.currentTime = Math.min(uploadedVid.duration || targetVidTime, targetVidTime);
        } catch {
          // ignore
        }
      }
      ctx.drawImage(uploadedVid, -W / 2, -H / 2, W, H);
    } else if (uploadedImg) {
      ctx.drawImage(uploadedImg, -W / 2, -H / 2, W, H);
    } else if (backdropImg) {
      ctx.drawImage(backdropImg, -W / 2, -H / 2, W, H);
    } else {
      const fallbackBg = ctx.createLinearGradient(0, -H / 2, 0, H / 2);
      fallbackBg.addColorStop(0, sc.timeOfDay === 'day' ? '#1e3a5f' : '#0b1024');
      fallbackBg.addColorStop(1, '#090b16');
      ctx.fillStyle = fallbackBg;
      ctx.fillRect(-W / 2, -H / 2, W, H);
    }

    const overlayVfx = overlayCacheRef.current.get(sc.id);
    if (overlayVfx) {
      ctx.drawImage(overlayVfx, -W / 2, -H / 2, W, H);
    }
    ctx.restore();

    // 2. Lighting & Weather Particles
    drawWeatherAndLighting(ctx, W, H, sc, atSec);

    // 3. Characters with real consistency + speech-synced lip animation
    const timings = dialogueTimingsByScene.get(sc.id) || [];
    const activeLine = timings.find((t) => sceneLocalSec >= t.startSec && sceneLocalSec <= t.endSec)?.line;

    const sceneChars = project.characters.filter(
      (c) => sc.characterIds.length === 0 || sc.characterIds.includes(c.id),
    );
    if (sceneChars.length > 0 && !sc.uploadedVideoUrl) {
      const boxSize = Math.min(W, H) * (sc.shotType === 'closeup' ? 0.34 : 0.25);
      sceneChars.slice(0, 3).forEach((ch, idx) => {
        const ratio = sceneChars.length === 1 ? 0.5 : 0.25 + (idx / (sceneChars.length - 1)) * 0.5;
        const cx = W * ratio;
        const cy = H * 0.58;
        const isSpeaking = activeLine ? activeLine.characterId === ch.id : false;
        drawCharacterFigure(ctx, ch, cx, cy, boxSize, atSec, isSpeaking);
      });
    }

    // 4. Optional Kinetic Text / Title Overlay
    if (sc.overlayText) {
      ctx.save();
      ctx.fillStyle = 'rgba(7, 10, 22, 0.72)';
      ctx.beginPath();
      ctx.roundRect(W * 0.05, H * 0.06, W * 0.5, 42, 8);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.font = `bold ${Math.round(W * 0.022)}px Tahoma, Arial, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(sc.overlayText.slice(0, 48), W * 0.53, H * 0.06 + 21);
      ctx.restore();
    }

    // 5. Auto Synchronized Subtitles
    if (project.showSubtitles && activeLine?.text) {
      ctx.save();
      const subtitleText = activeLine.speakerName ? `${activeLine.speakerName}: ${activeLine.text}` : activeLine.text;
      ctx.font = `bold ${Math.round(Math.max(15, W * 0.022))}px Tahoma, Arial, sans-serif`;
      const maxTw = W * 0.86;
      const words = subtitleText.split(/\s+/);
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (ctx.measureText(next).width > maxTw && cur) {
          lines.push(cur);
          cur = w;
        } else {
          cur = next;
        }
      }
      if (cur) lines.push(cur);
      const shown = lines.slice(0, 2);
      const boxH = shown.length > 1 ? 74 : 46;
      ctx.fillStyle = 'rgba(4, 6, 16, 0.82)';
      ctx.beginPath();
      ctx.roundRect(W * 0.06, H - boxH - 22, W * 0.88, boxH, 10);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      shown.forEach((ln, li) => {
        const yy = H - boxH - 22 + (shown.length === 1 ? boxH / 2 : 24 + li * 26);
        ctx.fillText(ln, W / 2, yy);
      });
      ctx.restore();
    }

    // 6. Toggleable Logo Watermark
    if (project.showLogoWatermark && logoImgRef.current) {
      ctx.save();
      ctx.globalAlpha = 0.78;
      const lw = Math.round(W * 0.052);
      ctx.drawImage(logoImgRef.current, W - lw - 18, 18, lw, lw);
      ctx.restore();
    }

    // 7. Smooth Scene Transitions (fade_black / wipe / crossfade)
    const fadeOutTail = sceneSpan - sceneLocalSec;
    if (sc.transition === 'fade_black' && sceneLocalSec < 0.55) {
      ctx.fillStyle = `rgba(0,0,0,${(1 - sceneLocalSec / 0.55).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    } else if (sc.transition === 'crossfade' && sceneLocalSec < 0.45) {
      ctx.fillStyle = `rgba(7,9,20,${((1 - sceneLocalSec / 0.45) * 0.72).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    } else if (sc.transition === 'wipe' && sceneLocalSec < 0.45) {
      const wipeW = W * (1 - sceneLocalSec / 0.45);
      ctx.fillStyle = '#050711';
      ctx.fillRect(0, 0, wipeW, H);
    }
    if (fadeOutTail < 0.35 && sc.transition !== 'cut') {
      ctx.fillStyle = `rgba(5,7,17,${((1 - Math.max(0, fadeOutTail) / 0.35) * 0.58).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawFrameAtTime(atSec: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderFrameToCanvas(ctx, canvas.width, canvas.height, atSec);
  }

  function pausePlayback() {
    isPlayingRef.current = false;
    setIsPlaying(false);
    stopAllPlaybackAudio();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  async function startPlayback(fromSec = currentTimeRef.current) {
    unlockGlobalAudioContext();
    if (fromSec >= totalDuration - 0.15) fromSec = 0;
    currentTimeRef.current = fromSec;
    setCurrentTime(fromSec);
    isPlayingRef.current = true;
    setIsPlaying(true);

    for (const v of videoElemCacheRef.current.values()) {
      try {
        await v.play();
      } catch {
        // user gesture video play fallback
      }
    }

    void scheduleCinemaAudio(fromSec);
    playStartPerfRef.current = performance.now() - fromSec * 1000;

    const tick = () => {
      if (!isPlayingRef.current) return;
      const elapsed = (performance.now() - playStartPerfRef.current) / 1000;
      if (elapsed >= totalDuration) {
        currentTimeRef.current = totalDuration;
        setCurrentTime(totalDuration);
        drawFrameAtTime(totalDuration);
        pausePlayback();
        return;
      }
      currentTimeRef.current = elapsed;
      setCurrentTime(elapsed);
      drawFrameAtTime(elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function exportCinemaVideo() {
    if (isExporting || scenes.length === 0) return;
    pausePlayback();
    unlockGlobalAudioContext();

    const dims = getExportDimensions(project.quality, project.aspectRatio);
    let exportW = dims.width;
    let exportH = dims.height;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = exportW;
    offCanvas.height = exportH;
    let offCtx = offCanvas.getContext('2d');

    if (!offCtx) {
      setExportStatus('المتصفح الحالي لا يدعم تصدير الفيديو عبر لوحة العرض.');
      return;
    }

    setIsExporting(true);
    setExportProgress(2);
    mediaRecAbortRef.current = false;
    setExportStatus(`جاري التحضير للتصدير بدقة ${getQualityArabicLabel(project.quality)} (${exportW}×${exportH})…`);

    const mimeCandidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const pickedMime = mimeCandidates.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
    if (!pickedMime) {
      setIsExporting(false);
      setExportStatus('المتصفح لا يدعم تسجيل وتصدير الفيديو مباشرة. استخدمي زر تنزيل السيناريو كبديل.');
      return;
    }

    const ctx = getGlobalAudioContext();
    let stream: MediaStream;
    try {
      const videoStream = offCanvas.captureStream(30);
      if (ctx) {
        const dest = ctx.createMediaStreamDestination();
        void scheduleCinemaAudio(0, dest);
        stream = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      } else {
        stream = videoStream;
      }
    } catch {
      // Fallback safely from high resolution to 1080p if device GPU rejects it
      if (project.quality === '4k' || project.quality === '2k') {
        exportW = project.aspectRatio === '9:16' ? 1080 : project.aspectRatio === '1:1' ? 1080 : 1920;
        exportH = project.aspectRatio === '9:16' ? 1920 : project.aspectRatio === '1:1' ? 1080 : 1080;
        offCanvas.width = exportW;
        offCanvas.height = exportH;
        offCtx = offCanvas.getContext('2d');
        setExportStatus(`تم التبديل تلقائياً للدقة الكاملة الفائقة (${exportW}×${exportH}) لأن معالج الرسوميات في الجهاز لا يدعم ${getQualityArabicLabel(project.quality)}.`);
        stream = offCanvas.captureStream(30);
      } else {
        setIsExporting(false);
        setExportStatus('تعذر إنشاء تدفق الفيديو للتسجيل.');
        return;
      }
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: pickedMime,
      videoBitsPerSecond: dims.bitrate,
    });

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const donePromise = new Promise<void>((resolve) => {
      recorder.onstop = () => {
        stopAllPlaybackAudio();
        if (!mediaRecAbortRef.current && chunks.length > 0) {
          const ext = pickedMime.includes('mp4') ? 'mp4' : 'webm';
          const outBlob = new Blob(chunks, { type: pickedMime.split(';')[0] });
          const baseName = safeFileName(project.title || targetEpisode?.title || 'zorvyx-cinema');
          saveBlob(outBlob, `${baseName}.${ext}`);
          setExportStatus(
            `تم تصدير وتنزيل العمل بنجاح (${baseName}.${ext}) بدقة ${exportW}×${exportH}.`,
          );
        } else if (mediaRecAbortRef.current) {
          setExportStatus('تم إلغاء عملية التصدير.');
        }
        setIsExporting(false);
        setExportProgress(100);
        resolve();
      };
    });

    recorder.start(400);
    const startPerf = performance.now();

    const stepLoop = () => {
      if (mediaRecAbortRef.current) {
        recorder.stop();
        return;
      }
      const elapsed = (performance.now() - startPerf) / 1000;
      const pct = Math.min(99, Math.round((elapsed / totalDuration) * 100));
      setExportProgress(pct);
      if (offCtx) renderFrameToCanvas(offCtx, exportW, exportH, Math.min(totalDuration, elapsed));

      if (elapsed >= totalDuration) {
        recorder.stop();
        return;
      }
      requestAnimationFrame(stepLoop);
    };

    requestAnimationFrame(stepLoop);
    await donePromise;
  }

  function exportStandaloneCinemaHtml() {
    const title = stripHashMarks(project.title || targetEpisode?.title || 'zorvyx-ai-cinema');
    const summaryText = stripHashMarks(
      `${project.logline || ''}\n\n${scenes.map((s, i) => `${i + 1}. ${s.title}: ${s.locationDesc}\n${s.dialogues.map((d) => `${d.speakerName}: ${d.text}`).join('\n')}`).join('\n\n')}`,
    );
    const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${escHtml(title)}</title><body style="background:#080a16;color:#f8fafc;font-family:Tahoma,Arial;padding:32px;line-height:1.9;max-width:900px;margin:auto"><h1 style="color:#38bdf8">${escHtml(title)}</h1><p style="color:#94a3b8">${escHtml(project.genre)} · ${escHtml(getAspectArabicLabel(project.aspectRatio))} · ${escHtml(getQualityArabicLabel(project.quality))}</p><hr style="border-color:#1e293b"/><pre style="white-space:pre-wrap;font-family:inherit">${escHtml(summaryText)}</pre></body></html>`;
    saveBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeFileName(title)}-سيناريو.html`);
    setExportStatus('تم تنزيل ملف السيناريو والعمل التفاعلي بنجاح.');
  }

  return (
    <div className="cinema-player-wrap">
      <div className="cinema-canvas-stage" style={{ aspectRatio: project.aspectRatio.replace(':', ' / ') }}>
        <canvas
          ref={canvasRef}
          width={previewDims.w}
          height={previewDims.h}
          className="cinema-canvas"
          onClick={() => (isPlaying ? pausePlayback() : void startPlayback())}
        />
      </div>

      <div className="cinema-transport-bar">
        <div className="cinema-transport-btns">
          <button
            type="button"
            className="primary"
            disabled={isExporting || scenes.length === 0}
            onClick={() => (isPlaying ? pausePlayback() : void startPlayback())}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            {isPlaying ? 'إيقاف مؤقت' : 'معاينة وتشغيل العمل'}
          </button>

          <button
            type="button"
            className="secondary"
            disabled={isExporting}
            onClick={() => {
              pausePlayback();
              currentTimeRef.current = 0;
              setCurrentTime(0);
              drawFrameAtTime(0);
            }}
          >
            <RotateCcw size={15} />
            من البداية
          </button>

          <button
            type="button"
            className="secondary"
            onClick={() => {
              setIsMuted((prev) => {
                const next = !prev;
                if (next) stopAllPlaybackAudio();
                return next;
              });
            }}
            aria-label="كتم أو تفعيل الصوت"
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>

        <div className="cinema-scrubber-row">
          <span className="cinema-timecode">{formatTimeMMSS(currentTime)} / {formatTimeMMSS(totalDuration)}</span>
          <input
            type="range"
            min={0}
            max={totalDuration}
            step={0.1}
            value={Math.min(currentTime, totalDuration)}
            onChange={(e) => {
              const t = Number(e.target.value);
              pausePlayback();
              currentTimeRef.current = t;
              setCurrentTime(t);
              drawFrameAtTime(t);
            }}
            className="cinema-scrubber"
            aria-label="شريط الزمن"
          />
        </div>
      </div>

      <div className="cinema-export-bar">
        <div className="cinema-export-meta">
          <Film size={15} />
          <span>التصدير الفعلي: {getQualityArabicLabel(project.quality)}</span>
          <span aria-hidden="true">·</span>
          <span>النسبة: {getAspectArabicLabel(project.aspectRatio)}</span>
          <span aria-hidden="true">·</span>
          <span>{scenes.length} مشاهد متسلسلة</span>
        </div>

        <div className="toolrow" style={{ margin: 0 }}>
          {!isExporting ? (
            <button
              type="button"
              className="primary"
              disabled={scenes.length === 0}
              onClick={() => void exportCinemaVideo()}
            >
              <Download size={16} />
              تصدير وتنزيل الفيديو ({getQualityArabicLabel(project.quality)})
            </button>
          ) : (
            <button
              type="button"
              className="mini-btn danger"
              onClick={() => {
                mediaRecAbortRef.current = true;
              }}
            >
              إلغاء التصدير ({exportProgress}%)
            </button>
          )}
          <button type="button" className="secondary" onClick={exportStandaloneCinemaHtml}>
            تنزيل السيناريو كصفحة ويب
          </button>
        </div>
      </div>

      {exportStatus && <div className="statusbox info">{exportStatus}</div>}
    </div>
  );
}
