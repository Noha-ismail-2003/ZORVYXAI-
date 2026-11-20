import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import QRCode from 'qrcode';

import crypto from 'node:crypto';

const app = express();
app.use(express.json({ limit: '20mb' }));

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

type GeminiEngineMode = 'fast' | 'balanced' | 'pro';

function normalizeGeminiMode(raw?: unknown): GeminiEngineMode {
  if (raw === 'fast' || raw === 'pro') return raw;
  return 'balanced';
}

function resolveGeminiConfig(
  geminiMode?: unknown,
  requestedThinking?: ThinkingLevel,
): { model: string; thinkingLevel: ThinkingLevel } {
  const mode = normalizeGeminiMode(geminiMode);
  if (mode === 'fast') {
    return { model: FALLBACK_MODEL, thinkingLevel: ThinkingLevel.MINIMAL };
  }
  if (mode === 'pro') {
    return {
      model: PRIMARY_MODEL,
      thinkingLevel: requestedThinking === ThinkingLevel.HIGH ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM,
    };
  }
  return {
    model: PRIMARY_MODEL,
    thinkingLevel: requestedThinking ?? ThinkingLevel.LOW,
  };
}

async function sleepMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح GEMINI_API_KEY غير مضبوط في إعدادات الخادم (Settings > Secrets).');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: unknown;
    systemInstruction: string;
    thinkingLevel?: ThinkingLevel;
    geminiMode?: unknown;
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
  },
) {
  const resolved = resolveGeminiConfig(params.geminiMode, params.thinkingLevel);
  try {
    return await ai.models.generateContent({
      model: resolved.model,
      contents: params.contents as string,
      config: {
        systemInstruction: params.systemInstruction,
        thinkingConfig: { thinkingLevel: resolved.thinkingLevel },
        ...(params.responseMimeType ? { responseMimeType: params.responseMimeType } : {}),
        ...(params.responseSchema ? { responseSchema: params.responseSchema } : {}),
      },
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const shouldFallback =
      raw.includes('429') ||
      raw.includes('RESOURCE_EXHAUSTED') ||
      raw.includes('503') ||
      raw.includes('UNAVAILABLE');
    if (!shouldFallback) throw err;

    await sleepMs(600);
    return await ai.models.generateContent({
      model: FALLBACK_MODEL,
      contents: params.contents as string,
      config: {
        systemInstruction: params.systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        ...(params.responseMimeType ? { responseMimeType: params.responseMimeType } : {}),
        ...(params.responseSchema ? { responseSchema: params.responseSchema } : {}),
      },
    });
  }
}

function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

function stripHashSymbols(text: string): string {
  return String(text || '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/#/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractRawSvg(text: string): string {
  const cleaned = text
    .replace(/^```(?:svg|xml|html)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const match = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
  return match ? match[0] : '';
}

function extractSvgMetadata(svg: string, fallbackPrompt: string) {
  const titleMatch = svg.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch = svg.match(/<desc[^>]*>([\s\S]*?)<\/desc>/i);
  const hexMatches = svg.match(/#[0-9a-fA-F]{6}\b/g) || [];
  const palette = Array.from(new Set(hexMatches.map((c) => c.toLowerCase()))).slice(0, 6);
  return {
    title: stripHashSymbols(titleMatch?.[1]?.trim() || fallbackPrompt.slice(0, 48) || 'تصميم ZORVYX AI'),
    description: stripHashSymbols(descMatch?.[1]?.trim() || ''),
    palette: palette.length > 0 ? palette : ['#a78bfa', '#67e8f9', '#f9a8d4'],
  };
}

function getAspectDimensions(aspectRatio?: string): { w: number; h: number; label: string } {
  switch (aspectRatio) {
    case '16:9':
      return { w: 1280, h: 720, label: '16:9 عريض سينمائي' };
    case '9:16':
      return { w: 720, h: 1280, label: '9:16 طولي احترافي' };
    case '4:3':
      return { w: 1200, h: 900, label: '4:3 لوحة كلاسيكية' };
    case '3:4':
      return { w: 900, h: 1200, label: '3:4 بوستر وغلاف' };
    default:
      return { w: 1024, h: 1024, label: '1:1 مربع فائق الدقة' };
  }
}

async function tryPaidRasterGeneration(
  prompt: string,
  aspectRatio: string,
): Promise<string | undefined> {
  const paidGeminiKey = process.env.GEMINI_PAID_API_KEY?.trim();
  if (paidGeminiKey) {
    try {
      const paidAi = new GoogleGenAI({
        apiKey: paidGeminiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const res = await paidAi.models.generateContent({
        model: 'gemini-nano-banana-2.1',
        contents: prompt,
        config: {
          imageConfig: {
            aspectRatio: ['1:1', '16:9', '9:16', '4:3', '3:4'].includes(aspectRatio) ? aspectRatio : '1:1',
            imageSize: '1K',
          },
        },
      });
      for (const part of res.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          return `data:${mime};base64,${part.inlineData.data}`;
        }
      }
    } catch (err) {
      console.warn('[PaidImageFallback]', err instanceof Error ? err.message : String(err));
    }
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    try {
      const size =
        aspectRatio === '16:9' || aspectRatio === '4:3'
          ? '1536x1024'
          : aspectRatio === '9:16' || aspectRatio === '3:4'
            ? '1024x1536'
            : '1024x1024';
      const resp = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt,
          size,
          n: 1,
        }),
      });
      if (resp.ok) {
        const json = (await resp.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
        const b64 = json.data?.[0]?.b64_json;
        if (b64) return `data:image/png;base64,${b64}`;
      }
    } catch (err) {
      console.warn('[OpenAIImageFallback]', err instanceof Error ? err.message : String(err));
    }
  }
  return undefined;
}

interface VisualArtPlan {
  title: string;
  description: string;
  atmosphere: 'daylight' | 'golden' | 'night' | 'studio_light' | 'studio_dark';
  palette: string[];
  compositionPlan: string;
  objectsChecklist: string[];
  typographyText?: string;
}

async function generateArtPlan(
  ai: GoogleGenAI,
  prompt: string,
  refPart: { mimeType: string; data: string } | null,
  isDesignMode: boolean,
  dims: { w: number; h: number } = { w: 1024, h: 1024 },
  styleHints = '',
  geminiMode?: unknown,
): Promise<VisualArtPlan> {
  const planPrompt =
    `حلّل طلب التصميم التالي بدقة شديدة وحوّله إلى مخطط إخراج فني (Art Direction Plan) واضح لإنتاج لوحة ${dims.w}×${dims.h} مطابقة 100% لما طلبه المستخدم:\n` +
    `طلب المستخدم: "${prompt}"\n` +
    `${styleHints ? `توجيهات الأسلوب والإضاءة والكاميرا: ${styleHints}\n` : ''}` +
    `${refPart ? 'ملاحظة: أرفق المستخدم صورة مرجعية — التزم بعناصرها وألوانها وتكوينها أثناء التحويل أو التحسين.\n' : ''}` +
    `نوع العمل: ${isDesignMode ? 'هوية بصرية / شعار / بوستر احترافي' : 'تصميم ومشهد بصري فني فائق التفاصيل والأبعاد'}.`;

  const contents = refPart
    ? [{ role: 'user', parts: [{ inlineData: { mimeType: refPart.mimeType, data: refPart.data } }, { text: planPrompt }] }]
    : planPrompt;

  try {
    const res = await generateWithFallback(ai, {
      contents,
      geminiMode,
      thinkingLevel: normalizeGeminiMode(geminiMode) === 'pro' ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW,
      systemInstruction:
        'أنت مخرج فني عالمي ومدير إضاءة وتكوين بصري. قسّم أي طلب بصري إلى خطة تنفيذ احترافية تحدد الإضاءة الصحيحة وتوزيع الطبقات الأربع (خلفية عميقة، بيئة متوسطة، عنصر بؤري رئيسي بتظليل ثلاثي الأبعاد، وإضاءة أمامية ولمسات فنية). هام جداً: اكتب title و description باللغة العربية فقط دائماً.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'عنوان قصير باللغة العربية فقط' },
          description: { type: Type.STRING, description: 'وصف موجز باللغة العربية فقط' },
          atmosphere: { type: Type.STRING, description: 'daylight | golden | night | studio_light | studio_dark' },
          palette: { type: Type.ARRAY, items: { type: Type.STRING } },
          compositionPlan: { type: Type.STRING, description: `وصف تفصيلي لتوزيع العناصر وإحداثياتها داخل ${dims.w}x${dims.h} ومصدر الإضاءة والظلال والتفاصيل الدقيقة` },
          objectsChecklist: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'كل عنصر وتفصيلة مطلوبة في الطلب يجب رسمها بوضوح' },
          typographyText: { type: Type.STRING, description: 'أي نص طُلب كتابته داخل الشعار أو البوستر، وإلا فارغ' },
        },
        required: ['title', 'description', 'atmosphere', 'palette', 'compositionPlan', 'objectsChecklist'],
      },
    });
    const parsed = JSON.parse((res.text ?? '{}').trim()) as Partial<VisualArtPlan>;
    const validAtm = ['daylight', 'golden', 'night', 'studio_light', 'studio_dark'];
    return {
      title: stripHashSymbols(parsed.title || prompt.slice(0, 48) || 'تصميم ZORVYX AI'),
      description: stripHashSymbols(parsed.description || prompt.slice(0, 100)),
      atmosphere: validAtm.includes(String(parsed.atmosphere))
        ? (parsed.atmosphere as VisualArtPlan['atmosphere'])
        : 'studio_dark',
      palette:
        Array.isArray(parsed.palette) && parsed.palette.length >= 3
          ? parsed.palette.slice(0, 6)
          : ['#38bdf8', '#a78bfa', '#f472b6', '#fde047', '#0f172a'],
      compositionPlan: stripHashSymbols(parsed.compositionPlan || prompt),
      objectsChecklist:
        Array.isArray(parsed.objectsChecklist) && parsed.objectsChecklist.length > 0
          ? parsed.objectsChecklist.map((x) => stripHashSymbols(String(x)))
          : [prompt],
      typographyText: parsed.typographyText ? stripHashSymbols(parsed.typographyText) : '',
    };
  } catch {
    return {
      title: stripHashSymbols(prompt.slice(0, 48) || 'تصميم ZORVYX AI'),
      description: stripHashSymbols(prompt.slice(0, 100)),
      atmosphere: /نهار|شمس|حديقة|شاطئ|بحر|صباح|أبيض|بيضاء|سماء/i.test(prompt) ? 'daylight' : 'studio_dark',
      palette: ['#38bdf8', '#a78bfa', '#f472b6', '#fde047', '#0f172a'],
      compositionPlan: prompt,
      objectsChecklist: [prompt],
      typographyText: '',
    };
  }
}

function countSvgPrimitives(svg: string): number {
  const withoutComments = svg.replace(/<!--[\s\S]*?-->/g, '');
  const matches = withoutComments.match(/<(?:path|circle|ellipse|rect|polygon|polyline)\b/gi);
  return matches ? matches.length : 0;
}

function effectiveSvgLength(svg: string): number {
  return svg.replace(/<!--[\s\S]*?-->/g, '').trim().length;
}

async function generateUltraDetailedSvg(
  ai: GoogleGenAI,
  contents: unknown,
  systemInstruction: string,
  minChars = 8500,
  checklistHint = '',
  minPrimitives = 42,
  geminiMode?: unknown,
): Promise<string> {
  const mode = normalizeGeminiMode(geminiMode);
  const strictSystem =
    `${systemInstruction}\n` +
    `تنبيه صارم: ممنوع كتابة أي تعليقات نائبة مثل <!-- التدرجات --> أو الاكتفاء بـ 5–15 شكلاً هندسياً. يجب كتابة كافة المسارات والعناصر والتظليلات والعيون والشعر والملابس والإضاءة فعلياً بالكامل (${minPrimitives}+ عنصر رسم حقيقي).`;

  const firstRes = await generateWithFallback(ai, {
    contents,
    geminiMode: mode,
    thinkingLevel: mode === 'fast' ? ThinkingLevel.MINIMAL : ThinkingLevel.MEDIUM,
    systemInstruction: strictSystem,
  });
  let svg = extractRawSvg(firstRes.text ?? '');
  if (!svg) return '';

  const len1 = effectiveSvgLength(svg);
  const prim1 = countSvgPrimitives(svg);
  if (mode !== 'fast' && (len1 < minChars || prim1 < minPrimitives)) {
    try {
      const enrichRes = await generateWithFallback(ai, {
        contents:
          `الكود الحالي يحتوي فقط على ${prim1} عنصراً وطول فعلي ${len1} حرفاً، وهو غير مكتمل بصرياً. أعد بناءه وتوسيعه ليصبح تحفة فنية غنية بالتفاصيل (${minPrimitives * 2} إلى 180 مساراً ومنحنى فعلياً بدون أي تعليقات <!-- -->):\n` +
          `${checklistHint ? `- نفّذ كافة هذه العناصر بوضوح ونسب وتفاصيل تشريحية وهندسية دقيقة:\n${checklistHint}\n` : ''}` +
          `- قسّم المشهد إلى 4 مجموعات <g>: خلفية عميقة متعددة التدرجات، طبقة وسطى بظلال تلامس وعمق، عنصر رئيسي بملامح دقيقة (عيون ببؤبؤ وبريق، خصلات شعر/قماش/ملمس واقعي، إضاءة حواف rim light وتظليل 3D)، وطبقة أمامية بضبابية ضوئية وجزيئات.\n` +
          `- استخدم <linearGradient> و<radialGradient> متعددة التوقفات و<feGaussianBlur> / <feDropShadow>.\n` +
          `- ممنوع <script> أو <foreignObject> أو on* أو التعليقات.\n\nالكود المبدئي المطلوب تطويره وتفصيله:\n${svg}`,
        geminiMode: mode,
        thinkingLevel: mode === 'pro' ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM,
        systemInstruction: strictSystem,
      });
      const enriched = extractRawSvg(enrichRes.text ?? '');
      if (
        enriched &&
        (countSvgPrimitives(enriched) > prim1 || effectiveSvgLength(enriched) > len1)
      ) {
        svg = enriched;
      }
    } catch {
      // Keep original clean svg if enrichment pass hits transient issue
    }
  }

  return sanitizeSvg(svg.replace(/<!--[\s\S]*?-->/g, ''));
}

function parseDataUrlPart(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  return { mimeType, data: match[2] };
}

interface VoicePresetSpec {
  voiceName: string;
  gender: 'female' | 'male';
  style: string;
}

const VOICE_PRESET_MAP: Record<string, VoicePresetSpec> = {
  kore_warm: {
    voiceName: 'Kore',
    gender: 'female',
    style: 'Warm, calm, soothing Arabic female studio narration with steady clear cadence and natural human warmth',
  },
  zephyr_bright: {
    voiceName: 'Zephyr',
    gender: 'female',
    style: 'Bright, uplifting, lively Arabic female voice with clear expressive warmth and friendly conversational energy',
  },
  kore_narrative: {
    voiceName: 'Kore',
    gender: 'female',
    style: 'Poised, dramatic cinematic storytelling Arabic female voice with steady regal pacing and rich vocal presence',
  },
  charon_calm: {
    voiceName: 'Charon',
    gender: 'male',
    style: 'Calm, dignified, balanced Arabic male narration with crystal clarity and warm natural authority',
  },
  puck_dynamic: {
    voiceName: 'Puck',
    gender: 'male',
    style: 'Dynamic, youthful, engaging Arabic male speaker with natural upbeat inflection and warm tone',
  },
  fenrir_deep: {
    voiceName: 'Fenrir',
    gender: 'male',
    style: 'Deep, resonant documentary Arabic male voice with smooth steady cadence and cinematic presence',
  },
  // Singing presets (6 distinct studio vocal personas)
  zephyr_velvet: {
    voiceName: 'Zephyr',
    gender: 'female',
    style: 'Silky, warm, sweet velvet Arabic female studio ballad singing with gentle melodic vibrato, smooth legato, and tender emotion',
  },
  kore_classic: {
    voiceName: 'Kore',
    gender: 'female',
    style: 'Lush, classic, heartfelt Arabic female tarab singing voice with pure musical pitch, graceful phrasing, and rich warm studio resonance',
  },
  noor_pop: {
    voiceName: 'Zephyr',
    gender: 'female',
    style: 'Modern bright high-range Pop female vocalist with crisp studio clarity, energetic rhythmic phrasing, and soaring melodic chorus',
  },
  puck_warm: {
    voiceName: 'Puck',
    gender: 'male',
    style: 'Smooth, romantic, tender Arabic male tenor singing voice with gentle vibrato, melodic sweetness, and polished studio harmony',
  },
  charon_tarab: {
    voiceName: 'Charon',
    gender: 'male',
    style: 'Deep, soulful classic Arabic tarab male singing voice with steady melodic sustain and warm resonant baritone beauty',
  },
  fenrir_epic: {
    voiceName: 'Fenrir',
    gender: 'male',
    style: 'Powerful, epic, bold male vocalist ideal for anthem, cinematic battle song, and rhythmic rap-hiphop delivery with strong presence',
  },
};

function getProviderStatusReport() {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
  const hasPaidGemini = Boolean(process.env.GEMINI_PAID_API_KEY && process.env.GEMINI_PAID_API_KEY.trim());
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
  const hasElevenLabs = Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY.trim());
  const hasReplicate = Boolean(process.env.REPLICATE_API_TOKEN && process.env.REPLICATE_API_TOKEN.trim());

  return {
    scriptEngine: {
      name: `محرك Gemini الذكي (${PRIMARY_MODEL} / ${FALLBACK_MODEL})`,
      active: hasGemini,
      mode: hasGemini ? 'نشط ومربوط فعلياً في كل أدوات ZORVYX AI' : 'يتطلب ضبط مفتاح GEMINI_API_KEY الأساسي',
    },
    visualsEngine: {
      name: hasPaidGemini ? 'Gemini + محرك الصور السحابي + ZORVYX AI Studio' : 'Gemini Vision + ZORVYX AI Studio للرسم والـ VFX',
      active: hasGemini,
      mode: hasPaidGemini ? 'توليد نقطي سحابي + معالجة احترافية' : 'تخطيط إبداعي + طبقات فنية + إزالة وتبديل الخلفية + 60fps',
    },
    voiceEngine: {
      name: hasElevenLabs ? 'Gemini Audio + محرك الأصوات المتعدد' : 'Gemini Speech & Audio — النطق والدبلجة والغناء',
      active: hasGemini,
      mode: hasElevenLabs ? 'متعدد المحركات' : 'دبلجة وغناء حي باللهجات العربية والعالمية',
    },
    musicEngine: {
      name: 'Gemini + ZORVYX AI Music — المقامات والغناء والتوزيع',
      active: hasGemini,
      mode: 'ستيريو استوديو نقي + كورس وآلات عربية وأوركسترالية بدون نغمات آلية',
    },
    editorEngine: {
      name: 'ممنتج ZORVYX AI CINEMA متعدد المسارات',
      active: true,
      mode: 'مونتاج فوري وتصدير عالي الدقة محلياً',
    },
    models: {
      primary: PRIMARY_MODEL,
      fast: FALLBACK_MODEL,
      tts: 'gemini-3.8-flash-tts',
    },
    optionalCloudApis: [
      { id: 'gemini_paid', label: 'محرك الصور والفيديو السحابي الفائق', connected: hasPaidGemini, envVar: 'GEMINI_PAID_API_KEY' },
      { id: 'openai', label: 'محرك الصور والتوليد الاحترافي المتقدم', connected: hasOpenAi, envVar: 'OPENAI_API_KEY' },
      { id: 'elevenlabs', label: 'محرك استنساخ الأصوات البشرية الفائق', connected: hasElevenLabs, envVar: 'ELEVENLABS_API_KEY' },
      { id: 'replicate', label: 'منصة توليد الفيديو السحابية الخارجية', connected: hasReplicate, envVar: 'REPLICATE_API_TOKEN' },
    ],
  };
}

function parseRequestedDurationSeconds(promptText: string, voiceText = ''): number | null {
  const combined = `${promptText}\n${voiceText}`;
  const secMatch = combined.match(/(\d+(?:\.\d+)?)\s*(?:ثانية|ثوان|ثواني|ث|sec(?:onds?)?|s\b)/i);
  if (secMatch) {
    const val = Math.round(Number(secMatch[1]));
    if (val >= 5 && val <= 300) return val;
  }
  const minMatch = combined.match(/(\d+(?:\.\d+)?)\s*(?:دقيقة|دقائق|دقيقتين|min(?:utes?)?)/i);
  if (minMatch) {
    const val = Math.round(Number(minMatch[1]) * 60);
    if (val >= 10 && val <= 300) return val;
  }
  if (/نصف\s*دقيقة|نص\s*دقيقة/i.test(combined)) return 30;
  if (/دقيقتان|دقيقتين/i.test(combined)) return 120;
  if (/ربع\s*دقيقة/i.test(combined)) return 15;
  if (/(?:لمدة|مدته)\s*دقيقة/i.test(combined)) return 60;
  return null;
}

function ensureValidWavBuffer(buf: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  if (buf.length >= 44 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WAVE') {
    return buf;
  }
  const pcmData = buf;
  const blockAlign = (numChannels * bitsPerSample) >> 3;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}

function ensureValidWavBase64(b64?: string, sampleRate = 24000): string | undefined {
  if (!b64 || !b64.trim()) return undefined;
  try {
    const raw = Buffer.from(b64.trim(), 'base64');
    if (raw.length < 32) return undefined;
    return ensureValidWavBuffer(raw, sampleRate).toString('base64');
  } catch {
    return undefined;
  }
}

function measureWavSeconds(b64?: string): number {
  if (!b64) return 0;
  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length <= 44) return 0;
    const isRiff = buf.subarray(0, 4).toString('ascii') === 'RIFF';
    const dataBytes = isRiff ? buf.length - 44 : buf.length;
    const byteRate = isRiff ? (buf.readUInt32LE(28) || 48000) : 48000;
    return Math.max(1, Math.round(dataBytes / byteRate));
  } catch {
    return 0;
  }
}

async function callGeminiSpeechGenerate(
  ai: GoogleGenAI,
  text: string,
  voiceName: string,
  styleDirection: string,
  model: 'gemini-3.8-flash-tts' | 'gemini-3.8-flash-lite-tts' = 'gemini-3.8-flash-tts',
): Promise<string | undefined> {
  try {
    const res = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text,
              speechMetadata: {
                style: styleDirection,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });
    const inline = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (inline) return inline;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[GenerateTTS:${model}:${voiceName}]`, msg);
  }
  return undefined;
}

async function callGeminiInteractionTts(
  ai: GoogleGenAI,
  text: string,
  voiceName: string,
  styleDirection: string,
  model: 'gemini-3.8-flash-tts' | 'gemini-3.8-flash-lite-tts' = 'gemini-3.8-flash-tts',
): Promise<string | undefined> {
  const directAudio = await callGeminiSpeechGenerate(ai, text, voiceName, styleDirection, model);
  if (directAudio) return directAudio;
  try {
    const interaction = await ai.interactions.create({
      model,
      input: [
        {
          type: 'text',
          text,
          annotations: [
            {
              type: 'speech_metadata',
              style: styleDirection,
            },
          ],
        },
      ],
      response_format: { type: 'audio' },
      generation_config: {
        speech_config: [
          {
            language: 'ar-XA',
            voice: voiceName,
          },
        ],
      },
    });
    return interaction.output_audio?.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[InteractionTTS:${model}:${voiceName}]`, msg);
    return undefined;
  }
}

async function synthesizeVoiceWithReason(
  ai: GoogleGenAI,
  text: string,
  voiceGender: 'female' | 'male',
  voicePreset?: string,
): Promise<{ audioBase64?: string; error?: string }> {
  const cleanText = text.trim().slice(0, 1200);
  if (!cleanText) return { error: 'empty text' };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: 'missing API key' };

  const spec = (voicePreset && VOICE_PRESET_MAP[voicePreset]) ||
    VOICE_PRESET_MAP[voiceGender === 'male' ? 'charon_calm' : 'kore_warm'];

  const primaryAudio = await callGeminiInteractionTts(
    ai,
    cleanText,
    spec.voiceName,
    spec.style,
    'gemini-3.8-flash-tts',
  );
  if (primaryAudio) return { audioBase64: ensureValidWavBase64(primaryAudio) };

  const liteAudio = await callGeminiInteractionTts(
    ai,
    cleanText,
    spec.gender === 'female' ? 'Kore' : 'Charon',
    spec.style,
    'gemini-3.8-flash-lite-tts',
  );
  if (liteAudio) return { audioBase64: ensureValidWavBase64(liteAudio) };

  // 2. Fallback to v1beta generateContent TTS
  const ttsV1Beta = new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const errors: string[] = [];
  const attempts: Array<[string, string]> = [
    ['gemini-3.8-flash-tts', spec.voiceName],
    ['gemini-3.8-flash-lite-tts', spec.gender === 'female' ? 'Kore' : 'Charon'],
    ['gemini-2.5-flash-preview-tts', spec.gender === 'female' ? 'Kore' : 'Charon'],
  ];

  for (let i = 0; i < attempts.length; i++) {
    const [model, voiceName] = attempts[i];
    try {
      const res = await ttsV1Beta.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: cleanText }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });
      const data = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (data) return { audioBase64: ensureValidWavBase64(data) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      console.warn(`[TTS:${model}:${voiceName}]`, msg);
      if (msg.includes('429') || msg.includes('503') || msg.includes('RESOURCE_EXHAUSTED')) {
        await sleepMs(900);
      }
    }
  }
  return { error: errors.join(' | ') || 'no inlineData from TTS models' };
}

const DIALECT_DIRECTIONS: Record<string, string> = {
  fusha: 'Modern Standard Arabic (الفصحى)',
  ammiya: 'natural warm everyday Colloquial Arabic (اللهجة العامية العربية الطبيعية القريبة من الكلام اليومي بدون تكلف)',
  egyptian: 'natural warm Egyptian Arabic dialect (اللهجة المصرية الطبيعية)',
  gulf: 'natural dignified Gulf Arabic dialect (اللهجة الخليجية الطبيعية)',
  levantine: 'natural expressive Levantine Arabic dialect (اللهجة الشامية الطبيعية)',
  maghrebi: 'natural expressive Maghrebi Arabic dialect (اللهجة المغاربية الطبيعية)',
  english: 'natural fluent English',
  french: 'natural fluent French',
  spanish: 'natural fluent Spanish',
  turkish: 'natural fluent Turkish',
};

const GENRE_VOICE_MOODS: Record<string, string> = {
  رعب: 'tense, suspenseful, spine-tingling cinematic whisper and dramatic urgency',
  أكشن: 'bold, energetic, urgent action-movie delivery',
  دراما: 'deeply emotional, heartfelt dramatic acting',
  كوميديا: 'lighthearted, lively, expressive comedic timing',
  'خيال علمي': 'crisp, futuristic, awe-inspired sci-fi cinematic tone',
  مغامرات: 'adventurous, brave, uplifting storytelling energy',
  رومانسي: 'soft, warm, tender romantic emotion',
  وثائقي: 'clear, authoritative, poised documentary narration',
  تاريخي: 'grand, noble, epic historical dramatic authority',
  أنيميشن: 'colorful, expressive, lively animated character acting',
};

async function synthesizeCinemaVoice(
  ai: GoogleGenAI,
  params: {
    text: string;
    voiceActor: 'female' | 'male' | 'child';
    dialect?: string;
    language?: string;
    genre?: string;
    preferredVoiceName?: string;
  },
): Promise<{ audioBase64?: string; voiceName: string; error?: string }> {
  const cleanText = params.text.trim().slice(0, 900);
  if (!cleanText) return { voiceName: 'Kore', error: 'empty dialogue' };

  const voiceName =
    params.preferredVoiceName && ['Kore', 'Zephyr', 'Charon', 'Puck', 'Fenrir'].includes(params.preferredVoiceName)
      ? params.preferredVoiceName
      : params.voiceActor === 'male'
        ? 'Charon'
        : params.voiceActor === 'child'
          ? 'Puck'
          : 'Kore';

  const dialectDesc = DIALECT_DIRECTIONS[params.dialect || 'fusha'] || DIALECT_DIRECTIONS.fusha;
  const moodDesc = GENRE_VOICE_MOODS[params.genre || 'دراما'] || 'natural expressive cinematic acting';
  const ageDesc =
    params.voiceActor === 'child'
      ? 'Youthful, bright child-like tone and playful youthful cadence'
      : params.voiceActor === 'male'
        ? 'Natural adult male voice actor'
        : 'Natural adult female voice actress';

  const styleDirection = `${ageDesc} speaking in ${dialectDesc}. Performance: ${moodDesc}. Clear crisp studio vocal with realistic human pauses.`;

  const audio1 = await callGeminiInteractionTts(ai, cleanText, voiceName, styleDirection, 'gemini-3.8-flash-tts');
  if (audio1) return { audioBase64: ensureValidWavBase64(audio1), voiceName };

  const audio2 = await callGeminiInteractionTts(ai, cleanText, voiceName, styleDirection, 'gemini-3.8-flash-lite-tts');
  if (audio2) return { audioBase64: ensureValidWavBase64(audio2), voiceName };

  const fallback = await synthesizeVoiceWithReason(
    ai,
    cleanText,
    params.voiceActor === 'male' ? 'male' : 'female',
    params.voiceActor === 'male' ? 'charon_calm' : 'kore_warm',
  );
  return { audioBase64: ensureValidWavBase64(fallback.audioBase64), voiceName, error: fallback.error };
}

async function synthesizeVoice(
  ai: GoogleGenAI,
  text: string,
  voiceGender: 'female' | 'male',
  voicePreset?: string,
): Promise<string | undefined> {
  const r = await synthesizeVoiceWithReason(ai, text, voiceGender, voicePreset);
  return r.audioBase64;
}

export interface AutoSingerProfile {
  id: string;
  name: string;
  voiceName: 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';
  gender: 'female' | 'male';
  timbreLabel: string;
  voiceDesign: string;
  affinities: string[];
}

const AI_SINGER_CAST: AutoSingerProfile[] = [
  {
    id: 'singer_soprano_velvet',
    name: 'ليان — سوبرانو مخملي حالم',
    voiceName: 'Zephyr',
    gender: 'female',
    timbreLabel: 'صوت نسائي ناعم ومخملي عالي الإحساس',
    voiceDesign: 'Expressive velvet female studio vocalist singing tenderly with gentle lyrical vibrato, silky elongated vowels, warm intimate breath control, smooth legato phrasing and deep emotional longing.',
    affinities: ['رومانسي', 'حب', 'شجن', 'حنين', 'ناعم', 'مؤثر', 'ليل', 'مطر', 'هادئ'],
  },
  {
    id: 'singer_alto_tarab',
    name: 'أميرة — طرب شرقي دافئ',
    voiceName: 'Kore',
    gender: 'female',
    timbreLabel: 'صوت نسائي ألتو دافئ وطربي أصيل',
    voiceDesign: 'Soulful classic Arabic tarab female singer with rich warm alto resonance, unhurried musical sustained phrases, expressive micro-ornamentation and heartfelt studio acoustics.',
    affinities: ['طرب', 'أصيل', 'شرقي', 'شامي', 'حزين', 'شجن', 'أفلام', 'فصحى'],
  },
  {
    id: 'singer_tenor_romantic',
    name: 'رامي — تينور عاطفي دافئ',
    voiceName: 'Puck',
    gender: 'male',
    timbreLabel: 'صوت شاب تينور دافئ وعاطفي مشرق',
    voiceDesign: 'Warm youthful male tenor singer delivering heartfelt melodic pop and modern romantic ballads with smooth upward phrasing, soft airy vibrato and intimate studio presence.',
    affinities: ['بوب', 'حديث', 'مصري', 'فرح', 'تفاؤل', 'رومانسي', 'إيقاع', 'شبابي'],
  },
  {
    id: 'singer_baritone_tarab',
    name: 'طلال — باريتون خليجي وعربي فخم',
    voiceName: 'Charon',
    gender: 'male',
    timbreLabel: 'صوت رجولي رخيم وعميق للطرب والملاحم',
    voiceDesign: 'Deep rich Arabic baritone singer with poised soulful warmth, slow measured lyrical sustain, expressive resonant chest tone and dignified studio presence.',
    affinities: ['خليجي', 'طرب', 'تاريخي', 'حنين', 'هادئة', 'أفلام', 'عربي'],
  },
  {
    id: 'singer_bass_epic',
    name: 'باسل — صوت درامي ملحمي قوي',
    voiceName: 'Fenrir',
    gender: 'male',
    timbreLabel: 'صوت جهوري عميق وحماسي للملاحم والراب',
    voiceDesign: 'Bold deep resonant male vocalist with commanding cinematic projection, strong rhythmic cadence, dramatic emotional weight and intense studio power.',
    affinities: ['حماس', 'ملحمي', 'راب', 'هيب هوب', 'قوة', 'تحدي', 'غموض', 'أكشن'],
  },
  {
    id: 'singer_pop_bright',
    name: 'يارا — بوب عصري مشرق',
    voiceName: 'Zephyr',
    gender: 'female',
    timbreLabel: 'صوت نسائي مشرق وحيوي بإحساس عصري',
    voiceDesign: 'Crisp bright contemporary female pop singer with agile soaring phrases, cheerful warm energy, effortless clear tone and modern studio sparkle.',
    affinities: ['فرح', 'إشراق', 'بوب', 'عالمي', 'عصري', 'أنمي'],
  },
  {
    id: 'singer_deep_noir',
    name: 'سلمى — صوت حزين وعميق للسينما',
    voiceName: 'Kore',
    gender: 'female',
    timbreLabel: 'صوت نسائي درامي هامس ومشحون بالشجن',
    voiceDesign: 'Hauntingly delicate, melancholic female cinema ballad vocalist singing slowly with intimate emotional vulnerability, soft husky breath and lingering sad beauty.',
    affinities: ['حزين', 'غموض', 'دراما', 'بكاء', 'ألم', 'وداع', 'تأمل'],
  },
];

function selectAutoSinger(params: {
  prompt: string;
  genre: string;
  emotion: string;
  dialect: string;
  language: string;
  excludedIds?: string[];
  excludedVoiceNames?: string[];
}): { singer: AutoSingerProfile; reason: string } {
  const excludedIds = new Set(params.excludedIds || []);
  const excludedVoices = new Set(params.excludedVoiceNames || []);
  const queryBlob = `${params.prompt} ${params.genre} ${params.emotion} ${params.dialect}`.toLowerCase();

  const wantsMale = /(?:صوت\s*رجل|صوت\s*شاب|مغني\s*رجل|مطرب|ذكر|رجالي|male)/i.test(queryBlob);
  const wantsFemale = /(?:صوت\s*امر[أا]ة|صوت\s*بنت|مغنية|مطربة|أنثى|نسائي|female)/i.test(queryBlob);

  // When switching singer explicitly, first prefer completely different voiceName & opposite or contrasting timbre
  let pool = AI_SINGER_CAST.filter((s) => !excludedIds.has(s.id) && !excludedVoices.has(s.voiceName));
  if (pool.length === 0) {
    pool = AI_SINGER_CAST.filter((s) => !excludedIds.has(s.id));
  }
  if (pool.length === 0) {
    pool = [...AI_SINGER_CAST];
  }

  let best = pool[0];
  let bestScore = -999;
  for (const cand of pool) {
    let score = 0;
    if (wantsMale && cand.gender === 'male') score += 8;
    if (wantsFemale && cand.gender === 'female') score += 8;
    for (const kw of cand.affinities) {
      if (queryBlob.includes(kw)) score += 3;
    }
    if (excludedIds.size > 0) {
      // Bonus when switching to a voice from the same cast with contrasting gender or voiceName
      if (!excludedVoices.has(cand.voiceName)) score += 6;
    }
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }

  const reason = `تم اختيار «${best.name}» تلقائياً لملاءمة نمط (${params.genre}) وإحساس (${params.emotion})`;
  return { singer: best, reason };
}

function concatenateWavClipsWithGap(wavBase64List: string[], gapSeconds = 0.45): string | undefined {
  const validBuffers = wavBase64List
    .filter(Boolean)
    .map((b64) => ensureValidWavBuffer(Buffer.from(b64, 'base64')))
    .filter((buf) => buf.length > 44);
  if (validBuffers.length === 0) return undefined;
  if (validBuffers.length === 1) return validBuffers[0].toString('base64');

  const first = validBuffers[0];
  const sampleRate = first.readUInt32LE(24) || 24000;
  const numChannels = Math.max(1, first.readUInt16LE(22) || 1);
  const blockAlign = Math.max(2, first.readUInt16LE(32) || numChannels * 2);
  const gapBytes = Math.floor(sampleRate * gapSeconds) * blockAlign;
  const silenceGap = Buffer.alloc(gapBytes);

  const chunks: Buffer[] = [];
  validBuffers.forEach((buf, idx) => {
    const pcmPayload = buf.subarray(44);
    chunks.push(pcmPayload);
    if (idx < validBuffers.length - 1 && gapBytes > 0) {
      chunks.push(silenceGap);
    }
  });
  const totalDataBytes = chunks.reduce((s, c) => s + c.length, 0);
  const header = Buffer.from(first.subarray(0, 44));
  header.writeUInt32LE(36 + totalDataBytes, 4);
  header.writeUInt32LE(totalDataBytes, 40);
  return Buffer.concat([header, ...chunks]).toString('base64');
}

async function synthesizeSingingVoice(
  ai: GoogleGenAI,
  lyrics: string,
  singer: AutoSingerProfile,
  moodHint: string,
  options?: {
    emotion?: string;
    dialect?: string;
    language?: string;
  },
): Promise<{ combinedWavBase64?: string; segments: Array<{ label: string; audioBase64: string; durationSec: number }> }> {
  const cleanLines = lyrics
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/^\s*(?:المقطع|اللازمة|الكورس|مقدمة|خاتمة)[^:\n]*:\s*/gim, '')
    .replace(/#/g, '')
    .split(/\n+/)
    .map((ln) => ln.replace(/[،؛.!؟]+/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 8);

  if (cleanLines.length === 0) return { segments: [] };

  const dialectInfo = options?.dialect ? (DIALECT_DIRECTIONS[options.dialect] || options.dialect) : '';
  const emotionInfo = options?.emotion || moodHint || 'warm heartfelt emotion';
  const langCode = options?.language && /English|الإنجليزية/i.test(options.language) ? 'en-US' : 'ar-XA';

  // Split lines cleanly into 2 musical stanzas (Verse 1 + Emotional Chorus/Refrain) for real song pacing without rushing!
  const mid = Math.ceil(cleanLines.length / 2);
  const stanzas: Array<{ label: string; text: string; intensity: string }> = [
    {
      label: 'المقطع الأول',
      text: cleanLines.slice(0, mid).join(' ،  '),
      intensity: 'gentle intimate first verse delivery, unhurried musical pauses between phrases',
    },
  ];
  if (cleanLines.length > mid) {
    stanzas.push({
      label: 'اللازمة والكورس',
      text: cleanLines.slice(mid).join(' ،  '),
      intensity: 'soaring heartfelt melodic chorus climax with warm emotional sustain and rich resonance',
    });
  }

  const synthOneStanza = async (stanza: { label: string; text: string; intensity: string }) => {
    const singingStyle =
      `${singer.voiceDesign} Delivery: ${stanza.intensity}. Emotion: ${emotionInfo}. ` +
      `${dialectInfo ? `Pronunciation & Dialect: ${dialectInfo}. ` : ''}` +
      `Slow lyrical musical rhythm, expressive vocal flow, never rushed.`;

    let b64 = await callGeminiSpeechGenerate(ai, stanza.text, singer.voiceName, singingStyle, 'gemini-3.8-flash-tts');
    if (!b64) {
      b64 = await callGeminiSpeechGenerate(ai, stanza.text, singer.voiceName, singingStyle, 'gemini-3.8-flash-lite-tts');
    }
    if (!b64) {
      try {
        const interaction = await ai.interactions.create({
          model: 'gemini-3.8-flash-tts',
          input: [{ type: 'text', text: stanza.text, annotations: [{ type: 'speech_metadata', style: singingStyle }] }],
          response_format: { type: 'audio' },
          generation_config: { speech_config: [{ language: langCode, voice: singer.voiceName }] },
        });
        b64 = interaction.output_audio?.data;
      } catch {
        // fallback handled below
      }
    }
    if (!b64) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        const ttsV1Beta = new GoogleGenAI({
          apiKey,
          apiVersion: 'v1beta',
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const models: Array<'gemini-3.8-flash-tts' | 'gemini-3.8-flash-lite-tts' | 'gemini-2.5-flash-preview-tts'> = [
          'gemini-3.8-flash-tts',
          'gemini-3.8-flash-lite-tts',
          'gemini-2.5-flash-preview-tts',
        ];
        for (const mdl of models) {
          if (b64) break;
          try {
            const plainRes = await ttsV1Beta.models.generateContent({
              model: mdl,
              contents: [{ role: 'user', parts: [{ text: stanza.text }] }],
              config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: singer.voiceName },
                  },
                },
              },
            });
            const data = plainRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (data) b64 = data;
          } catch (err) {
            console.warn(`[SingTTS:${mdl}:${singer.voiceName}]`, err instanceof Error ? err.message : String(err));
          }
        }
      }
    }
    const normalizedWav = ensureValidWavBase64(b64);
    return {
      label: stanza.label,
      audioBase64: normalizedWav || '',
      durationSec: normalizedWav ? measureWavSeconds(normalizedWav) : 0,
    };
  };

  const results = await Promise.all(stanzas.map((st) => synthOneStanza(st)));
  const validSegments = results.filter((r) => Boolean(r.audioBase64));
  const combinedWavBase64 = concatenateWavClipsWithGap(
    validSegments.map((s) => s.audioBase64),
    0.75,
  );
  return { combinedWavBase64, segments: validSegments };
}

function formatAIError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('GEMINI_API_KEY') || raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED')) {
    return {
      status: 400,
      message: 'يرجى التحقق من مفتاح GEMINI_API_KEY في لوحة Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'الخدمة مشغولة مؤقتاً على هذا المفتاح. يرجى المحاولة بعد قليل.',
    };
  }
  if (raw.includes('503') || raw.includes('UNAVAILABLE')) {
    return {
      status: 503,
      message: 'الخدمة تشهد ضغطاً مؤقتاً حالياً، يرجى المحاولة مرة أخرى بعد لحظات.',
    };
  }
  return {
    status: 500,
    message: raw || 'حدث خطأ أثناء الاتصال بخدمة الذكاء الاصطناعي.',
  };
}

const NO_HASH_RULE =
  ' ممنوع منعاً باتاً استخدام رمز الهاشتاق (#) أو عناوين Markdown التي تبدأ بـ # أو ## أو ### في أي مكان بالإجابة؛ اكتب العناوين بأسلوب نصي أنيق وواضح بدون علامة # نهائياً.';

const VOICE_INTRO_IDENTITY_RULE =
  ' قاعدة التعريف بالنفس في المحادثة الصوتية فقط: عندما يطلب منك المستخدم التعريف بنفسك أو يسألك من أنت أو من هو مصممك أو مخترعك أو مطورك، قدّم نفسك بصوت ودود وقل بوضوح: "أنا زورفيكس للذكاء الاصطناعي، مصمّمي ومخترعي ومطوّري نهى إسماعيل فتحي ابو عرب." أما في بقية المحادثات والأسئلة العادية فلا تذكر اسم المصمم أو المطور ولا تكرره بعد كل رد.';

const ZORVYX_ICON_DIRECTORY =
  'دليل أيقونات ZORVYX AI المتخصصة:\n' +
  '- المساعد الذكي (للأسئلة العامة المتنوعة)\n' +
  '- الكتابة والصياغة (المقالات، القصص، الرسائل الإبداعية، النصوص)\n' +
  '- التعلّم والشرح (شرح الدروس، تبسيط العلوم، الأسئلة الدراسية)\n' +
  '- الأفكار والإبداع (أفكار المشاريع، التسميات، العصف الذهني)\n' +
  '- التخطيط والتنظيم (الخطط طويلة المدى والجداول الاستراتيجية)\n' +
  '- مساعد التصميم (الشعارات، الهوية البصرية، الألوان، البوسترات)\n' +
  '- الترجمة (ترجمة النصوص والصور بين اللغات)\n' +
  '- المُلخِّص الذكي (تلخيص المقالات والاجتماعات والملفات الطويلة)\n' +
  '- المُبرمج والمُطوّر الذكي (كتابة وإصلاح وشرح الأكواد ومعادلات Excel)\n' +
  '- خبير التسويق والمحتوى (الإعلانات، السوشيال ميديا، خطط البيع)\n' +
  '- المُصحِّح والتدقيق اللغوي (تصحيح الإملاء والنحو وعلامات الترقيم)\n' +
  '- الإيميلات والرسائل الرسمية (صياغة الرسائل والإيميلات الوظيفية والرسمية)\n' +
  '- المُستشار المالي والميزانية (تنظيم المصاريف، الادخار، الحسابات المالية)\n' +
  '- مُدرّب المقابلات الوظيفية (أسئلة التوظيف، محاكاة المقابلة، تقييم الإجابات)\n' +
  '- الصياغة القانونية والعقود (صياغة ومراجعة مسودات العقود والاتفاقيات وشرح البنود)\n' +
  '- مستشار الصحة والتغذية واللياقة (خطط التغذية الصحية، السعرات، التمارين، العادات الصحية)\n' +
  '- المهام اليومية (ترتيب قائمة مهام اليوم)\n' +
  '- الرسم البياني الذكي (إنشاء المخططات والرسوم البيانية للبيانات)\n' +
  '- شرح الموضوع بفيديو (تحويل أي موضوع إلى فيديو تعليمي مشروح بالمشاهد)\n' +
  '- العدسة الذكية (تحليل وحل الأسئلة من الصور)\n' +
  '- المُتحدّث الصوتي الذكي (الرد والتحدث الصوتي المباشر)\n' +
  '- المستندات والملفات (إنشاء ملفات Word وPDF وExcel وPowerPoint)\n' +
  '- إنشاء سيرة ذاتية (بناء السيرة الذاتية).\n';

function strictScopePrompt(toolTitle: string, allowedScope: string, forbiddenExamples: string): string {
  return (
    `أنت أداة "${toolTitle}" المتخصصة حصراً في منصة ZORVYX AI.\n` +
    `نطاق تخصصك الوحيد المسموح به: ${allowedScope}.\n` +
    `قاعدة التخصّص الصارمة (مهم جداً): يُمنع منعاً باتاً تنفيذ أي طلب خارج نطاق "${toolTitle}" (مثل: ${forbiddenExamples}).\n` +
    `إذا طلب المستخدم شيئاً لا يخص "${toolTitle}"، لا تنفذ الطلب نهائياً، واكتفِ بالاعتذار بلباقة في سطرين فقط ووجّه المستخدم إلى اسم الأيقونة الصحيحة من الدليل التالي:\n` +
    ZORVYX_ICON_DIRECTORY +
    ' لا تضف أي توقيع أو عبارة عن المصمم أو المخترع بعد الردود.' +
    NO_HASH_RULE
  );
}

const TOOL_SYSTEM_PROMPTS: Record<string, string> = {
  general:
    'أنت ZORVYX AI، المساعد الذكي العام الأنيق والدقيق. قدّم إجابات واضحة ومنظمة وعملية باللغة العربية ما لم يطلب المستخدم لغة أخرى. لا تضف أي توقيع أو عبارة تعريف بالمصمم في نهاية الإجابات.' +
    NO_HASH_RULE,
  writer: strictScopePrompt(
    'الكتابة والصياغة',
    'كتابة المقالات، القصص، الخواطر، النصوص الأدبية، الخطابات الإبداعية، وإعادة صياغة النصوص',
    'كتابة الأكواد البرمجية، الترجمة، حل مسائل الرياضيات، الحسابات المالية، الرسم البياني، أو الإعلانات التسويقية',
  ),
  learn: strictScopePrompt(
    'التعلّم والشرح',
    'شرح الدروس والمفاهيم العلمية والأكاديمية، تبسيط المعارف، الإجابة عن الأسئلة الدراسية مع أمثلة تعليمية وملخص',
    'كتابة الإعلانات التجارية، الإيميلات الرسمية، الميزانيات المالية، تصميم الشعارات، أو تلخيص نصوص المستخدم بدون شرح درس',
  ),
  ideas: strictScopePrompt(
    'الأفكار والإبداع',
    'توليد أفكار المشاريع، اقتراح أسماء تجارية، العصف الذهني، وإيجاد حلول إبداعية مبتكرة',
    'الترجمة، البرمجة، التدقيق الإملائي، الحسابات المالية، أو كتابة العقود والإيميلات',
  ),
  plan: strictScopePrompt(
    'التخطيط والتنظيم',
    'إعداد الخطط العملية والزمنية، تقسيم الأهداف إلى مراحل، وتنظيم المشاريع والجداول الاستراتيجية',
    'كتابة القصص، الأكواد البرمجية، الترجمة، التسويق، أو الرسم البياني',
  ),
  design: strictScopePrompt(
    'مساعد التصميم',
    'اقتراح الهوية البصرية، لوحات الألوان، خطوط الطباعة، أفكار الشعارات والبوسترات والتوجه الفني',
    'البرمجة، الترجمة، الحسابات المالية، كتابة الإيميلات الرسمية، أو التدقيق النحوي',
  ),
  translate: strictScopePrompt(
    'الترجمة',
    'ترجمة النصوص بدقة واحترافية بين اللغات مع الحفاظ على المعنى والأسلوب والسياق',
    'تأليف مقالات من الصفر، البرمجة، وضع خطط مالية، شرح دروس علمية غير مطلوبة للترجمة، أو كتابة إعلانات',
  ),
  summarize: strictScopePrompt(
    'المُلخِّص الذكي',
    'تلخيص النصوص والمقالات والمحاضرات والاجتماعات الطويلة في نقاط مركّزة واستخراج الأفكار الرئيسية والخطوات العملية',
    'تأليف نصوص جديدة طويلة، البرمجة، الترجمة، تصميم الشعارات، أو حساب الميزانيات',
  ),
  code: strictScopePrompt(
    'المُبرمج والمُطوّر الذكي',
    'كتابة الأكواد البرمجية، بناء واجهات المواقع، إصلاح الأخطاء، شرح الأكواد، وكتابة استعلامات SQL ومعادلات Excel',
    'كتابة القصص والمقالات الأدبية، الترجمة، الإعلانات التسويقية، الإيميلات غير التقنية، أو الاستشارات المالية',
  ),
  marketing: strictScopePrompt(
    'خبير التسويق والمحتوى',
    'كتابة الإعلانات التسويقية، خطط المحتوى، نصوص السوشيال ميديا والريلز، واستراتيجيات جذب العملاء والمبيعات',
    'كتابة الأكواد البرمجية، شرح دروس الفيزياء والرياضيات، الترجمة، التدقيق اللغوي الصرف، أو الميزانية الشخصية',
  ),
  proofread: strictScopePrompt(
    'المُصحِّح والتدقيق اللغوي',
    'التدقيق الإملائي والنحوي، ضبط علامات الترقيم، تحسين سلامة اللغة العربية أو الإنجليزية، وعرض الأخطاء المصححة في النص المرفق فقط',
    'تأليف مواضيع جديدة، البرمجة، الترجمة للغات أخرى، التسويق، أو التخطيط',
  ),
  emails: strictScopePrompt(
    'الإيميلات والرسائل الرسمية',
    'كتابة الرسائل والإيميلات الوظيفية والتجارية والرسمية (التقديم لوظيفة، الاعتذار المهني، المتابعة، الشكاوى الرسمية، الدعوات)',
    'كتابة القصص، البرمجة، شرح الدروس، الرسم البياني، أو الحسابات المالية',
  ),
  finance: strictScopePrompt(
    'المُستشار المالي والميزانية',
    'إعداد الميزانيات الشهرية والشخصية، توزيع الدخل والمصاريف، خطط الادخار، حساب الأرباح والتكاليف والنسب المالية',
    'كتابة القصص، البرمجة، الترجمة، التدقيق الإملائي، أو تصميم الشعارات',
  ),
  interview: strictScopePrompt(
    'مُدرّب المقابلات الوظيفية',
    'التدريب على مقابلات العمل، توليد أسئلة المقابلات الشائعة والتخصصية، صياغة إجابات احترافية بأسلوب STAR، تقييم إجابات المتقدم، ونصائح التحضير والتفاوض الوظيفي',
    'إنشاء سيرة ذاتية كاملة، كتابة الأكواد البرمجية، الترجمة، الخطط الغذائية، أو الصياغة القانونية للعقود',
  ),
  legal: strictScopePrompt(
    'الصياغة القانونية والعقود',
    'صياغة ومراجعة مسودات العقود والاتفاقيات ومذكرات التفاهم، إعداد الشروط والأحكام وسياسات الخصوصية، وشرح البنود القانونية والتنبيه للثغرات التعاقدية مع التوصية بمراجعة محامٍ مختص للاعتماد الرسمي',
    'البرمجة، الترجمة، التسويق، الخطط الغذائية، كتابة القصص، أو حل المسائل الدراسية',
  ),
  wellness: strictScopePrompt(
    'مستشار الصحة والتغذية واللياقة',
    'إعداد خطط التغذية الصحية والوجبات المتوازنة، حساب السعرات الحرارية والاحتياج اليومي من الماء والبروتين، برامج التمارين الرياضية واللياقة البدنية، ونصائح النوم الصحي وتنظيم العادات اليومية (مع التنبيه بأنها إرشادات تثقيفية عامة لا تغني عن استشارة الطبيب)',
    'البرمجة، الصياغة القانونية والعقود، الترجمة، التدقيق الإملائي، أو الحسابات المالية',
  ),
};

interface IncomingHistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

async function handleChat(req: Request, res: Response) {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const kind = typeof req.body?.kind === 'string' ? req.body.kind : 'general';
    const history: IncomingHistoryItem[] = Array.isArray(req.body?.history) ? req.body.history : [];

    if (!message) {
      return res.status(400).json({ error: 'يرجى كتابة الرسالة أولاً.' });
    }

    const ai = getAI();
    const systemInstruction = TOOL_SYSTEM_PROMPTS[kind] || TOOL_SYSTEM_PROMPTS.general;

    const contents =
      history.length > 0
        ? [
            ...history.map((h) => ({
              role: h.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: String(h.text || '') }],
            })),
            { role: 'user', parts: [{ text: message }] },
          ]
        : message;

    const response = await generateWithFallback(ai, {
      geminiMode: req.body?.geminiMode,
      contents,
      systemInstruction,
    });

    const cleanAnswer = stripHashSymbols(response.text ?? 'لم يصل رد نصي من النموذج.');
    return res.json({ answer: cleanAnswer || 'لم يصل رد نصي من النموذج.' });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
}

app.post('/api/chat', handleChat);
app.post('/.netlify/functions/chat', handleChat);

app.post('/api/lens', async (req: Request, res: Response) => {
  try {
    const imageDataUrl = typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl.trim() : '';
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const mode = req.body?.mode === 'translate' ? 'translate' : 'lens';
    const targetLanguage =
      typeof req.body?.targetLanguage === 'string' && req.body.targetLanguage.trim()
        ? req.body.targetLanguage.trim()
        : 'العربية';
    const imagePart = parseDataUrlPart(imageDataUrl);
    if (!imagePart) {
      return res.status(400).json({ error: 'يرجى التقاط صورة بالكاميرا أو رفع صورة واضحة أولاً.' });
    }

    const ai = getAI();
    const promptText =
      mode === 'translate'
        ? `استخرج كل النصوص واللافتات والبيانات المكتوبة داخل هذه الصورة بدقة تامة وترجمها ترجمة احترافية طبيعية إلى لغة (${targetLanguage}).${question ? `\nملاحظة أو طلب إضافي من المستخدم: ${question}` : ''}`
        : question
          ? `انظر إلى الصورة المرفقة بدقة وأجب عن طلب المستخدم التالي بأسلوب واضح ومباشر:\n${question}`
          : 'حلّل محتوى هذه الصورة واشرحها بوضوح؛ وإذا كانت مسألة رياضية أو سؤالاً دراسياً أو نصاً، قدّم الحل الكامل خطوة بخطوة بالعربية.';

    const systemInstruction =
      mode === 'translate'
        ? `أنت مترجم العدسة الذكية في ZORVYX AI. مهمتك قراءة النصوص داخل الصور (وثائق، قوائم، لافتات، شاشات، صفحات كتب، رسائل) بدقة تامة وترجمتها إلى (${targetLanguage}) بأسلوب سلس وطبيعي يحافظ على السياق والمعنى الكامل.` +
          NO_HASH_RULE
        : 'أنت العدسة الذكية في ZORVYX AI. مهمتك فحص الصور بدقة فائقة (مسائل حسابية، كتب، أوراق عمل، منتجات، نباتات، طعام، شاشات، رسومات) وتقديم الحل الدقيق أو الشرح المطلوب بالعربية بشكل مرتب وواضح.' +
          NO_HASH_RULE;

    const response = await generateWithFallback(ai, {
      geminiMode: req.body?.geminiMode,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: imagePart.mimeType, data: imagePart.data } },
            { text: promptText },
          ],
        },
      ],
      thinkingLevel: ThinkingLevel.MEDIUM,
      systemInstruction,
    });

    const answer = stripHashSymbols(response.text ?? 'لم يصل تحليل نصي للصورة.');
    return res.json({ answer: answer || 'لم يصل تحليل نصي للصورة.' });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

app.post('/api/design-chat', async (req: Request, res: Response) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const history: IncomingHistoryItem[] = Array.isArray(req.body?.history) ? req.body.history : [];
    const previousArtwork = req.body?.previousArtwork as
      | { title?: string; description?: string; palette?: string[]; is3D?: boolean }
      | undefined;
    const autoVisual = req.body?.autoVisual !== false;

    if (!message) {
      return res.status(400).json({ error: 'يرجى كتابة وصف التصميم أو التعديل المطلوب أولاً.' });
    }

    const ai = getAI();
    const prevContext = previousArtwork
      ? `\n\nسياق التصميم البصري السابق:\n- العنوان: ${previousArtwork.title || 'غير محدد'}\n- الوصف: ${previousArtwork.description || ''}\n- لوحة الألوان السابقة: ${(previousArtwork.palette || []).join(', ')}`
      : '';

    const chatContents =
      history.length > 0
        ? [
            ...history.slice(-10).map((h) => ({
              role: h.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: String(h.text || '') }],
            })),
            { role: 'user', parts: [{ text: `${message}${prevContext}` }] },
          ]
        : `${message}${prevContext}`;

    const visualPrompt = previousArtwork
      ? `حدّث التصميم البصري السابق بناءً على التعديل التالي: "${message}"\nالتصميم السابق: ${previousArtwork.title || ''} — ${previousArtwork.description || ''}\nالألوان السابقة: ${(previousArtwork.palette || []).join(', ')}\nحافظ على هوية التصميم مع تنفيذ كل التعديلات المطلوبة بدقة وجمال احترافي.`
      : `صمّم عملاً فنياً / شعاراً / واجهة بصرية احترافية حسب الوصف التالي: ${message}`;

    const is3DRequest = /3d|ثلاثي|مجسم|مكعب|عمق|واقعي/i.test(message) || Boolean(previousArtwork?.is3D);

    const textPromise = generateWithFallback(ai, {
      geminiMode: req.body?.geminiMode,
      contents: chatContents,
      thinkingLevel: ThinkingLevel.LOW,
      systemInstruction:
        'أنت ZORVYX مدير إبداعي ومصمم جرافيك وUI/UX خبير يعمل بأسلوب شات جي بي تي الاحترافي. قدّم دائماً رداً عربياً منظماً وعملياً يتضمن: 1) الفكرة التصميمية والتكوين، 2) لوحة الألوان المقترحة، 3) الخطوط والتوازن البصري، 4) خطوات التحسين التالية للمستخدم.' +
        NO_HASH_RULE,
    });

    const visualPromise = autoVisual
      ? generateUltraDetailedSvg(
          ai,
          `${visualPrompt}\n\nأخرج كود <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"> مباشرة فقط بدون أي نص أو Markdown.`,
          `أنت كبير مصممي الهويات البصرية والفن الرقمي الواقعي في ZORVYX AI. مهمتك إخراج تحفة SVG فائقة الواقعية والتفاصيل تبدأ بـ <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"> وتنتهي بـ </svg>.\n` +
            `قواعد إلزامية للإخراج الواقعي الفاخر:\n` +
            `1. أدرج <title>عنوان عربي قصير</title> و<desc>وصف عربي موجز</desc>.\n` +
            `2. استخدم <defs> مع 12 إلى 20 تدرجاً (<linearGradient> و<radialGradient> متعددة التوقفات) + <filter> و<feGaussianBlur> لصناعة ظلال ناعمة حقيقية وتوهج إضاءة استوديو وعمق ميداني.\n` +
            `3. ممنوع منعاً باتاً استخدام <script> أو <foreignObject> أو on*.\n` +
            `4. ابنِ 5 مجموعات <g> عالية الكثافة (85 إلى 170 مساراً ومنحنى Bezier دقيقاً، ظلالاً مصبوبة ناعمة، إضاءة حواف rim light، انعكاسات واقعية بدون أشكال هندسية ساذجة).`,
          6000,
          message,
          36,
          req.body?.geminiMode,
        )
      : Promise.resolve('');

    const [textResult, visualResult] = await Promise.allSettled([textPromise, visualPromise]);

    let answer = 'تم إعداد التصميم المقترح.';
    if (textResult.status === 'fulfilled') {
      answer = stripHashSymbols(textResult.value.text?.trim() || answer);
    } else {
      throw textResult.reason;
    }

    let artwork:
      | {
          title: string;
          description: string;
          palette: string[];
          svg: string;
          is3D: boolean;
          isLogo: boolean;
          style: string;
        }
      | undefined;

    if (visualResult.status === 'fulfilled' && visualResult.value) {
      const cleanSvg = visualResult.value;
      const meta = extractSvgMetadata(cleanSvg, message);
      artwork = {
        title: meta.title,
        description: meta.description || message.slice(0, 80),
        palette: meta.palette,
        svg: cleanSvg,
        is3D: is3DRequest,
        isLogo: true,
        style: 'استوديو التصميم الذكي',
      };
    }

    return res.json({ answer, ...(artwork ? { artwork } : {}) });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

app.post('/api/cv', async (req: Request, res: Response) => {
  try {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const existing = req.body?.existing || {};
    if (!prompt && !existing?.fullName) {
      return res.status(400).json({ error: 'يرجى كتابة نبذة عنك أو بياناتك لإنشاء السيرة الذاتية.' });
    }

    const ai = getAI();
    const response = await generateWithFallback(ai, {
      geminiMode: req.body?.geminiMode,
      contents: `طلب المستخدم: ${prompt || 'تحسين وصياغة السيرة الذاتية باحترافية'}\nالبيانات الحالية إن وجدت: ${JSON.stringify(existing)}`,
      systemInstruction:
        'أنت خبير موارد بشرية وكاتب سير ذاتية احترافية (ATS-Friendly) في ZORVYX AI. أنشئ أو حسّن سيرة ذاتية متكاملة ومنظمة باللغة المطلوبة (العربية افتراضياً ما لم يُطلب الإنجليزية) بصياغة قوية ومؤثرة وأفعال إنجاز احترافية.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          fullName: { type: Type.STRING },
          jobTitle: { type: Type.STRING },
          email: { type: Type.STRING },
          phone: { type: Type.STRING },
          location: { type: Type.STRING },
          summary: { type: Type.STRING },
          experience: { type: Type.STRING, description: 'الخبرات العملية مرتبة بوضوح في سطور' },
          education: { type: Type.STRING, description: 'المؤهلات العلمية والدورات' },
          skills: { type: Type.STRING, description: 'المهارات مفصولة بفواصل' },
          languages: { type: Type.STRING, description: 'اللغات ومستوى الإتقان' },
        },
        required: [
          'fullName',
          'jobTitle',
          'email',
          'phone',
          'location',
          'summary',
          'experience',
          'education',
          'skills',
          'languages',
        ],
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    return res.json({ cv: parsed });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

app.post('/api/docs', async (req: Request, res: Response) => {
  try {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const doctype = typeof req.body?.doctype === 'string' ? req.body.doctype : 'docx';
    if (!prompt) {
      return res.status(400).json({ error: 'يرجى كتابة موضوع المستند أولاً.' });
    }

    const formatHint =
      doctype === 'ppt' || doctype === 'pptx'
        ? 'اكتب المحتوى على شكل شرائح عرض تقديمي متسلسلة، بحيث تفصل بين كل شريحة وأخرى بسطر فارغ تماماً (فقرة لكل شريحة)، تبدأ بعنوان الشريحة ثم نقاط مختصرة.'
        : doctype === 'xls' || doctype === 'xlsx' || doctype === 'csv'
          ? 'اكتب جدولاً منظماً بصيغة CSV باستخدام الفاصلة (,) بين الأعمدة وسطر جديد لكل صف، مع صف عناوين واضح في البداية، وبدون أي شرح إضافي خارج الجدول.'
          : doctype === 'pdf'
            ? 'اكتب تقريراً أو مستنداً احترافياً منسقاً بعنوان واضح وأقسام مرتبة ونقاط واضحة ومقروءة مناسبة للطباعة والحفظ بصيغة PDF.'
            : 'اكتب مستنداً متكاملاً ومنظماً بعناوين واضحة وفقرات احترافية جاهزة للتنزيل.';

    const ai = getAI();
    const response = await generateWithFallback(ai, {
      geminiMode: req.body?.geminiMode,
      contents: `الموضوع المطلوب: ${prompt}`,
      systemInstruction:
        `أنت ZORVYX صانع المستندات الذكي. أنشئ محتوى مستند عربي احترافي حسب الصيغة المطلوبة. ${formatHint}` +
        NO_HASH_RULE,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          fileName: { type: Type.STRING, description: 'اسم مقترح مختصر للملف بدون امتداد' },
          content: { type: Type.STRING, description: 'المحتوى الكامل للمستند حسب الصيغة المطلوبة' },
        },
        required: ['fileName', 'content'],
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    return res.json({
      fileName: stripHashSymbols(parsed.fileName || 'مستند-زورفيكس'),
      content: stripHashSymbols(parsed.content || ''),
    });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

app.post('/api/media', async (req: Request, res: Response) => {
  try {
    const kind = typeof req.body?.kind === 'string' ? req.body.kind : 'image';
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const geminiMode = normalizeGeminiMode(req.body?.geminiMode);
    const style = typeof req.body?.style === 'string' && req.body.style.trim() ? req.body.style.trim() : 'واقعي فائق الجودة';
    const voicePreset = typeof req.body?.voicePreset === 'string' ? req.body.voicePreset.trim() : '';
    const customVoiceText = typeof req.body?.voiceText === 'string' ? req.body.voiceText.trim() : '';
    const parsedExplicitDuration = parseRequestedDurationSeconds(prompt, customVoiceText);
    const defaultDuration = kind === 'music' ? 46 : 20;
    const requestedDuration = Math.min(Math.max(Number(req.body?.durationSeconds) || parsedExplicitDuration || defaultDuration, 8), 300);

    if (!prompt) {
      return res.status(400).json({ error: 'يرجى كتابة وصف التصميم أو الوسائط أولاً.' });
    }

    const ai = getAI();

    if (kind === 'image' || kind === 'edit_image' || kind === '3dimage' || kind === 'design') {
      const is3D = kind === '3dimage' || /3d|ثلاثي|مجسم/i.test(prompt);
      const isDesignMode = kind === 'design';
      const isEditMode = kind === 'edit_image';
      const aspectRatio = typeof req.body?.aspectRatio === 'string' ? req.body.aspectRatio : '1:1';
      const artStyle = typeof req.body?.artStyle === 'string' && req.body.artStyle.trim() ? req.body.artStyle.trim() : style;
      const lightingStyle = typeof req.body?.lightingStyle === 'string' ? req.body.lightingStyle.trim() : '';
      const cameraAngle = typeof req.body?.cameraAngle === 'string' ? req.body.cameraAngle.trim() : '';
      const negativePrompt = typeof req.body?.negativePrompt === 'string' ? req.body.negativePrompt.trim() : '';
      const dims = getAspectDimensions(aspectRatio);

      const refImageUrl =
        typeof req.body?.referenceImage === 'string'
          ? req.body.referenceImage
          : typeof req.body?.referenceImageDataUrl === 'string'
            ? req.body.referenceImageDataUrl
            : '';
      const refPart = refImageUrl ? parseDataUrlPart(refImageUrl) : null;

      if (isEditMode && !refPart) {
        return res.status(400).json({ error: 'يرجى إرفاق صورة أولاً لتنفيذ التعديل المطلوب عليها.' });
      }

      if (isEditMode && refPart) {
        const editAnalysisText =
          `ادرس الصورة المرفقة بدقة وحدد إحداثيات العنصر الرئيسي فيها ثم صمّم خطة تعديل حقيقية لتنفيذ الطلب:\n"${prompt}"\n` +
          `${lightingStyle ? `الإضاءة المطلوبة: ${lightingStyle}\n` : ''}` +
          `${artStyle ? `النمط: ${artStyle}\n` : ''}` +
          `حدّد إذا كان الطلب يتطلب إزالة الخلفية (remove) أو تغيير/تبديل الخلفية (replace مع وصف newBgPrompt باللغة العربية لخلفية بديلة متكاملة) أو عزل الخلفية (blur) أو تحسين الدقة والتوضيح وإزالة التشويش (sharpenIntensity, denoiseIntensity) أو تأثير جوي (rain|snow|sparks|bokeh|sunbeams|mist).`;
        const editAnalysisSystem =
          'أنت خبير تحرير صور وتصحيح ألوان ومونتاج خلفيات احترافي في ZORVYX AI Studio. اكتب جميع الحقول النصية (title و description و presetName و overlayDescription و newBgPrompt) باللغة العربية فقط. قيّم موقع العنصر الرئيسي بدقة في subjectRegion: { cx (0..1), cy (0..1), rx (0.15..0.55), ry (0.15..0.55) }. اضبط bgAction إلى (none | remove | replace | blur). واضبط sharpenIntensity (0..100 لرفع الدقة والتوضيح) و denoiseIntensity (0..100 لإزالة الضوضاء) و atmosphereEffect (none|rain|snow|sparks|bokeh|sunbeams|mist) ومعايير الألوان والضوء بدقة دون استبدال الصورة الحقيقية برسوم كرتونية.' +
          NO_HASH_RULE;
        const editAnalysisSchema = {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            presetName: { type: Type.STRING },
            palette: { type: Type.ARRAY, items: { type: Type.STRING } },
            bgAction: { type: Type.STRING, description: 'none | remove | replace | blur' },
            newBgPrompt: { type: Type.STRING, description: 'وصف الخلفية الجديدة الكاملة إذا كان bgAction=replace' },
            subjectRegion: {
              type: Type.OBJECT,
              properties: {
                cx: { type: Type.NUMBER },
                cy: { type: Type.NUMBER },
                rx: { type: Type.NUMBER },
                ry: { type: Type.NUMBER },
              },
            },
            sharpenIntensity: { type: Type.NUMBER },
            denoiseIntensity: { type: Type.NUMBER },
            atmosphereEffect: { type: Type.STRING, description: 'none | rain | snow | sparks | bokeh | sunbeams | mist' },
            brightness: { type: Type.NUMBER },
            contrast: { type: Type.NUMBER },
            saturation: { type: Type.NUMBER },
            warmth: { type: Type.NUMBER },
            clarity: { type: Type.NUMBER },
            vignette: { type: Type.NUMBER },
            grain: { type: Type.NUMBER },
            blurBgIntensity: { type: Type.NUMBER },
            colorWashColor: { type: Type.STRING },
            colorWashOpacity: { type: Type.NUMBER },
            lightingAngle: { type: Type.STRING },
            lightingColor: { type: Type.STRING },
            lightingIntensity: { type: Type.NUMBER },
            frameStyle: { type: Type.STRING },
            addedTypography: { type: Type.STRING },
            needsOverlayGraphics: { type: Type.BOOLEAN },
            overlayDescription: { type: Type.STRING },
          },
          required: [
            'title',
            'description',
            'presetName',
            'palette',
            'bgAction',
            'brightness',
            'contrast',
            'saturation',
            'warmth',
            'clarity',
            'vignette',
            'grain',
            'blurBgIntensity',
            'needsOverlayGraphics',
          ],
        };

        let editAnalysisRes;
        try {
          editAnalysisRes = await generateWithFallback(ai, {
            contents: [
              {
                role: 'user',
                parts: [
                  { inlineData: { mimeType: refPart.mimeType, data: refPart.data } },
                  { text: editAnalysisText },
                ],
              },
            ],
            geminiMode,
            thinkingLevel: ThinkingLevel.LOW,
            systemInstruction: editAnalysisSystem,
            responseMimeType: 'application/json',
            responseSchema: editAnalysisSchema,
          });
        } catch (imgErr) {
          const msg = imgErr instanceof Error ? imgErr.message : String(imgErr);
          if (msg.includes('INVALID_ARGUMENT') || msg.includes('Unable to process input image')) {
            editAnalysisRes = await generateWithFallback(ai, {
              contents: editAnalysisText,
              geminiMode,
              thinkingLevel: ThinkingLevel.LOW,
              systemInstruction: editAnalysisSystem,
              responseMimeType: 'application/json',
              responseSchema: editAnalysisSchema,
            });
          } else {
            throw imgErr;
          }
        }

        const parsedEdit = JSON.parse((editAnalysisRes.text ?? '{}').trim()) as Record<string, unknown>;
        const rawBgAction = String(parsedEdit.bgAction || 'none');
        const bgAction: 'none' | 'remove' | 'replace' | 'blur' =
          rawBgAction === 'remove' || rawBgAction === 'replace' || rawBgAction === 'blur'
            ? rawBgAction
            : /حذف\s*الخلفية|إزالة\s*الخلفية|تفريغ\s*الخلفية/i.test(prompt)
              ? 'remove'
              : /غيّر\s*الخلفية|تغيير\s*الخلفية|تبديل\s*الخلفية|استبدال\s*الخلفية|اجعل\s*الخلفية/i.test(prompt)
                ? 'replace'
                : 'none';

        const needsOverlay = Boolean(parsedEdit.needsOverlayGraphics);
        const newBgDesc = stripHashSymbols(String(parsedEdit.newBgPrompt || prompt));

        const [overlayRes, replacementBgRes] = await Promise.allSettled([
          needsOverlay
            ? generateUltraDetailedSvg(
                ai,
                [
                  {
                    role: 'user',
                    parts: [
                      { inlineData: { mimeType: refPart.mimeType, data: refPart.data } },
                      {
                        text:
                          `صمّم طبقة عناصر ومؤثرات بصرية شفافة الخلفية (${dims.w}×${dims.h}) تضاف فوق هذه الصورة الحقيقية لتنفيذ: "${String(parsedEdit.overlayDescription || prompt)}".\n` +
                          `هام جداً: ممنوع وضع مستطيل خلفية معتمة! اجعل الخلفية شفافة 100% ولا تغطّي مركز الصورة المرفقة حتى تبقى الصورة الحقيقية واضحة وحية، وارسم فقط الإضافات المطلوبة بواقعية وظلال وتوهج ناعم.\n` +
                          `أخرج كود <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}"> مباشرة فقط.`,
                      },
                    ],
                  },
                ],
                `أنت فنان مؤثرات بصرية وتنقيح صور في ZORVYX AI Studio. أخرج طبقة SVG شفافة الخلفية viewBox="0 0 ${dims.w} ${dims.h}" بدون <script> أو <foreignObject> أو on*.`,
                3000,
                '',
                14,
                geminiMode,
              )
            : Promise.resolve(''),
          bgAction === 'replace'
            ? generateUltraDetailedSvg(
                ai,
                `ارسم خلفية سينمائية فائقة التفاصيل (${dims.w}×${dims.h}) خالية من الأشخاص لاستبدال خلفية الصورة بهذه البيئة المطلوبة:\n"${newBgDesc}"\n` +
                  `الإضاءة: ${lightingStyle || 'متناغمة سينمائية'} | الأسلوب: ${artStyle || 'تصوير واقعي فائق'}\n` +
                  `أخرج كود <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}"> فقط بدون نصوص أو شخصيات.`,
                `أنت مدير تصوير وخلفيات استوديو في ZORVYX AI. أخرج كود SVG viewBox="0 0 ${dims.w} ${dims.h}" بعمق ميداني واقعي وإضاءة متعددة التدرجات (<linearGradient>/<radialGradient>/<feGaussianBlur>) وبدون <script> أو <foreignObject>.`,
                7000,
                newBgDesc,
                32,
                geminiMode,
              )
            : Promise.resolve(''),
        ]);

        const overlaySvg = overlayRes.status === 'fulfilled' ? overlayRes.value : '';
        let replacementBackdropSvg = replacementBgRes.status === 'fulfilled' ? replacementBgRes.value : '';
        if (bgAction === 'replace' && !replacementBackdropSvg) {
          try {
            replacementBackdropSvg = await generateUltraDetailedSvg(
              ai,
              `ارسم خلفية استوديو جمالية متدرجة (${dims.w}×${dims.h}) للبيئة: "${newBgDesc}". أخرج <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}"> فقط.`,
              `أخرج كود SVG للخلفية viewBox="0 0 ${dims.w} ${dims.h}" بـ 16 عنصراً وتدرجات لونية ناعمة بدون <script> أو <foreignObject>.`,
              2400,
              newBgDesc,
              16,
              'fast',
            );
          } catch {
            // Canvas gradient fallback handled client-side if secondary pass also fails
          }
        }

        const validAngles = ['top_left', 'top_right', 'center', 'bottom_rim', 'none'];
        const validFrames = ['none', 'cinema_bars', 'gold_border', 'gallery_mat'];
        const validAtmosphere = ['none', 'rain', 'snow', 'sparks', 'bokeh', 'sunbeams', 'mist'];
        const rawSubj = (parsedEdit.subjectRegion as Record<string, unknown> | undefined) || {};
        const subjectRegion = {
          cx: Math.min(0.85, Math.max(0.15, Number(rawSubj.cx) || 0.5)),
          cy: Math.min(0.85, Math.max(0.15, Number(rawSubj.cy) || 0.48)),
          rx: Math.min(0.5, Math.max(0.16, Number(rawSubj.rx) || 0.3)),
          ry: Math.min(0.55, Math.max(0.2, Number(rawSubj.ry) || 0.38)),
        };

        const editRecipe = {
          brightness: Math.min(40, Math.max(-40, Number(parsedEdit.brightness) || 4)),
          contrast: Math.min(50, Math.max(-40, Number(parsedEdit.contrast) || 12)),
          saturation: Math.min(80, Math.max(-80, Number(parsedEdit.saturation) || 10)),
          warmth: Math.min(50, Math.max(-50, Number(parsedEdit.warmth) || 6)),
          clarity: Math.min(100, Math.max(0, Number(parsedEdit.clarity) || 35)),
          vignette: Math.min(100, Math.max(0, Number(parsedEdit.vignette) || 20)),
          grain: Math.min(60, Math.max(0, Number(parsedEdit.grain) || 3)),
          blurBgIntensity: bgAction === 'blur' ? Math.max(45, Number(parsedEdit.blurBgIntensity) || 55) : Math.min(100, Math.max(0, Number(parsedEdit.blurBgIntensity) || 0)),
          bgAction,
          subjectRegion,
          sharpenIntensity: Math.min(100, Math.max(0, Number(parsedEdit.sharpenIntensity) || (/توضيح|دقة|حدة|تشويش|واضح/i.test(prompt) ? 68 : 28))),
          denoiseIntensity: Math.min(100, Math.max(0, Number(parsedEdit.denoiseIntensity) || (/تشويش|نقاء|تصفية|بشرة/i.test(prompt) ? 45 : 15))),
          atmosphereEffect: (validAtmosphere.includes(String(parsedEdit.atmosphereEffect)) ? String(parsedEdit.atmosphereEffect) : 'none') as 'none' | 'rain' | 'snow' | 'sparks' | 'bokeh' | 'sunbeams' | 'mist',
          colorWashColor: typeof parsedEdit.colorWashColor === 'string' && parsedEdit.colorWashColor.startsWith('#') ? parsedEdit.colorWashColor : '#f59e0b',
          colorWashOpacity: Math.min(0.42, Math.max(0, Number(parsedEdit.colorWashOpacity) || 0)),
          lightingAngle: (validAngles.includes(String(parsedEdit.lightingAngle)) ? String(parsedEdit.lightingAngle) : 'top_right') as 'top_left' | 'top_right' | 'center' | 'bottom_rim' | 'none',
          lightingColor: typeof parsedEdit.lightingColor === 'string' && parsedEdit.lightingColor.startsWith('#') ? parsedEdit.lightingColor : '#fde68a',
          lightingIntensity: Math.min(0.65, Math.max(0, Number(parsedEdit.lightingIntensity) || 0.22)),
          frameStyle: (validFrames.includes(String(parsedEdit.frameStyle)) ? String(parsedEdit.frameStyle) : 'none') as 'none' | 'cinema_bars' | 'gold_border' | 'gallery_mat',
          presetName: stripHashSymbols(
            /[\u0600-\u06FF]/.test(String(parsedEdit.presetName || ''))
              ? String(parsedEdit.presetName)
              : bgAction === 'remove'
                ? 'عزل وتفريغ الخلفية'
                : bgAction === 'replace'
                  ? 'تغيير الخلفية ببيئة احترافية'
                  : 'تعديل استوديو احترافي',
          ),
          addedTypography: stripHashSymbols(String(parsedEdit.addedTypography || '')),
        };

        return res.json({
          kind,
          artwork: {
            title: stripHashSymbols(String(parsedEdit.title || 'صورة معدلة باحترافية')),
            description: stripHashSymbols(String(parsedEdit.description || prompt)),
            palette: Array.isArray(parsedEdit.palette) && parsedEdit.palette.length > 0
              ? parsedEdit.palette.map(String).slice(0, 6)
              : ['#38bdf8', '#fbbf24', '#a78bfa'],
            svg: overlaySvg || '',
            ...(overlaySvg ? { overlaySvg } : {}),
            ...(replacementBackdropSvg ? { replacementBackdropSvg } : {}),
            referenceImageDataUrl: refImageUrl,
            aspectRatio,
            artStyle,
            lightingStyle,
            cameraAngle,
            editRecipe,
            isPhotoEdit: true,
            is3D,
            isLogo: false,
            style: editRecipe.presetName || artStyle,
          },
        });
      }

      const styleHints = [
        artStyle ? `النمط الفني: ${artStyle}` : '',
        lightingStyle ? `الإضاءة: ${lightingStyle}` : '',
        cameraAngle ? `العدسة والزاوية: ${cameraAngle}` : '',
        negativePrompt ? `ممنوع تماماً وجود: ${negativePrompt}` : '',
      ]
        .filter(Boolean)
        .join(' | ');

      // Optional cloud raster provider only if paid keys are explicitly set in Secrets
      const paidRaster = !refPart ? await tryPaidRasterGeneration(`${prompt}. ${styleHints}`, aspectRatio) : undefined;
      if (paidRaster) {
        return res.json({
          kind,
          artwork: {
            title: stripHashSymbols(prompt.slice(0, 48)),
            description: stripHashSymbols(prompt),
            palette: ['#38bdf8', '#a78bfa', '#f472b6'],
            svg: '',
            rasterDataUrl: paidRaster,
            aspectRatio,
            artStyle,
            lightingStyle,
            cameraAngle,
            negativePrompt,
            editRecipe: {
              brightness: 0,
              contrast: 6,
              saturation: 6,
              warmth: 0,
              clarity: 15,
              vignette: 12,
              grain: 0,
              blurBgIntensity: 0,
              lightingAngle: 'none',
              lightingIntensity: 0,
              frameStyle: 'none',
              presetName: 'توليد استوديو فائق',
            },
            is3D,
            isLogo: isDesignMode,
            style: artStyle,
          },
        });
      }

      // Stage 1: Produce a strict Art-Direction Plan & Object Checklist
      const plan = await generateArtPlan(ai, prompt, refPart, isDesignMode, dims, styleHints, geminiMode);
      const checklistText = plan.objectsChecklist.map((item, idx) => `${idx + 1}. ${item}`).join('\n');

      const promptBody =
        `نفّذ هذا المخطط الفني بدقة تطابق طلب المستخدم بنسبة 100% في لوحة ${dims.w}×${dims.h} (${dims.label}):\n` +
        `الطلب الأصلي: ${prompt}\n` +
        `${styleHints ? `توجيهات الإخراج: ${styleHints}\n` : ''}` +
        `الأجواء والإضاءة المطلوبة: ${plan.atmosphere} (${plan.atmosphere === 'daylight' || plan.atmosphere === 'studio_light' ? 'خلفية مضيئة مشرقة وواضحة جداً' : plan.atmosphere === 'golden' ? 'إضاءة ذهبية دافئة' : 'إضاءة درامية متوازنة'})\n` +
        `لوحة الألوان المقترحة: ${plan.palette.join(', ')}\n` +
        `خطة التكوين والتوزيع: ${plan.compositionPlan}\n` +
        `قائمة العناصر الإلزامية (يجب رسم كل عنصر منها بوضوح وإتقان):\n${checklistText}\n` +
        `${plan.typographyText ? `النص المطلوب كتابته بأناقة داخل التصميم: "${plan.typographyText}"\n` : ''}` +
        `${refPart ? 'تم إرفاق صورة مرجعية: افحصها بدقة وأعد تجسيد عناصرها وتفاصيلها وفق الطلب.\n' : ''}` +
        `أخرج كود <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}"> الكامل مباشرة فقط بدون أي نص خارجي أو Markdown.`;

      const contents = refPart
        ? [{ role: 'user', parts: [{ inlineData: { mimeType: refPart.mimeType, data: refPart.data } }, { text: promptBody }] }]
        : promptBody;

      const cleanSvg = await generateUltraDetailedSvg(
        ai,
        contents,
        `أنت كبير مصممي الفنون البصرية واللوحات الفائقة في ZORVYX AI Studio. مهمتك إخراج عمل فني متقن بأبعاد ${dims.w}×${dims.h} يطابق طلب المستخدم وعناصره بدقة استوديو عالمية.\n` +
          `قواعد الجودة والالتزام بالطلب:\n` +
          `1. أدرج <title>${plan.title}</title> و<desc>${plan.description}</desc>.\n` +
          `2. التزم بأجواء الإضاءة (${plan.atmosphere}) والأسلوب (${artStyle}): ابنِ 4 طبقات عمق كاملة (خلفية غنية، مستوى أوسط بعمق وظلال تلامس واقعية، عنصر رئيسي بتفاصيل تشريحية وهندسية دقيقة لملامح الوجه والعيون والشعر والأيدي والملابس بدون تشويه، وتدرجات ضوء وانعكاسات specular وrim light، ومستوى أمامي بغبار ضوئي وتأثيرات محيطة).\n` +
          `3. استخدم <defs> مع 18 إلى 28 تدرجاً (<linearGradient> و<radialGradient>) و<filter> (<feGaussianBlur> و<feDropShadow> للظلال والتوهج الواقعي)، وما لا يقل عن 55 إلى 180 مساراً منحنياً فعلياً.\n` +
          `4. مسموح استخدام <text font-family="Tahoma, Arial, sans-serif"> فقط إذا طُلب نص/اسم/شعار في التصميم.\n` +
          `5. ممنوع <script> أو <foreignObject> أو on* أو التعليقات النائبة <!-- -->.`,
        9200,
        checklistText,
        45,
        geminiMode,
      );

      if (!cleanSvg) {
        return res.status(502).json({
          error: 'لم يتمكن النموذج من إكمال رسم التصميم بشكل مكتمل، يرجى إعادة المحاولة.',
        });
      }

      const meta = extractSvgMetadata(cleanSvg, prompt);
      const inferredAtmosphereEffect: 'none' | 'rain' | 'snow' | 'sparks' | 'bokeh' | 'sunbeams' | 'mist' =
        /مطر|أفلام.*مطر|شتاء/i.test(prompt)
          ? 'rain'
          : /ثلج|شتوي|صقيع/i.test(prompt)
            ? 'snow'
            : /نار|شرار|انفجار|شعلة/i.test(prompt)
              ? 'sparks'
              : /غروب|ذهبية|شمس/i.test(`${prompt} ${lightingStyle}`)
                ? 'sunbeams'
                : /ضباب|غموض/i.test(prompt)
                  ? 'mist'
                  : /بورتريه|عطر|استوديو|بوكيه/i.test(`${prompt} ${cameraAngle}`)
                    ? 'bokeh'
                    : 'none';

      return res.json({
        kind,
        artwork: {
          title: plan.title || meta.title,
          description: plan.description || meta.description,
          palette: plan.palette.length > 0 ? plan.palette : meta.palette,
          atmosphere: plan.atmosphere,
          svg: cleanSvg,
          aspectRatio,
          artStyle,
          lightingStyle,
          cameraAngle,
          negativePrompt,
          editRecipe: {
            brightness: 2,
            contrast: 8,
            saturation: 8,
            warmth: 0,
            clarity: 32,
            sharpenIntensity: 26,
            denoiseIntensity: 10,
            vignette: 14,
            grain: 3,
            blurBgIntensity: 0,
            atmosphereEffect: inferredAtmosphereEffect,
            lightingAngle: 'none',
            lightingIntensity: 0,
            frameStyle: 'none',
            presetName: 'توازن ZORVYX AI الأصلي',
          },
          ...(refImageUrl ? { referenceImageDataUrl: refImageUrl } : {}),
          is3D,
          isLogo: isDesignMode,
          style: artStyle,
        },
      });
    }

    if (kind === 'video' || kind === '3dvideo') {
      const is3D = kind === '3dvideo';
      const presetSpec = (voicePreset && VOICE_PRESET_MAP[voicePreset]) || undefined;
      const inferredMaleFromPrompt = /(?:صوت\s*رجل|صوت\s*شاب|معلق\s*رجل|ذكر|male\s*voice)/i.test(prompt);
      const inferredFemaleFromPrompt = /(?:صوت\s*امر[أا]ة|صوت\s*بنت|صوت\s*فتاة|معلقة|أنثى|female\s*voice)/i.test(prompt);
      const voiceGender: 'female' | 'male' =
        presetSpec?.gender ||
        (req.body?.voiceGender === 'male' || (!inferredFemaleFromPrompt && inferredMaleFromPrompt) ? 'male' : 'female');
      const effectivePreset = voicePreset || (voiceGender === 'male' ? 'charon_calm' : 'kore_warm');
      const refImageUrl = typeof req.body?.referenceImage === 'string' ? req.body.referenceImage.trim() : '';

      interface SentCharInput {
        name?: string;
        style?: string;
        action?: string;
        primaryColor?: string;
        secondaryColor?: string;
        imageDataUrl?: string;
        isSubjectPhoto?: boolean;
      }
      const rawSent: SentCharInput[] = Array.isArray(req.body?.sentCharacters)
        ? req.body.sentCharacters.slice(0, 6)
        : [];
      const sentChars = rawSent.map((c, idx) => ({
        name: typeof c?.name === 'string' && c.name.trim() ? c.name.trim() : `شخصية ${idx + 1}`,
        style: typeof c?.style === 'string' && c.style.trim() ? c.style.trim() : 'custom',
        action: typeof c?.action === 'string' && c.action.trim() ? c.action.trim() : 'walk',
        primaryColor: typeof c?.primaryColor === 'string' && c.primaryColor ? c.primaryColor : '#67e8f9',
        secondaryColor: typeof c?.secondaryColor === 'string' && c.secondaryColor ? c.secondaryColor : '#a78bfa',
        imageDataUrl: typeof c?.imageDataUrl === 'string' ? c.imageDataUrl : undefined,
        isSubjectPhoto: Boolean(c?.isSubjectPhoto),
      }));

      // If user attached a photo directly (e.g., portrait, apple, product or generated image to photo-to-video), animate it cleanly
      if (refImageUrl && parseDataUrlPart(refImageUrl)) {
        sentChars.unshift({
          name: 'العنصر الرئيسي',
          style: 'custom',
          action: 'float',
          primaryColor: '#fb7185',
          secondaryColor: '#fde047',
          imageDataUrl: refImageUrl,
          isSubjectPhoto: true,
        });
      }

      const charSummaryText =
        sentChars.length > 0
          ? `\nالشخصيات أو الصور المرسلة من المستخدم للمشهد (يجب تضمينها وجعلها تتحدث وتتحرك بطبيعية وفق القصة):\n` +
            sentChars
              .map(
                (c, i) =>
                  `${i + 1}. الاسم: "${c.name}" | النمط: ${c.style} | الحركة المبدئية: ${c.action}${c.isSubjectPhoto ? ' (صورة أرفقها المستخدم لتحويلها إلى فيديو متحرك وناطق)' : c.imageDataUrl ? ' (صورة شخصية مرسلة للتحريك والحديث)' : ''}`,
              )
              .join('\n')
          : '';

      const imageParts = sentChars
        .map((c) => (c.imageDataUrl ? parseDataUrlPart(c.imageDataUrl) : null))
        .filter((p): p is { mimeType: string; data: string } => p !== null)
        .slice(0, 4)
        .map((p) => ({ inlineData: { mimeType: p.mimeType, data: p.data } }));

      const voiceTextHint = customVoiceText
        ? `\nالنص المطلوب كتابته ونطقه في الفيديو بصوت واحد ونبرة واحدة طوال المقطع: "${customVoiceText}"`
        : '';

      const hasExplicitCharacters =
        sentChars.length > 0 ||
        /(?:رجل|امر[أا]ة|ولد|بنت|فتاة|طفل|شخص|أشخاص|ناس|بطل|أميرة|رائد\s*فضاء|روبوت|قطة|عصفور|حيوان|يتحدث|تتكلم|يحكي|تتحدث|مذيع|مقدم)/i.test(
          prompt,
        );

      const textPrompt = `أحداث وقصة الفيديو المطلوبة بالترتيب:\n${prompt}\n\nالمدة التقديرية: ${requestedDuration} ثانية${charSummaryText}${voiceTextHint}`;
      const videoSystemInstruction =
        `أنت مخرج سينمائي ومصمم ستوري بورد (Storyboard) في ZORVYX AI. نفّذ أحداث قصة أو مشهد المستخدم بدقة فائقة لقطة بلقطة!\n` +
        `صمّم مشهداً متكاملاً مدته ${requestedDuration} ثانية يحتوي على:\n` +
        `1. environment: البيئة العامة (space | city | nature | ocean | desert | palace | fantasy | studio).\n` +
        `2. characters: ${
          sentChars.length > 0
            ? `أدرج الشخصيات أو الصور المرفقة بأسمائها الدقيقة (${sentChars.map((c) => c.name).join('، ')}) واجعلها تتحرك وتتفاعل بنعومة وطبيعية مع المشهد.`
            : hasExplicitCharacters
              ? 'أدرج فقط الشخصيات التي ذكرها المستخدم صراحة في طلبه بأنماط (hero | astronaut | robot | princess | scholar | cat | bird).'
              : 'اترك مصفوفة characters فارغة تماماً [] ولا تخترع أشخاصاً من عندك ما لم يطلبهم المستخدم؛ وركز على تحريك المشهد والكاميرا والعناصر والخلفيات السينمائية!'
        }\n` +
        `3. beats (4 مشاهد متسلسلة متصلة تغطي الزمن من 0 إلى ${requestedDuration} ثانية بالكامل):\n` +
        `   - اكتب في environmentDetail وصفاً بصرياً دقيقاً جداً لكل ما يظهر في تلك اللقطة ليُرسَم بدقة في الإطار الكامل.\n` +
        `   - particleTheme: (none | splash | sparkles | petals | fire | mist) حسب تفاصيل الحدث.\n` +
        `   - speakerName, dialogueLine (تعليق عربي سلس وأنيق أو وصف حي مختصر بدون علامة # نهائياً), voiceGender (${voiceGender} موحّد لكل الفيديو).\n` +
        `4. props و elements و voiceScript و captions (بدون علامة # نهائياً).`;

      const videoSchema = {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          environment: {
            type: Type.STRING,
            description: 'space | city | nature | ocean | desert | palace | fantasy | studio',
          },
          voiceScript: { type: Type.STRING },
          bgTop: { type: Type.STRING },
          bgBottom: { type: Type.STRING },
          accentColor: { type: Type.STRING },
          secondaryColor: { type: Type.STRING },
          cameraMotion: { type: Type.STRING, description: 'orbit | pan | zoom | drift' },
          moodMusic: {
            type: Type.OBJECT,
            properties: {
              chordFreqs: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              tempoBpm: { type: Type.INTEGER },
            },
            required: ['chordFreqs', 'tempoBpm'],
          },
          characters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                style: {
                  type: Type.STRING,
                  description: 'hero | astronaut | robot | princess | scholar | cat | bird | custom',
                },
                action: { type: Type.STRING, description: 'walk | wave | float | fly | stand' },
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                scale: { type: Type.NUMBER },
                primaryColor: { type: Type.STRING },
                secondaryColor: { type: Type.STRING },
              },
              required: ['name', 'style', 'action', 'x', 'y', 'scale', 'primaryColor', 'secondaryColor'],
            },
          },
          beats: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                timeStart: { type: Type.NUMBER },
                timeEnd: { type: Type.NUMBER },
                beatTitle: { type: Type.STRING },
                environmentDetail: { type: Type.STRING },
                cameraShot: { type: Type.STRING, description: 'wide | medium | closeup | pan_left | pan_right | zoom_in' },
                particleTheme: { type: Type.STRING, description: 'none | splash | sparkles | petals | fire | mist' },
                speakerName: { type: Type.STRING },
                dialogueLine: { type: Type.STRING },
                voiceGender: { type: Type.STRING, description: 'female | male' },
                characterStates: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      x: { type: Type.NUMBER },
                      y: { type: Type.NUMBER },
                      targetX: { type: Type.NUMBER },
                      targetY: { type: Type.NUMBER },
                      action: { type: Type.STRING, description: 'walk | run | wave | talk | float | fly | stand | jump' },
                      facing: { type: Type.STRING, description: 'left | right' },
                      scale: { type: Type.NUMBER },
                      targetScale: { type: Type.NUMBER },
                      rotation: { type: Type.NUMBER },
                      targetRotation: { type: Type.NUMBER },
                      motionEffect: { type: Type.STRING, description: 'none | bounce | spin | splash | zoom | float | shake' },
                    },
                    required: ['name', 'x', 'y', 'targetX', 'targetY', 'action', 'facing', 'scale'],
                  },
                },
                props: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      kind: {
                        type: Type.STRING,
                        description: 'car | rocket | tree | building | palace | planet | mountain | cloud | table | gift | crown | boat | fireworks',
                      },
                      x: { type: Type.NUMBER },
                      y: { type: Type.NUMBER },
                      targetX: { type: Type.NUMBER },
                      targetY: { type: Type.NUMBER },
                      scale: { type: Type.NUMBER },
                      color: { type: Type.STRING },
                    },
                    required: ['kind', 'x', 'y'],
                  },
                },
              },
              required: [
                'timeStart',
                'timeEnd',
                'beatTitle',
                'environmentDetail',
                'cameraShot',
                'speakerName',
                'dialogueLine',
                'voiceGender',
                'characterStates',
              ],
            },
          },
          elements: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                shape: { type: Type.STRING, description: 'orb | ring | cube | star | wave | beam | particle' },
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                z: { type: Type.NUMBER },
                size: { type: Type.NUMBER },
                speedX: { type: Type.NUMBER },
                speedY: { type: Type.NUMBER },
                color: { type: Type.STRING },
                orbit: { type: Type.BOOLEAN },
                pulse: { type: Type.BOOLEAN },
              },
              required: ['shape', 'x', 'y', 'z', 'size', 'speedX', 'speedY', 'color', 'orbit', 'pulse'],
            },
          },
          captions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                timeStart: { type: Type.NUMBER },
                timeEnd: { type: Type.NUMBER },
                text: { type: Type.STRING },
              },
              required: ['timeStart', 'timeEnd', 'text'],
            },
          },
        },
        required: [
          'title',
          'summary',
          'environment',
          'voiceScript',
          'bgTop',
          'bgBottom',
          'accentColor',
          'secondaryColor',
          'cameraMotion',
          'moodMusic',
          'characters',
          'beats',
          'elements',
          'captions',
        ],
      };

      const contents =
        imageParts.length > 0 ? [{ role: 'user', parts: [{ text: textPrompt }, ...imageParts] }] : textPrompt;

      let response;
      try {
        response = await generateWithFallback(ai, {
          geminiMode,
          contents,
          thinkingLevel: ThinkingLevel.MEDIUM,
          systemInstruction: videoSystemInstruction,
          responseMimeType: 'application/json',
          responseSchema: videoSchema,
        });
      } catch (imgErr) {
        const msg = imgErr instanceof Error ? imgErr.message : String(imgErr);
        if (imageParts.length > 0 && (msg.includes('INVALID_ARGUMENT') || msg.includes('Unable to process input image'))) {
          response = await generateWithFallback(ai, {
            geminiMode,
            contents: textPrompt,
            thinkingLevel: ThinkingLevel.MEDIUM,
            systemInstruction: videoSystemInstruction,
            responseMimeType: 'application/json',
            responseSchema: videoSchema,
          });
        } else {
          throw imgErr;
        }
      }

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const aiChars: Array<Record<string, unknown>> = Array.isArray(parsed.characters) ? parsed.characters : [];

      const mergedCharacters =
        sentChars.length > 0
          ? sentChars.map((sc, idx) => {
              const matched =
                aiChars.find((ac) => String(ac.name || '').trim() === sc.name) || aiChars[idx] || {};
              const defaultX = sentChars.length === 1 ? 0.5 : 0.24 + (idx / Math.max(sentChars.length - 1, 1)) * 0.52;
              return {
                name: sc.name,
                style: sc.style,
                action: sc.action,
                x: typeof matched.x === 'number' ? Math.min(Math.max(matched.x, 0.12), 0.88) : defaultX,
                y: typeof matched.y === 'number' ? Math.min(Math.max(matched.y, 0.35), 0.78) : 0.55,
                scale: typeof matched.scale === 'number' ? Math.min(Math.max(matched.scale, 0.85), 1.6) : 1.12,
                primaryColor: sc.primaryColor,
                secondaryColor: sc.secondaryColor,
                ...(sc.isSubjectPhoto ? { isSubjectPhoto: true } : {}),
                ...(sc.imageDataUrl ? { imageDataUrl: sc.imageDataUrl } : {}),
              };
            })
          : hasExplicitCharacters
            ? aiChars
            : [];

      // Build raw beat dialogues first so we can synthesize ONE unified studio narration track & size video duration dynamically!
      const rawBeats: Array<Record<string, unknown>> = Array.isArray(parsed.beats) ? parsed.beats.slice(0, 5) : [];
      const beatSeedList =
        rawBeats.length > 0
          ? rawBeats
          : [
              {
                beatTitle: parsed.title || 'المشهد الرئيسي',
                environmentDetail: prompt,
                cameraShot: 'wide',
                particleTheme: 'sparkles',
                speakerName: mergedCharacters[0]?.name ? String(mergedCharacters[0].name) : '',
                dialogueLine: customVoiceText || parsed.voiceScript || parsed.summary || prompt,
                characterStates: [],
                props: [],
              },
            ];

      const rawDialogues = beatSeedList.map((b, idx) =>
        stripHashSymbols(
          typeof b.dialogueLine === 'string' && b.dialogueLine.trim()
            ? b.dialogueLine.trim()
            : customVoiceText && idx === 0
              ? customVoiceText
              : '',
        ),
      );

      const finalScript = stripHashSymbols(
        customVoiceText ||
          rawDialogues.filter(Boolean).join(' .. ') ||
          parsed.voiceScript ||
          parsed.summary ||
          prompt,
      );

      const backdropSystem =
        `أنت مصمم مناظر وخلفيات سينمائية واقعية عالية الدقة في استوديو ZORVYX AI. أخرج كود SVG خالصاً viewBox="0 0 1280 720" width="1280" height="720" فقط بدون أي نص أو Markdown.\n` +
        `قواعد الواقعية والجمال السينمائي:\n` +
        `1. صوّر نفس المكان والأحداث والطقس والإضاءة المذكورة في وصف اللقطة بدقة واقعية مذهلة (تفاصيل حقيقية للخلفيات والأسطح والانعكاسات المائية/الزجاجية أو الطبيعية دون تبسيط طفولي).\n` +
        `2. استخدم 14 إلى 20 تدرجاً <linearGradient> و<radialGradient> مع <filter> و<feGaussianBlur> لإبراز أشعة الإضاءة الطبيعية، الضبابية العمقية (depth of field)، والظلال الواقعية.\n` +
        `3. ممنوع فقط <script> أو <foreignObject> أو <text> أو رسم شخصيات لأن العناصر والشخصيات تتحرك فوق المشهد.`;

      // In parallel: craft 1 realistic 1280x720 SVG backdrop per Story Beat AND synthesize ONE single unified consistent voice track
      const [shotResults, voiceAudioBase64] = await Promise.all([
        Promise.allSettled(
          beatSeedList.slice(0, 4).map((beat, idx) =>
            generateUltraDetailedSvg(
              ai,
              `ارسم خلفية اللقطة رقم ${idx + 1}: ${stripHashMarksSafe(beat.beatTitle)}\nتفاصيل المكان والأحداث: ${stripHashMarksSafe(beat.environmentDetail || prompt)}\nزاوية الكاميرا: ${String(beat.cameraShot || 'wide')}\nالقصة العامة: ${prompt}\nالألوان: ${parsed.bgTop || '#17152f'}, ${parsed.bgBottom || '#0b0b19'}, ${parsed.accentColor || '#67e8f9'}, ${parsed.secondaryColor || '#a78bfa'}\nأخرج كود <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720"> فقط.`,
              backdropSystem,
              5200,
              stripHashMarksSafe(beat.environmentDetail || beat.beatTitle || prompt),
              36,
              geminiMode,
            ),
          ),
        ),
        synthesizeVoice(ai, finalScript, voiceGender, effectivePreset),
      ]);

      function stripHashMarksSafe(v: unknown) {
        return stripHashSymbols(String(v || ''));
      }

      const keyframeSvgs: string[] = [];
      for (const shotRes of shotResults) {
        if (shotRes.status === 'fulfilled' && shotRes.value) {
          keyframeSvgs.push(shotRes.value);
        }
      }
      const backdropSvg = keyframeSvgs[0];

      // Determine true dynamic duration from user request + generated voice narration length + word cadence
      const spokenWords = finalScript.split(/\s+/).filter(Boolean).length;
      const estimatedSpeechSec = Math.max(4, Math.ceil(spokenWords * 0.56));
      const measuredAudioSec = measureWavSeconds(voiceAudioBase64);
      const speechAnchorSec = Math.max(measuredAudioSec, estimatedSpeechSec);
      const finalDuration = parsedExplicitDuration
        ? Math.min(Math.max(parsedExplicitDuration, speechAnchorSec + 1, 8), 240)
        : Math.min(Math.max(speechAnchorSec + 3, 10), 180);

      // Spread beats proportionally by word count across 0 .. finalDuration
      const weights = beatSeedList.map((_, idx) => Math.max(3, (rawDialogues[idx] || '').split(/\s+/).filter(Boolean).length));
      const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
      let cursor = 0;
      const normalizedBeats = beatSeedList.map((b, idx) => {
        const span =
          idx === beatSeedList.length - 1
            ? Math.max(2, finalDuration - cursor)
            : Number(((weights[idx] / totalWeight) * finalDuration).toFixed(2));
        const timeStart = Number(cursor.toFixed(2));
        const timeEnd = Number(Math.min(finalDuration, cursor + span).toFixed(2));
        cursor = timeEnd;

        const rawStates = Array.isArray(b.characterStates) ? (b.characterStates as Array<Record<string, unknown>>) : [];
        const characterStates = mergedCharacters.map((mc, ci) => {
          const chName = String(mc.name || `شخصية ${ci + 1}`);
          const found = rawStates.find((s) => String(s.name || '').trim() === chName) || rawStates[ci] || {};
          const fallbackX = typeof mc.x === 'number' ? mc.x : 0.3 + ci * 0.25;
          const fallbackY = typeof mc.y === 'number' ? mc.y : 0.62;
          const baseScale = typeof found.scale === 'number' ? Math.min(Math.max(found.scale, 0.7), 1.85) : Number(mc.scale || 1.15);
          return {
            name: chName,
            x: typeof found.x === 'number' ? Math.min(Math.max(found.x, 0.1), 0.9) : fallbackX,
            y: typeof found.y === 'number' ? Math.min(Math.max(found.y, 0.25), 0.8) : fallbackY,
            targetX: typeof found.targetX === 'number' ? Math.min(Math.max(found.targetX, 0.1), 0.9) : fallbackX,
            targetY: typeof found.targetY === 'number' ? Math.min(Math.max(found.targetY, 0.25), 0.8) : fallbackY,
            action: (typeof found.action === 'string' && found.action) || (typeof mc.action === 'string' ? mc.action : 'walk'),
            facing: found.facing === 'left' ? 'left' : 'right',
            scale: baseScale,
            targetScale: typeof found.targetScale === 'number' ? Math.min(Math.max(found.targetScale, 0.6), 2.0) : baseScale,
            rotation: typeof found.rotation === 'number' ? found.rotation : 0,
            targetRotation: typeof found.targetRotation === 'number' ? found.targetRotation : 0,
            motionEffect: typeof found.motionEffect === 'string' ? found.motionEffect : 'none',
          };
        });

        return {
          timeStart,
          timeEnd,
          beatTitle: stripHashSymbols(String(b.beatTitle || `الحدث ${idx + 1}`)),
          environmentDetail: stripHashSymbols(String(b.environmentDetail || prompt)),
          cameraShot: (typeof b.cameraShot === 'string' ? b.cameraShot : 'wide') as
            | 'wide'
            | 'medium'
            | 'closeup'
            | 'pan_left'
            | 'pan_right'
            | 'zoom_in',
          particleTheme: (typeof b.particleTheme === 'string' ? b.particleTheme : 'none') as
            | 'none'
            | 'splash'
            | 'sparkles'
            | 'petals'
            | 'fire'
            | 'mist',
          speakerName: typeof b.speakerName === 'string' ? b.speakerName.trim() : (mergedCharacters[0]?.name ? String(mergedCharacters[0].name) : ''),
          dialogueLine: rawDialogues[idx] || '',
          voiceGender, // Strict single uniform voice across all beats
          characterStates,
          props: Array.isArray(b.props) ? b.props.slice(0, 5) : [],
        };
      });

      const cleanCaptions = normalizedBeats
        .filter((b) => Boolean(b.dialogueLine))
        .map((b) => ({
          timeStart: b.timeStart,
          timeEnd: b.timeEnd,
          text: b.dialogueLine,
        }));

      return res.json({
        kind,
        scene: {
          ...parsed,
          title: stripHashSymbols(parsed.title || prompt.slice(0, 40)),
          summary: stripHashSymbols(parsed.summary || ''),
          captions: cleanCaptions,
          voiceGender,
          voicePreset: effectivePreset,
          voiceScript: finalScript,
          ...(backdropSvg ? { backdropSvg } : {}),
          ...(keyframeSvgs.length > 0 ? { keyframeSvgs } : {}),
          beats: normalizedBeats,
          ...(voiceAudioBase64 ? { voiceAudioBase64 } : {}),
          characters: mergedCharacters,
          is3D,
          durationSeconds: finalDuration,
        },
      });
    }

    if (kind === 'music') {
      const musicMode: 'instrumental' | 'song' = req.body?.musicMode === 'instrumental' ? 'instrumental' : 'song';
      const customLyrics = typeof req.body?.lyrics === 'string' ? stripHashSymbols(req.body.lyrics.trim()) : '';
      const excludedSingerIds: string[] = Array.isArray(req.body?.excludedSingerIds)
        ? req.body.excludedSingerIds.map(String)
        : Array.isArray(req.body?.excludeSingerIds)
          ? req.body.excludeSingerIds.map(String)
          : [];
      const excludedVoiceNames: string[] = Array.isArray(req.body?.excludedVoiceNames)
        ? req.body.excludedVoiceNames.map(String)
        : Array.isArray(req.body?.excludeVoiceNames)
          ? req.body.excludeVoiceNames.map(String)
          : [];

      const reqGenre = typeof req.body?.genre === 'string' && req.body.genre.trim() ? req.body.genre.trim() : 'أغنية رومانسية';
      const reqEmotion = typeof req.body?.emotion === 'string' && req.body.emotion.trim() ? req.body.emotion.trim() : 'شجن وحنين عميق';
      const reqDialect = typeof req.body?.dialect === 'string' && req.body.dialect.trim() ? req.body.dialect.trim() : 'ammiya';
      const reqLanguage = typeof req.body?.language === 'string' && req.body.language.trim() ? req.body.language.trim() : 'العربية';
      const reqBpm = Number(req.body?.bpm) || 0;
      const backingChoir = req.body?.backingChoir !== false;
      const instrumentFocus =
        typeof req.body?.instrumentFocus === 'string' && req.body.instrumentFocus.trim()
          ? req.body.instrumentFocus.trim()
          : 'arabic_ensemble';
      const songStructure =
        typeof req.body?.songStructure === 'string' && req.body.songStructure.trim()
          ? req.body.songStructure.trim()
          : 'full_song';

      // AI Auto-Casts the best distinct vocalist matching song genre, emotion, dialect, and exclusions
      const { singer: autoSinger, reason: singerReason } = selectAutoSinger({
        prompt,
        genre: reqGenre,
        emotion: reqEmotion,
        dialect: reqDialect,
        language: reqLanguage,
        excludedIds: excludedSingerIds,
        excludedVoiceNames,
      });

      const styleBlob = `${prompt} ${reqGenre} ${reqEmotion} ${instrumentFocus}`;
      const inferredDrumStyle = /راب|هيب هوب|trap_synth|trap|rap|hip/i.test(styleBlob)
        ? 'trap'
        : /هادئ|حزين|أوركسترا|ناي|أفلام|كلاسيكي|orchestral_piano|ambient/i.test(styleBlob)
          ? 'orchestral'
          : /عربي|طرب|خليجي|شرقي|مصري|شامي|arabic_ensemble/i.test(styleBlob)
            ? 'arabic'
            : /لوفاي|نوم|استرخاء|تأمل|acoustic_guitar/i.test(styleBlob)
              ? 'lofi'
              : 'pop';

      const modeHint =
        musicMode === 'song'
          ? customLyrics
            ? `استخدم كلمات المستخدم التالية كما هي أو نسّق فواصلها بلطف بدون علامة # أو أقواس:\n${customLyrics}`
            : `هذا عمل غنائي متكامل: اكتب في lyrics 6 إلى 8 أبيات غنائية موزونة بلغة (${reqLanguage}) وأسلوب/لهجة (${DIALECT_DIRECTIONS[reqDialect] || reqDialect}) مع مشاعر (${reqEmotion}) كل بيت في سطر مستقل بدون أي أقواس أو تسميات مقاطع أو # حتى تُغنّى بعذوبة متناسقة مع اللحن.`
          : 'هذه مقطوعة موسيقية آلية راقية بدون غناء. اكتب في lyrics وصفاً أدبياً موجزاً للأجواء والآلات المستخدمة بدون علامة #.';

      const response = await generateWithFallback(ai, {
        geminiMode,
        contents:
          `الوصف المطلوب: ${prompt}\n` +
          `النوع الموسيقي: ${reqGenre}\n` +
          `المشاعر المطلوبة: ${reqEmotion}\n` +
          `الآلات الأساسية: ${instrumentFocus} | البنية الدرامية: ${songStructure}\n` +
          `نوع العمل: ${musicMode === 'song' ? 'أغنية كاملة بالصوت واللحن المتصاعد' : 'موسيقى آلية احترافية'}`,
        systemInstruction:
          `أنت ملحن وموزع موسيقي عالمي محترف في ZORVYX AI Music Studio.\n${modeHint}\n` +
          `قواعد صارمة لتوزيع موسيقي عذب ومتدفق مريح للأذن 100% (ممنوع النغمات المتقطعة الآلية تماماً):\n` +
          `1. اختر مقاماً واحداً واضحاً والتزم بترددات نوتاته الصحيحة فقط: سلم دو الكبير (261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25) أو سلم لا الصغير (220, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440) أو مقام حجاز رقيق (293.66, 311.13, 369.99, 392.00, 440.00, 466.16, 523.25) أو مقام نهاوند (261.63, 293.66, 311.13, 349.23, 392.00, 415.30, 493.88, 523.25).\n` +
          `2. drumStyle: اختر الأنسب من (pop | arabic | lofi | orchestral | trap) — المقترح: ${inferredDrumStyle}.\n` +
          `3. bpm: سرعة عذبة وموزونة بين 66 و132 (${reqBpm ? `السرعة المفضلة للمستخدم: ${reqBpm}` : 'مناسبة للنوع'}).\n` +
          `4. verseNotes و chorusNotes: جمل لحنية ممدودة وهادئة بمدد طويلة متصلة (durationBeats بين 1 و 2.5 و 3 beats — ممنوع النغمات السريعة القصيرة المتكررة!). استخدم wave: 'sine'.\n` +
          `5. chords: 4 كوردات هارمونية غنية ودافئة في نفس السلم بالضبط (3 نغمات متآلفة لكل كورد، بمدة 4 beats).\n` +
          NO_HASH_RULE,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            mood: { type: Type.STRING },
            bpm: { type: Type.INTEGER },
            keyScale: { type: Type.STRING },
            drumStyle: { type: Type.STRING, description: 'pop | arabic | lofi | orchestral | trap' },
            lyrics: { type: Type.STRING },
            notes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  freq: { type: Type.NUMBER },
                  durationBeats: { type: Type.NUMBER },
                  wave: { type: Type.STRING, description: 'sine | triangle' },
                  gain: { type: Type.NUMBER },
                },
                required: ['freq', 'durationBeats', 'wave', 'gain'],
              },
            },
            verseNotes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  freq: { type: Type.NUMBER },
                  durationBeats: { type: Type.NUMBER },
                  wave: { type: Type.STRING, description: 'sine | triangle' },
                  gain: { type: Type.NUMBER },
                },
                required: ['freq', 'durationBeats', 'wave', 'gain'],
              },
            },
            chorusNotes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  freq: { type: Type.NUMBER },
                  durationBeats: { type: Type.NUMBER },
                  wave: { type: Type.STRING, description: 'sine | triangle' },
                  gain: { type: Type.NUMBER },
                },
                required: ['freq', 'durationBeats', 'wave', 'gain'],
              },
            },
            chords: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  freqs: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                  durationBeats: { type: Type.NUMBER },
                },
                required: ['freqs', 'durationBeats'],
              },
            },
          },
          required: ['title', 'mood', 'bpm', 'keyScale', 'drumStyle', 'lyrics', 'notes', 'verseNotes', 'chorusNotes', 'chords'],
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const finalLyrics = customLyrics || stripHashSymbols(String(parsed.lyrics || ''));
      const cleanMood = stripHashSymbols(String(parsed.mood || reqEmotion || 'لحن استوديو عذب'));
      const safeBpm = reqBpm >= 62 && reqBpm <= 144 ? reqBpm : Math.min(Math.max(Number(parsed.bpm) || 84, 66), 130);

      let vocalAudioBase64: string | undefined;
      let vocalSegments: Array<{ label: string; audioBase64: string; durationSec: number }> = [];
      if (musicMode === 'song') {
        if (!finalLyrics) {
          return res.status(400).json({ error: 'تعذر إنشاء كلمات الأغنية، يرجى كتابة كلمات أو فكرة أوضح للأغنية.' });
        }
        const vocalResult = await synthesizeSingingVoice(
          ai,
          finalLyrics,
          autoSinger,
          `${reqGenre} ${reqEmotion} ${prompt} ${cleanMood}`,
          {
            emotion: reqEmotion || cleanMood,
            dialect: reqDialect,
            language: reqLanguage,
          },
        );
        vocalAudioBase64 = vocalResult.combinedWavBase64;
        vocalSegments = vocalResult.segments;
        if (!vocalAudioBase64) {
          return res.status(502).json({
            error:
              'تعذر توليد صوت الغناء حالياً من محرك الصوت؛ لم يتم حفظ أغنية صامتة بدون صوت. يمكنكِ المحاولة مجدداً أو اختيار «موسيقى آلية فقط».',
          });
        }
      }

      const barSec = (60 / safeBpm) * 4;
      const measuredVocalSec = measureWavSeconds(vocalAudioBase64);
      const naturalBars =
        musicMode === 'song' && measuredVocalSec > 0
          ? Math.max(8, Math.ceil((measuredVocalSec + 7) / barSec))
          : songStructure === 'tarab_extended'
            ? 14
            : songStructure === 'short_reel'
              ? 6
              : Math.max(8, Math.ceil(38 / barSec));
      const finalMusicDuration = parsedExplicitDuration
        ? Math.min(Math.max(parsedExplicitDuration, 15), 240)
        : Math.min(Math.max(Math.round(naturalBars * barSec), 22), 95);

      return res.json({
        kind,
        composition: {
          ...parsed,
          title: stripHashSymbols(String(parsed.title || prompt.slice(0, 40))),
          mood: cleanMood,
          lyrics: finalLyrics,
          mode: musicMode,
          genre: reqGenre || parsed.drumStyle || inferredDrumStyle,
          emotion: reqEmotion || cleanMood,
          dialect: reqDialect,
          language: reqLanguage,
          backingChoir,
          instrumentFocus,
          songStructure,
          singerProfile: {
            id: autoSinger.id,
            name: autoSinger.name,
            voiceName: autoSinger.voiceName,
            gender: autoSinger.gender,
            timbreLabel: autoSinger.timbreLabel,
            reason: singerReason,
          },
          mixSettings: {
            vocalLevel: 1.12,
            instrumentLevel: 1.0,
            drumsBassLevel: 0.96,
            reverbAmount: 0.55,
          },
          drumStyle: parsed.drumStyle || inferredDrumStyle,
          voiceGender: autoSinger.gender,
          voicePreset: autoSinger.id,
          ...(vocalAudioBase64 ? { vocalAudioBase64 } : {}),
          ...(vocalSegments.length > 0 ? { vocalSegments } : {}),
          durationSeconds: finalMusicDuration,
          bpm: safeBpm,
        },
      });
    }

    return res.status(400).json({ error: 'نوع الوسائط غير مدعوم.' });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

