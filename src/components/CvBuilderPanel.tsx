import { useState } from 'react';
import type { CvData } from '../utils/mediaExport';
import { escHtml, safeFileName, saveBlob, stripHashMarks } from '../utils/mediaExport';
import { buildCvDocxBlob, buildCvPdfBlob } from '../utils/officeExport';

interface Props {
  cv: CvData;
  onChange: (next: CvData) => void;
  geminiMode?: 'fast' | 'balanced' | 'pro';
}

export function CvBuilderPanel({ cv, onChange, geminiMode = 'balanced' }: Props) {
  const [aiPrompt, setAiPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  async function generateCvWithAI() {
    if (!aiPrompt.trim() && !cv.fullName.trim()) {
      setStatus('اكتبي نبذة عن تخصصك وخبراتك أو اسمك ومسمّاك الوظيفي ليقوم الذكاء الاصطناعي ببناء السيرة الذاتية.');
      return;
    }
    setLoading(true);
    setStatus('جاري صياغة وتنسيق السيرة الذاتية باحترافية…');
    try {
      const r = await fetch('/api/cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim(), existing: cv, geminiMode }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'تعذر توليد السيرة الذاتية.');
      if (data.cv) {
        const cleanCv: CvData = {
          fullName: stripHashMarks(data.cv.fullName || ''),
          jobTitle: stripHashMarks(data.cv.jobTitle || ''),
          email: stripHashMarks(data.cv.email || ''),
          phone: stripHashMarks(data.cv.phone || ''),
          location: stripHashMarks(data.cv.location || ''),
          summary: stripHashMarks(data.cv.summary || ''),
          experience: stripHashMarks(data.cv.experience || ''),
          education: stripHashMarks(data.cv.education || ''),
          skills: stripHashMarks(data.cv.skills || ''),
          languages: stripHashMarks(data.cv.languages || ''),
        };
        onChange(cleanCv);
        setStatus('تم إنشاء وتنسيق السيرة الذاتية وحفظها بنجاح!');
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'حدث خطأ أثناء إنشاء السيرة الذاتية.');
    } finally {
      setLoading(false);
    }
  }

  function buildCvHtmlDocument(): string {
    return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escHtml(cv.fullName || 'السيرة الذاتية')}</title>
<style>
  body { font-family: Tahoma, Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 36px; line-height: 1.8; }
  .sheet { max-width: 820px; margin: auto; background: #fff; padding: 40px; border-radius: 12px; border-top: 8px solid #5b21b6; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
  h1 { margin: 0; font-size: 28px; color: #1e1b4b; }
  .role { font-size: 16px; color: #5b21b6; font-weight: bold; margin: 4px 0 12px; }
  .meta { font-size: 13px; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 20px; }
  h2 { font-size: 16px; color: #1e1b4b; border-right: 4px solid #06b6d4; padding-right: 10px; margin: 22px 0 8px; }
  p, div.sec { white-space: pre-wrap; font-size: 14px; color: #334155; margin: 0; }
</style>
</head>
<body>
  <div class="sheet">
    <h1>${escHtml(cv.fullName || 'الاسم الكامل')}</h1>
    <div class="role">${escHtml(cv.jobTitle || 'المسمى الوظيفي')}</div>
    <div class="meta">${escHtml([cv.email, cv.phone, cv.location].filter(Boolean).join(' • '))}</div>
    ${cv.summary ? `<h2>الملخص المهني</h2><p>${escHtml(cv.summary)}</p>` : ''}
    ${cv.experience ? `<h2>الخبرات العملية</h2><div class="sec">${escHtml(cv.experience)}</div>` : ''}
    ${cv.education ? `<h2>التعليم والمؤهلات</h2><div class="sec">${escHtml(cv.education)}</div>` : ''}
    ${cv.skills ? `<h2>المهارات</h2><p>${escHtml(cv.skills)}</p>` : ''}
    ${cv.languages ? `<h2>اللغات</h2><p>${escHtml(cv.languages)}</p>` : ''}
  </div>
</body>
</html>`;
  }

  async function downloadCvWord() {
    if (!cv.fullName.trim() && !cv.summary.trim()) {
      setStatus('املئي بيانات السيرة الذاتية أو ولّديها بالذكاء الاصطناعي أولاً.');
      return;
    }
    try {
      setStatus('جاري تجهيز ملف السيرة الذاتية بصيغة المستند الاحترافي…');
      const docxBlob = await buildCvDocxBlob(cv);
      saveBlob(docxBlob, `${safeFileName(cv.fullName || 'السيرة-الذاتية')}.docx`);
      setStatus('تم تنزيل السيرة الذاتية بصيغة المستند الاحترافي جاهزة للنشر بنجاح!');
    } catch {
      setStatus('تعذر إنشاء ملف المستند، جربي مرة أخرى.');
    }
  }

  function downloadCvHtml() {
    if (!cv.fullName.trim() && !cv.summary.trim()) {
      setStatus('املئي بيانات السيرة الذاتية أو ولّديها بالذكاء الاصطناعي أولاً.');
      return;
    }
    const html = buildCvHtmlDocument();
    saveBlob(
      new Blob([html], { type: 'text/html;charset=utf-8' }),
      `${safeFileName(cv.fullName || 'السيرة-الذاتية')}.html`,
    );
    setStatus('تم تنزيل السيرة الذاتية بصيغة صفحة ويب تفاعلية بنجاح.');
  }

  async function downloadCvPdf() {
    if (!cv.fullName.trim() && !cv.summary.trim() && !cv.experience.trim()) {
      setStatus('املئي بيانات السيرة الذاتية أو ولّديها بالذكاء الاصطناعي أولاً.');
      return;
    }
    try {
      setStatus('جاري تجهيز السيرة الذاتية بصيغة ملف الطباعة الثابت…');
      const pdfBlob = await buildCvPdfBlob(cv);
      saveBlob(pdfBlob, `${safeFileName(cv.fullName || 'السيرة-الذاتية')}.pdf`);
      setStatus('تم تنزيل السيرة الذاتية بصيغة ملف الطباعة الثابت بنجاح وهي جاهزة للنشر والمشاركة!');
    } catch {
      setStatus('تعذر إنشاء ملف الطباعة الثابت، يرجى المحاولة مرة أخرى.');
    }
  }

  return (
    <div id="cvControls">
      <label className="mini-label" htmlFor="cvAiPrompt">
        إنشاء أو تحسين السيرة الذاتية بالذكاء الاصطناعي
      </label>
      <div className="toolrow">
        <input
          id="cvAiPrompt"
          className="field"
          style={{ flex: 1, margin: 0 }}
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder="مثال: اسمي سارة، مصممة جرافيك خبرة 4 سنوات في الهويات البصرية ومقرّي عمّان..."
        />
        <button type="button" className="primary" disabled={loading} onClick={generateCvWithAI}>
          {loading ? 'جاري الإنشاء…' : 'إنشاء السيرة بالذكاء الاصطناعي ✨'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10 }}>
        <div>
          <label className="mini-label" htmlFor="cvFullName">الاسم الكامل</label>
          <input
            id="cvFullName"
            className="field"
            value={cv.fullName}
            onChange={(e) => onChange({ ...cv, fullName: e.target.value })}
            placeholder="الاسم الكامل"
          />
        </div>
        <div>
          <label className="mini-label" htmlFor="cvJobTitle">المسمى الوظيفي</label>
          <input
            id="cvJobTitle"
            className="field"
            value={cv.jobTitle}
            onChange={(e) => onChange({ ...cv, jobTitle: e.target.value })}
            placeholder="مثال: مطوّرة واجهات أمامية"
          />
        </div>
        <div>
          <label className="mini-label" htmlFor="cvEmail">البريد الإلكتروني</label>
          <input
            id="cvEmail"
            className="field"
            value={cv.email}
            onChange={(e) => onChange({ ...cv, email: e.target.value })}
            placeholder="مثال: البريد الإلكتروني الشخصي"
          />
        </div>
        <div>
          <label className="mini-label" htmlFor="cvPhone">رقم الهاتف</label>
          <input
            id="cvPhone"
            className="field"
            value={cv.phone}
            onChange={(e) => onChange({ ...cv, phone: e.target.value })}
            placeholder="مثال: ٠٧٩٠٠٠٠٠٠٠+"
          />
        </div>
      </div>

      <label className="mini-label" htmlFor="cvLocation">المدينة / الدولة</label>
      <input
        id="cvLocation"
        className="field"
        value={cv.location}
        onChange={(e) => onChange({ ...cv, location: e.target.value })}
        placeholder="المدينة، الدولة"
      />

      <label className="mini-label" htmlFor="cvSummary">الملخص المهني</label>
      <textarea
        id="cvSummary"
        className="field"
        value={cv.summary}
        onChange={(e) => onChange({ ...cv, summary: e.target.value })}
        placeholder="نبذة احترافية عن خبراتك وأهدافك..."
        style={{ minHeight: 88 }}
      />

      <label className="mini-label" htmlFor="cvExp">الخبرات العملية</label>
      <textarea
        id="cvExp"
        className="field"
        value={cv.experience}
        onChange={(e) => onChange({ ...cv, experience: e.target.value })}
        placeholder="الوظائف السابقة والإنجازات..."
        style={{ minHeight: 110 }}
      />

      <label className="mini-label" htmlFor="cvEdu">التعليم والمؤهلات</label>
      <textarea
        id="cvEdu"
        className="field"
        value={cv.education}
        onChange={(e) => onChange({ ...cv, education: e.target.value })}
        placeholder="الشهادة الجامعية والدورات..."
        style={{ minHeight: 80 }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <div>
          <label className="mini-label" htmlFor="cvSkills">المهارات</label>
          <input
            id="cvSkills"
            className="field"
            value={cv.skills}
            onChange={(e) => onChange({ ...cv, skills: e.target.value })}
            placeholder="التصميم، القيادة، التحليل..."
          />
        </div>
        <div>
          <label className="mini-label" htmlFor="cvLangs">اللغات</label>
          <input
            id="cvLangs"
            className="field"
            value={cv.languages}
            onChange={(e) => onChange({ ...cv, languages: e.target.value })}
            placeholder="العربية (اللغة الأم)، الإنجليزية (ممتاز)"
          />
        </div>
      </div>

      <div className="toolrow" style={{ marginTop: 8 }}>
        <button type="button" className="primary" onClick={downloadCvWord}>
          تنزيل السيرة الذاتية كمستند وورد ↓
        </button>
        <button type="button" className="secondary" onClick={downloadCvPdf}>
          تنزيل كملف طباعة ثابت ↓
        </button>
        <button type="button" className="secondary" onClick={downloadCvHtml}>
          تنزيل كصفحة ويب تفاعلية ↓
        </button>
      </div>

      {status && <div className="statusbox info">{status}</div>}

      {(cv.fullName || cv.summary || cv.experience) && (
        <div className="cv-preview-card">
          <div className="cv-preview-head">
            <h4>{cv.fullName || 'الاسم الكامل'}</h4>
            <div className="cv-preview-role">{cv.jobTitle}</div>
            <div className="tiny">{[cv.email, cv.phone, cv.location].filter(Boolean).join(' • ')}</div>
          </div>
          {cv.summary && (
            <div className="cv-preview-sec">
              <strong>الملخص المهني</strong>
              <p>{cv.summary}</p>
            </div>
          )}
          {cv.experience && (
            <div className="cv-preview-sec">
              <strong>الخبرات العملية</strong>
              <p>{cv.experience}</p>
            </div>
          )}
          {cv.education && (
            <div className="cv-preview-sec">
              <strong>التعليم والمؤهلات</strong>
              <p>{cv.education}</p>
            </div>
          )}
          {cv.skills && (
            <div className="cv-preview-sec">
              <strong>المهارات</strong>
              <p>{cv.skills}</p>
            </div>
          )}
          {cv.languages && (
            <div className="cv-preview-sec">
              <strong>اللغات</strong>
              <p>{cv.languages}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
