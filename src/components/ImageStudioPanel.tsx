import type { RefObject } from 'react';
import { Image as ImageIcon, Sparkles, Upload, Wand2, Layers, Eraser } from 'lucide-react';
import type { ArtSpec, ImageAspectRatio } from '../utils/mediaExport';
import {
  IMAGE_ASPECT_OPTIONS,
  IMAGE_CAMERA_OPTIONS,
  IMAGE_LIGHTING_OPTIONS,
  IMAGE_STYLE_OPTIONS,
} from '../utils/mediaExport';
import { AiArtworkCanvas } from './AiArtworkCanvas';

interface Props {
  studioMode: 'image' | 'edit_image';
  studioTheme: 'night' | 'day';
  geminiMode: 'fast' | 'balanced' | 'pro';
  mediaPrompt: string;
  onMediaPromptChange: (val: string) => void;
  mediaReferenceImage: string;
  onClearReferenceImage: () => void;
  onReferenceFilesSelect: (files: FileList | null) => void;
  mediaRefFileInputRef: RefObject<HTMLInputElement | null>;
  imageAspectRatio: ImageAspectRatio;
  onAspectRatioChange: (ar: ImageAspectRatio) => void;
  imageStyle: string;
  onStyleChange: (st: string) => void;
  imageLighting: string;
  onLightingChange: (lt: string) => void;
  imageCamera: string;
  onCameraChange: (cam: string) => void;
  imageNegativePrompt: string;
  onNegativePromptChange: (neg: string) => void;
  enhancingPrompt: boolean;
  onEnhancePrompt: () => void;
  mediaLoading: boolean;
  onGenerateMedia: () => void;
  mediaStatus: string;
  generatedArtwork: ArtSpec | null;
  onEditArtwork: (art: ArtSpec) => void;
  onSendToVideo?: (art: ArtSpec) => void;
}

const IMAGE_STARTERS = [
  {
    label: 'زجاجة عطر فاخرة',
    prompt: 'زجاجة عطر زجاجية فاخرة بنقوش ذهبية على صخرة رخامية داكنة محاطة برذاذ الماء وإضاءة استوديو درامية فخمة',
    style: IMAGE_STYLE_OPTIONS[1],
    aspect: '3:4' as ImageAspectRatio,
  },
  {
    label: 'بورتريه سينمائي',
    prompt: 'بورتريه فني لشخصية عربية بملامح عميقة ونظرة واثقة تحت إضاءة الساعة الذهبية الناعمة مع عزل احترافي للخلفية',
    style: IMAGE_STYLE_OPTIONS[6],
    aspect: '3:4' as ImageAspectRatio,
  },
  {
    label: 'مدينة عربية مستقبلية',
    prompt: 'مدينة عربية مستقبلية مذهلة تجمع بين الأقواس التراثية والأبراج المضيئة بتوهج أزرق سماوي عند الغسق',
    style: IMAGE_STYLE_OPTIONS[7],
    aspect: '16:9' as ImageAspectRatio,
  },
  {
    label: 'شعار وهوية فاخرة',
    prompt: 'شعار وهوية بصرية فاخرة متقنة لعلامة تجارية عربية باللونين الذهبي والكحلي العميق بتوازن هندسي أنيق',
    style: IMAGE_STYLE_OPTIONS[3],
    aspect: '1:1' as ImageAspectRatio,
  },
];

const EDIT_STARTERS = [
  {
    label: 'إزالة الخلفية (شفاف)',
    prompt: 'إزالة الخلفية وتفريغ العنصر تماماً مع خلفية شفافة',
  },
  {
    label: 'خلفية غروب سينمائي',
    prompt: 'تغيير الخلفية إلى طبيعة سينمائية وقت الغروب مع إضاءة دافئة وعزل ناعم للخلفية',
  },
  {
    label: 'رفع الدقة 4K والتصفية',
    prompt: 'رفع الدقة وتوضيح التفاصيل الدقيقة وإزالة الضوضاء والتشويش بلمسة استوديو احترافية',
  },
  {
    label: 'إضاءة استوديو متوازنة',
    prompt: 'تحسين الإضاءة والظلال وإضافة توهج استوديو متوازن مع الحفاظ التام على الملامح الأصلية',
  },
];