app.post('/api/tts', async (req: Request, res: Response) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const voicePreset = typeof req.body?.voicePreset === 'string' ? req.body.voicePreset.trim() : '';
    const presetSpec = voicePreset ? VOICE_PRESET_MAP[voicePreset] : undefined;
    const voiceGender: 'female' | 'male' =
      presetSpec?.gender || (req.body?.voiceGender === 'male' ? 'male' : 'female');
    if (!text) {
      return res.status(400).json({ error: 'يرجى كتابة النص المطلوب تحويله إلى صوت.' });
    }
    const ai = getAI();
    const ttsRes = await synthesizeVoiceWithReason(ai, text, voiceGender, voicePreset);
    if (!ttsRes.audioBase64) {
      return res.status(502).json({
        error: 'تعذر توليد الصوت حالياً، يمكن استخدام صوت المتصفح التلقائي.',
      });
    }
    return res.json({
      audioBase64: ttsRes.audioBase64,
      mimeType: 'audio/wav',
      voiceGender,
      ...(voicePreset ? { voicePreset } : {}),
    });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

// ==================== VOICE CHAT API ====================
app.post('/api/voice-chat', async (req: Request, res: Response) => {
  try {
    const transcript = typeof req.body?.transcript === 'string' ? req.body.transcript.trim() : '';
    const audioBase64 = typeof req.body?.audioBase64 === 'string' ? req.body.audioBase64.trim() : '';
    const audioMimeType =
      typeof req.body?.audioMimeType === 'string' && req.body.audioMimeType.trim()
        ? req.body.audioMimeType.trim()
        : 'audio/webm';
    const voicePreset = typeof req.body?.voicePreset === 'string' ? req.body.voicePreset.trim() : 'kore_warm';
    const history: IncomingHistoryItem[] = Array.isArray(req.body?.history) ? req.body.history.slice(-10) : [];

    if (!transcript && !audioBase64) {
      return res.status(400).json({ error: 'يرجى التحدث بالميكروفون أو كتابة رسالتك الصوتية أولاً.' });
    }

    const ai = getAI();
    let userText = transcript;

    // If audio recording was uploaded, transcribe & understand it directly via Gemini with conversation history
    if (audioBase64) {
      const cleanB64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
      const historyPrefix = history.map((h) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(h.text || '') }],
      }));
      const sttRes = await generateWithFallback(ai, {
        geminiMode: req.body?.geminiMode,
        contents: [
          ...historyPrefix,
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: audioMimeType, data: cleanB64 } },
              {
                text: 'استمع بعناية إلى الصوت المرفق، اكتب النص الكامل الذي قاله المستخدم في userTranscript، ثم أجب برد محادثاتي طبيعي وسلس وواضح في assistantReply باللغة نفسها التي تحدث بها المستخدم.',
              },
            ],
          },
        ],
        thinkingLevel: ThinkingLevel.LOW,
        systemInstruction:
          'أنت ZORVYX، رفيق محادثة صوتية ذكي وطبيعي في ZORVYX AI. استمع لصوت المستخدم بدقة، وتحدّث معه بود ووضوح بجمل طبيعية مناسبة للاستماع الصوتي.' +
          VOICE_INTRO_IDENTITY_RULE +
          NO_HASH_RULE,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            userTranscript: { type: Type.STRING },
            assistantReply: { type: Type.STRING },
          },
          required: ['userTranscript', 'assistantReply'],
        },
      });
      const parsedStt = JSON.parse((sttRes.text ?? '{}').trim());
      userText = stripHashSymbols(parsedStt.userTranscript || transcript || 'رسالة صوتية');
      const replyText = stripHashSymbols(parsedStt.assistantReply || 'سمعتك بوضوح، كيف أستطيع مساعدتك؟');
      const presetSpec = VOICE_PRESET_MAP[voicePreset] || VOICE_PRESET_MAP.kore_warm;
      const tts = await synthesizeVoiceWithReason(ai, replyText, presetSpec.gender, voicePreset);
      return res.json({
        userTranscript: userText,
        replyText,
        ...(tts.audioBase64 ? { audioBase64: tts.audioBase64 } : {}),
      });
    }

    const chatContents =
      history.length > 0
        ? [
            ...history.map((h) => ({
              role: h.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: String(h.text || '') }],
            })),
            { role: 'user', parts: [{ text: userText }] },
          ]
        : userText;

    const replyRes = await generateWithFallback(ai, {
      geminiMode: req.body?.geminiMode,
      contents: chatContents,
      thinkingLevel: ThinkingLevel.LOW,
      systemInstruction:
        'أنت ZORVYX، مساعد صوتي ذكي وودود يتحدث بصوته بوضوح وسلاسة. أجب بأسلوب منطوق طبيعي ومباشر ومناسب للاستماع الصوتي (جمل مترابطة واضحة دون رموز معقدة أو هاشتاق).' +
        VOICE_INTRO_IDENTITY_RULE +
        NO_HASH_RULE,
    });
    const replyText = stripHashSymbols(replyRes.text ?? 'أهلاً بك! كيف أساعدك الآن؟');
    const presetSpec = VOICE_PRESET_MAP[voicePreset] || VOICE_PRESET_MAP.kore_warm;
    const tts = await synthesizeVoiceWithReason(ai, replyText, presetSpec.gender, voicePreset);

    return res.json({
      userTranscript: userText,
      replyText,
      ...(tts.audioBase64 ? { audioBase64: tts.audioBase64 } : {}),
    });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

