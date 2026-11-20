import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import PptxGenJS from 'pptxgenjs';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import type { CvData } from './mediaExport';

function isArabicText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function cleanXmlText(text: string): string {
  return String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/\u200B/g, '');
}

function makeWordParagraph(
  text: string,
  opts: {
    bold?: boolean;
    sizeHalfPt?: number;
    color?: string;
    spacingAfter?: number;
    spacingBefore?: number;
    borderBottomColor?: string;
    rtl?: boolean;
    align?: 'right' | 'left' | 'center';
  } = {},
): Paragraph {
  const rtl = opts.rtl ?? isArabicText(text);
  const alignType =
    opts.align === 'center'
      ? AlignmentType.CENTER
      : opts.align === 'left'
        ? AlignmentType.LEFT
        : rtl
          ? AlignmentType.RIGHT
          : AlignmentType.LEFT;

  return new Paragraph({
    bidirectional: rtl,
    alignment: alignType,
    spacing: {
      before: opts.spacingBefore ?? 0,
      after: opts.spacingAfter ?? 140,
      line: 320,
    },
    ...(opts.borderBottomColor
      ? {
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 8,
              space: 4,
              color: opts.borderBottomColor,
            },
          },
        }
      : {}),
    children: [
      new TextRun({
        text: text || ' ',
        bold: Boolean(opts.bold),
        color: opts.color ?? '1E293B',
        size: opts.sizeHalfPt ?? 22,
        rightToLeft: rtl,
        font: rtl ? 'Tahoma' : 'Arial',
      }),
    ],
  });
}

export async function buildDocxBlob(title: string, bodyText: string): Promise<Blob> {
  const cleanTitle = cleanXmlText(title || '').trim() || 'مستند زورفيكس للذكاء الاصطناعي';
  const cleanBody = cleanXmlText(bodyText || '');
  const rtlDoc = isArabicText(`${cleanTitle}\n${cleanBody}`);
  const lines = cleanBody.replace(/\r\n/g, '\n').split('\n');

  const children: Paragraph[] = [
    makeWordParagraph(cleanTitle, {
      bold: true,
      sizeHalfPt: 34,
      color: '1E1B4B',
      spacingAfter: 200,
      borderBottomColor: '06B6D4',
      rtl: rtlDoc,
    }),
  ];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      children.push(makeWordParagraph('', { spacingAfter: 80, rtl: rtlDoc }));
      continue;
    }
    const lineRtl = isArabicText(trimmed) || rtlDoc;
    const isColonHeading = trimmed.length < 75 && trimmed.endsWith(':');
    const isShortHeading =
      !trimmed.startsWith('•') &&
      !trimmed.startsWith('-') &&
      !/^\d+/.test(trimmed) &&
      i > 0 &&
      trimmed.length < 48 &&
      trimmed.split(/\s+/).length <= 7;

    if (isColonHeading) {
      children.push(
        makeWordParagraph(trimmed, {
          bold: true,
          sizeHalfPt: 26,
          color: '4C1D95',
          spacingBefore: 160,
          spacingAfter: 90,
          rtl: lineRtl,
        }),
      );
    } else if (isShortHeading) {
      children.push(
        makeWordParagraph(trimmed, {
          bold: true,
          sizeHalfPt: 24,
          color: '1E1B4B',
          spacingBefore: 120,
          spacingAfter: 80,
          rtl: lineRtl,
        }),
      );
    } else {
      children.push(
        makeWordParagraph(trimmed, {
          sizeHalfPt: 22,
          color: '1E293B',
          spacingAfter: 120,
          rtl: lineRtl,
        }),
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

export async function buildCvDocxBlob(cv: CvData): Promise<Blob> {
  const fullName = cleanXmlText(cv.fullName ?? '').trim() || 'الاسم الكامل';
  const jobTitle = cleanXmlText(cv.jobTitle ?? '').trim() || 'المسمى الوظيفي';
  const contactLine = [cv.email, cv.phone, cv.location]
    .map((x) => cleanXmlText(x ?? '').trim())
    .filter(Boolean)
    .join('   •   ');
  const allText = `${fullName} ${jobTitle} ${cv.summary ?? ''} ${cv.experience ?? ''} ${cv.education ?? ''} ${cv.skills ?? ''} ${cv.languages ?? ''}`;
  const rtl = isArabicText(allText) || !/[A-Za-z]{4,}/.test(allText);

  const headerParagraphs: Paragraph[] = [
    makeWordParagraph(fullName, {
      bold: true,
      sizeHalfPt: 40,
      color: 'FFFFFF',
      spacingAfter: 60,
      rtl: true,
      align: 'right',
    }),
    makeWordParagraph(jobTitle, {
      bold: true,
      sizeHalfPt: 26,
      color: '67E8F9',
      spacingAfter: 80,
      rtl: true,
      align: 'right',
    }),
  ];

  if (contactLine) {
    headerParagraphs.push(
      makeWordParagraph(contactLine, {
        sizeHalfPt: 20,
        color: 'E2E8F0',
        spacingAfter: 40,
        rtl: true,
        align: 'right',
      }),
    );
  }

  const bannerTable = new Table({
    width: { size: 9746, type: WidthType.DXA },
    columnWidths: [9746],
    visuallyRightToLeft: true,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 9746, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: '1E1B4B', color: 'auto' },
            margins: { top: 240, bottom: 240, left: 260, right: 260 },
            borders: {
              top: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.SINGLE, size: 18, color: '06B6D4' },
            },
            children: headerParagraphs,
          }),
        ],
      }),
    ],
  });

  const bodyElements: Array<Paragraph | Table> = [
    bannerTable,
    makeWordParagraph('', { spacingAfter: 120, rtl: true, align: 'right' }),
  ];

  const addSection = (heading: string, content: string | undefined) => {
    const clean = (content ?? '').trim();
    if (!clean) return;
    bodyElements.push(
      makeWordParagraph(heading, {
        bold: true,
        sizeHalfPt: 26,
        color: '4C1D95',
        spacingBefore: 180,
        spacingAfter: 100,
        borderBottomColor: 'CBD5E1',
        rtl: true,
        align: 'right',
      }),
    );
    for (const ln of cleanXmlText(clean).replace(/\r\n/g, '\n').split('\n')) {
      const t = ln.trim();
      if (!t) continue;
      bodyElements.push(
        makeWordParagraph(t, {
          sizeHalfPt: 22,
          color: '1E293B',
          spacingAfter: 90,
          rtl: true,
          align: 'right',
        }),
      );
    }
  };

  addSection('الملخص المهني', cv.summary);
  addSection('الخبرات العملية', cv.experience);
  addSection('التعليم والمؤهلات', cv.education);
  addSection('المهارات', cv.skills);
  addSection('اللغات', cv.languages);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children: bodyElements,
      },
    ],
  });

  return Packer.toBlob(doc);
}