export function ImageStudioPanel({
  studioMode,
  studioTheme,
  geminiMode,
  mediaPrompt,
  onMediaPromptChange,
  mediaReferenceImage,
  onClearReferenceImage,
  onReferenceFilesSelect,
  mediaRefFileInputRef,
  imageAspectRatio,
  onAspectRatioChange,
  imageStyle,
  onStyleChange,
  imageLighting,
  onLightingChange,
  imageCamera,
  onCameraChange,
  imageNegativePrompt,
  onNegativePromptChange,
  enhancingPrompt,
  onEnhancePrompt,
  mediaLoading,
  onGenerateMedia,
  mediaStatus,
  generatedArtwork,
  onEditArtwork,
  onSendToVideo,
}: Props) {
  const isEdit = studioMode === 'edit_image';

  return (
    <div className="wb-split-grid">
      {/* Right Control Rail */}
      <aside className="wb-rail">
        {/* Source / Reference Image Dropzone */}
        <div className="wb-dropzone">
          <div className="wb-row-between">
            <div>
              <strong style={{ fontSize: 13 }}>
                {isEdit ? 'الصورة الأصلية للتعديل' : 'صورة مرجعية للتصميم (اختياري)'}
              </strong>
              <div className="wb-meta-line">
                {isEdit
                  ? 'مطلوب للتفريغ أو تغيير الخلفية أو التنقيح'
                  : 'أرفقي صورة لإعادة رسمها أو دمج عناصرها'}
              </div>
            </div>
            <div className="toolrow" style={{ margin: 0 }}>
              <input
                ref={mediaRefFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => onReferenceFilesSelect(e.target.files)}
              />
              <button
                type="button"
                className="secondary"
                onClick={() => mediaRefFileInputRef.current?.click()}
              >
                <Upload size={14} />
                {mediaReferenceImage ? 'تغيير' : isEdit ? 'اختيار صورة' : 'إرفاق +'}
              </button>
              {mediaReferenceImage && (
                <button
                  type="button"
                  className="mini-btn danger"
                  onClick={onClearReferenceImage}
                >
                  حذف
                </button>
              )}
            </div>
          </div>

          {mediaReferenceImage && (
            <img
              src={mediaReferenceImage}
              alt="الصورة المرفقة"
              className="wb-dropzone-thumb"
            />
          )}
        </div>

        <hr className="wb-hr" />

        {/* Quick Actions / Starters */}
        <div className="wb-section">
          <div className="wb-row-between">
            <span className="mini-label" style={{ margin: 0 }}>
              {isEdit ? 'أدوات التعديل الفوري' : 'قوالب تصميم سريعة'}
            </span>
            <span className="wb-meta-line">
              {geminiMode === 'fast' ? 'وضع فلاش السريع' : geminiMode === 'pro' ? 'وضع التفكير العميق' : 'وضع التوازن'}
            </span>
          </div>

          {isEdit ? (
            <div className="wb-quick-list">
              {EDIT_STARTERS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={`wb-quick-btn ${mediaPrompt === item.prompt ? 'active' : ''}`}
                  onClick={() => onMediaPromptChange(item.prompt)}
                >
                  <Eraser size={13} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="wb-quick-list">
              {IMAGE_STARTERS.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  className={`wb-quick-btn ${mediaPrompt === tpl.prompt ? 'active' : ''}`}
                  onClick={() => {
                    onMediaPromptChange(tpl.prompt);
                    onStyleChange(tpl.style);
                    onAspectRatioChange(tpl.aspect);
                  }}
                >
                  <Sparkles size={13} />
                  <span>{tpl.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <hr className="wb-hr" />

        {/* Aspect Ratio Segmented Selector */}
        <div className="wb-section">
          <label className="mini-label" style={{ margin: 0 }}>الأبعاد والقياس</label>
          <div className="wb-segmented" role="group" aria-label="الأبعاد والقياس">
            {IMAGE_ASPECT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`wb-seg-btn ${imageAspectRatio === opt.value ? 'active' : ''}`}
                onClick={() => onAspectRatioChange(opt.value)}
              >
                {opt.value}
              </button>
            ))}
          </div>
        </div>

        {/* Prompt Input + Gemini Prompt Enhancer */}
        <div className="wb-section">
          <div className="wb-row-between">
            <label className="mini-label" htmlFor="mediaprompt" style={{ margin: 0 }}>
              {isEdit ? 'وصف التعديل المطلوب' : 'وصف التصميم الدقيق'}
            </label>
            <button
              type="button"
              className="mini-btn"
              disabled={enhancingPrompt}
              onClick={onEnhancePrompt}
            >
              <Wand2 size={12} style={{ display: 'inline', marginLeft: 4 }} />
              {enhancingPrompt ? 'جاري التطوير…' : 'تحسين الوصف ذكياً'}
            </button>
          </div>

          <textarea
            id="mediaprompt"
            className="field"
            style={{ minHeight: 112, margin: '4px 0 0' }}
            value={mediaPrompt}
            onChange={(e) => onMediaPromptChange(e.target.value)}
            placeholder={
              isEdit
                ? 'مثال: أزل الخلفية واجعلها استوديو ناعم، أو غيّرها لغروب سينمائي مع تحسين إضاءة الوجه...'
                : 'صفي المشهد والشخصية والألوان والإضاءة بدقة فائقة...'
            }
          />
        </div>

        {/* Style & Optics Parameters */}
        <div className="wb-grid-2">
          <div>
            <label className="mini-label">الأسلوب الفني</label>
            <select
              className="field"
              style={{ marginTop: 4, marginBottom: 0 }}
              value={imageStyle}
              onChange={(e) => onStyleChange(e.target.value)}
            >
              {IMAGE_STYLE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mini-label">الإضاءة والجو</label>
            <select
              className="field"
              style={{ marginTop: 4, marginBottom: 0 }}
              value={imageLighting}
              onChange={(e) => onLightingChange(e.target.value)}
            >
              {IMAGE_LIGHTING_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mini-label">زاوية الكاميرا والعدسة</label>
          <select
            className="field"
            style={{ marginTop: 4, marginBottom: 0 }}
            value={imageCamera}
            onChange={(e) => onCameraChange(e.target.value)}
          >
            {IMAGE_CAMERA_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mini-label" htmlFor="negativeprompt">عناصر مستبعدة (اختياري)</label>
          <input
            id="negativeprompt"
            className="field"
            style={{ marginTop: 4, marginBottom: 0 }}
            value={imageNegativePrompt}
            onChange={(e) => onNegativePromptChange(e.target.value)}
            placeholder="تشويش، نصوص عشوائية، ألوان باهتة..."
          />
        </div>

        {/* Primary CTA */}
        <button
          type="button"
          className="primary"
          style={{ width: '100%', justifyContent: 'center', minHeight: 46 }}
          disabled={mediaLoading}
          onClick={onGenerateMedia}
        >
          <Sparkles size={16} />
          {mediaLoading
            ? 'جاري التنفيذ بمحرك ZORVYX AI…'
            : isEdit
              ? 'تطبيق التعديل الاحترافي الآن'
              : 'إنشاء الصورة الاحترافية الآن'}
        </button>

        {mediaStatus && (
          <div className="statusbox info" id="mediastatus" style={{ marginTop: 0 }}>
            {mediaStatus}
          </div>
        )}
      </aside>

      {/* Left Live Canvas Stage */}
      <section className="wb-stage">
        {generatedArtwork ? (
          <AiArtworkCanvas
            artwork={generatedArtwork}
            studioTheme={studioTheme}
            onEditArtwork={onEditArtwork}
            onSendToVideo={onSendToVideo}
          />
        ) : (
          <div className="wb-empty-stage">
            <div className="wb-empty-icon">
              {isEdit ? <Layers size={26} /> : <ImageIcon size={26} />}
            </div>
            <h4>
              {isEdit
                ? 'منصة التعديل والمعالجة الاحترافية'
                : 'منصة التصميم والصور فائقة الدقة'}
            </h4>
            <p>
              {isEdit
                ? 'ارفقي صورتك من اللوحة الجانبية واكتبي التعديل المطلوب (تفريغ خلفية، استبدال مشهد، إزالة تشويش، إضاءة استوديو) وستظهر النتيجة هنا مع شريط مقارنة تفاعلي فوري.'
                : 'اختاري قياس اللوحة والأسلوب الفني واكتبي وصفك أو جرّبي أحد القوالب الجاهزة؛ وستُعرض اللوحة بدقة عالية مع 8 قنوات ضبط وتصدير متعدد الصيغ.'}
            </p>
            <div className="wb-meta-line">
              4 طبقات إضاءة · 8 قنوات معالجة حية · مقارنة سحب أصل/تعديل · تصدير PNG وJPG وSVG
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