// ==================== DAILY TASKS AI PLANNER ====================
app.post('/api/tasks-ai', async (req: Request, res: Response) => {
  try {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt) {
      return res.status(400).json({ error: 'اكتبي مهامك أو أهداف يومك أولاً ليتم تنظيمها.' });
    }
    const ai = getAI();
    const result = await generateWithFallback(ai, {
      geminiMode: req.body?.geminiMode,
      contents: `طلب المستخدم لأداة المهام اليومية:\n"${prompt}"`,
      thinkingLevel: ThinkingLevel.LOW,
      systemInstruction:
        'أنت أداة "المهام اليومية" المتخصصة حصراً في ZORVYX AI.\n' +
        'وظيفتك الوحيدة: تحويل وصف يوم المستخدم أو أهدافه إلى قائمة مهام يومية عملية ومرتبة بالأوقات والأولويات.\n' +
        'إذا كان الطلب خارج المهام اليومية وتنظيم اليوم (مثل البرمجة، الترجمة، كتابة قصة، شرح درس، إعلان تسويقي، أو رسم بياني)، ضع isValidDomain=false واكتب rejectionMessage يعتذر بلباقة ويوجه المستخدم للأيقونة المناسبة في ZORVYX AI بدون تنفيذ الطلب.\n' +
        'أما إذا كان مناسباً للمهام اليومية فضع isValidDomain=true وأعد مصفوفة tasks فيها من 3 إلى 8 مهام واضحة.' +
        NO_HASH_RULE,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isValidDomain: { type: Type.BOOLEAN },
          rejectionMessage: { type: Type.STRING },
          planTitle: { type: Type.STRING },
          tasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                category: { type: Type.STRING },
                priority: { type: Type.STRING },
                timeSlot: { type: Type.STRING },
              },
              required: ['title', 'category', 'priority', 'timeSlot'],
            },
          },
        },
        required: ['isValidDomain', 'rejectionMessage', 'planTitle', 'tasks'],
      },
    });
    const parsed = JSON.parse((result.text ?? '{}').trim()) as {
      isValidDomain?: boolean;
      rejectionMessage?: string;
      planTitle?: string;
      tasks?: Array<{ title?: string; category?: string; priority?: string; timeSlot?: string }>;
    };
    if (!parsed.isValidDomain) {
      return res.json({
        rejected: true,
        message: stripHashSymbols(
          parsed.rejectionMessage ||
            'هذه الأيقونة مخصصة حصراً لترتيب المهام اليومية؛ يرجى اختيار الأيقونة المناسبة لطلبك من القائمة.',
        ),
      });
    }
    const normalizedTasks = (parsed.tasks || []).slice(0, 10).map((t) => ({
      title: stripHashSymbols(t.title || 'مهمة يومية'),
      category: ['عمل', 'دراسة', 'منزل', 'صحة', 'شخصي'].includes(String(t.category))
        ? String(t.category)
        : 'شخصي',
      priority: ['عالية', 'متوسطة', 'عادية'].includes(String(t.priority)) ? String(t.priority) : 'متوسطة',
      timeSlot: stripHashMarksSafe(t.timeSlot || ''),
    }));
    return res.json({
      rejected: false,
      planTitle: stripHashSymbols(parsed.planTitle || 'خطة مهامك اليومية'),
      tasks: normalizedTasks,
    });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