export async function buildPptxBlob(title: string, rawContent: string): Promise<Blob> {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.rtlMode = true;
  const safeTitle = cleanXmlText(title || '').trim() || 'عرض تقديمي زورفيكس';
  pres.title = safeTitle;
  pres.author = 'زورفيكس للذكاء الاصطناعي';

  const cleanContent = cleanXmlText(rawContent || '');
  const blocks = cleanContent
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const slides = blocks.length > 0 ? blocks : [safeTitle];

  for (let idx = 0; idx < slides.length; idx++) {
    const slideText = slides[idx];
    const parts = slideText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const heading = parts[0] || `${safeTitle} - ${idx + 1}`;
    const bodyLines = parts.slice(1).length > 0 ? parts.slice(1) : [slideText];
    const rtl = isArabicText(slideText);

    const slide = pres.addSlide();
    slide.background = { color: '13112B' };

    slide.addShape(pres.ShapeType.rect, {
      x: 0.6,
      y: 1.48,
      w: 12.13,
      h: 0.04,
      fill: { color: '06B6D4' },
    });

    slide.addText(heading, {
      x: 0.6,
      y: 0.42,
      w: 12.13,
      h: 0.96,
      fontSize: 28,
      bold: true,
      color: '67E8F9',
      fontFace: rtl ? 'Tahoma' : 'Arial',
      align: rtl ? 'right' : 'left',
      rtlMode: rtl,
    });

    slide.addText(bodyLines.join('\n\n'), {
      x: 0.6,
      y: 1.72,
      w: 12.13,
      h: 5.2,
      fontSize: 18,
      color: 'E2E8F0',
      fontFace: rtl ? 'Tahoma' : 'Arial',
      align: rtl ? 'right' : 'left',
      valign: 'top',
      rtlMode: rtl,
      lineSpacingMultiple: 1.35,
    });
  }

  const out = await pres.write({ outputType: 'arraybuffer' });
  const buf = out instanceof ArrayBuffer ? out : new Uint8Array(out as ArrayLike<number>).buffer;
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

export async function buildXlsxBlob(rows: string[][]): Promise<Blob> {
  const safeRows =
    Array.isArray(rows) && rows.length > 0
      ? rows.map((row) =>
          (Array.isArray(row) ? row : [String(row ?? '')]).map((cell) => {
            const trimmed = cleanXmlText(String(cell ?? '')).trim();
            const isNumeric = trimmed !== '' && !Number.isNaN(Number(trimmed)) && !/^0\d+/.test(trimmed);
            return isNumeric ? Number(trimmed) : trimmed;
          }),
        )
      : [['زورفيكس للذكاء الاصطناعي']];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(safeRows);
  ws['!views'] = [{ RTL: true }];

  const colCount = Math.max(...safeRows.map((r) => r.length), 1);
  ws['!cols'] = Array.from({ length: colCount }, (_, ci) => {
    const maxLen = Math.max(...safeRows.map((r) => String(r[ci] ?? '').length), 10);
    return { wch: Math.min(maxLen + 6, 48) };
  });

  XLSX.utils.book_append_sheet(wb, ws, 'زورفيكس');
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function wrapCanvasLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const clean = text.replace(/\r/g, '');
  if (!clean.trim()) return [''];
  const words = clean.split(/\s+/);
  const out: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      out.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  return out;
}

function canvasesToPdfBlob(pages: HTMLCanvasElement[]): Blob {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pages.forEach((canvas, idx) => {
    if (idx > 0) pdf.addPage('a4', 'portrait');
    const imgData = canvas.toDataURL('image/jpeg', 0.94);
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
  });
  const ab = pdf.output('arraybuffer');
  return new Blob([ab], { type: 'application/pdf' });
}

export async function buildPdfBlob(title: string, bodyText: string): Promise<Blob> {
  const W = 1240;
  const H = 1754;
  const marginX = 96;
  const marginTop = 96;
  const marginBottom = 96;
  const maxWidth = W - marginX * 2;
  const rtl = isArabicText(`${title}\n${bodyText}`);

  const createPageCanvas = (pageIndex: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; y: number } => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    // Top decorative rule
    const grad = ctx.createLinearGradient(marginX, 0, W - marginX, 0);
    grad.addColorStop(0, '#5b21b6');
    grad.addColorStop(1, '#06b6d4');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 14);
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = rtl ? 'right' : 'left';
    ctx.textBaseline = 'top';
    let startY = marginTop;

    if (pageIndex === 0) {
      ctx.font = 'bold 40px Tahoma, Arial, sans-serif';
      ctx.fillStyle = '#1e1b4b';
      const titleLines = wrapCanvasLines(ctx, (title || 'مستند زورفيكس للذكاء الاصطناعي').trim(), maxWidth);
      const anchorX = rtl ? W - marginX : marginX;
      for (const tl of titleLines) {
        ctx.fillText(tl, anchorX, startY);
        startY += 54;
      }
      startY += 8;
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(marginX, startY, maxWidth, 3);
      startY += 28;
    }

    return { canvas, ctx, y: startY };
  };

  const pages: HTMLCanvasElement[] = [];
  let page = createPageCanvas(0);
  pages.push(page.canvas);

  const paragraphs = (bodyText || '').replace(/\r\n/g, '\n').split('\n');
  const anchorX = rtl ? W - marginX : marginX;

  for (let i = 0; i < paragraphs.length; i++) {
    const trimmed = paragraphs[i].trim();
    if (!trimmed) {
      page.y += 20;
      continue;
    }
    const isHeading =
      trimmed.endsWith(':') ||
      (i > 0 && !trimmed.startsWith('•') && !trimmed.startsWith('-') && trimmed.length < 46 && trimmed.split(/\s+/).length <= 7);

    page.ctx.font = isHeading ? 'bold 28px Tahoma, Arial, sans-serif' : '24px Tahoma, Arial, sans-serif';
    page.ctx.fillStyle = isHeading ? '#4c1d95' : '#1e293b';
    const lineHeight = isHeading ? 42 : 38;
    const wrapped = wrapCanvasLines(page.ctx, trimmed, maxWidth);

    if (page.y + wrapped.length * lineHeight > H - marginBottom) {
      page = createPageCanvas(pages.length);
      pages.push(page.canvas);
    }
    if (isHeading) page.y += 10;
    page.ctx.font = isHeading ? 'bold 28px Tahoma, Arial, sans-serif' : '24px Tahoma, Arial, sans-serif';
    page.ctx.fillStyle = isHeading ? '#4c1d95' : '#1e293b';
    for (const ln of wrapped) {
      if (page.y + lineHeight > H - marginBottom) {
        page = createPageCanvas(pages.length);
        pages.push(page.canvas);
        page.ctx.font = isHeading ? 'bold 28px Tahoma, Arial, sans-serif' : '24px Tahoma, Arial, sans-serif';
        page.ctx.fillStyle = isHeading ? '#4c1d95' : '#1e293b';
      }
      page.ctx.fillText(ln, anchorX, page.y);
      page.y += lineHeight;
    }
    page.y += 8;
  }

  return canvasesToPdfBlob(pages);
}

