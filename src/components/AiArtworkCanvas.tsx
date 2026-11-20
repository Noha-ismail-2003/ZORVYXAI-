import { useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal, Sparkles, Eye, RotateCcw, Download, Film, Wand2 } from 'lucide-react';
import type { ArtSpec, ImageEditRecipe } from '../utils/mediaExport';
import {
  IMAGE_ASPECT_OPTIONS,
  safeFileName,
  sanitizeSvgClient,
  saveBlob,
  saveDataUrl,
  stripHashMarks,
} from '../utils/mediaExport';

interface Props {
  artwork: ArtSpec;
  studioTheme?: 'night' | 'day';
  onSendToVideo?: (artwork: ArtSpec) => void;
  onEditArtwork?: (artwork: ArtSpec) => void;
}

const DEFAULT_RECIPE: ImageEditRecipe = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  clarity: 0,
  vignette: 0,
  grain: 0,
  blurBgIntensity: 0,
  colorWashColor: '#f59e0b',
  colorWashOpacity: 0,
  lightingAngle: 'none',
  lightingColor: '#fde68a',
  lightingIntensity: 0,
  frameStyle: 'none',
  atmosphereEffect: 'none',
  bgAction: 'none',
  sharpenIntensity: 0,
  denoiseIntensity: 0,
  presetName: 'توازن ZORVYX AI الأصلي',
  addedTypography: '',
};

interface StudioPreset {
  id: string;
  label: string;
  recipe: Partial<ImageEditRecipe>;
}

const STUDIO_PRESETS: StudioPreset[] = [
  {
    id: 'ai_default',
    label: 'تعديل الذكاء المقترح',
    recipe: {},
  },
  {
    id: 'raw_clean',
    label: 'الأصل النقي',
    recipe: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      warmth: 0,
      clarity: 0,
      vignette: 0,
      grain: 0,
      blurBgIntensity: 0,
      colorWashOpacity: 0,
      lightingAngle: 'none',
      lightingIntensity: 0,
      frameStyle: 'none',
    },
  },
  {
    id: 'cinema_warm',
    label: 'سينمائي دافئ',
    recipe: {
      brightness: 3,
      contrast: 16,
      saturation: 10,
      warmth: 18,
      clarity: 28,
      vignette: 32,
      grain: 10,
      colorWashColor: '#f59e0b',
      colorWashOpacity: 0.08,
      lightingAngle: 'top_right',
      lightingColor: '#fde68a',
      lightingIntensity: 0.25,
      frameStyle: 'cinema_bars',
    },
  },
  {
    id: 'studio_sharp',
    label: 'إضاءة استوديو',
    recipe: {
      brightness: 6,
      contrast: 20,
      saturation: 12,
      warmth: 2,
      clarity: 48,
      vignette: 14,
      grain: 0,
      blurBgIntensity: 18,
      lightingAngle: 'center',
      lightingColor: '#ffffff',
      lightingIntensity: 0.22,
      frameStyle: 'none',
    },
  },
  {
    id: 'teal_orange',
    label: 'تباين درامي عميق',
    recipe: {
      brightness: -2,
      contrast: 26,
      saturation: 22,
      warmth: 8,
      clarity: 38,
      vignette: 38,
      grain: 12,
      colorWashColor: '#0284c7',
      colorWashOpacity: 0.14,
      lightingAngle: 'top_left',
      lightingColor: '#fb923c',
      lightingIntensity: 0.28,
      frameStyle: 'none',
    },
  },
  {
    id: 'neon_night',
    label: 'نيون ليلي متوهج',
    recipe: {
      brightness: 2,
      contrast: 24,
      saturation: 35,
      warmth: -18,
      clarity: 32,
      vignette: 42,
      grain: 8,
      colorWashColor: '#7c3aed',
      colorWashOpacity: 0.18,
      lightingAngle: 'bottom_rim',
      lightingColor: '#38bdf8',
      lightingIntensity: 0.36,
      frameStyle: 'none',
    },
  },
  {
    id: 'luxury_gold',
    label: 'ذهبي فاخر',
    recipe: {
      brightness: 4,
      contrast: 18,
      saturation: 14,
      warmth: 28,
      clarity: 35,
      vignette: 26,
      grain: 4,
      colorWashColor: '#d97706',
      colorWashOpacity: 0.14,
      lightingAngle: 'top_right',
      lightingColor: '#fde047',
      lightingIntensity: 0.3,
      frameStyle: 'gold_border',
    },
  },
  {
    id: 'remove_bg_cutout',
    label: 'إزالة الخلفية وتفريغ العنصر',
    recipe: {
      bgAction: 'remove',
      sharpenIntensity: 35,
      clarity: 26,
      contrast: 10,
      saturation: 8,
    },
  },
  {
    id: 'hd_sharpen',
    label: 'رفع الدقة والتوضيح الفائق',
    recipe: {
      sharpenIntensity: 78,
      denoiseIntensity: 42,
      clarity: 48,
      contrast: 16,
      saturation: 12,
    },
  },
  {
    id: 'noir_bw',
    label: 'أبيض وأسود فني',
    recipe: {
      brightness: 4,
      contrast: 32,
      saturation: -80,
      warmth: 0,
      clarity: 50,
      vignette: 45,
      grain: 18,
      colorWashOpacity: 0,
      lightingAngle: 'top_left',
      lightingColor: '#e2e8f0',
      lightingIntensity: 0.2,
      frameStyle: 'gallery_mat',
    },
  },
];

function loadHtmlImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function svgTextToImage(svgText: string, w: number, h: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const clean = sanitizeSvgClient(svgText);
    if (!clean) {
      resolve(null);
      return;
    }
    const blob = new Blob([clean], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.width = w;
    img.height = h;
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

function applyPixelDspAndCutout(
  canvas: HTMLCanvasElement,
  r: ImageEditRecipe,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const sharpen = Math.min(100, Math.max(0, (r.sharpenIntensity ?? 0) + Math.round((r.clarity || 0) * 0.22)));
  const denoise = Math.min(100, Math.max(0, r.denoiseIntensity ?? 0));
  const bgMode = r.bgAction || 'none';
  const needSegmentation = bgMode === 'remove' || bgMode === 'replace' || bgMode === 'blur';

  if (sharpen < 4 && denoise < 4 && !needSegmentation) return;

  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;
  const len = data.length;
  const srcCopy = new Uint8ClampedArray(data);

  // 1. Gentle Edge-Preserving 3x3 Denoise Smoothing
  if (denoise >= 4) {
    const blend = Math.min(0.65, (denoise / 100) * 0.65);
    const edgeGuard = 36;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = (y * W + x) * 4;
        if (srcCopy[idx + 3] < 10) continue;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let weightSum = 0;
        const cR = srcCopy[idx];
        const cG = srcCopy[idx + 1];
        const cB = srcCopy[idx + 2];
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const nIdx = ((y + ky) * W + (x + kx)) * 4;
            const dR = Math.abs(srcCopy[nIdx] - cR);
            const dG = Math.abs(srcCopy[nIdx + 1] - cG);
            const dB = Math.abs(srcCopy[nIdx + 2] - cB);
            const diff = (dR + dG + dB) / 3;
            const w = diff < edgeGuard ? 1 : 0.12;
            sumR += srcCopy[nIdx] * w;
            sumG += srcCopy[nIdx + 1] * w;
            sumB += srcCopy[nIdx + 2] * w;
            weightSum += w;
          }
        }
        const avgR = sumR / weightSum;
        const avgG = sumG / weightSum;
        const avgB = sumB / weightSum;
        data[idx] = Math.round(cR * (1 - blend) + avgR * blend);
        data[idx + 1] = Math.round(cG * (1 - blend) + avgG * blend);
        data[idx + 2] = Math.round(cB * (1 - blend) + avgB * blend);
      }
    }
  }

  // 2. Real Convolution Unsharp-Mask Micro-Detail Enhancement
  if (sharpen >= 4) {
    const base = denoise >= 4 ? new Uint8ClampedArray(data) : srcCopy;
    const strength = Math.min(1.45, (sharpen / 100) * 1.25);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = (y * W + x) * 4;
        if (base[idx + 3] < 10) continue;
        const top = ((y - 1) * W + x) * 4;
        const bot = ((y + 1) * W + x) * 4;
        const lft = (y * W + (x - 1)) * 4;
        const rgt = (y * W + (x + 1)) * 4;
        for (let c = 0; c < 3; c++) {
          const lap = base[idx + c] * 4 - base[top + c] - base[bot + c] - base[lft + c] - base[rgt + c];
          const val = base[idx + c] + lap * strength * 0.42;
          data[idx + c] = val < 0 ? 0 : val > 255 ? 255 : Math.round(val);
        }
      }
    }
  }

  // 3. Foreground Segmentation Alpha Mask (Border Color Sampling + Local Contrast + AI Subject Region Prior)
  if (needSegmentation) {
    const x0 = Math.max(0, Math.floor(dx));
    const y0 = Math.max(0, Math.floor(dy));
    const x1 = Math.min(W - 1, Math.floor(dx + dw));
    const y1 = Math.min(H - 1, Math.floor(dy + dh));
    const regW = Math.max(1, x1 - x0);
    const regH = Math.max(1, y1 - y0);

    // Sample outer perimeter strips of the image to estimate background colors
    const bgSamples: Array<[number, number, number]> = [];
    const sampleStep = Math.max(4, Math.floor(Math.min(regW, regH) / 28));
    for (let sx = x0 + 2; sx <= x1 - 2; sx += sampleStep) {
      for (const sy of [y0 + 3, y0 + 10, y1 - 3, y1 - 10]) {
        const p = (Math.min(H - 1, Math.max(0, sy)) * W + sx) * 4;
        bgSamples.push([data[p], data[p + 1], data[p + 2]]);
      }
    }
    for (let sy = y0 + 2; sy <= y1 - 2; sy += sampleStep) {
      for (const sx of [x0 + 3, x0 + 10, x1 - 3, x1 - 10]) {
        const p = (sy * W + Math.min(W - 1, Math.max(0, sx))) * 4;
        bgSamples.push([data[p], data[p + 1], data[p + 2]]);
      }
    }

    const subj = r.subjectRegion || { cx: 0.5, cy: 0.48, rx: 0.3, ry: 0.38 };
    const cx = dx + subj.cx * dw;
    const cy = dy + subj.cy * dh;
    const rx = Math.max(20, subj.rx * dw);
    const ry = Math.max(20, subj.ry * dh);

    const alphaBuf = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const pIdx = y * W + x;
        const px = pIdx * 4;
        if (x < x0 || x > x1 || y < y0 || y > y1 || data[px + 3] < 10) {
          alphaBuf[pIdx] = 0;
          continue;
        }
        const rr = data[px];
        const gg = data[px + 1];
        const bb = data[px + 2];

        // Minimum Euclidean distance to border background color palette
        let minBgDist = 999;
        for (let b = 0; b < bgSamples.length; b++) {
          const s = bgSamples[b];
          const dr = rr - s[0];
          const dg = gg - s[1];
          const db = bb - s[2];
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);
          if (dist < minBgDist) minBgDist = dist;
        }

        // Elliptical subject prior: 0 inside core subject, ~1 on inner contour, >1.4 outer background
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        const ellipDist = Math.sqrt(nx * nx + ny * ny);

        // Combine color difference from edges + spatial subject silhouette
        const colorScore = Math.min(1.4, minBgDist / 58);
        const spatialBoost = ellipDist < 0.72 ? 0.55 : ellipDist < 1.05 ? 0.22 : -0.32 * (ellipDist - 1.05);
        const combined = colorScore + spatialBoost;
        const rawAlpha = Math.max(0, Math.min(1, (combined - 0.46) / 0.34));
        alphaBuf[pIdx] = rawAlpha;
      }
    }

    // Smooth 3x3 feather pass on alpha mask so cutouts have silky edges without halo jaggedness
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const sumA =
          alphaBuf[(y - 1) * W + (x - 1)] +
          alphaBuf[(y - 1) * W + x] * 2 +
          alphaBuf[(y - 1) * W + (x + 1)] +
          alphaBuf[y * W + (x - 1)] * 2 +
          alphaBuf[y * W + x] * 4 +
          alphaBuf[y * W + (x + 1)] * 2 +
          alphaBuf[(y + 1) * W + (x - 1)] +
          alphaBuf[(y + 1) * W + x] * 2 +
          alphaBuf[(y + 1) * W + (x + 1)];
        const smoothA = sumA / 16;
        const p = (y * W + x) * 4;
        if (p + 3 < len) {
          data[p + 3] = Math.round(data[p + 3] * smoothA);
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

function drawAtmosphereLayer(ctx: CanvasRenderingContext2D, W: number, H: number, effect: ImageEditRecipe['atmosphereEffect']) {
  if (!effect || effect === 'none') return;
  ctx.save();
  if (effect === 'rain') {
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.38)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 85; i++) {
      const rx = ((i * 197) % (W + 40)) - 20;
      const ry = ((i * 313) % (H + 40)) - 20;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 10, ry + 26);
      ctx.stroke();
    }
  } else if (effect === 'snow') {
    ctx.fillStyle = 'rgba(248, 250, 252, 0.72)';
    for (let i = 0; i < 60; i++) {
      const sx = (i * 139) % W;
      const sy = (i * 227) % H;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.8 + (i % 4), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (effect === 'sparks') {
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 42; i++) {
      const gx = (i * 173) % W;
      const gy = (i * 271) % H;
      const rad = 2 + (i % 4);
      const sp = ctx.createRadialGradient(gx, gy, 0.5, gx, gy, rad * 3);
      sp.addColorStop(0, '#fef08a');
      sp.addColorStop(0.5, 'rgba(251,146,60,0.45)');
      sp.addColorStop(1, 'transparent');
      ctx.fillStyle = sp;
      ctx.beginPath();
      ctx.arc(gx, gy, rad * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (effect === 'bokeh') {
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 24; i++) {
      const bx = (i * 211) % W;
      const by = (i * 149) % H;
      const br = 14 + (i % 5) * 9;
      const bk = ctx.createRadialGradient(bx, by, 2, bx, by, br);
      bk.addColorStop(0, 'rgba(253, 224, 71, 0.14)');
      bk.addColorStop(0.75, 'rgba(103, 232, 249, 0.12)');
      bk.addColorStop(1, 'transparent');
      ctx.fillStyle = bk;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (effect === 'sunbeams') {
    ctx.globalCompositeOperation = 'screen';
    const rays = ctx.createLinearGradient(0, 0, W * 0.72, H * 0.85);
    rays.addColorStop(0, 'rgba(253, 230, 138, 0.24)');
    rays.addColorStop(0.45, 'rgba(253, 224, 71, 0.08)');
    rays.addColorStop(1, 'transparent');
    ctx.fillStyle = rays;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W * 0.45, 0);
    ctx.lineTo(W * 0.9, H);
    ctx.lineTo(W * 0.18, H);
    ctx.closePath();
    ctx.fill();
  } else if (effect === 'mist') {
    const mist = ctx.createLinearGradient(0, H * 0.48, 0, H);
    mist.addColorStop(0, 'transparent');
    mist.addColorStop(1, 'rgba(226, 232, 240, 0.26)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, H * 0.48, W, H * 0.52);
  }
  ctx.restore();
}

export function AiArtworkCanvas({ artwork, studioTheme = 'night', onSendToVideo, onEditArtwork }: Props) {
  const aspectMeta = useMemo(
    () => IMAGE_ASPECT_OPTIONS.find((a) => a.value === artwork.aspectRatio) || IMAGE_ASPECT_OPTIONS[0],
    [artwork.aspectRatio],
  );

  const initialAiRecipe = useMemo<ImageEditRecipe>(
    () => ({
      ...DEFAULT_RECIPE,
      ...(artwork.editRecipe || {}),
    }),
    [artwork.editRecipe],
  );

  const [recipe, setRecipe] = useState<ImageEditRecipe>(initialAiRecipe);
  const [activePresetId, setActivePresetId] = useState<string>('ai_default');
  const [showSliders, setShowSliders] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [compareSplit, setCompareSplit] = useState(100);
  const [status, setStatus] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImgRef = useRef<HTMLImageElement | null>(null);
  const overlayImgRef = useRef<HTMLImageElement | null>(null);
  const replacementBgImgRef = useRef<HTMLImageElement | null>(null);

  const canCompare = Boolean(artwork.isPhotoEdit || artwork.referenceImageDataUrl);

  useEffect(() => {
    setRecipe(initialAiRecipe);
    setActivePresetId('ai_default');
    setShowOriginal(false);
    setCompareSplit(100);
  }, [artwork, initialAiRecipe]);

  function drawComposite(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    currentRecipe: ImageEditRecipe,
    rawOnly: boolean,
    forExport = false,
  ) {
    ctx.clearRect(0, 0, W, H);
    const baseImg = baseImgRef.current;
    const overlayImg = overlayImgRef.current;
    const replacementBg = replacementBgImgRef.current;

    if (!baseImg && !overlayImg) {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, studioTheme === 'day' ? '#e2e8f0' : '#0f172a');
      grad.addColorStop(1, studioTheme === 'day' ? '#cbd5e1' : '#1e1b4b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const r = rawOnly ? { ...DEFAULT_RECIPE } : currentRecipe;
    const bgAction = rawOnly ? 'none' : r.bgAction || 'none';

    const bri = 100 + r.brightness;
    const con = 100 + r.contrast + (r.clarity > 0 ? Math.round(r.clarity * 0.14) : 0);
    const sat = Math.max(0, 100 + r.saturation);
    const sepiaPct = r.warmth > 0 ? Math.min(36, Math.round(r.warmth * 0.55)) : 0;
    const hueDeg = r.warmth < 0 ? Math.round(r.warmth * 0.45) : 0;
    const colorFilter = `brightness(${bri}%) contrast(${con}%) saturate(${sat}%) sepia(${sepiaPct}%) hue-rotate(${hueDeg}deg)`;

    if (baseImg) {
      const imgRatio = (baseImg.naturalWidth || baseImg.width || W) / Math.max(1, baseImg.naturalHeight || baseImg.height || H);
      const boxRatio = W / H;
      let dw = W;
      let dh = H;
      let dx = 0;
      let dy = 0;
      if (artwork.isPhotoEdit || artwork.rasterDataUrl) {
        if (imgRatio > boxRatio) {
          dh = W / imgRatio;
          dy = (H - dh) / 2;
        } else {
          dw = H * imgRatio;
          dx = (W - dw) / 2;
        }
      }

      if (bgAction === 'remove') {
        if (!forExport) {
          const tile = 20;
          const cA = studioTheme === 'day' ? '#e2e8f0' : '#171929';
          const cB = studioTheme === 'day' ? '#cbd5e1' : '#10121f';
          for (let ty = 0; ty < H; ty += tile) {
            for (let tx = 0; tx < W; tx += tile) {
              ctx.fillStyle = ((tx / tile + ty / tile) % 2 === 0) ? cA : cB;
              ctx.fillRect(tx, ty, tile, tile);
            }
          }
        }
      } else if (bgAction === 'replace') {
        if (replacementBg) {
          ctx.save();
          ctx.filter = 'blur(1.5px) brightness(96%) saturate(108%)';
          ctx.drawImage(replacementBg, 0, 0, W, H);
          ctx.restore();
        } else {
          const repGrad = ctx.createLinearGradient(0, 0, W, H);
          repGrad.addColorStop(0, r.colorWashColor || '#1e1b4b');
          repGrad.addColorStop(0.55, '#0f172a');
          repGrad.addColorStop(1, '#090b16');
          ctx.fillStyle = repGrad;
          ctx.fillRect(0, 0, W, H);
        }
      } else if (bgAction === 'blur' || r.blurBgIntensity > 4) {
        ctx.save();
        ctx.filter = `blur(${Math.max(8, Math.round((r.blurBgIntensity || 48) * 0.24))}px) ${colorFilter}`;
        ctx.drawImage(baseImg, -20, -20, W + 40, H + 40);
        ctx.restore();
      } else if (artwork.isPhotoEdit || artwork.rasterDataUrl) {
        ctx.save();
        ctx.filter = 'blur(26px) brightness(48%) saturate(130%)';
        ctx.drawImage(baseImg, -20, -20, W + 40, H + 40);
        ctx.restore();
      }

      const workCanvas = document.createElement('canvas');
      workCanvas.width = W;
      workCanvas.height = H;
      const wCtx = workCanvas.getContext('2d');
      if (wCtx) {
        wCtx.filter = colorFilter;
        wCtx.drawImage(baseImg, dx, dy, dw, dh);
        wCtx.filter = 'none';
        if (!rawOnly) {
          applyPixelDspAndCutout(workCanvas, r, dx, dy, dw, dh);
        }
        ctx.save();
        if (bgAction === 'replace') {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
          ctx.shadowBlur = 24;
          ctx.shadowOffsetY = 8;
        }
        ctx.drawImage(workCanvas, 0, 0, W, H);
        ctx.restore();
      } else {
        ctx.save();
        ctx.filter = colorFilter;
        ctx.drawImage(baseImg, dx, dy, dw, dh);
        ctx.restore();
      }
    }

    if (!rawOnly && overlayImg) {
      ctx.save();
      ctx.drawImage(overlayImg, 0, 0, W, H);
      ctx.restore();
    }

    if (!rawOnly) {
      drawAtmosphereLayer(ctx, W, H, r.atmosphereEffect);

      if (r.warmth < -4) {
        ctx.save();
        ctx.globalCompositeOperation = 'soft-light';
        ctx.fillStyle = `rgba(56, 189, 248, ${Math.min(0.28, Math.abs(r.warmth) * 0.0055).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      if (r.colorWashOpacity && r.colorWashOpacity > 0.01 && r.colorWashColor && bgAction !== 'remove') {
        ctx.save();
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = Math.min(0.45, r.colorWashOpacity);
        ctx.fillStyle = r.colorWashColor;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      if (r.lightingAngle && r.lightingAngle !== 'none' && (r.lightingIntensity || 0) > 0.01 && bgAction !== 'remove') {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const lx =
          r.lightingAngle === 'top_left'
            ? W * 0.14
            : r.lightingAngle === 'top_right'
              ? W * 0.86
              : W * 0.5;
        const ly = r.lightingAngle === 'bottom_rim' ? H * 0.9 : r.lightingAngle === 'center' ? H * 0.45 : H * 0.14;
        const lGrad = ctx.createRadialGradient(lx, ly, 10, lx, ly, Math.max(W, H) * 0.72);
        lGrad.addColorStop(0, r.lightingColor || '#fde68a');
        lGrad.addColorStop(0.45, `${(r.lightingColor || '#fde68a')}44`);
        lGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = Math.min(0.65, r.lightingIntensity || 0.25);
        ctx.fillStyle = lGrad;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      if (r.vignette > 2 && bgAction !== 'remove') {
        ctx.save();
        const vGrad = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.26, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
        vGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vGrad.addColorStop(1, `rgba(2,4,12,${Math.min(0.75, r.vignette * 0.0072).toFixed(3)})`);
        ctx.fillStyle = vGrad;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      if (r.grain > 4 && bgAction !== 'remove') {
        ctx.save();
        ctx.globalAlpha = Math.min(0.11, r.grain * 0.0018);
        ctx.fillStyle = '#ffffff';
        const dots = Math.min(1800, Math.round(r.grain * 24));
        for (let i = 0; i < dots; i++) {
          const gx = ((i * 7919) % 9973) / 9973 * W;
          const gy = ((i * 6271) % 9949) / 9949 * H;
          ctx.fillRect(gx, gy, 1.5, 1.5);
        }
        ctx.restore();
      }

      if (r.frameStyle === 'cinema_bars') {
        const barH = Math.round(H * 0.085);
        ctx.fillStyle = '#03040a';
        ctx.fillRect(0, 0, W, barH);
        ctx.fillRect(0, H - barH, W, barH);
      } else if (r.frameStyle === 'gold_border') {
        ctx.save();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = Math.max(4, Math.round(W * 0.008));
        ctx.strokeRect(18, 18, W - 36, H - 36);
        ctx.strokeStyle = 'rgba(253,224,71,0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(28, 28, W - 56, H - 56);
        ctx.restore();
      } else if (r.frameStyle === 'gallery_mat') {
        const pad = Math.round(Math.min(W, H) * 0.045);
        ctx.save();
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = pad;
        ctx.strokeRect(pad / 2, pad / 2, W - pad, H - pad);
        ctx.restore();
      }

      if (r.addedTypography && r.addedTypography.trim()) {
        ctx.save();
        const fontSize = Math.round(Math.max(24, W * 0.042));
        ctx.font = `bold ${fontSize}px Tahoma, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tx = W / 2;
        const ty = r.frameStyle === 'cinema_bars' ? H * 0.85 : H * 0.88;
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(stripHashMarks(r.addedTypography), tx, ty, W * 0.84);
        ctx.restore();
      }
    }
  }

  function renderPreviewWithSplit(canvas: HTMLCanvasElement, currentRecipe: ImageEditRecipe, forceOrig: boolean, splitPct: number) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    if (forceOrig) {
      drawComposite(ctx, W, H, currentRecipe, true, false);
      return;
    }
    if (!canCompare || splitPct >= 99) {
      drawComposite(ctx, W, H, currentRecipe, false, false);
      return;
    }
    if (splitPct <= 1) {
      drawComposite(ctx, W, H, currentRecipe, true, false);
      return;
    }

    // Draw original layer first, then clip edited composite on the right portion
    drawComposite(ctx, W, H, currentRecipe, true, false);
    const editedCanvas = document.createElement('canvas');
    editedCanvas.width = W;
    editedCanvas.height = H;
    const eCtx = editedCanvas.getContext('2d');
    if (eCtx) {
      drawComposite(eCtx, W, H, currentRecipe, false, false);
      const splitX = Math.round((splitPct / 100) * W);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, H);
      ctx.clip();
      ctx.drawImage(editedCanvas, 0, 0);
      ctx.restore();

      // Wipe Divider Hairline
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = Math.max(2, Math.round(W * 0.003));
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, H);
      ctx.stroke();
      ctx.restore();
    }
  }

  useEffect(() => {
    let active = true;
    async function hydrate() {
      baseImgRef.current = null;
      overlayImgRef.current = null;
      replacementBgImgRef.current = null;

      if (artwork.rasterDataUrl) {
        baseImgRef.current = await loadHtmlImage(artwork.rasterDataUrl);
      } else if (artwork.isPhotoEdit && artwork.referenceImageDataUrl) {
        baseImgRef.current = await loadHtmlImage(artwork.referenceImageDataUrl);
        if (artwork.overlaySvg || artwork.svg) {
          overlayImgRef.current = await svgTextToImage(artwork.overlaySvg || artwork.svg, aspectMeta.w, aspectMeta.h);
        }
        if (artwork.replacementBackdropSvg) {
          replacementBgImgRef.current = await svgTextToImage(artwork.replacementBackdropSvg, aspectMeta.w, aspectMeta.h);
        }
      } else if (artwork.svg) {
        baseImgRef.current = await svgTextToImage(artwork.svg, aspectMeta.w, aspectMeta.h);
      } else if (artwork.referenceImageDataUrl) {
        baseImgRef.current = await loadHtmlImage(artwork.referenceImageDataUrl);
      }

      if (!active) return;
      const canvas = canvasRef.current;
      if (canvas) {
        renderPreviewWithSplit(canvas, recipe, showOriginal, compareSplit);
      }
    }
    void hydrate();
    return () => {
      active = false;
    };
  }, [artwork, aspectMeta.w, aspectMeta.h, studioTheme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderPreviewWithSplit(canvas, recipe, showOriginal, compareSplit);
  }, [recipe, showOriginal, compareSplit, studioTheme]);

  function applyPreset(preset: StudioPreset) {
    setActivePresetId(preset.id);
    setShowOriginal(false);
    setCompareSplit(100);
    if (preset.id === 'ai_default') {
      setRecipe(initialAiRecipe);
    } else if (preset.id === 'raw_clean') {
      setRecipe({ ...DEFAULT_RECIPE });
    } else {
      setRecipe({
        ...DEFAULT_RECIPE,
        ...preset.recipe,
        subjectRegion: initialAiRecipe.subjectRegion,
        blurBgIntensity: preset.recipe.blurBgIntensity ?? initialAiRecipe.blurBgIntensity ?? 0,
        addedTypography: initialAiRecipe.addedTypography || '',
      });
    }
  }

  function exportHighResDataUrl(format: 'png' | 'jpeg' = 'png'): string {
    const scale = 2;
    const expW = aspectMeta.w * scale;
    const expH = aspectMeta.h * scale;
    const off = document.createElement('canvas');
    off.width = expW;
    off.height = expH;
    const ctx = off.getContext('2d');
    if (ctx) {
      drawComposite(ctx, expW, expH, recipe, false, format === 'png');
      return off.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95);
    }
    return canvasRef.current?.toDataURL('image/png') || '';
  }

  function handleDownloadPng() {
    const url = exportHighResDataUrl('png');
    if (url) {
      saveDataUrl(url, `${safeFileName(artwork.title || 'zorvyx-ai-image')}.png`);
      setStatus(recipe.bgAction === 'remove' ? 'تم حفظ الصورة مفرّغة بخلفية شفافة فائقة الدقة.' : 'تم حفظ الصورة فائقة الدقة بنجاح.');
    }
  }

  function handleDownloadJpg() {
    const url = exportHighResDataUrl('jpeg');
    if (url) {
      saveDataUrl(url, `${safeFileName(artwork.title || 'zorvyx-ai-image')}.jpg`);
      setStatus('تم حفظ الصورة عالية الجودة بنجاح.');
    }
  }

  function handleDownloadSvg() {
    const cleanSvg = sanitizeSvgClient(artwork.svg || artwork.overlaySvg || '');
    if (!cleanSvg) return;
    const blob = new Blob([cleanSvg], { type: 'image/svg+xml;charset=utf-8' });
    saveBlob(blob, `${safeFileName(artwork.title || 'zorvyx-ai-design')}.svg`);
    setStatus('تم تنزيل الملف الرسومي القابل للتكبير بنجاح.');
  }

  function handleEditBaked() {
    if (!onEditArtwork) return;
    const baked = exportHighResDataUrl('png');
    onEditArtwork({
      ...artwork,
      rasterDataUrl: baked || artwork.rasterDataUrl,
      referenceImageDataUrl: baked || artwork.referenceImageDataUrl,
    });
  }

  function handleVideoBaked() {
    if (!onSendToVideo) return;
    const baked = exportHighResDataUrl('png');
    onSendToVideo({
      ...artwork,
      rasterDataUrl: baked || artwork.rasterDataUrl,
      referenceImageDataUrl: baked || artwork.referenceImageDataUrl,
    });
  }

  const hasVectorSvg = Boolean((artwork.svg || '').trim()) && !artwork.isPhotoEdit && !artwork.rasterDataUrl;

  return (
    <div className="pro-art-studio-card">
      <div className="pro-art-header">
        <div>
          <h4>{stripHashMarks(artwork.title)}</h4>
          <div className="wb-meta-line">
            {aspectMeta.label}
            {artwork.style ? ` · ${stripHashMarks(artwork.style)}` : ''}
            {recipe.bgAction && recipe.bgAction !== 'none'
              ? ` · ${recipe.bgAction === 'remove' ? 'خلفية شفافة' : recipe.bgAction === 'replace' ? 'خلفية مستبدلة' : 'عزل بورتريه'}`
              : ''}
          </div>
        </div>
        {artwork.palette && artwork.palette.length > 0 && (
          <div className="palette-row" aria-label="الألوان المستخرجة">
            {artwork.palette.slice(0, 6).map((hex) => (
              <span key={hex} className="palette-dot" title={hex} style={{ background: hex }} />
            ))}
          </div>
        )}
      </div>

      {artwork.description && (
        <p className="media-desc" style={{ marginBottom: 10 }}>
          {stripHashMarks(artwork.description)}
        </p>
      )}

      {/* Live High-Resolution Studio Canvas */}
      <div
        className="pro-art-canvas-stage"
        style={{ aspectRatio: `${aspectMeta.w} / ${aspectMeta.h}` }}
      >
        <canvas
          ref={canvasRef}
          width={aspectMeta.w}
          height={aspectMeta.h}
          className="pro-art-canvas"
          aria-label={stripHashMarks(artwork.title)}
        />
        {canCompare && (
          <button
            type="button"
            className={`pro-compare-float ${showOriginal ? 'active' : ''}`}
            onMouseDown={() => setShowOriginal(true)}
            onMouseUp={() => setShowOriginal(false)}
            onMouseLeave={() => setShowOriginal(false)}
            onClick={() => setShowOriginal((p) => !p)}
            title="معاينة الصورة الأصلية"
          >
            <Eye size={14} />
            {showOriginal ? 'عرض النتيجة المعدلة ✨' : 'معاينة الأصل 👁'}
          </button>
        )}
      </div>

      {/* Interactive Split-Wipe Before/After Slider */}
      {canCompare && (
        <div className="wb-compare-bar" style={{ marginBottom: 10 }}>
          <span>مقارنة سحب التعديل: {compareSplit}%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={compareSplit}
            onChange={(e) => {
              setShowOriginal(false);
              setCompareSplit(Number(e.target.value));
            }}
            aria-label="نسبة المقارنة بين الأصل والتعديل"
          />
          <button
            type="button"
            className="mini-btn"
            onClick={() => {
              setShowOriginal(false);
              setCompareSplit((p) => (p === 50 ? 100 : 50));
            }}
          >
            {compareSplit === 50 ? 'النتيجة الكاملة' : 'نصف بنصف'}
          </button>
        </div>
      )}

      {/* Segmented LUT Presets Grid */}
      <div className="wb-section" style={{ marginTop: 8 }}>
        <div className="pro-deck-title" style={{ marginBottom: 4 }}>
          <Sparkles size={13} />
          <span>لمسات لونية وإضاءة استوديو فورية</span>
        </div>
        <div className="wb-lut-grid">
          {STUDIO_PRESETS.map((pr) => (
            <button
              key={pr.id}
              type="button"
              className={`wb-lut-btn ${activePresetId === pr.id && !showOriginal ? 'active' : ''}`}
              onClick={() => applyPreset(pr)}
            >
              {pr.label}
            </button>
          ))}
        </div>
      </div>

      {/* DSP Adjustments Drawer Toggle */}
      <div className="pro-sliders-toggle-row">
        <button
          type="button"
          className={`mini-btn ${showSliders ? 'active-chip' : ''}`}
          onClick={() => setShowSliders((p) => !p)}
        >
          <SlidersHorizontal size={13} style={{ display: 'inline', marginLeft: 5 }} />
          {showSliders ? 'إخفاء ضبط القنوات الدقيقة ▲' : 'فتح ضبط القنوات والتنقية (8 قنوات) ▼'}
        </button>

        {showSliders && (
          <button
            type="button"
            className="mini-btn"
            onClick={() => applyPreset(STUDIO_PRESETS[0])}
          >
            <RotateCcw size={12} style={{ display: 'inline', marginLeft: 4 }} />
            إعادة الضبط
          </button>
        )}
      </div>

      {showSliders && (
        <div className="pro-sliders-grid">
          <label className="pro-slider-item">
            <span>السطوع ({recipe.brightness > 0 ? `+${recipe.brightness}` : recipe.brightness})</span>
            <input
              type="range"
              min={-40}
              max={40}
              value={recipe.brightness}
              onChange={(e) => {
                setActivePresetId('custom');
                setRecipe((p) => ({ ...p, brightness: Number(e.target.value) }));
              }}
            />
          </label>
          <label className="pro-slider-item">
            <span>التباين ({recipe.contrast > 0 ? `+${recipe.contrast}` : recipe.contrast})</span>
            <input
              type="range"
              min={-35}
              max={50}
              value={recipe.contrast}
              onChange={(e) => {
                setActivePresetId('custom');
                setRecipe((p) => ({ ...p, contrast: Number(e.target.value) }));
              }}
            />
          </label>
          <label className="pro-slider-item">
            <span>تشبع الألوان ({recipe.saturation > 0 ? `+${recipe.saturation}` : recipe.saturation})</span>
            <input
              type="range"
              min={-80}
              max={80}
              value={recipe.saturation}
              onChange={(e) => {
                setActivePresetId('custom');
                setRecipe((p) => ({ ...p, saturation: Number(e.target.value) }));
              }}
            />
          </label>
          <label className="pro-slider-item">
            <span>دفء الإضاءة ({recipe.warmth > 0 ? `+${recipe.warmth}` : recipe.warmth})</span>
            <input
              type="range"
              min={-45}
              max={45}
              value={recipe.warmth}
              onChange={(e) => {
                setActivePresetId('custom');
                setRecipe((p) => ({ ...p, warmth: Number(e.target.value) }));
              }}
            />
          </label>
          <label className="pro-slider-item">
            <span>الحدة وتوضيح التفاصيل ({recipe.sharpenIntensity ?? 0}%)</span>
            <input
              type="range"
              min={0}
              max={100}
              value={recipe.sharpenIntensity ?? 0}
              onChange={(e) => {
                setActivePresetId('custom');
                setRecipe((p) => ({ ...p, sharpenIntensity: Number(e.target.value) }));
              }}
            />
          </label>
          <label className="pro-slider-item">
            <span>إزالة الضوضاء والتشويش ({recipe.denoiseIntensity ?? 0}%)</span>
            <input
              type="range"
              min={0}
              max={100}
              value={recipe.denoiseIntensity ?? 0}
              onChange={(e) => {
                setActivePresetId('custom');
                setRecipe((p) => ({ ...p, denoiseIntensity: Number(e.target.value) }));
              }}
            />
          </label>
          <label className="pro-slider-item">
            <span>عزل الخلفية الناعم ({recipe.blurBgIntensity}%)</span>
            <input
              type="range"
              min={0}
              max={85}
              value={recipe.blurBgIntensity}
              onChange={(e) => {
                setActivePresetId('custom');
                setRecipe((p) => ({ ...p, blurBgIntensity: Number(e.target.value) }));
              }}
            />
          </label>
          <label className="pro-slider-item">
            <span>تظليل الحواف السينمائي ({recipe.vignette}%)</span>
            <input
              type="range"
              min={0}
              max={90}
              value={recipe.vignette}
              onChange={(e) => {
                setActivePresetId('custom');
                setRecipe((p) => ({ ...p, vignette: Number(e.target.value) }));
              }}
            />
          </label>
        </div>
      )}

      {/* Action & Export Toolbar */}
      <div className="toolrow" style={{ marginTop: 12 }}>
        <button type="button" className="primary" onClick={handleDownloadPng}>
          <Download size={15} />
          تنزيل فائق الدقة (PNG) ↓
        </button>
        <button type="button" className="secondary" onClick={handleDownloadJpg}>
          تنزيل مضغوط (JPG) ↓
        </button>
        {hasVectorSvg && (
          <button type="button" className="secondary" onClick={handleDownloadSvg}>
            تنزيل ملف متجه (SVG) ↓
          </button>
        )}
        {onEditArtwork && (
          <button type="button" className="secondary" onClick={handleEditBaked}>
            <Wand2 size={14} />
            تعديل هذه الصورة ✏️
          </button>
        )}
        {onSendToVideo && (
          <button type="button" className="secondary" onClick={handleVideoBaked}>
            <Film size={14} />
            تحويل إلى فيديو حي 🎬
          </button>
        )}
      </div>

      {status && <div className="statusbox info" style={{ marginTop: 8 }}>{status}</div>}
    </div>
  );
}
