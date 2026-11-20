import { useEffect, useRef, useState } from 'react';
import type {
  VideoBeat,
  VideoBeatCharacterState,
  VideoCaption,
  VideoCharacter,
  VideoProp,
  VideoScene,
} from '../utils/mediaExport';
import {
  buildStandaloneVideoHtml,
  formatTimeMMSS,
  getGlobalAudioContext,
  safeFileName,
  sanitizeSvgClient,
  saveBlob,
  stripHashMarks,
  unlockGlobalAudioContext,
} from '../utils/mediaExport';

interface Props {
  scene: VideoScene;
}

function splitTextIntoCaptions(text: string, durationSeconds: number): VideoCaption[] {
  const parts = text
    .split(/[\n.!؟،؛]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];
  const step = Math.max(durationSeconds / parts.length, 2.5);
  return parts.map((chunk, i) => ({
    timeStart: i * step,
    timeEnd: Math.min((i + 1) * step, durationSeconds),
    text: chunk,
  }));
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

function drawProp(ctx: CanvasRenderingContext2D, prop: VideoProp, W: number, H: number, t: number, prog: number) {
  const ease = prog * prog * (3 - 2 * prog);
  const px = ((prop.x ?? 0.5) + ((prop.targetX ?? prop.x ?? 0.5) - (prop.x ?? 0.5)) * ease) * W;
  const py = ((prop.y ?? 0.65) + ((prop.targetY ?? prop.y ?? 0.65) - (prop.y ?? 0.65)) * ease) * H;
  const sc = Math.min(Math.max(prop.scale || 1, 0.5), 2.2);
  const col = prop.color || '#67e8f9';

  ctx.save();
  ctx.translate(px, py);
  ctx.scale(sc, sc);

  if (prop.kind === 'car') {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 28, 58, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(-54, -20, 54, 22);
    g.addColorStop(0, '#ffffff66');
    g.addColorStop(0.25, col);
    g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-55, -8, 110, 28, 10);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-32, -8);
    ctx.lineTo(-14, -28);
    ctx.lineTo(24, -28);
    ctx.lineTo(40, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(-16, -24, 34, 14);
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-32, 20, 12, 0, Math.PI * 2);
    ctx.arc(32, 20, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(54, 4, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === 'rocket') {
    const flame = 12 + Math.abs(Math.sin(t * 22)) * 18;
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.moveTo(-10, 34);
    ctx.lineTo(0, 34 + flame);
    ctx.lineTo(10, 34);
    ctx.closePath();
    ctx.fill();
    const rg = ctx.createLinearGradient(-20, -40, 20, 34);
    rg.addColorStop(0, '#ffffff');
    rg.addColorStop(0.5, col);
    rg.addColorStop(1, '#1e293b');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(0, -52);
    ctx.quadraticCurveTo(24, -10, 16, 34);
    ctx.lineTo(-16, 34);
    ctx.quadraticCurveTo(-24, -10, 0, -52);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(0, -10, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === 'tree') {
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(-8, -4, 16, 48);
    const tg = ctx.createRadialGradient(-8, -32, 4, 0, -24, 38);
    tg.addColorStop(0, '#86efac');
    tg.addColorStop(0.55, '#16a34a');
    tg.addColorStop(1, '#052e16');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.arc(0, -26, 32, 0, Math.PI * 2);
    ctx.arc(-20, -14, 22, 0, Math.PI * 2);
    ctx.arc(20, -14, 22, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === 'palace' || prop.kind === 'building') {
    const bg = ctx.createLinearGradient(-45, -75, 45, 45);
    bg.addColorStop(0, '#ffffff44');
    bg.addColorStop(0.4, col);
    bg.addColorStop(1, '#0f172a');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(-45, -50, 90, 95, 6);
    ctx.fill();
    if (prop.kind === 'palace') {
      ctx.beginPath();
      ctx.arc(0, -50, 26, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillStyle = '#fef08a';
    for (let wy = -36; wy <= 16; wy += 22) {
      for (let wx = -28; wx <= 18; wx += 22) {
        ctx.fillRect(wx, wy, 10, 13);
      }
    }
  } else if (prop.kind === 'planet') {
    const pg = ctx.createRadialGradient(-14, -14, 4, 0, 0, 42);
    pg.addColorStop(0, '#ffffff');
    pg.addColorStop(0.4, col);
    pg.addColorStop(1, '#090a1a');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 56, 14, -0.25, 0, Math.PI * 2);
    ctx.stroke();
  } else if (prop.kind === 'gift') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(-22, -18, 44, 38, 6);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-5, -18, 10, 38);
    ctx.fillRect(-22, -3, 44, 8);
  } else if (prop.kind === 'crown') {
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(-24, 10);
    ctx.lineTo(-24, -14);
    ctx.lineTo(-10, -2);
    ctx.lineTo(0, -20);
    ctx.lineTo(10, -2);
    ctx.lineTo(24, -14);
    ctx.lineTo(24, 10);
    ctx.closePath();
    ctx.fill();
  } else if (prop.kind === 'fireworks') {
    for (let ray = 0; ray < 10; ray++) {
      const ang = (ray / 10) * Math.PI * 2 + t * 0.4;
      const dist = ((t * 48) % 44) + 10;
      ctx.fillStyle = ray % 2 === 0 ? '#fde047' : col;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * dist, Math.sin(ang) * dist, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const fg = ctx.createRadialGradient(-6, -6, 2, 0, 0, 32);
    fg.addColorStop(0, '#ffffffcc');
    fg.addColorStop(1, col);
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.ellipse(0, 0, 38, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSpeechBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, accent: string) {
  const clean = text.trim();
  if (!clean) return;
  ctx.save();
  ctx.font = 'bold 16px Tahoma, Arial, sans-serif';
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > 240 && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 2);
  const bw = Math.min(280, Math.max(150, ...shown.map((l) => ctx.measureText(l).width + 36)));
  const bh = shown.length > 1 ? 64 : 44;
  const bx = Math.max(24, Math.min(1280 - bw - 24, x - bw / 2));
  const by = Math.max(22, y - bh - 18);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 14);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Pointer triangle
  const tipX = Math.max(bx + 20, Math.min(bx + bw - 20, x));
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.beginPath();
  ctx.moveTo(tipX - 8, by + bh);
  ctx.lineTo(tipX + 8, by + bh);
  ctx.lineTo(tipX, by + bh + 11);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  shown.forEach((ln, idx) => {
    ctx.fillText(ln, bx + bw / 2, by + (shown.length > 1 ? 26 + idx * 24 : 28));
  });
  ctx.restore();
}

function drawParticleTheme(
  ctx: CanvasRenderingContext2D,
  theme: VideoBeat['particleTheme'],
  W: number,
  H: number,
  t: number,
  beatProgress: number,
  accentColor: string,
) {
  if (!theme || theme === 'none') return;
  ctx.save();
  if (theme === 'splash') {
    for (let i = 0; i < 24; i++) {
      const angle = ((i / 24) * Math.PI * 1.4) - Math.PI * 0.7 - Math.PI / 2;
      const dist = 45 + ((t * 160 + i * 27) % 240) * (0.4 + beatProgress * 0.8);
      const gravity = dist * dist * 0.0022;
      const px = W * 0.5 + Math.cos(angle) * dist * 1.35;
      const py = H * 0.62 + Math.sin(angle) * dist + gravity;
      const r = 4 + (i % 5) * 2.4;
      const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, 1, px, py, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.4, accentColor || '#fb7185');
      g.addColorStop(1, 'rgba(255,255,255,0.12)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (theme === 'sparkles') {
    for (let i = 0; i < 22; i++) {
      const px = ((i * 193 + t * 28) % (W - 80)) + 40;
      const py = H - ((t * 95 + i * 71) % H);
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 4.5 + i));
      ctx.globalAlpha = tw;
      ctx.fillStyle = i % 2 === 0 ? '#fde047' : accentColor || '#67e8f9';
      ctx.beginPath();
      ctx.arc(px, py, 2.5 + (i % 3) * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (theme === 'petals') {
    for (let i = 0; i < 18; i++) {
      const px = ((i * 167 + Math.sin(t * 1.4 + i) * 55) % W + W) % W;
      const py = (t * 72 + i * 64) % H;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(t * 1.8 + i);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(249, 168, 212, 0.78)' : 'rgba(253, 186, 116, 0.78)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (theme === 'fire') {
    for (let i = 0; i < 20; i++) {
      const px = W * 0.25 + ((i * 79 + Math.sin(t * 3 + i) * 24) % (W * 0.5));
      const py = H - ((t * 135 + i * 49) % (H * 0.75));
      ctx.fillStyle = i % 2 === 0 ? 'rgba(251, 146, 60, 0.78)' : 'rgba(250, 204, 21, 0.72)';
      ctx.beginPath();
      ctx.arc(px, py, 3 + (i % 4), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (theme === 'mist') {
    for (let i = 0; i < 10; i++) {
      const px = ((i * 210 + t * 34) % (W + 200)) - 100;
      const py = H * 0.55 + Math.sin(t * 0.8 + i) * 60;
      const mg = ctx.createRadialGradient(px, py, 10, px, py, 110);
      mg.addColorStop(0, 'rgba(255,255,255,0.14)');
      mg.addColorStop(1, 'transparent');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(px, py, 110, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  ch: VideoCharacter,
  W: number,
  H: number,
  t: number,
  idx: number,
  loadedImages: Record<string, HTMLImageElement>,
  beatState?: VideoBeatCharacterState,
  beatProgress = 0,
  isTalking = false,
  dialogueLine?: string,
  speechAmp = 0,
) {
  const ease = beatProgress * beatProgress * (3 - 2 * beatProgress);
  const startScale = beatState?.scale || ch.scale || 1.1;
  const endScale = beatState?.targetScale ?? startScale;
  const rawScale = startScale + (endScale - startScale) * ease;
  const scale = Math.min(Math.max(rawScale, 0.55), 2.15);
  const action = beatState?.action || ch.action || 'walk';
  const motionEffect = beatState?.motionEffect || 'none';
  const facing = beatState?.facing === 'left' ? -1 : 1;

  const walkSpeed = action === 'run' ? 8.0 : action === 'walk' ? 4.8 : action === 'fly' ? 3.4 : 2.2;
  let cx: number;
  let cy: number;
  if (beatState) {
    cx = (beatState.x + (beatState.targetX - beatState.x) * ease) * W;
    cy = (beatState.y + (beatState.targetY - beatState.y) * ease) * H;
  } else {
    const moveX =
      action === 'walk' || action === 'run'
        ? Math.sin(t * 0.7 + idx * 1.5) * 140
        : action === 'fly'
          ? Math.cos(t * 0.9 + idx) * 180
          : 0;
    cx = ch.x * W + moveX;
    cy = ch.y * H;
  }

  const effectBobY =
    motionEffect === 'bounce'
      ? -Math.abs(Math.sin(t * 4.5 + idx)) * 34
      : motionEffect === 'splash'
        ? Math.sin(t * 9) * 8
        : motionEffect === 'shake'
          ? Math.sin(t * 28) * 6
          : 0;
  const effectOffsetX = motionEffect === 'shake' ? Math.cos(t * 32) * 7 : 0;

  const bobY =
    action === 'float' || action === 'fly'
      ? Math.sin(t * 2.6 + idx) * 20
      : action === 'jump'
        ? -Math.abs(Math.sin(t * 4.5 + idx)) * 38
        : action === 'walk' || action === 'run'
          ? Math.abs(Math.sin(t * walkSpeed)) * -10
          : isTalking
            ? Math.sin(t * 9) * 2.5
            : Math.sin(t * 1.8 + idx) * 3;
  cx += effectOffsetX;
  cy += bobY + effectBobY;

  const primary = ch.primaryColor || '#67e8f9';
  const secondary = ch.secondaryColor || '#a78bfa';
  const swing = action === 'walk' || action === 'run' ? Math.sin(t * walkSpeed) * (action === 'run' ? 0.78 : 0.55) : 0;
  const waveAngle =
    action === 'wave'
      ? -2.2 + Math.sin(t * 6.5) * 0.45
      : isTalking
        ? -0.85 + Math.sin(t * 7) * 0.25
        : -0.35 - swing * 0.6;

  ctx.save();
  ctx.translate(cx, cy);

  // Draw facing-flipped character / subject geometry
  ctx.save();
  ctx.scale(scale * facing, scale);

  const customImg = ch.imageDataUrl ? loadedImages[ch.imageDataUrl] : undefined;
  const activeVoiceLevel = isTalking ? Math.max(speechAmp, 0.25 + Math.abs(Math.sin(t * 11 + idx)) * 0.45) : 0;
  if (customImg && customImg.complete && customImg.naturalWidth > 0) {
    const startRot = ((beatState?.rotation ?? 0) * Math.PI) / 180;
    const endRot = ((beatState?.targetRotation ?? beatState?.rotation ?? 0) * Math.PI) / 180;
    const interpRot = startRot + (endRot - startRot) * ease;
    const spinRot = motionEffect === 'spin' ? t * 2.2 : 0;
    const talkSway = isTalking ? Math.sin(t * 5.2 + idx) * (0.032 + activeVoiceLevel * 0.025) : 0;
    const tilt =
      interpRot || spinRot
        ? interpRot + spinRot + talkSway
        : action === 'walk' || action === 'run'
          ? Math.sin(t * walkSpeed) * 0.075
          : action === 'wave'
            ? Math.sin(t * 5) * 0.095
            : action === 'fly'
              ? Math.sin(t * 1.8 + idx) * 0.11
              : isTalking
                ? talkSway
                : Math.sin(t * 1.6 + idx) * 0.028;
    // Organic human chest breathing + expressive voice liveliness
    const breathX = 1 + Math.sin(t * 2.3 + idx) * 0.016 - (isTalking ? activeVoiceLevel * 0.014 : 0);
    const breathY = 1 + Math.cos(t * 2.3 + idx) * 0.022 + (isTalking ? activeVoiceLevel * 0.038 : 0);

    // Soft realistic contact shadow beneath subject or character
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.ellipse(0, ch.isSubjectPhoto ? 104 : 88, ch.isSubjectPhoto ? 74 : 42, ch.isSubjectPhoto ? 14 : 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(tilt);
    ctx.scale(breathX, breathY);

    const maxSize = ch.isSubjectPhoto ? 340 : 168;
    const ar = customImg.naturalWidth / Math.max(customImg.naturalHeight, 1);
    const dw = ar >= 1 ? maxSize : maxSize * ar;
    const dh = ar >= 1 ? maxSize / ar : maxSize;

    // Luminous studio halo around subject
    const aura = ctx.createRadialGradient(0, 0, dw * 0.14, 0, 0, maxSize * (isTalking ? 0.92 : 0.68));
    aura.addColorStop(0, isTalking ? `${primary}99` : `${primary}28`);
    aura.addColorStop(1, 'transparent');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, maxSize * (isTalking ? 0.92 : 0.68), 0, Math.PI * 2);
    ctx.fill();

    if (ch.isSubjectPhoto) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(-dw / 2, -dh / 2, dw, dh, 28);
      ctx.clip();
      ctx.drawImage(customImg, -dw / 2, -dh / 2, dw, dh);
      const rim = ctx.createRadialGradient(0, 0, Math.min(dw, dh) * 0.38, 0, 0, Math.max(dw, dh) * 0.72);
      rim.addColorStop(0, 'rgba(0,0,0,0)');
      rim.addColorStop(1, 'rgba(11,11,25,0.16)');
      ctx.fillStyle = rim;
      ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-dw / 2, -dh / 2, dw, dh, 28);
      ctx.stroke();
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(-dw / 2, -dh / 2, dw, dh, 20);
      ctx.clip();
      ctx.drawImage(customImg, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();

      ctx.strokeStyle = isTalking ? '#fde047' : primary;
      ctx.lineWidth = isTalking ? 3.8 + activeVoiceLevel * 2.2 : 2.8;
      ctx.beginPath();
      ctx.roundRect(-dw / 2, -dh / 2, dw, dh, 20);
      ctx.stroke();
    }

    if (isTalking) {
      for (let bar = 0; bar < 4; bar++) {
        const bh = 8 + activeVoiceLevel * (12 + (bar % 2) * 8) * Math.abs(Math.sin(t * 14 + bar * 1.1));
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.roundRect(dw / 2 + 8 + bar * 6, -bh / 2, 4, Math.max(6, bh), 2);
        ctx.fill();
      }
    }

    ctx.restore();

    if (ch.name && !ch.isSubjectPhoto) {
      ctx.fillStyle = 'rgba(11, 11, 25, 0.8)';
      ctx.beginPath();
      ctx.roundRect(-58, (-dh / 2 - 34) * scale, 116, 24, 12);
      ctx.fill();
      ctx.fillStyle = isTalking ? '#fde047' : '#f8fafc';
      ctx.font = 'bold 13px Tahoma, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ch.name, 0, (-dh / 2 - 18) * scale);
    }

    if (isTalking && dialogueLine) {
      ctx.restore();
      drawSpeechBubble(ctx, cx, cy - (dh / 2 + 38) * scale, stripHashMarks(dialogueLine), primary);
      return;
    }

    ctx.restore();
    return;
  }

  // Soft ground shadow for vector characters
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.beginPath();
  ctx.ellipse(0, 86, 40, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  if (ch.style === 'cat') {
    // Cat body & tail
    ctx.strokeStyle = primary;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-18, 42);
    ctx.quadraticCurveTo(-50, 20 + Math.sin(t * 4) * 14, -42, -5);
    ctx.stroke();

    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.ellipse(0, 32, 26, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head & ears
    ctx.beginPath();
    ctx.arc(0, -14, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-20, -24);
    ctx.lineTo(-26, -48);
    ctx.lineTo(-6, -34);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(20, -24);
    ctx.lineTo(26, -48);
    ctx.lineTo(6, -34);
    ctx.closePath();
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#0b0b19';
    ctx.beginPath();
    ctx.arc(-8, -16, 3.5, 0, Math.PI * 2);
    ctx.arc(8, -16, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (ch.style === 'bird') {
    const flap = Math.sin(t * 9 + idx) * 26;
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wings
    ctx.fillStyle = secondary;
    ctx.beginPath();
    ctx.moveTo(-8, -4);
    ctx.quadraticCurveTo(-24, -44 + flap, 10, -14);
    ctx.closePath();
    ctx.fill();
    // Beak & eye
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(28, -4);
    ctx.lineTo(44, 2);
    ctx.lineTo(28, 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0b0b19';
    ctx.beginPath();
    ctx.arc(16, -4, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Humanoid / Hero / Astronaut / Robot / Princess / Scholar
    // Cape for hero / princess
    if (ch.style === 'hero' || ch.style === 'princess') {
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.moveTo(-14, -10);
      ctx.quadraticCurveTo(-36 - Math.sin(t * 4) * 10, 42, -26, 76);
      ctx.lineTo(14, 72);
      ctx.lineTo(14, -10);
      ctx.closePath();
      ctx.fill();
    }

    // Articulated two-segment legs with knee bend & boots
    const legColor = ch.style === 'robot' ? '#94a3b8' : '#1e293b';
    ctx.strokeStyle = legColor;
    ctx.lineWidth = 9.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const side of [-1, 1] as const) {
      const hipPhase = side === -1 ? swing : -swing;
      const kneeBend = action === 'walk' || action === 'run' ? Math.max(0, Math.sin(t * walkSpeed + (side === 1 ? Math.PI : 0))) * 0.48 : 0.04;
      ctx.save();
      ctx.translate(side * 9, 44);
      ctx.rotate(hipPhase);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 19);
      ctx.stroke();
      ctx.translate(0, 19);
      ctx.rotate(kneeBend);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 18);
      ctx.stroke();
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.ellipse(2, 20, 8.5, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Soft diffused ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.ellipse(0, 86, 40, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Organic breathing & conversational torso lean
    const torsoLean = isTalking ? Math.sin(t * 3.8 + idx) * 0.035 : Math.sin(t * 1.7 + idx) * 0.015;
    const breathScale = 1 + Math.sin(t * 2.4 + idx) * 0.016;
    ctx.save();
    ctx.rotate(torsoLean);
    ctx.scale(breathScale, 1);

    // Torso with realistic studio gradient
    const torsoGrad = ctx.createLinearGradient(-22, -12, 22, 54);
    torsoGrad.addColorStop(0, '#ffffff66');
    torsoGrad.addColorStop(0.28, primary);
    torsoGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = torsoGrad;
    ctx.beginPath();
    if (ch.style === 'princess') {
      ctx.moveTo(-15, -12);
      ctx.lineTo(15, -12);
      ctx.lineTo(28, 52);
      ctx.lineTo(-28, 52);
      ctx.closePath();
    } else {
      ctx.roundRect(-18, -12, 36, 58, 12);
    }
    ctx.fill();

    // Rim highlight on torso & belt detail
    ctx.strokeStyle = 'rgba(255,255,255,0.34)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fillRect(-17, 27, 34, 6);

    // Chest emblem
    const emblemGrad = ctx.createRadialGradient(-2, 10, 1, 0, 12, 8);
    emblemGrad.addColorStop(0, '#ffffff');
    emblemGrad.addColorStop(1, secondary);
    ctx.fillStyle = emblemGrad;
    ctx.beginPath();
    ctx.arc(0, 12, 7, 0, Math.PI * 2);
    ctx.fill();

    // Left arm with shoulder & natural elbow bend
    ctx.strokeStyle = primary;
    ctx.lineWidth = 8.5;
    ctx.lineCap = 'round';
    ctx.save();
    ctx.translate(-18, -4);
    const leftShoulder = isTalking ? 0.3 + Math.sin(t * 5.2 + idx) * 0.22 : 0.35 + swing * 0.6;
    ctx.rotate(leftShoulder);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-4, 17);
    ctx.stroke();
    ctx.translate(-4, 17);
    ctx.rotate(isTalking ? -0.45 - activeVoiceLevel * 0.35 : -0.18);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-3, 17);
    ctx.stroke();
    ctx.fillStyle = ch.style === 'robot' ? '#cbd5e1' : '#fcd34d';
    ctx.beginPath();
    ctx.arc(-3, 18, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Right arm (articulated elbow gesture when talking or waving)
    ctx.save();
    ctx.translate(18, -4);
    const rightShoulder =
      action === 'wave'
        ? -2.1 + Math.sin(t * 6.5) * 0.38
        : isTalking
          ? -0.65 - Math.sin(t * 6 + idx) * (0.18 + activeVoiceLevel * 0.28)
          : -0.35 - swing * 0.6;
    ctx.rotate(rightShoulder);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(4, 17);
    ctx.stroke();
    ctx.translate(4, 17);
    ctx.rotate(action === 'wave' ? -0.4 + Math.sin(t * 9) * 0.3 : isTalking ? -0.55 : -0.18);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(3, 17);
    ctx.stroke();
    ctx.fillStyle = ch.style === 'robot' ? '#cbd5e1' : '#fcd34d';
    ctx.beginPath();
    ctx.arc(3, 18, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Neck bridge
    if (ch.style !== 'robot') {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-5, -18, 10, 8);
    }

    // Expressive natural head nod when speaking
    ctx.save();
    ctx.translate(0, -16);
    ctx.rotate(isTalking ? Math.sin(t * 5.6 + idx) * (0.045 + activeVoiceLevel * 0.05) : Math.sin(t * 1.4 + idx) * 0.025);
    ctx.translate(0, 16);

    // Head
    if (ch.style === 'robot') {
      const headGrad = ctx.createLinearGradient(-20, -54, 20, -18);
      headGrad.addColorStop(0, '#f8fafc');
      headGrad.addColorStop(0.5, '#cbd5e1');
      headGrad.addColorStop(1, '#475569');
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.roundRect(-20, -54, 40, 36, 10);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(-15, -45, 30, 14, 5);
      ctx.fill();
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.arc(-6, -38, 3.8, 0, Math.PI * 2);
      ctx.arc(6, -38, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-7, -39, 1.3, 0, Math.PI * 2);
      ctx.arc(5, -39, 1.3, 0, Math.PI * 2);
      ctx.fill();
      if (isTalking) {
        ctx.fillStyle = '#67e8f9';
        ctx.beginPath();
        ctx.roundRect(-9, -27, 18, 2.5 + activeVoiceLevel * 4.5, 2);
        ctx.fill();
      }
    } else {
      // Shaded 3D skin head
      const skinGrad = ctx.createRadialGradient(-6, -40, 3, 0, -34, 24);
      skinGrad.addColorStop(0, '#fef3c7');
      skinGrad.addColorStop(0.65, '#fde68a');
      skinGrad.addColorStop(1, '#d97706');
      ctx.fillStyle = skinGrad;
      ctx.beginPath();
      ctx.arc(0, -34, 21, 0, Math.PI * 2);
      ctx.fill();

      // Rosy soft cheek glow
      ctx.fillStyle = 'rgba(244, 63, 94, 0.22)';
      ctx.beginPath();
      ctx.ellipse(-11, -30, 4.2, 2.4, 0, 0, Math.PI * 2);
      ctx.ellipse(11, -30, 4.2, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Expressive blinking eyes with sclera, colored iris, pupil & white catchlight
      const blink = Math.sin(t * 2.2 + idx) > 0.96 ? 0.16 : 1;
      const eyeGazeX = isTalking ? Math.sin(t * 1.9 + idx) * 0.9 : 0.4;
      for (const ex of [-7.5, 7.5]) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(ex, -36, 4.3, 4.4 * blink, 0, 0, Math.PI * 2);
        ctx.fill();
        if (blink > 0.4) {
          ctx.fillStyle = primary;
          ctx.beginPath();
          ctx.arc(ex + eyeGazeX, -36, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(ex + eyeGazeX, -36, 1.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(ex - 0.6 + eyeGazeX * 0.4, -37.2, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Expressive eyebrows reacting to dialogue amplitude
      const browLift = isTalking ? -activeVoiceLevel * 2.2 : 0;
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-11, -43 + browLift);
      ctx.quadraticCurveTo(-7.5, -45.5 + browLift, -4, -43 + browLift);
      ctx.moveTo(4, -43 + browLift);
      ctx.quadraticCurveTo(7.5, -45.5 + browLift, 11, -43 + browLift);
      ctx.stroke();

      // Real audio-driven lip-sync mouth with upper teeth & natural jaw motion
      if (isTalking) {
        const mouthOpen = 1.6 + activeVoiceLevel * 6.8;
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath();
        ctx.ellipse(0, -24.5, 6.4, mouthOpen, 0, 0, Math.PI * 2);
        ctx.fill();
        if (mouthOpen > 3.2) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(-4.2, -24.5 - mouthOpen * 0.72, 8.4, Math.min(2.2, mouthOpen * 0.32), 1);
          ctx.fill();
        }
        ctx.fillStyle = '#fca5a5';
        ctx.beginPath();
        ctx.ellipse(0, -24.5 + mouthOpen * 0.45, 3.6, mouthOpen * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -31, 6, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }

      // Sculpted layered hair & headgear
      const hairGrad = ctx.createLinearGradient(-20, -56, 20, -34);
      hairGrad.addColorStop(0, '#ffffff66');
      hairGrad.addColorStop(0.35, secondary);
      hairGrad.addColorStop(1, '#1e1b4b');

      if (ch.style === 'astronaut') {
        ctx.strokeStyle = '#e2e8f0';
        ctx.fillStyle = 'rgba(103, 232, 249, 0.22)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, -34, 27, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (ch.style === 'princess') {
        ctx.fillStyle = hairGrad;
        ctx.beginPath();
        ctx.arc(0, -38, 22, Math.PI * 0.9, Math.PI * 2.1);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(-12, -54);
        ctx.lineTo(-7, -66);
        ctx.lineTo(0, -57);
        ctx.lineTo(7, -66);
        ctx.lineTo(12, -54);
        ctx.closePath();
        ctx.fill();
      } else if (ch.style === 'scholar') {
        ctx.fillStyle = hairGrad;
        ctx.beginPath();
        ctx.arc(0, -40, 21, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-22, -58, 44, 6);
      } else {
        ctx.fillStyle = hairGrad;
        ctx.beginPath();
        ctx.arc(0, -40, 22, Math.PI * 0.92, Math.PI * 2.08);
        ctx.quadraticCurveTo(10, -48, 0, -44);
        ctx.quadraticCurveTo(-10, -48, -22, -40);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.restore();
  }

  // Restore flipped geometry transform BEFORE drawing upright text & speech bubble
  ctx.restore();

  if (ch.name) {
    ctx.fillStyle = 'rgba(11, 11, 25, 0.78)';
    ctx.beginPath();
    ctx.roundRect(-54, -92 * scale, 108, 24, 12);
    ctx.fill();
    ctx.fillStyle = isTalking ? '#fde047' : '#f8fafc';
    ctx.font = 'bold 13px Tahoma, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ch.name, 0, -92 * scale + 16);
  }

  ctx.restore();

  if (isTalking && dialogueLine) {
    drawSpeechBubble(ctx, cx, cy - 96 * scale, dialogueLine, primary);
  }
}

export function VideoScenePlayer({ scene }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [recording, setRecording] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');

  const initialGender: 'female' | 'male' = scene.voiceGender || 'female';
  const [voiceGender, setVoiceGender] = useState<'female' | 'male'>(initialGender);
  const [scriptText, setScriptText] = useState(scene.voiceScript || '');
  const [activeAudioB64, setActiveAudioB64] = useState<string | undefined>(scene.voiceAudioBase64);
  const [activeCaptions, setActiveCaptions] = useState<VideoCaption[]>(scene.captions || []);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const timeOffsetRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const loadedImagesRef = useRef<Record<string, HTMLImageElement>>({});
  const keyframeImgsRef = useRef<HTMLImageElement[]>([]);

  // Web Audio refs + AnalyserNode for real lip-sync animation
  const audioCtxRef = useRef<AudioContext | null>(null);
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const ambientNodesRef = useRef<{ oscs: OscillatorNode[]; gain: GainNode } | null>(null);
  const mediaDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  function stopVoiceOnly() {
    if (voiceSourceRef.current) {
      try {
        voiceSourceRef.current.stop();
        voiceSourceRef.current.disconnect();
      } catch {
        // ignore already stopped
      }
      voiceSourceRef.current = null;
    }
    analyserRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  function stopAllAudio() {
    stopVoiceOnly();
    if (ambientNodesRef.current) {
      ambientNodesRef.current.oscs.forEach((o) => {
        try {
          o.stop();
          o.disconnect();
        } catch {
          // ignore
        }
      });
      try {
        ambientNodesRef.current.gain.disconnect();
      } catch {
        // ignore
      }
      ambientNodesRef.current = null;
    }
  }

  async function ensureAudioContext(): Promise<AudioContext | null> {
    const ctx = getGlobalAudioContext();
    if (!ctx) return null;
    audioCtxRef.current = ctx;
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }
    setAudioBlocked(ctx.state === 'suspended');
    if (!mediaDestRef.current && typeof ctx.createMediaStreamDestination === 'function') {
      try {
        mediaDestRef.current = ctx.createMediaStreamDestination();
      } catch {
        // ignore on browsers without MediaStreamAudioDestinationNode
      }
    }
    return ctx;
  }

  async function playVoiceClip(b64?: string, fallbackText?: string, gender: 'female' | 'male' = voiceGender, offsetInClip = 0) {
    stopVoiceOnly();
    if (!voiceEnabled) return;
    const ctx = await ensureAudioContext();
    if (ctx && b64) {
      try {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0));
        const src = ctx.createBufferSource();
        src.buffer = decoded;
        const vGain = ctx.createGain();
        vGain.gain.value = 1.08;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.65;
        analyserRef.current = analyser;
        freqDataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
        src.connect(vGain);
        vGain.connect(analyser);
        analyser.connect(ctx.destination);
        if (mediaDestRef.current) vGain.connect(mediaDestRef.current);
        const startAt = offsetInClip > 0 && offsetInClip < decoded.duration ? offsetInClip : 0;
        if (offsetInClip < decoded.duration) {
          src.start(0, startAt);
        }
        voiceSourceRef.current = src;
        return;
      } catch {
        // Fall through to speechSynthesis
      }
    }

    if (fallbackText?.trim() && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(fallbackText.trim());
      utter.lang = 'ar-SA';
      utter.pitch = gender === 'female' ? 1.15 : 0.85;
      utter.rate = 0.96;
      const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ar'));
      if (voices.length > 0) {
        const femaleHint = voices.find((v) => /female|layla|hoda|salma|laila|amira|mariam|zira|samantha/i.test(v.name));
        const maleHint = voices.find((v) => /male|tarik|maged|naayf|omar|karim|david|daniel/i.test(v.name));
        utter.voice = gender === 'female' ? femaleHint || voices[0] : maleHint || voices[voices.length - 1];
      }
      window.speechSynthesis.speak(utter);
    }
  }

  async function startSyncedAudio(offsetSec = 0) {
    stopAllAudio();
    const ctx = await ensureAudioContext();
    if (!ctx) return;

    // 1. Evolving multi-chord atmospheric soundtrack (warm low-pass progression)
    if (musicEnabled) {
      const baseFreqs = scene.moodMusic?.chordFreqs?.length
        ? scene.moodMusic.chordFreqs.slice(0, 3)
        : [220, 261.63, 329.63];
      const padGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 740;
      padGain.connect(filter);
      filter.connect(ctx.destination);
      if (mediaDestRef.current) filter.connect(mediaDestRef.current);

      const chordRatios = [1, 1.12246, 0.8909, 1.1892]; // I -> II -> VII -> bIII smooth cinematic motion
      const totalDur = Math.max(8, scene.durationSeconds || 12);
      const chordDur = 3.2;
      const now = ctx.currentTime;
      const oscs = baseFreqs.map((f, idx) => {
        const osc = ctx.createOscillator();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(f, now);
        const steps = Math.max(4, Math.ceil(totalDur / chordDur) + 2);
        for (let s = 0; s < steps; s++) {
          const t = now + s * chordDur;
          const ratio = chordRatios[s % chordRatios.length];
          const targetF = Math.max(55, Math.min(880, f * ratio));
          osc.frequency.linearRampToValueAtTime(targetF, t + 0.45);
        }
        osc.connect(padGain);
        osc.start(now);
        return osc;
      });
      padGain.gain.setValueAtTime(0.001, now);
      padGain.gain.linearRampToValueAtTime(0.044, now + 0.4);
      ambientNodesRef.current = { oscs, gain: padGain };
    }

    // 2. Unified single-voice narration/speech track across the entire video
    if (voiceEnabled) {
      await playVoiceClip(activeAudioB64, scriptText, voiceGender, offsetSec);
    }
  }

  useEffect(() => {
    timeOffsetRef.current = 0;
    setCurrentSec(0);
    setVoiceGender(scene.voiceGender || 'female');
    const cleanScript = scene.voiceScript || '';
    setScriptText(cleanScript);
    setActiveAudioB64(scene.voiceAudioBase64);
    setActiveCaptions(
      scene.captions && scene.captions.length > 0
        ? scene.captions
        : cleanScript
          ? splitTextIntoCaptions(cleanScript, scene.durationSeconds)
          : [],
    );
    setPlaying(true);

    (scene.characters || []).forEach((ch) => {
      if (ch.imageDataUrl && !loadedImagesRef.current[ch.imageDataUrl]) {
        const img = new Image();
        img.src = ch.imageDataUrl;
        loadedImagesRef.current[ch.imageDataUrl] = img;
      }
    });

    const revokeUrls: string[] = [];
    const rawSvgs =
      scene.keyframeSvgs && scene.keyframeSvgs.length > 0
        ? scene.keyframeSvgs
        : scene.backdropSvg
          ? [scene.backdropSvg]
          : [];
    keyframeImgsRef.current = rawSvgs.map((rawSvg) => {
      const cleanBg = sanitizeSvgClient(rawSvg);
      const blob = new Blob([cleanBg], { type: 'image/svg+xml;charset=utf-8' });
      const u = URL.createObjectURL(blob);
      revokeUrls.push(u);
      const bgImg = new Image();
      bgImg.src = u;
      return bgImg;
    });

    return () => {
      stopAllAudio();
      revokeUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [scene]);

  useEffect(() => {
    if (playing) {
      void startSyncedAudio(timeOffsetRef.current);
    } else {
      stopAllAudio();
    }
    return () => stopAllAudio();
  }, [playing, activeAudioB64, voiceEnabled, musicEnabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 320;
    glowCanvas.height = 180;
    const glowCtx = glowCanvas.getContext('2d');

    let rafId = 0;
    let lastNow = performance.now();

    const drawFrame = (now: number) => {
      const dt = (now - lastNow) / 1000;
      lastNow = now;
      if (playing) {
        const prevT = timeOffsetRef.current;
        timeOffsetRef.current = (timeOffsetRef.current + dt) % scene.durationSeconds;
        if (timeOffsetRef.current < prevT) {
          void startSyncedAudio(0);
        }
      }
      const t = timeOffsetRef.current;
      setCurrentSec(t);

      // Live voice amplitude for synchronized lip movement
      let speechAmp = 0;
      if (playing && voiceEnabled && analyserRef.current && freqDataRef.current) {
        analyserRef.current.getByteFrequencyData(freqDataRef.current);
        let sum = 0;
        const bins = Math.min(24, freqDataRef.current.length);
        for (let b = 0; b < bins; b++) sum += freqDataRef.current[b];
        speechAmp = Math.min(1, sum / (bins * 115));
      }

      const beats: VideoBeat[] = scene.beats || [];
      let activeBeatIdx = -1;
      let activeBeat: VideoBeat | undefined;
      let beatProgress = 0;
      if (beats.length > 0) {
        activeBeatIdx = beats.findIndex((b) => t >= b.timeStart && t <= b.timeEnd);
        if (activeBeatIdx < 0) activeBeatIdx = beats.length - 1;
        activeBeat = beats[activeBeatIdx];
        const beatDur = Math.max(activeBeat.timeEnd - activeBeat.timeStart, 0.5);
        beatProgress = Math.max(0, Math.min(1, (t - activeBeat.timeStart) / beatDur));
      }

      const W = canvas.width;
      const H = canvas.height;

      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, scene.bgTop || '#17152f');
      bg.addColorStop(1, scene.bgBottom || '#0b0b19');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      const shot = activeBeat?.cameraShot || scene.cameraMotion || 'zoom';
      const camZoom =
        shot === 'closeup'
          ? 1.12
          : shot === 'zoom_in' || shot === 'zoom'
            ? 1.02 + beatProgress * 0.08
            : 1.03;
      const camPanX =
        shot === 'pan_left'
          ? 24 - beatProgress * 48
          : shot === 'pan_right'
            ? -24 + beatProgress * 48
            : Math.sin(t * 0.35) * 10;
      const camPanY = Math.cos(t * 0.3) * 6;
      ctx.translate(W / 2 + camPanX, H / 2 + camPanY);
      ctx.scale(camZoom, camZoom);
      ctx.translate(-W / 2, -H / 2);

      // Synchronized Story Beat Keyframe Backdrops with smooth cross-fades
      const kfImgs = keyframeImgsRef.current;
      if (kfImgs.length > 0) {
        const idxA = activeBeatIdx >= 0 ? Math.min(activeBeatIdx, kfImgs.length - 1) : Math.floor((t / Math.max(scene.durationSeconds, 1)) * kfImgs.length) % kfImgs.length;
        const idxB = Math.min(idxA + 1, kfImgs.length - 1);
        const fadeWindow = 0.16;
        const blend = activeBeat && idxB !== idxA && beatProgress > 1 - fadeWindow ? (beatProgress - (1 - fadeWindow)) / fadeWindow : 0;

        const imgA = kfImgs[idxA];
        if (imgA && imgA.complete && imgA.naturalWidth > 0) {
          ctx.save();
          ctx.globalAlpha = 0.97 * (1 - blend);
          ctx.drawImage(imgA, -28, -18, W + 56, H + 36);
          ctx.restore();
        }
        if (blend > 0.005) {
          const imgB = kfImgs[idxB];
          if (imgB && imgB.complete && imgB.naturalWidth > 0) {
            ctx.save();
            ctx.globalAlpha = 0.97 * blend;
            ctx.drawImage(imgB, -28, -18, W + 56, H + 36);
            ctx.restore();
          }
        }
      }

      if (scene.is3D) {
        // Realistic atmospheric depth haze & soft reflective studio floor plane
        const horizonY = H * 0.64;
        const floorGrad = ctx.createLinearGradient(0, horizonY, 0, H);
        floorGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
        floorGrad.addColorStop(0.25, `${scene.accentColor || '#67e8f9'}14`);
        floorGrad.addColorStop(1, 'rgba(6, 6, 16, 0.42)');
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, horizonY, W, H - horizonY);

        const horizonGlow = ctx.createLinearGradient(0, horizonY - 24, 0, horizonY + 24);
        horizonGlow.addColorStop(0, 'transparent');
        horizonGlow.addColorStop(0.5, `${scene.accentColor || '#67e8f9'}26`);
        horizonGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = horizonGlow;
        ctx.fillRect(0, horizonY - 24, W, 48);
      }

      const sorted = [...(scene.elements || [])].sort((a, b) => (b.z || 1) - (a.z || 1));
      sorted.forEach((el, idx) => {
        const depthScale = scene.is3D ? 1 / Math.max(el.z || 1, 0.42) : 1;
        const baseX = el.x * W + t * (el.speedX || 0) * 38 + (el.orbit ? Math.cos(t * 1.1 + idx) * 54 : 0);
        const baseY = el.y * H + t * (el.speedY || 0) * 32 + (el.orbit ? Math.sin(t * 1.1 + idx) * 30 : 0);
        const x = ((baseX % (W + 200)) + (W + 200)) % (W + 200) - 100;
        const y = ((baseY % (H + 200)) + (H + 200)) % (H + 200) - 100;
        const pulse = el.pulse ? 1 + 0.12 * Math.sin(t * 2.6 + idx) : 1;
        const size = Math.max(8, (el.size || 46) * depthScale * pulse);
        const color = el.color || scene.accentColor || '#67e8f9';

        ctx.save();
        ctx.translate(x, y);

        if (el.shape === 'orb') {
          // Realistic 3D specular sphere with rim light & core shadow
          const rad = ctx.createRadialGradient(-size * 0.24, -size * 0.24, size * 0.05, 0, 0, size * 0.62);
          rad.addColorStop(0, '#ffffff');
          rad.addColorStop(0.28, color);
          rad.addColorStop(0.75, `${color}99`);
          rad.addColorStop(1, 'rgba(8, 10, 26, 0.72)');
          ctx.fillStyle = rad;
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.56, 0, Math.PI * 2);
          ctx.fill();
        } else if (el.shape === 'ring') {
          ctx.rotate(t * 0.55 + idx);
          const ringGrad = ctx.createLinearGradient(-size * 0.6, -size * 0.3, size * 0.6, size * 0.3);
          ringGrad.addColorStop(0, '#ffffffcc');
          ringGrad.addColorStop(0.5, color);
          ringGrad.addColorStop(1, `${scene.secondaryColor || '#a78bfa'}88`);
          ctx.strokeStyle = ringGrad;
          ctx.lineWidth = Math.max(2.5, size * 0.09);
          ctx.beginPath();
          ctx.ellipse(0, 0, size * 0.62, size * (scene.is3D ? 0.28 : 0.62), 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (el.shape === 'cube') {
          // Realistic 3D shaded isometric prism instead of flat wireframe
          const bobRot = Math.sin(t * 0.8 + idx) * 0.18;
          ctx.rotate(bobRot);
          const r = size * 0.48;
          const h = r * 0.52;
          // Top lit face
          ctx.fillStyle = '#ffffffcc';
          ctx.beginPath();
          ctx.moveTo(0, -r);
          ctx.lineTo(r, -h);
          ctx.lineTo(0, 0);
          ctx.lineTo(-r, -h);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = `${color}aa`;
          ctx.fill();
          // Left mid-lit face
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(-r, -h);
          ctx.lineTo(0, 0);
          ctx.lineTo(0, r);
          ctx.lineTo(-r, h);
          ctx.closePath();
          ctx.fill();
          // Right shadow face
          const darkGrad = ctx.createLinearGradient(0, 0, r, r);
          darkGrad.addColorStop(0, `${color}88`);
          darkGrad.addColorStop(1, 'rgba(10, 12, 30, 0.85)');
          ctx.fillStyle = darkGrad;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(r, -h);
          ctx.lineTo(r, h);
          ctx.lineTo(0, r);
          ctx.closePath();
          ctx.fill();
        } else if (el.shape === 'wave') {
          ctx.strokeStyle = `${color}88`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          for (let wx = -W * 0.45; wx <= W * 0.45; wx += 18) {
            const wy = Math.sin(wx * 0.018 + t * 2.5 + idx) * (size * 0.3);
            if (wx === -W * 0.45) ctx.moveTo(wx, wy);
            else ctx.lineTo(wx, wy);
          }
          ctx.stroke();
        } else if (el.shape === 'beam') {
          const beamGrad = ctx.createLinearGradient(0, -size * 1.4, 0, size * 1.4);
          beamGrad.addColorStop(0, 'transparent');
          beamGrad.addColorStop(0.5, `${color}3a`);
          beamGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = beamGrad;
          ctx.rotate(Math.sin(t * 0.6 + idx) * 0.22);
          ctx.fillRect(-size * 0.22, -size * 1.6, size * 0.44, size * 3.2);
        } else if (el.shape === 'star') {
          const flare = ctx.createRadialGradient(0, 0, 1, 0, 0, size * 0.55);
          flare.addColorStop(0, '#ffffff');
          flare.addColorStop(0.35, color);
          flare.addColorStop(1, 'transparent');
          ctx.fillStyle = flare;
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Soft atmospheric bokeh dust mote
          const mote = ctx.createRadialGradient(0, 0, 0.5, 0, 0, Math.max(4, size * 0.22));
          mote.addColorStop(0, '#ffffffcc');
          mote.addColorStop(0.4, `${color}88`);
          mote.addColorStop(1, 'transparent');
          ctx.fillStyle = mote;
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(4, size * 0.22), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      // Draw Story Props moving in this event
      (activeBeat?.props || []).forEach((prop) => {
        drawProp(ctx, prop, W, H, t, beatProgress);
      });

      // Draw animated talking & moving characters / subjects synchronized with current Story Beat!
      (scene.characters || []).forEach((ch, idx) => {
        const beatState = activeBeat?.characterStates?.find((s) => s.name === ch.name) || activeBeat?.characterStates?.[idx];
        const isTalking = Boolean(
          activeBeat &&
            (activeBeat.dialogueLine || scriptText) &&
            ((activeBeat.speakerName && activeBeat.speakerName === ch.name) || beatState?.action === 'talk' || (scene.characters || []).length === 1),
        );
        drawCharacter(
          ctx,
          ch,
          W,
          H,
          t,
          idx,
          loadedImagesRef.current,
          beatState,
          beatProgress,
          isTalking,
          isTalking ? activeBeat?.dialogueLine : undefined,
          speechAmp,
        );
      });

      // Dynamic story physics particle overlay (splash droplets, sparkles, petals, fire, mist)
      drawParticleTheme(ctx, activeBeat?.particleTheme, W, H, t, beatProgress, scene.accentColor || '#67e8f9');

      ctx.restore();

      // Optical cinema glow bloom pass (refined alpha for crisp detail)
      if (glowCtx) {
        glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
        glowCtx.imageSmoothingEnabled = true;
        glowCtx.imageSmoothingQuality = 'medium';
        if ('filter' in glowCtx) {
          glowCtx.filter = 'blur(4px) saturate(120%) brightness(1.03)';
        }
        glowCtx.drawImage(canvas, 0, 0, glowCanvas.width, glowCanvas.height);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.16;
        ctx.drawImage(glowCanvas, 0, 0, W, H);
        ctx.restore();
      }

      // Subtle cinema vignette at frame edges only
      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, W * 0.72);
      vig.addColorStop(0, 'transparent');
      vig.addColorStop(1, 'rgba(6, 6, 16, 0.28)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      const activeCaption = activeCaptions.find((cap) => t >= cap.timeStart && t <= cap.timeEnd);
      const bottomText = stripHashMarks(activeBeat?.dialogueLine || activeCaption?.text || '');
      if (bottomText) {
        const displayBottom =
          activeBeat?.speakerName && activeBeat?.dialogueLine
            ? `${activeBeat.speakerName}: ${stripHashMarks(activeBeat.dialogueLine)}`
            : bottomText;
        ctx.font = 'bold 24px Tahoma, Arial, sans-serif';
        const lines = wrapCanvasText(ctx, displayBottom, W - 260);
        const boxH = lines.length > 1 ? 86 : 62;
        const boxY = H - boxH - 26;
        ctx.fillStyle = 'rgba(11, 11, 25, 0.8)';
        ctx.beginPath();
        ctx.roundRect(100, boxY, W - 200, boxH, 16);
        ctx.fill();
        ctx.strokeStyle = `${scene.accentColor || '#67e8f9'}77`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#f7f7ff';
        ctx.textAlign = 'center';
        lines.forEach((ln, li) => {
          const ly = lines.length > 1 ? boxY + 34 + li * 34 : boxY + 39;
          ctx.fillText(ln, W / 2, ly);
        });
      }

      rafId = requestAnimationFrame(drawFrame);
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafId);
  }, [playing, scene, activeCaptions, voiceEnabled, voiceGender]);

  function stopRecordingEarly() {
    if (recordTimerRef.current) {
      window.clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }

  async function recordAndDownloadVideo() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    unlockGlobalAudioContext();
    if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
      setStatusMsg('المتصفح الحالي لا يدعم تسجيل الفيديو المباشر؛ استخدمي زر تنزيل المشهد التفاعلي الذي يعمل بالصوت والحركة.');
      return;
    }

    setRecording(true);
    setStatusMsg(`جاري تجهيز وتسجيل الفيديو بالصوت (${formatTimeMMSS(scene.durationSeconds)})... يمكنكِ إيقاف التسجيل وحفظه في أي لحظة.`);
    timeOffsetRef.current = 0;
    setPlaying(true);
    await startSyncedAudio(0);

    try {
      const videoStream = canvas.captureStream(30);
      const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
      if (mediaDestRef.current) {
        const audioTracks = mediaDestRef.current.stream.getAudioTracks();
        tracks.push(...audioTracks);
      }
      const combinedStream = new MediaStream(tracks);
      const candidates = [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm',
      ];
      const supportedMime = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const recorder = supportedMime
        ? new MediaRecorder(combinedStream, { mimeType: supportedMime })
        : new MediaRecorder(combinedStream);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      const done = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start(1000);
      await new Promise<void>((resolve) => {
        recordTimerRef.current = window.setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop();
          resolve();
        }, scene.durationSeconds * 1000);
        const origStop = recorder.onstop;
        recorder.onstop = (ev) => {
          if (origStop) origStop.call(recorder, ev);
          resolve();
        };
      });
      await done;
      const actualMime = (recorder.mimeType || supportedMime || 'video/webm').toLowerCase();
      const isMp4 = actualMime.includes('mp4');
      const ext = isMp4 ? 'mp4' : 'webm';
      const extArabic = isMp4 ? 'فيديو عالي التوافق' : 'فيديو ويب';
      const blob = new Blob(chunks, { type: isMp4 ? 'video/mp4' : 'video/webm' });
      saveBlob(blob, `${safeFileName(scene.title || 'zorvyx-video')}.${ext}`);
      setStatusMsg(`تم حفظ وتنزيل الفيديو بالصوت والصورة (${extArabic}) بنجاح.`);
    } catch {
      setStatusMsg('تعذر تسجيل الفيديو على هذا الجهاز، جربي تنزيل المشهد التفاعلي فهو يعمل مباشرة بالصوت والصورة على الآيفون.');
    } finally {
      recorderRef.current = null;
      if (recordTimerRef.current) {
        window.clearTimeout(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      setRecording(false);
    }
  }

  function downloadInteractiveHtml() {
    const updatedScene: VideoScene = {
      ...scene,
      voiceGender,
      voiceScript: scriptText,
      voiceAudioBase64: activeAudioB64,
      captions: activeCaptions,
    };
    const html = buildStandaloneVideoHtml(updatedScene);
    saveBlob(
      new Blob([html], { type: 'text/html;charset=utf-8' }),
      `${safeFileName(scene.title || 'zorvyx-video')}.html`,
    );
  }

  return (
    <div className="media-preview">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <strong>{scene.title}</strong>
        <span className="tiny">
          {formatTimeMMSS(currentSec)} / {formatTimeMMSS(scene.durationSeconds)}
        </span>
      </div>
      {scene.summary && <p style={{ margin: '0 0 10px' }}>{scene.summary}</p>}
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        onClick={() => {
          unlockGlobalAudioContext();
          if (audioBlocked) void startSyncedAudio(timeOffsetRef.current);
        }}
        style={{ width: '100%', borderRadius: 12, border: '1px solid #2b2b49', display: 'block', background: '#070712' }}
      />
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="range"
          min={0}
          max={scene.durationSeconds}
          step={0.5}
          value={currentSec}
          onChange={(e) => {
            unlockGlobalAudioContext();
            const val = Number(e.target.value);
            timeOffsetRef.current = val;
            setCurrentSec(val);
            if (playing) void startSyncedAudio(val);
          }}
          style={{ width: '100%', accentColor: '#67e8f9' }}
        />
      </div>

      {scene.beats && scene.beats.length > 0 && (
        <div className="history-chips" style={{ marginTop: 8 }}>
          {scene.beats.map((b, bi) => {
            const isActive = currentSec >= b.timeStart && currentSec <= b.timeEnd;
            return (
              <button
                key={`${bi}-${b.beatTitle}`}
                type="button"
                className={`history-chip ${isActive ? 'active' : ''}`}
                onClick={() => {
                  unlockGlobalAudioContext();
                  timeOffsetRef.current = b.timeStart + 0.05;
                  setCurrentSec(b.timeStart + 0.05);
                  setPlaying(true);
                  void startSyncedAudio(b.timeStart + 0.05);
                }}
              >
                {bi + 1}. {b.beatTitle}
                {b.speakerName ? ` (${b.speakerName} 🗣)` : ''}
              </button>
            );
          })}
        </div>
      )}

      <div className="toolrow" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            unlockGlobalAudioContext();
            setPlaying((p) => !p);
          }}
        >
          {playing ? 'إيقاف مؤقت ❚❚' : 'تشغيل بالصوت ▶'}
        </button>
        {audioBlocked && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              unlockGlobalAudioContext();
              setAudioBlocked(false);
              void startSyncedAudio(timeOffsetRef.current);
            }}
          >
            تفعيل الصوت على الآيفون 🔊
          </button>
        )}
        <button
          type="button"
          className="secondary"
          onClick={() => {
            unlockGlobalAudioContext();
            timeOffsetRef.current = 0;
            setCurrentSec(0);
            setPlaying(true);
            void startSyncedAudio(0);
          }}
        >
          إعادة من البداية ↺
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            unlockGlobalAudioContext();
            setVoiceEnabled((v) => !v);
          }}
        >
          {voiceEnabled ? 'الصوت: مفعّل 🔊' : 'الصوت: صامت 🔇'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            unlockGlobalAudioContext();
            setMusicEnabled((m) => !m);
          }}
        >
          {musicEnabled ? 'الموسيقى الخلفية: مفعّلة ♫' : 'الموسيقى: متوقفة'}
        </button>
        {!recording ? (
          <button type="button" className="primary" onClick={recordAndDownloadVideo}>
            حفظ وتنزيل الفيديو بالصوت ↓
          </button>
        ) : (
          <button type="button" className="primary" onClick={stopRecordingEarly}>
            إيقاف وحفظ المقطع الآن ↓
          </button>
        )}
        <button type="button" className="secondary" onClick={downloadInteractiveHtml}>
          تنزيل مشهد تفاعلي كامل
        </button>
      </div>

      {statusMsg && <div className="statusbox info">{statusMsg}</div>}
    </div>
  );
}