export async function buildCvPdfBlob(cv: CvData): Promise<Blob> {
  const W = 1240;
  const H = 1754;
  const marginX = 88;
  const marginBottom = 88;
  const maxWidth = W - marginX * 2;
  const fullName = (cv.fullName ?? '').trim() || 'الاسم الكامل';
  const jobTitle = (cv.jobTitle ?? '').trim() || 'المسمى الوظيفي';
  const contactLine = [cv.email, cv.phone, cv.location].filter((x) => Boolean(x && x.trim())).join('   •   ');

  const createCvPage = (isFirst: boolean): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; y: number } => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    if (!isFirst) {
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(0, 0, W, 14);
      return { canvas, ctx, y: 84 };
    }

    // Header navy indigo banner
    const headerH = contactLine ? 255 : 210;
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(0, 0, W, headerH);
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(0, headerH, W, 8);

    const anchorX = W - marginX;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 46px Tahoma, Arial, sans-serif';
    ctx.fillText(fullName, anchorX, 54);

    ctx.fillStyle = '#67e8f9';
    ctx.font = 'bold 28px Tahoma, Arial, sans-serif';
    ctx.fillText(jobTitle, anchorX, 122);

    if (contactLine) {
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '21px Tahoma, Arial, sans-serif';
      ctx.fillText(contactLine, anchorX, 180);
    }

    return { canvas, ctx, y: headerH + 46 };
  };

  const pages: HTMLCanvasElement[] = [];
  let page = createCvPage(true);
  pages.push(page.canvas);

  const anchorX = W - marginX;
  const sections: Array<[string, string | undefined]> = [
    ['الملخص المهني', cv.summary],
    ['الخبرات العملية', cv.experience],
    ['التعليم والمؤهلات', cv.education],
    ['المهارات', cv.skills],
    ['اللغات', cv.languages],
  ];

  for (const [heading, content] of sections) {
    const clean = (content ?? '').trim();
    if (!clean) continue;

    if (page.y + 90 > H - marginBottom) {
      page = createCvPage(false);
      pages.push(page.canvas);
    }

    // Section heading with cyan right accent bar and subtle rule
    page.ctx.fillStyle = '#06b6d4';
    page.ctx.fillRect(W - marginX - 6, page.y + 2, 6, 30);
    page.ctx.fillStyle = '#4c1d95';
    page.ctx.font = 'bold 28px Tahoma, Arial, sans-serif';
    page.ctx.fillText(heading, W - marginX - 18, page.y);
    page.y += 42;
    page.ctx.fillStyle = '#cbd5e1';
    page.ctx.fillRect(marginX, page.y, maxWidth, 2);
    page.y += 16;

    const rawLines = clean.replace(/\r\n/g, '\n').split('\n');
    for (const rawLine of rawLines) {
      const t = rawLine.trim();
      if (!t) {
        page.y += 12;
        continue;
      }
      page.ctx.font = '23px Tahoma, Arial, sans-serif';
      page.ctx.fillStyle = '#1e293b';
      const wrapped = wrapCanvasLines(page.ctx, t, maxWidth);
      for (const wl of wrapped) {
        if (page.y + 38 > H - marginBottom) {
          page = createCvPage(false);
          pages.push(page.canvas);
          page.ctx.font = '23px Tahoma, Arial, sans-serif';
          page.ctx.fillStyle = '#1e293b';
        }
        page.ctx.fillText(wl, anchorX, page.y);
        page.y += 36;
      }
      page.y += 6;
    }
    page.y += 16;
  }

  return canvasesToPdfBlob(pages);
}