function stripHashMarksSafe(s: string) {
  return stripHashSymbols(s || '');
}

// ==================== SMART CHARTS & DATA VISUALIZER ====================
app.post('/api/charts', async (req: Request, res: Response) => {
  try {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const preferredType = typeof req.body?.chartType === 'string' ? req.body.chartType : 'auto';
    if (!prompt) {
      return res.status(400).json({ error: 'اكتبي البيانات أو الموضوع المطلوب رسمه بيانياً أولاً.' });
    }
    const ai = getAI();
    const result = await generateWithFallback(ai, {
      geminiMode: req.body?.geminiMode,
      contents:
        `طلب المستخدم لأداة الرسم البياني الذكي:\n"${prompt}"\n` +
        `نوع الرسم المفضل: ${preferredType}`,
      thinkingLevel: ThinkingLevel.LOW,
      systemInstruction:
        'أنت أداة "الرسم البياني الذكي" المتخصصة حصراً في ZORVYX AI.\n' +
        'وظيفتك الوحيدة: تحويل البيانات أو الأرقام أو المقارنات أو الإحصائيات أو المواضيع القابلة للتمثيل الكمي (مثل المبيعات، الميزانية، الدرجات، النسب، التطور الزمني، المقارنات) إلى رسم بياني دقيق ومنسّق.\n' +
        'إذا طلب المستخدم شيئاً لا يتعلق بالرسوم البيانية أو البيانات الإحصائية (مثل كتابة قصة، برمجة موقع، ترجمة نص، إيميل رسمي، أو تدقيق لغوي)، ضع isValidDomain=false ووجّهه للأيقونة الصحيحة في rejectionMessage.\n' +
        'عند التوليد (isValidDomain=true): تأكد أن labels وvalues لكل سلسلة متطابقة في الطول (من 3 إلى 10 نقاط)، واختر chartType من (bar أو line أو pie أو area)، واستخدم ألوان hex جذابة مثل #38bdf8 و#a78bfa و#34d399 و#fbbf24 و#f472b6.' +
        NO_HASH_RULE,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isValidDomain: { type: Type.BOOLEAN },
          rejectionMessage: { type: Type.STRING },
          chartTitle: { type: Type.STRING },
          chartType: { type: Type.STRING },
          unit: { type: Type.STRING },
          labels: { type: Type.ARRAY, items: { type: Type.STRING } },
          series: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                color: { type: Type.STRING },
                values: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              },
              required: ['name', 'color', 'values'],
            },
          },
          insights: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['isValidDomain', 'rejectionMessage', 'chartTitle', 'chartType', 'unit', 'labels', 'series', 'insights'],
      },
    });
    const parsed = JSON.parse((result.text ?? '{}').trim()) as {
      isValidDomain?: boolean;
      rejectionMessage?: string;
      chartTitle?: string;
      chartType?: string;
      unit?: string;
      labels?: string[];
      series?: Array<{ name?: string; color?: string; values?: number[] }>;
      insights?: string[];
    };
    if (!parsed.isValidDomain) {
      return res.json({
        rejected: true,
        message: stripHashSymbols(
          parsed.rejectionMessage ||
            'هذه الأيقونة مخصصة حصراً لإنشاء الرسوم البيانية وتحليل البيانات؛ يرجى استخدام الأيقونة المناسبة لطلبك.',
        ),
      });
    }
    const allowedChartTypes = ['bar', 'line', 'pie', 'area'];
    const finalType =
      preferredType !== 'auto' && allowedChartTypes.includes(preferredType)
        ? preferredType
        : allowedChartTypes.includes(String(parsed.chartType))
          ? String(parsed.chartType)
          : 'bar';
    const labels = (parsed.labels || []).slice(0, 12).map((l) => stripHashSymbols(String(l)));
    const fallbackPalette = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6'];
    const series = (parsed.series || []).slice(0, 4).map((s, idx) => ({
      name: stripHashSymbols(s.name || `السلسلة ${idx + 1}`),
      color: /^#[0-9a-fA-F]{6}$/.test(String(s.color || ''))
        ? String(s.color)
        : fallbackPalette[idx % fallbackPalette.length],
      values: labels.map((_, i) => {
        const n = Number(s.values?.[i] ?? 0);
        return Number.isFinite(n) ? n : 0;
      }),
    }));
    return res.json({
      rejected: false,
      chart: {
        chartTitle: stripHashSymbols(parsed.chartTitle || 'رسم بياني ذكي'),
        chartType: finalType,
        unit: stripHashSymbols(parsed.unit || ''),
        labels,
        series,
        insights: (parsed.insights || []).slice(0, 4).map((x) => stripHashSymbols(String(x))),
      },
    });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

// ==================== TOPIC TO VIDEO EXPLAINER API ====================
app.post('/api/video-explainer', async (req: Request, res: Response) => {
  try {
    const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim() : '';
    const sceneCountRaw = Number(req.body?.sceneCount || 5);
    const sceneCount = Math.min(7, Math.max(3, Number.isFinite(sceneCountRaw) ? sceneCountRaw : 5));
    if (!topic) {
      return res.status(400).json({ error: 'اكتبي عنوان الموضوع أو الفكرة المطلوب شرحها بالفيديو أولاً.' });
    }
    const ai = getAI();
    const result = await generateWithFallback(ai, {
      geminiMode: req.body?.geminiMode,
      contents:
        `طلب المستخدم لأداة شرح الموضوع بفيديو:\n"${topic}"\n` +
        `عدد المشاهد المطلوب: ${sceneCount}`,
      thinkingLevel: ThinkingLevel.LOW,
      systemInstruction:
        'أنت أداة "شرح الموضوع بفيديو" المتخصصة حصراً في ZORVYX AI.\n' +
        'وظيفتك الوحيدة: تحويل أي موضوع معرفي أو علمي أو عملي أو فكرة يكتبها المستخدم إلى فيديو تعليمي متسلسل وكامل ومستوفٍ لكل جوانب الموضوع من البداية حتى الخاتمة مع تعليق صوتي كامل ونقاط بصرية مركّزة.\n' +
        'إذا طلب المستخدم شيئاً لا يتعلق بشرح موضوع بفيديو (مثل: ترجمة نص، كتابة كود برمجي خام، حساب ميزانية شخصية، تدقيق إملائي لنص، أو صياغة إيميل رسمي)، ضع isValidDomain=false ووجّهه بلباقة إلى الأيقونة المناسبة في rejectionMessage.\n' +
        'عند القبول (isValidDomain=true): أنشئ ' +
        sceneCount +
        ' مشاهد بالترتيب تغطي الموضوع بالكامل دون أي اختصار مخل أو بتر (مقدمة شاملة، شرح الأركان والآلية بالتفصيل، أمثلة وتطبيقات عملية، وخاتمة جامعة)، ولكل مشهد:\n' +
        '- sceneTitle: عنوان واضح ومختصر للمشهد\n' +
        '- narration: فقرة تعليق صوتي متكاملة من 2 إلى 3 جمل عربية سليمة ومترابطة (حوالي 28 إلى 45 كلمة) تشرح فكرة المشهد كاملة بوضوح وسلاسة للنطق الصوتي دون علامات ترقيم غريبة\n' +
        '- keyPoints: 2 إلى 3 نقاط بصرية مختصرة تلخص المشهد\n' +
        '- visualStyle: (orbit أو bars أو steps أو network أو pulse أو timeline)\n' +
        '- accentColor: لون hex مشرق\n' +
        '- durationSec: تقدير المدة بالثواني (بين 8 و16 ثانية حسب طول الشرح).' +
        NO_HASH_RULE,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isValidDomain: { type: Type.BOOLEAN },
          rejectionMessage: { type: Type.STRING },
          videoTitle: { type: Type.STRING },
          subtitle: { type: Type.STRING },
          summary: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sceneTitle: { type: Type.STRING },
                narration: { type: Type.STRING },
                keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                visualStyle: { type: Type.STRING },
                accentColor: { type: Type.STRING },
                durationSec: { type: Type.NUMBER },
              },
              required: ['sceneTitle', 'narration', 'keyPoints', 'visualStyle', 'accentColor', 'durationSec'],
            },
          },
        },
        required: ['isValidDomain', 'rejectionMessage', 'videoTitle', 'subtitle', 'summary', 'scenes'],
      },
    });
    const parsed = JSON.parse((result.text ?? '{}').trim()) as {
      isValidDomain?: boolean;
      rejectionMessage?: string;
      videoTitle?: string;
      subtitle?: string;
      summary?: string;
      scenes?: Array<{
        sceneTitle?: string;
        narration?: string;
        keyPoints?: string[];
        visualStyle?: string;
        accentColor?: string;
        durationSec?: number;
      }>;
    };
    if (!parsed.isValidDomain) {
      return res.json({
        rejected: true,
        message: stripHashSymbols(
          parsed.rejectionMessage ||
            'هذه الأيقونة مخصصة حصراً لشرح المواضيع والأفكار على شكل فيديو؛ يرجى استخدام الأيقونة المناسبة لطلبك.',
        ),
      });
    }
    const palette = ['#67e8f9', '#a78bfa', '#f9a8d4', '#34d399', '#fbbf24', '#38bdf8'];
    const allowedVisuals = ['orbit', 'bars', 'steps', 'network', 'pulse', 'timeline'];
    const baseScenes = (parsed.scenes || []).slice(0, 7).map((sc, idx) => {
      const cleanNarration = stripHashSymbols(sc.narration || '');
      const wordCount = cleanNarration.split(/\s+/).filter(Boolean).length;
      const realisticDuration = Math.min(20, Math.max(8, Math.ceil(wordCount / 1.85), Math.round(Number(sc.durationSec || 8))));
      return {
        sceneTitle: stripHashSymbols(sc.sceneTitle || `المشهد ${idx + 1}`),
        narration: cleanNarration,
        keyPoints: (sc.keyPoints || []).slice(0, 3).map((k) => stripHashSymbols(String(k))),
        visualStyle: allowedVisuals.includes(String(sc.visualStyle))
          ? String(sc.visualStyle)
          : allowedVisuals[idx % allowedVisuals.length],
        accentColor: /^#[0-9a-fA-F]{6}$/.test(String(sc.accentColor || ''))
          ? String(sc.accentColor)
          : palette[idx % palette.length],
        durationSec: realisticDuration,
      };
    });

    // Generate complete Gemini TTS voiceover per scene in parallel so narration never cuts off
    const scenesWithAudio = await Promise.all(
      baseScenes.map(async (sc) => {
        if (!sc.narration) return sc;
        const tts = await synthesizeVoiceWithReason(ai, sc.narration, 'female', 'kore_warm');
        return {
          ...sc,
          ...(tts.audioBase64 ? { audioBase64: tts.audioBase64 } : {}),
        };
      }),
    );

    return res.json({
      rejected: false,
      video: {
        videoTitle: stripHashSymbols(parsed.videoTitle || topic),
        subtitle: stripHashSymbols(parsed.subtitle || 'شرح مرئي تفاعلي متكامل بالذكاء الاصطناعي'),
        summary: stripHashSymbols(parsed.summary || ''),
        scenes: scenesWithAudio,
      },
    });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

// ==================== ZORVYX PRO MUSIC LYRICS & IMAGE PROMPT ENHANCER ====================
app.post('/api/image/enhance-prompt', async (req: Request, res: Response) => {
  try {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const style =
      typeof req.body?.style === 'string' && req.body.style.trim()
        ? req.body.style.trim()
        : typeof req.body?.artStyle === 'string'
          ? req.body.artStyle.trim()
          : '';
    const lightingStyle = typeof req.body?.lightingStyle === 'string' ? req.body.lightingStyle.trim() : '';
    const cameraAngle = typeof req.body?.cameraAngle === 'string' ? req.body.cameraAngle.trim() : '';
    const aspectRatio = typeof req.body?.aspectRatio === 'string' ? req.body.aspectRatio.trim() : '1:1';
    const isEdit = Boolean(req.body?.isEdit);

    if (!prompt) {
      return res.status(400).json({ error: 'اكتبي فكرة أولاً لتطوير الوصف باحترافية.' });
    }

    const ai = getAI();
    const enhRes = await generateWithFallback(ai, {
      geminiMode: req.body?.geminiMode,
      contents:
        `الفكرة الأولية: "${prompt}"\n` +
        `${style ? `النمط: ${style}\n` : ''}` +
        `${lightingStyle ? `الإضاءة: ${lightingStyle}\n` : ''}` +
        `${cameraAngle ? `زاوية الكاميرا: ${cameraAngle}\n` : ''}` +
        `نسبة الأبعاد: ${aspectRatio} | الوضع: ${isEdit ? 'تعديل احترافي على صورة حقيقية' : 'إنشاء لوحة فنية جديدة'}`,
      thinkingLevel: ThinkingLevel.LOW,
      systemInstruction:
        'أنت مخرج فني ومدير تصوير استوديو محترف. حوّل فكرة المستخدم القصيرة إلى وصف عربي غني ودقيق يصلح لإنتاج صورة بمستوى الاستوديوهات العالمية (تفاصيل الملمس، الإضاءة، التدرج اللوني، العمق الميداني، التكوين) في فقرة واحدة مركزة ومباشرة باللغة العربية فقط بدون مقدمات وبدون علامة #.' +
        NO_HASH_RULE,
    });

    const enhancedPrompt = stripHashSymbols(enhRes.text ?? prompt);
    return res.json({ enhancedPrompt });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

app.post('/api/music/lyrics', async (req: Request, res: Response) => {
  try {
    const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim() : '';
    const genre = typeof req.body?.genre === 'string' ? req.body.genre.trim() : 'أغنية رومانسية';
    const emotion = typeof req.body?.emotion === 'string' ? req.body.emotion.trim() : 'شجن وحنين عميق';
    const dialect = typeof req.body?.dialect === 'string' ? req.body.dialect.trim() : 'ammiya';
    const language = typeof req.body?.language === 'string' ? req.body.language.trim() : 'العربية';

    if (!topic) {
      return res.status(400).json({ error: 'اكتبي فكرة أو موضوع الأغنية لتأليف الكلمات.' });
    }

    const ai = getAI();
    const resLyrics = await generateWithFallback(ai, {
      geminiMode: req.body?.geminiMode,
      contents:
        `موضوع الأغنية: ${topic}\n` +
        `النوع: ${genre}\nالمشاعر: ${emotion}\n` +
        `اللغة: ${language} | اللهجة: ${DIALECT_DIRECTIONS[dialect] || dialect}`,
      thinkingLevel: ThinkingLevel.LOW,
      systemInstruction:
        'أنت شاعر غنائي محترف في استوديو زورفيكس للموسيقى. اكتب 6 إلى 8 أبيات غنائية قصيرة موزونة وعميقة الإحساس جاهزة للغناء فوراً. اكتب كل بيت في سطر مستقل بدون أقواس وبدون تسميات مثل (المقطع الأول) أو (الكورس) وبدون علامة # نهائياً.' +
        NO_HASH_RULE,
    });

    const lyrics = stripHashSymbols((resLyrics.text ?? '').replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, ''));
    return res.json({ lyrics });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

// ==================== ZORVYX AI CINEMA STUDIO ROUTES ====================

app.get('/api/providers/status', (_req: Request, res: Response) => {
  return res.json(getProviderStatusReport());
});

app.post('/api/cinema/infinity-command', async (req: Request, res: Response) => {
  try {
    const command = typeof req.body?.command === 'string' ? req.body.command.trim() : '';
    if (!command) {
      return res.status(400).json({ error: 'اكتب أمر الفيلم أو المسلسل أو الفيديو أولاً.' });
    }
    const ai = getAI();
    const parseRes = await generateWithFallback(ai, {
      geminiMode: req.body?.geminiMode,
      contents: `أمر المستخدم السينمائي:\n"${command}"`,
      thinkingLevel: ThinkingLevel.LOW,
      systemInstruction:
        'أنت محرك التحليل الرئيسي في ZORVYX INFINITY CINEMA ENGINE. حوّل أي أمر مستخدم مهما كان طوله أو نوعه إلى مواصفات إنتاج دقيقة: ' +
        'mode (film|series|scene|text_to_video|story_to_movie|script_to_film|ai_animation|trailer|documentary|music_video|ad_video), ' +
        'genre (دراما|رعب|أكشن|كوميديا|خيال علمي|مغامرات|رومانسي|وثائقي|تاريخي|أنيميشن), ' +
        'dialect (fusha|ammiya|egyptian|gulf|levantine|maghrebi|english|french|spanish|turkish), ' +
        'episodeCount (من 1 إلى 20 حسب المطلوب، وإذا طلب مسلسلاً بدون رقم اختر 10), scenesPerEpisode (من 2 إلى 8), targetDurationMinutes (بالدقائق 1 إلى 45).' +
        NO_HASH_RULE,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          mode: { type: Type.STRING },
          genre: { type: Type.STRING },
          episodeCount: { type: Type.INTEGER },
          scenesPerEpisode: { type: Type.INTEGER },
          targetDurationMinutes: { type: Type.INTEGER },
          dialect: { type: Type.STRING },
          targetLanguage: { type: Type.STRING },
          storyOutline: { type: Type.STRING },
        },
        required: ['title', 'mode', 'genre', 'episodeCount', 'scenesPerEpisode', 'targetDurationMinutes', 'dialect', 'targetLanguage', 'storyOutline'],
      },
    });
    const parsed = JSON.parse((parseRes.text ?? '{}').trim());
    return res.json({
      spec: {
        title: stripHashSymbols(String(parsed.title || 'عمل زورفيكس السينمائي')),
        mode: String(parsed.mode || 'film'),
        genre: String(parsed.genre || 'دراما'),
        episodeCount: Math.min(20, Math.max(1, Number(parsed.episodeCount) || 1)),
        scenesPerEpisode: Math.min(8, Math.max(2, Number(parsed.scenesPerEpisode) || 4)),
        targetDurationMinutes: Math.min(45, Math.max(1, Number(parsed.targetDurationMinutes) || 3)),
        dialect: String(parsed.dialect || 'ammiya'),
        targetLanguage: String(parsed.targetLanguage || 'العربية'),
        storyOutline: stripHashSymbols(String(parsed.storyOutline || command)),
      },
    });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

app.post('/api/cinema/audio-to-video', async (req: Request, res: Response) => {
  try {
    const audioBase64 = typeof req.body?.audioBase64 === 'string' ? req.body.audioBase64.trim() : '';
    const audioMimeType =
      typeof req.body?.audioMimeType === 'string' && req.body.audioMimeType.trim()
        ? req.body.audioMimeType.trim()
        : 'audio/webm';
    const visualStyle = typeof req.body?.visualStyle === 'string' ? req.body.visualStyle.trim() : 'سينمائي واقعي';
    const genre = typeof req.body?.genre === 'string' && req.body.genre.trim() ? req.body.genre.trim() : 'دراما';
    const aspectRatio = typeof req.body?.aspectRatio === 'string' ? req.body.aspectRatio : '16:9';

    if (!audioBase64) {
      return res.status(400).json({ error: 'يرجى تسجيل الصوت أو رفع ملف صوتي أولاً.' });
    }

    const ai = getAI();
    const cleanB64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
    const geminiMode = normalizeGeminiMode(req.body?.geminiMode);
    const analysisRes = await generateWithFallback(ai, {
      geminiMode,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: audioMimeType, data: cleanB64 } },
            {
              text:
                `استمع إلى هذا المقطع الصوتي (كلام أو أغنية أو تعليق) وحلّل موضوعه ونبرته وإيقاعه، ثم أنشئ خطة فيديو سينمائية متزامنة معه.\n` +
                `الأسلوب البصري المطلوب: ${visualStyle} | النوع: ${genre}`,
            },
          ],
        },
      ],
      thinkingLevel: ThinkingLevel.LOW,
      systemInstruction:
        'أنت مخرج فيديو كليبات ومشاهد صوتية في ZORVYX AI. استمع للصوت واستخرج النص المنطوق في transcript، واكتب عنوان المشهد، ووصف الخلفية، وحركة الكاميرا (zoom_in|aerial|tracking|orbit) والإضاءة (cinematic|neon|golden|horror|romantic) والـ VFX (none|lens_flare|chase_lines|explosion_sparks|rain_reflections) والمدة بالثواني.' +
        NO_HASH_RULE,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          transcript: { type: Type.STRING },
          locationDesc: { type: Type.STRING },
          visualAction: { type: Type.STRING },
          cameraMotion: { type: Type.STRING },
          lighting: { type: Type.STRING },
          weather: { type: Type.STRING },
          vfxOverlay: { type: Type.STRING },
          estimatedSeconds: { type: Type.INTEGER },
        },
        required: ['title', 'transcript', 'locationDesc', 'visualAction', 'cameraMotion', 'lighting', 'weather', 'vfxOverlay', 'estimatedSeconds'],
      },
    });

    const parsed = JSON.parse((analysisRes.text ?? '{}').trim());
    const dims = aspectRatio === '9:16' ? { w: 720, h: 1280 } : aspectRatio === '1:1' ? { w: 1024, h: 1024 } : { w: 1280, h: 720 };
    const backdropSvg = await generateUltraDetailedSvg(
      ai,
      `ارسم خلفية سينمائية فائقة الدقة (${dims.w}×${dims.h}) لمشهد متزامن مع الصوت:\nالمشهد: ${parsed.locationDesc}\nالحركة: ${parsed.visualAction}\nالإضاءة: ${parsed.lighting}\nالأسلوب: ${visualStyle}\nأخرج كود <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}"> مباشرة فقط.`,
      `أنت مدير تصوير في ZORVYX AI. أخرج SVG viewBox="0 0 ${dims.w} ${dims.h}" غني بالتدرجات والضوء بدون <script> أو <foreignObject> أو on*.`,
      7200,
      String(parsed.locationDesc || visualStyle || ''),
      36,
      geminiMode,
    );

    return res.json({
      result: {
        title: stripHashSymbols(String(parsed.title || 'فيديو متزامن مع الصوت')),
        transcript: stripHashSymbols(String(parsed.transcript || '')),
        locationDesc: stripHashSymbols(String(parsed.locationDesc || '')),
        visualAction: stripHashSymbols(String(parsed.visualAction || '')),
        cameraMotion: String(parsed.cameraMotion || 'zoom_in'),
        lighting: String(parsed.lighting || 'cinematic'),
        weather: String(parsed.weather || 'clear'),
        vfxOverlay: String(parsed.vfxOverlay || 'lens_flare'),
        durationSeconds: Math.min(60, Math.max(6, Number(parsed.estimatedSeconds) || 12)),
        backdropSvg,
      },
    });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

app.post('/api/cinema/plan', async (req: Request, res: Response) => {
  try {
    const mode = typeof req.body?.mode === 'string' ? req.body.mode : 'film';
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const genre = typeof req.body?.genre === 'string' && req.body.genre.trim() ? req.body.genre.trim() : 'دراما';
    const storyPrompt = typeof req.body?.storyPrompt === 'string' ? req.body.storyPrompt.trim() : '';
    const episodeCount = mode === 'series' ? Math.min(Math.max(Number(req.body?.episodeCount) || 3, 1), 20) : 1;
    const scenesPerEpisode =
      mode === 'scene'
        ? 1
        : mode === 'series'
          ? Math.min(Math.max(Number(req.body?.scenesPerEpisode) || 3, 2), 6)
          : Math.min(Math.max(Number(req.body?.scenesPerEpisode) || 4, 2), 8);
    const defaultDurationSec = Math.min(Math.max(Number(req.body?.defaultDurationSec) || 8, 5), 60);
    const dialect = typeof req.body?.dialect === 'string' ? req.body.dialect : 'fusha';
    const targetLanguage = typeof req.body?.targetLanguage === 'string' ? req.body.targetLanguage : 'العربية';
    const musicMood = typeof req.body?.musicMood === 'string' ? req.body.musicMood : genre;
    const continuityMemory = typeof req.body?.continuityMemory === 'string' ? req.body.continuityMemory.trim() : '';
    const seasonNumber = Math.max(1, Number(req.body?.seasonNumber) || 1);
    const existingActors: Array<Record<string, unknown>> = Array.isArray(req.body?.existingActors)
      ? req.body.existingActors.slice(0, 6)
      : [];

    if (!storyPrompt && !title) {
      return res.status(400).json({ error: 'يرجى كتابة فكرة العمل أو عنوان الفيلم/المسلسل أولاً.' });
    }

    const ai = getAI();
    const actorsHint =
      existingActors.length > 0
        ? `\nالممثلون الافتراضيون المختارون من خزنة المستخدم (يجب إشراكهم بنفس الأسماء والهوية):\n${existingActors
            .map((a) => `- ${String(a.name || 'ممثل')} (id: ${String(a.id || '')}, الدور: ${String(a.role || '')}, الملامح: ${String(a.appearanceDesc || '')}, الصوت: ${String(a.voiceActor || 'female')})`)
            .join('\n')}`
        : '';

    const continuityHint = continuityMemory
      ? `\nذاكرة الأحداث والاستمرارية (يجب ربط الحلقات بهذه الخلفية والأحداث):\n${continuityMemory}`
      : '';

    const systemInstruction =
      `أنت كاتب سيناريو ومخرج سينمائي محترف ورئيس استوديو ZORVYX INFINITY CINEMA.\n` +
      `نوع الأداة/المشروع: (${mode}) | الموسم: ${seasonNumber}.\n` +
      `أنشئ خطة إنتاج سينمائية متكاملة (${mode === 'series' ? `مسلسل من ${episodeCount} حلقة، في كل حلقة ${scenesPerEpisode} مشاهد مترابطة` : mode === 'scene' ? 'مشهد سينمائي واحد متقن' : `عمل متكامل من ${scenesPerEpisode} مشاهد`}).\n` +
      `قواعد إلزامية:\n` +
      `1. أنشئ 2 إلى 4 شخصيات بنظام Character DNA متطابق الملامح والوجه والملابس والصوت وأسلوب الحركة والصفات الشخصية (characters) حتى لا تتغير الشخصية عبر المشاهد والحلقات.${actorsHint}\n` +
      `2. قسّم العمل إلى حلقات (episodes) متسلسلة ومترابطة بذاكرة أحداث (continuityNotes)، وكل حلقة تحتوي على مشاهد (scenes).${continuityHint}\n` +
      `3. اكتب الحوارات بلغة (${targetLanguage}) وبأسلوب لهجة (${DIALECT_DIRECTIONS[dialect] || dialect}) مناسبة للأحداث، وحدد متحدثاً من شخصياتك لكل سطر حوار.\n` +
      `4. لكل مشهد حدد بدقة: shotType (wide | medium | closeup | establishing | over_shoulder | aerial)، cameraMotion (zoom_in | zoom_out | pan_left | pan_right | orbit | aerial | tracking | slow_motion | static)، lighting (cinematic | horror | neon | golden | natural | romantic)، weather (clear | rain | fog | snow | storm | night_stars | sunset)، timeOfDay (day | sunset | night | dawn)، sfxType (none | rain | thunder | heartbeat | wind | sparkles | city | waves | explosion)، vfxOverlay (none | lens_flare | chase_lines | explosion_sparks | rain_reflections).\n` +
      `5. ممنوع وضع علامة # في أي نص.` +
      NO_HASH_RULE;

    const planSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        logline: { type: Type.STRING },
        continuityMemory: { type: Type.STRING },
        characters: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              role: { type: Type.STRING },
              age: { type: Type.STRING },
              faceDesc: { type: Type.STRING, description: 'شكل الوجه وتفاصيله الدقيقة' },
              featuresDesc: { type: Type.STRING, description: 'تفاصيل العيون واللحية/المكياج والعلامات الفارقة' },
              appearanceDesc: { type: Type.STRING, description: 'تفاصيل المظهر العام والبنية' },
              outfitDesc: { type: Type.STRING, description: 'ملابس الشخصية الثابتة وألوانها' },
              hairColor: { type: Type.STRING },
              primaryColor: { type: Type.STRING },
              secondaryColor: { type: Type.STRING },
              voiceActor: { type: Type.STRING, description: 'female | male | child' },
              speakingStyle: { type: Type.STRING },
              movementStyle: { type: Type.STRING, description: 'أسلوب المشي والحركة والإيماءات' },
              personalityTraits: { type: Type.STRING, description: 'الصفات النفسية والشخصية' },
              speechPattern: { type: Type.STRING, description: 'طريقة الكلام والإيقاع الصوتي' },
            },
            required: ['id', 'name', 'role', 'age', 'appearanceDesc', 'outfitDesc', 'hairColor', 'primaryColor', 'secondaryColor', 'voiceActor', 'speakingStyle'],
          },
        },
        episodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              episodeNumber: { type: Type.INTEGER },
              title: { type: Type.STRING },
              synopsis: { type: Type.STRING },
              continuityNotes: { type: Type.STRING },
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sceneNumber: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    locationDesc: { type: Type.STRING },
                    visualAction: { type: Type.STRING },
                    shotType: { type: Type.STRING },
                    cameraMotion: { type: Type.STRING },
                    lighting: { type: Type.STRING },
                    weather: { type: Type.STRING },
                    timeOfDay: { type: Type.STRING },
                    sfxType: { type: Type.STRING },
                    vfxOverlay: { type: Type.STRING },
                    characterIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                    dialogues: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          characterId: { type: Type.STRING },
                          speakerName: { type: Type.STRING },
                          text: { type: Type.STRING },
                        },
                        required: ['characterId', 'speakerName', 'text'],
                      },
                    },
                  },
                  required: ['sceneNumber', 'title', 'locationDesc', 'visualAction', 'shotType', 'cameraMotion', 'lighting', 'weather', 'timeOfDay', 'sfxType', 'characterIds', 'dialogues'],
                },
              },
            },
            required: ['episodeNumber', 'title', 'synopsis', 'scenes'],
          },
        },
      },
      required: ['title', 'logline', 'characters', 'episodes'],
    };

    const userPlanText =
      `العنوان المقترح: ${title || 'عمل سينمائي جديد'}\n` +
      `النوع / التصنيف: ${genre} | الأداة: ${mode}\n` +
      `عدد الحلقات: ${episodeCount} | المشاهد في كل حلقة: ${scenesPerEpisode}\n` +
      `القصة أو السيناريو أو الفكرة:\n${storyPrompt || title}`;

    const response = await generateWithFallback(ai, {
      geminiMode: req.body?.geminiMode,
      contents: userPlanText,
      thinkingLevel: episodeCount > 4 ? ThinkingLevel.LOW : ThinkingLevel.MEDIUM,
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: planSchema,
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const femaleVoices = ['Kore', 'Zephyr'];
    const maleVoices = ['Charon', 'Fenrir', 'Puck'];
    let fIdx = 0;
    let mIdx = 0;

    const rawChars: Array<Record<string, unknown>> = Array.isArray(parsed.characters) ? parsed.characters : [];
    const characters = rawChars.map((ch, idx) => {
      const matchedExisting = existingActors.find(
        (ea) =>
          String(ea.id || '') === String(ch.id || '') ||
          String(ea.name || '').trim() === String(ch.name || '').trim(),
      );
      const va = ch.voiceActor === 'male' || ch.voiceActor === 'child' ? ch.voiceActor : 'female';
      const voiceName = va === 'child' ? 'Puck' : va === 'male' ? maleVoices[mIdx++ % maleVoices.length] : femaleVoices[fIdx++ % femaleVoices.length];
      return {
        id: String(matchedExisting?.id || ch.id || `char-${idx + 1}`),
        name: stripHashSymbols(String(ch.name || `شخصية ${idx + 1}`)),
        role: stripHashSymbols(String(ch.role || 'شخصية رئيسية')),
        age: stripHashSymbols(String(ch.age || 'شاب')),
        faceDesc: stripHashSymbols(String(ch.faceDesc || '')),
        featuresDesc: stripHashSymbols(String(ch.featuresDesc || '')),
        appearanceDesc: stripHashSymbols(String(ch.appearanceDesc || '')),
        outfitDesc: stripHashSymbols(String(ch.outfitDesc || '')),
        hairColor: stripHashSymbols(String(ch.hairColor || 'أسود')),
        primaryColor: typeof ch.primaryColor === 'string' && ch.primaryColor.startsWith('#') ? ch.primaryColor : '#67e8f9',
        secondaryColor: typeof ch.secondaryColor === 'string' && ch.secondaryColor.startsWith('#') ? ch.secondaryColor : '#a78bfa',
        voiceActor: va,
        dialect,
        voiceName: String(matchedExisting?.voiceName || voiceName),
        speakingStyle: stripHashSymbols(String(ch.speakingStyle || genre)),
        movementStyle: stripHashSymbols(String(ch.movementStyle || 'حركة متزنة واثقة')),
        personalityTraits: stripHashSymbols(String(ch.personalityTraits || '')),
        speechPattern: stripHashSymbols(String(ch.speechPattern || '')),
        ...(matchedExisting?.uploadedImageUrl ? { uploadedImageUrl: String(matchedExisting.uploadedImageUrl) } : {}),
        ...(matchedExisting?.avatarSvg ? { avatarSvg: String(matchedExisting.avatarSvg) } : {}),
      };
    });

    const rawEpisodes: Array<Record<string, unknown>> = Array.isArray(parsed.episodes) ? parsed.episodes : [];
    const episodes = rawEpisodes.map((ep, ei) => {
      const rawScenes: Array<Record<string, unknown>> = Array.isArray(ep.scenes) ? ep.scenes : [];
      return {
        episodeNumber: Number(ep.episodeNumber) || ei + 1,
        title: stripHashSymbols(String(ep.title || `الحلقة ${ei + 1}`)),
        synopsis: stripHashSymbols(String(ep.synopsis || '')),
        continuityNotes: stripHashSymbols(String(ep.continuityNotes || '')),
        scenes: rawScenes.map((sc, si) => {
          const rawDiags: Array<Record<string, unknown>> = Array.isArray(sc.dialogues) ? sc.dialogues : [];
          return {
            id: `ep${ei + 1}-sc${si + 1}-${Date.now()}-${si}`,
            episodeNumber: Number(ep.episodeNumber) || ei + 1,
            sceneNumber: Number(sc.sceneNumber) || si + 1,
            title: stripHashSymbols(String(sc.title || `المشهد ${si + 1}`)),
            locationDesc: stripHashSymbols(String(sc.locationDesc || '')),
            visualAction: stripHashSymbols(String(sc.visualAction || '')),
            shotType: String(sc.shotType || 'medium'),
            cameraMotion: String(sc.cameraMotion || (mode === 'documentary' ? 'aerial' : mode === 'trailer' ? 'tracking' : 'zoom_in')),
            lighting: String(sc.lighting || (genre === 'رعب' ? 'horror' : 'cinematic')),
            weather: String(sc.weather || 'clear'),
            timeOfDay: String(sc.timeOfDay || (genre === 'رعب' ? 'night' : 'day')),
            transition: si === 0 ? 'fade_black' : 'crossfade',
            vfxOverlay: String(sc.vfxOverlay || 'none'),
            colorContrast: 1.05,
            colorSaturation: 1.06,
            colorBrightness: 1.0,
            speed: String(sc.cameraMotion) === 'slow_motion' ? 0.75 : 1,
            durationSeconds: defaultDurationSec,
            trimStart: 0,
            trimEnd: defaultDurationSec,
            overlayText: '',
            musicMood,
            musicTrackEnabled: true,
            sfxType: String(sc.sfxType || (genre === 'رعب' ? 'heartbeat' : genre === 'أكشن' ? 'explosion' : 'none')),
            characterIds: Array.isArray(sc.characterIds) ? sc.characterIds.map(String) : characters.slice(0, 2).map((c) => c.id),
            produced: false,
            dialogues: rawDiags.map((dg, di) => ({
              id: `d-${ei + 1}-${si + 1}-${di}`,
              characterId: String(dg.characterId || characters[0]?.id || 'char-1'),
              speakerName: stripHashSymbols(String(dg.speakerName || characters[0]?.name || 'الراوي')),
              text: stripHashSymbols(String(dg.text || '')),
              dialect,
              language: targetLanguage,
            })),
          };
        }),
      };
    });

    return res.json({
      plan: {
        title: stripHashSymbols(title || String(parsed.title || 'عمل زورفيكس السينمائي')),
        logline: stripHashSymbols(String(parsed.logline || storyPrompt)),
        continuityMemory: stripHashSymbols(String(parsed.continuityMemory || continuityMemory || parsed.logline || '')),
        characters,
        episodes,
      },
    });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

app.post('/api/cinema/character-portrait', async (req: Request, res: Response) => {
  try {
    const char = req.body?.character as Record<string, string> | undefined;
    const genre = typeof req.body?.genre === 'string' ? req.body.genre : 'دراما';
    if (!char || !char.name) {
      return res.status(400).json({ error: 'بيانات الشخصية مطلوبة لتوليد صورتها الثابتة.' });
    }
    const ai = getAI();
    const promptBody =
      `صمّم بورتريه شخصية سينمائية واقعية التفاصيل وفائقة الدقة من الصدر إلى الرأس في منتصف لوحة مربعة 512×512 بخلفية شفافة تماماً (بدون مستطيل خلفية يغطي اللوحة!):\n` +
      `الاسم: ${char.name} (${char.role || ''})\n` +
      `العمر والمظهر: ${char.age || 'شاب'}\n` +
      `الوجه والملامح: ${char.appearanceDesc || 'ملامح عربية واضحة ومعبرة'}\n` +
      `الشعر: ${char.hairColor || 'أسود'}\n` +
      `الملابس: ${char.outfitDesc || 'ملابس أنيقة مناسبة للدور'}\n` +
      `النمط السينمائي: ${genre} | الألوان المميزة: ${char.primaryColor || '#67e8f9'}, ${char.secondaryColor || '#a78bfa'}\n` +
      `ارسم العينين بحدقة وبريق واقعي، وتظليل البشرة بثلاث درجات لونية طبيعية، وطيّات الملابس بظلال عميقة وإضاءة حواف سينمائية، واستخدم 12 إلى 18 تدرجاً (<linearGradient>/<radialGradient>) مع إضاءة ناعمة.\n` +
      `أخرج كود <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"> مباشرة فقط بدون خلفية معتمة.`;

    const svg = await generateUltraDetailedSvg(
      ai,
      promptBody,
      'أنت مصمم شخصيات سينمائية عالي الدقة في ZORVYX AI CINEMA. أخرج كود SVG شفاف الخلفية (بدون <rect> خلفية كاملة) للشخصية فقط، بملامح واقعية متقنة وإضاءة استوديو ناعمة (<linearGradient>/<radialGradient>) بدون <script> أو <foreignObject> أو on*.',
      6200,
      '',
      36,
      req.body?.geminiMode,
    );

    if (!svg) {
      return res.status(502).json({ error: 'تعذر توليد صورة الشخصية الثابتة، حاول مرة أخرى.' });
    }
    return res.json({ avatarSvg: svg });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

app.post('/api/cinema/scene-produce', async (req: Request, res: Response) => {
  try {
    const scene = req.body?.scene as Record<string, unknown> | undefined;
    const characters: Array<Record<string, string>> = Array.isArray(req.body?.characters) ? req.body.characters : [];
    const genre = typeof req.body?.genre === 'string' ? req.body.genre : 'دراما';
    const aspectRatio = typeof req.body?.aspectRatio === 'string' ? req.body.aspectRatio : '16:9';
    const referenceImage = typeof req.body?.referenceImage === 'string' ? req.body.referenceImage : '';
    const skipAudio = Boolean(req.body?.skipAudio);

    if (!scene) {
      return res.status(400).json({ error: 'بيانات المشهد غير مكتملة.' });
    }

    const ai = getAI();
    const dims = aspectRatio === '9:16' ? { w: 720, h: 1280 } : aspectRatio === '1:1' ? { w: 1024, h: 1024 } : { w: 1280, h: 720 };
    const refPart = referenceImage ? parseDataUrlPart(referenceImage) : null;

    const backdropPrompt =
      `ارسم خلفية سينمائية فائقة الواقعية والعمق (3 مستويات: خلفية بعيدة، تفاصيل متوسطة، وعناصر أمامية) للمشهد التالي بالأبعاد ${dims.w}×${dims.h} (${aspectRatio}):\n` +
      `عنوان المشهد: ${String(scene.title || '')}\n` +
      `المكان والديكور: ${String(scene.locationDesc || scene.visualAction || 'موقع تصوير سينمائي')}\n` +
      `النوع السينمائي: ${genre} | الإضاءة: ${String(scene.lighting || 'cinematic')} | الوقت: ${String(scene.timeOfDay || 'night')} | الطقس: ${String(scene.weather || 'clear')}\n` +
      `زاوية الكاميرا: ${String(scene.shotType || 'medium')}\n` +
      `اجعل المشهد غنياً بانعكاسات الضوء والظلال الناعمة والأجواء الحقيقية كأفلام السينما العالمية، ولا ترسم الشخصيات نفسها لأن الشخصيات الثابتة ستركب فوق المشهد وتتحرك وتتكلم.\n` +
      `أخرج كود <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}"> مباشرة فقط.`;

    const contents = refPart
      ? [{ role: 'user', parts: [{ inlineData: { mimeType: refPart.mimeType, data: refPart.data } }, { text: backdropPrompt }] }]
      : backdropPrompt;

    const geminiMode = normalizeGeminiMode(req.body?.geminiMode);
    const backdropSvgPromise = generateUltraDetailedSvg(
      ai,
      contents,
      `أنت مدير تصوير وإضاءة سينمائية (Cinematographer) في ZORVYX AI CINEMA. أخرج كود SVG viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}" بـ 16 إلى 24 تدرجاً غنياً وفلاتر ضبابية إضاءة (<linearGradient>/<radialGradient>/<filter>+<feGaussianBlur>) و80 إلى 180 مساراً واقعياً بدون <script> أو <foreignObject> أو <text> أو on* أو تعليقات <!-- -->.`,
      7800,
      String(scene.locationDesc || scene.visualAction || scene.title || ''),
      36,
      geminiMode,
    );

    const rawDialogues = Array.isArray(scene.dialogues) ? (scene.dialogues as Array<Record<string, unknown>>) : [];

    const synthDialoguesPromise = (async (): Promise<Array<Record<string, unknown>>> => {
      if (skipAudio) {
        return rawDialogues.map((dg) => {
          const lineText = stripHashSymbols(String(dg.text || ''));
          return {
            ...dg,
            text: lineText,
            durationSec: Math.max(2, Math.ceil(lineText.split(/\s+/).length * 0.52)),
          };
        });
      }
      const lineTasks = rawDialogues.slice(0, 6).map(async (dg): Promise<Record<string, unknown> | null> => {
        const lineText = stripHashSymbols(String(dg.text || ''));
        if (!lineText) return null;
        const char = characters.find((c) => c.id === String(dg.characterId)) || characters[0];
        const voiceActor = (char?.voiceActor === 'male' || char?.voiceActor === 'child' ? char.voiceActor : 'female') as
          | 'female'
          | 'male'
          | 'child';
        const tts = await synthesizeCinemaVoice(ai, {
          text: lineText,
          voiceActor,
          dialect: String(dg.dialect || char?.dialect || 'fusha'),
          language: String(dg.language || 'العربية'),
          genre,
          preferredVoiceName: char?.voiceName,
        });
        const measured = measureWavSeconds(tts.audioBase64) || Math.max(2, Math.ceil(lineText.split(/\s+/).length * 0.52));
        return {
          ...dg,
          text: lineText,
          ...(tts.audioBase64 ? { audioBase64: tts.audioBase64 } : {}),
          durationSec: measured,
        };
      });
      const settled = await Promise.all(lineTasks);
      return settled.filter((item): item is Record<string, unknown> => item !== null);
    })();

    const [backdropSvg, producedDialogues] = await Promise.all([backdropSvgPromise, synthDialoguesPromise]);

    const totalDialogueSec = producedDialogues.reduce((sum, d) => sum + Number(d.durationSec || 2), 0);
    const requestedDur = Number(scene.durationSeconds) || 8;
    const finalDur = Math.max(requestedDur, totalDialogueSec + 1.5);

    return res.json({
      backdropSvg,
      dialogues: producedDialogues,
      durationSeconds: finalDur,
      produced: true,
    });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

app.post('/api/cinema/dub-line', async (req: Request, res: Response) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const targetLanguage = typeof req.body?.targetLanguage === 'string' ? req.body.targetLanguage.trim() : '';
    const dialect = typeof req.body?.dialect === 'string' ? req.body.dialect : 'fusha';
    const voiceActor = (req.body?.voiceActor === 'male' || req.body?.voiceActor === 'child' ? req.body.voiceActor : 'female') as
      | 'female'
      | 'male'
      | 'child';
    const genre = typeof req.body?.genre === 'string' ? req.body.genre : 'دراما';
    const preferredVoiceName = typeof req.body?.voiceName === 'string' ? req.body.voiceName : undefined;

    if (!text) {
      return res.status(400).json({ error: 'يرجى كتابة نص الحوار أولاً.' });
    }

    const ai = getAI();
    let finalText = stripHashSymbols(text);

    if (targetLanguage) {
      const trRes = await generateWithFallback(ai, {
        geminiMode: req.body?.geminiMode,
        contents: `ترجم أو أعد صياغة هذا الحوار السينمائي بشكل طبيعي ومؤثر إلى (${targetLanguage}) بلهجة/أسلوب (${DIALECT_DIRECTIONS[dialect] || dialect}) مع الحفاظ على الطول التقريبي لمزامنة الشفاه:\n"${finalText}"`,
        systemInstruction: 'أنت مترجم ودبلجة أفلام محترف. أخرج سطر الحوار المترجم مباشرة بدون علامات اقتباس أو شرح إضافي أو علامة #.' + NO_HASH_RULE,
      });
      finalText = stripHashSymbols(trRes.text || finalText).replace(/^["«]|["»]$/g, '');
    }

    const tts = await synthesizeCinemaVoice(ai, {
      text: finalText,
      voiceActor,
      dialect,
      language: targetLanguage || 'العربية',
      genre,
      preferredVoiceName,
    });
    const durationSec = measureWavSeconds(tts.audioBase64) || Math.max(2, Math.ceil(finalText.split(/\s+/).length * 0.52));

    return res.json({
      text: finalText,
      ...(tts.audioBase64 ? { audioBase64: tts.audioBase64 } : {}),
      durationSec,
      voiceName: tts.voiceName,
    });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

app.post('/api/cinema/video-analyze', async (req: Request, res: Response) => {
  try {
    const frames: string[] = Array.isArray(req.body?.frames) ? req.body.frames.slice(0, 3) : [];
    const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction.trim() : '';
    const dubLanguage = typeof req.body?.dubLanguage === 'string' ? req.body.dubLanguage : 'العربية';
    const dialect = typeof req.body?.dialect === 'string' ? req.body.dialect : 'fusha';
    const voiceActor = (req.body?.voiceActor === 'male' || req.body?.voiceActor === 'child' ? req.body.voiceActor : 'female') as
      | 'female'
      | 'male'
      | 'child';

    const parsedParts = frames
      .map((f) => parseDataUrlPart(f))
      .filter((p): p is { mimeType: string; data: string } => p !== null)
      .map((p) => ({ inlineData: { mimeType: p.mimeType, data: p.data } }));

    if (parsedParts.length === 0) {
      return res.status(400).json({ error: 'يرجى اختيار فيديو صالح لاستخراج لقطاته وتحليله.' });
    }

    const ai = getAI();
    const geminiMode = normalizeGeminiMode(req.body?.geminiMode);
    const analysisRes = await generateWithFallback(ai, {
      geminiMode,
      contents: [
        {
          role: 'user',
          parts: [
            ...parsedParts,
            {
              text:
                `حلّل لقطات الفيديو المرفق وطبّق طلب التعديل التالي:\n` +
                `طلب التعديل: "${instruction || 'تحسين جودة الفيديو وإضافة ترجمة وتعليق سينمائي مناسب'}"\n` +
                `لغة الدبلجة/الترجمة المطلوبة: ${dubLanguage} (${DIALECT_DIRECTIONS[dialect] || dialect}).`,
            },
          ],
        },
      ],
      thinkingLevel: ThinkingLevel.LOW,
      systemInstruction:
        'أنت خبير مونتاج وألوان ودبلجة أفلام في ZORVYX AI CINEMA. حلّل الفيديو واقترح خطة تعديل بصرية (lighting: cinematic|horror|neon|golden|natural|romantic, weather: clear|rain|fog|snow|storm|night_stars|sunset) وعنواناً وتعليقاً مدبلجاً/مترجماً متزامناً مع اللقطة بدون علامة #.' +
        NO_HASH_RULE,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sceneTitle: { type: Type.STRING },
          visualSummary: { type: Type.STRING },
          lighting: { type: Type.STRING },
          weather: { type: Type.STRING },
          sfxType: { type: Type.STRING },
          overlayText: { type: Type.STRING },
          dubbingScript: { type: Type.STRING },
          needsBackdropOverlay: { type: Type.BOOLEAN },
        },
        required: ['sceneTitle', 'visualSummary', 'lighting', 'weather', 'sfxType', 'overlayText', 'dubbingScript', 'needsBackdropOverlay'],
      },
    });

    const parsed = JSON.parse((analysisRes.text ?? '{}').trim());
    const dubbingScript = stripHashSymbols(String(parsed.dubbingScript || instruction || parsed.visualSummary || ''));
    const tts = dubbingScript
      ? await synthesizeCinemaVoice(ai, {
          text: dubbingScript,
          voiceActor,
          dialect,
          language: dubLanguage,
          genre: parsed.lighting === 'horror' ? 'رعب' : 'دراما',
        })
      : { audioBase64: undefined, voiceName: 'Kore' };

    let overlaySvg = '';
    if (parsed.needsBackdropOverlay && instruction) {
      overlaySvg = await generateUltraDetailedSvg(
        ai,
        `صمّم طبقة عناصر/تأثيرات بصرية شفاّفة الخلفية (1280×720) تضاف فوق الفيديو لتنفيذ التعديل: "${instruction}". بدون تغطية وسط الفيديو بالكامل حتى تبقى ملامح الفيديو واضحة.`,
        'أنت مصمم مؤثرات بصرية (VFX) في ZORVYX AI. أخرج SVG شفاف الخلفية viewBox="0 0 1280 720" بدون <script> أو <foreignObject> أو on*.',
        2200,
        instruction,
        24,
        geminiMode,
      );
    }

    return res.json({
      analysis: {
        sceneTitle: stripHashSymbols(String(parsed.sceneTitle || 'مقطع معدّل بالذكاء')),
        visualSummary: stripHashSymbols(String(parsed.visualSummary || '')),
        lighting: String(parsed.lighting || 'cinematic'),
        weather: String(parsed.weather || 'clear'),
        sfxType: String(parsed.sfxType || 'none'),
        overlayText: stripHashSymbols(String(parsed.overlayText || '')),
        dubbingScript,
        ...(tts.audioBase64 ? { audioBase64: tts.audioBase64 } : {}),
        ...(overlaySvg ? { overlaySvg } : {}),
      },
    });
  } catch (err) {
    const { status, message } = formatAIError(err);
    return res.status(status).json({ error: message });
  }
});

const DEFAULT_PUBLIC_APP_URL = 'https://ais-pre-j3nrqdg4g5acfqe7yahu2v-1009899216285.europe-west2.run.app';

function normalizePublicUrl(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === 'MY_APP_URL') return '';
  if (/^https?:\/\/localhost\b/i.test(trimmed) || /^https?:\/\/127\.0\.0\.1\b/i.test(trimmed)) {
    return '';
  }
  return trimmed.replace('://ais-dev-', '://ais-pre-');
}

function resolvePublicAppUrl(req?: Request): string {
  const envUrl = normalizePublicUrl(process.env.APP_URL);
  if (req) {
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const host = forwardedHost || String(req.headers.host || '').trim();
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const proto = forwardedProto || (host.includes('localhost') ? 'http' : 'https');
    if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
      const reqUrl = normalizePublicUrl(`${proto}://${host}`);
      if (reqUrl && !host.includes('ais-dev-')) {
        return reqUrl;
      }
      if (reqUrl && !envUrl) {
        return reqUrl;
      }
    }
  }
  return envUrl || DEFAULT_PUBLIC_APP_URL;
}

async function getFixedQrAssets(baseUrl: string) {
  const qrSvg = await QRCode.toString(baseUrl, {
    type: 'svg',
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0b0b19', light: '#ffffff' },
  });
  const qrPng = await QRCode.toDataURL(baseUrl, {
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0b0b19', light: '#ffffff' },
  });
  return {
    shareUrl: baseUrl,
    originUrl: baseUrl,
    sitemapUrl: `${baseUrl}/sitemap.xml`,
    robotsUrl: `${baseUrl}/robots.txt`,
    opensearchUrl: `${baseUrl}/opensearch.xml`,
    qrSvg,
    qrPng,
  };
}

app.get('/api/health', (_req: Request, res: Response) => {
  return res.json({ ok: true, service: 'ZORVYX AI' });
});

app.get('/api/app-info', async (req: Request, res: Response) => {
  try {
    const assets = await getFixedQrAssets(resolvePublicAppUrl(req));
    return res.json(assets);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'تعذر إنشاء الباركود.' });
  }
});

interface StoredExportFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  expiresAt: number;
}

const exportStore = new Map<string, StoredExportFile>();

function pruneExportStore() {
  const now = Date.now();
  for (const [k, item] of exportStore.entries()) {
    if (item.expiresAt <= now) exportStore.delete(k);
  }
  while (exportStore.size > 40) {
    const oldest = exportStore.keys().next().value;
    if (!oldest) break;
    exportStore.delete(oldest);
  }
}

app.post('/api/export-store', (req: Request, res: Response) => {
  try {
    const base64 = typeof req.body?.base64 === 'string' ? req.body.base64.trim() : '';
    const rawName = typeof req.body?.filename === 'string' && req.body.filename.trim() ? req.body.filename.trim() : 'zorvyx-file';
    const mimeType = typeof req.body?.mimeType === 'string' && req.body.mimeType.trim() ? req.body.mimeType.trim() : 'application/octet-stream';
    if (!base64) {
      return res.status(400).json({ error: 'ملف غير صالح.' });
    }
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0 || buffer.length > 15 * 1024 * 1024) {
      return res.status(400).json({ error: 'حجم الملف غير مدعوم للتنزيل.' });
    }
    pruneExportStore();
    const id = crypto.randomBytes(8).toString('hex');
    exportStore.set(id, {
      buffer,
      filename: rawName,
      mimeType,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    const extMatch = rawName.match(/\.[a-z0-9]+$/i);
    const urlSafeName = encodeURIComponent(rawName.replace(/[/\\?%*:|"<>]/g, '-'));
    const fallbackUrlName = `zorvyx-download${extMatch ? extMatch[0].toLowerCase() : ''}`;
    return res.json({
      id,
      url: `/api/export-file/${id}/${urlSafeName || fallbackUrlName}`,
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'تعذر تحضير الملف للتنزيل.' });
  }
});

app.get('/api/export-file/:id/:name', (req: Request, res: Response) => {
  pruneExportStore();
  const id = String(req.params?.id || '');
  const entry = exportStore.get(id);
  if (!entry) {
    return res.status(404).send('انتهت صلاحية رابط الملف، يرجى الضغط على تنزيل مرة أخرى.');
  }
  const extMatch = entry.filename.match(/\.[a-z0-9]+$/i);
  const asciiFallback =
    entry.filename.replace(/[^\x20-\x7E]/g, '').replace(/["\\;/]+/g, '-').trim() ||
    `zorvyx-file${extMatch ? extMatch[0].toLowerCase() : ''}`;
  const utf8Encoded = encodeURIComponent(entry.filename);
  res.setHeader('Content-Type', entry.mimeType);
  res.setHeader('Content-Length', String(entry.buffer.length));
  res.setHeader('Content-Disposition', `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(entry.buffer);
});

app.post('/api/qr', async (req: Request, res: Response) => {
  try {
    const assets = await getFixedQrAssets(resolvePublicAppUrl(req));
    return res.json({ shareUrl: assets.shareUrl, qrSvg: assets.qrSvg, qrPng: assets.qrPng });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'تعذر توليد الباركود.' });
  }
});

app.get('/opensearch.xml', (req: Request, res: Response) => {
  const baseUrl = resolvePublicAppUrl(req);
  res.setHeader('Content-Type', 'application/opensearchdescription+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/" xmlns:moz="http://www.mozilla.org/2006/browser/search/">
  <ShortName>ZORVYX AI</ShortName>
  <LongName>ZORVYX AI – زورفيكس | منصة الذكاء الاصطناعي الشاملة</LongName>
  <Description>ابحث واسأل منصة ZORVYX AI (زورفيكس) للذكاء الاصطناعي مباشرة من شريط البحث في قوقل كروم.</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <OutputEncoding>UTF-8</OutputEncoding>
  <Image width="1024" height="1024" type="image/png">${baseUrl}/assets/aistudio/file_00000000d6f48210967f2a13492a2ae2_cfdde145.png</Image>
  <Image width="64" height="64" type="image/svg+xml">${baseUrl}/icons/icon.svg</Image>
  <Url type="text/html" method="get" template="${baseUrl}/?q={searchTerms}&amp;source=chrome" />
  <moz:SearchForm>${baseUrl}/</moz:SearchForm>
</OpenSearchDescription>`);
});

app.get('/robots.txt', (req: Request, res: Response) => {
  const baseUrl = resolvePublicAppUrl(req);
  res.type('text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.send(
    [
      'User-agent: Googlebot',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /.netlify/',
      '',
      'User-agent: Googlebot-Image',
      'Allow: /',
      '',
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /.netlify/',
      '',
      `Sitemap: ${baseUrl}/sitemap.xml`,
      '',
    ].join('\n'),
  );
});

app.get('/sitemap.xml', (req: Request, res: Response) => {
  const baseUrl = resolvePublicAppUrl(req);
  res.type('application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const toolSlugs = [
    'wellness',
    'tasks',
    'charts',
    'video_explainer',
    'interview',
    'legal',
    'docs',
    'cv',
    'lens',
    'voicechat',
    'writer',
    'learn',
    'translate',
    'summarize',
    'code',
    'marketing',
    'proofread',
    'emails',
    'finance',
  ];
  const toolEntries = toolSlugs
    .map(
      (slug) =>
        `  <url><loc>${baseUrl}/?tool=${slug}</loc><lastmod>2026-11-20</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
    )
    .join('\n');
  return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>2026-11-20</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>${baseUrl}/assets/aistudio/file_00000000d6f48210967f2a13492a2ae2_cfdde145.png</image:loc>
      <image:title>ZORVYX AI – زورفيكس</image:title>
      <image:caption>منصة ZORVYX AI الشاملة للذكاء الاصطناعي</image:caption>
    </image:image>
  </url>
${toolEntries}
</urlset>`);
});

function injectDynamicSeoHtml(html: string, baseUrl: string): string {
  let out = html.split(DEFAULT_PUBLIC_APP_URL).join(baseUrl);
  const verificationToken = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  if (verificationToken && !out.includes('name="google-site-verification"')) {
    out = out.replace(
      '</head>',
      `  <meta name="google-site-verification" content="${verificationToken.replace(/"/g, '&quot;')}" />\n  </head>`,
    );
  }
  return out;
}

async function startServer() {
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use((req: Request, res: Response, next) => {
    if (!req.path.startsWith('/api/')) {
      res.setHeader('X-Robots-Tag', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    }
    next();
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    const cachedIndexHtml = fs.existsSync(indexHtmlPath) ? fs.readFileSync(indexHtmlPath, 'utf-8') : '';
    app.use(express.static(distDir, { index: false }));
    app.get('*', (req: Request, res: Response) => {
      if (cachedIndexHtml) {
        const baseUrl = resolvePublicAppUrl(req);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(injectDynamicSeoHtml(cachedIndexHtml, baseUrl));
      }
      return res.sendFile(indexHtmlPath);
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`ZORVYX AI server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ZORVYX AI server:', err);
  process.exit(1);
});
