import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { sanitizeSvgClient, saveBlob, saveDataUrl } from '../utils/mediaExport';

const DEFAULT_PUBLIC_URL = 'https://ais-pre-j3nrqdg4g5acfqe7yahu2v-1009899216285.europe-west2.run.app';

export function ShareQrPanel() {
  const [shareUrl, setShareUrl] = useState(DEFAULT_PUBLIC_URL);
  const [qrSvg, setQrSvg] = useState('');
  const [qrPng, setQrPng] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;

    async function loadAppInfoAndQr() {
      let resolvedUrl = DEFAULT_PUBLIC_URL;
      try {
        const res = await fetch('/api/app-info');
        if (res.ok) {
          const data = await res.json();
          if (!active) return;
          if (data.shareUrl) resolvedUrl = data.shareUrl;
          setShareUrl(resolvedUrl);
          if (data.qrSvg) setQrSvg(data.qrSvg);
          if (data.qrPng) setQrPng(data.qrPng);
          if (data.qrSvg && data.qrPng) return;
        }
      } catch {
        // Fall through to client-side QR generation
      }

      try {
        const [svg, png] = await Promise.all([
          QRCode.toString(resolvedUrl, {
            type: 'svg',
            margin: 2,
            errorCorrectionLevel: 'M',
            color: { dark: '#0b0b19', light: '#ffffff' },
          }),
          QRCode.toDataURL(resolvedUrl, {
            width: 512,
            margin: 2,
            errorCorrectionLevel: 'M',
            color: { dark: '#0b0b19', light: '#ffffff' },
          }),
        ]);
        if (!active) return;
        setQrSvg(svg);
        setQrPng(png);
      } catch {
        // Ignore QR fallback error
      }
    }

    void loadAppInfoAndQr();

    return () => {
      active = false;
    };
  }, []);

  async function copyText(key: string, value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setStatus(`تم نسخ ${label} إلى الحافظة بنجاح.`);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
    } catch {
      setStatus('حددي الرابط وانسخيه يدوياً.');
    }
  }

  async function shareNative() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'ZORVYX AI – زورفيكس | منصة الذكاء الاصطناعي الشاملة',
          text: 'جرّب منصة ZORVYX AI (زورفيكس) للكتابة والتصميم وتوليد المستندات والفيديو',
          url: shareUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      await copyText('share', shareUrl, 'الرابط الدائم');
    }
  }

  return (
    <div className="panel show">
      <h3>الرابط الدائم والباركود</h3>

      <div className="icon-purpose-box">
        <span className="icon-purpose-title">وظيفة هذه الأيقونة</span>
        <span className="icon-purpose-text">
          مخصّصة للحصول على الرابط الدائم ومشاركة باركود تطبيق ZORVYX AI بسهولة.
        </span>
      </div>

      <label className="mini-label" htmlFor="share-link-input">رابط التطبيق الدائم للمشاركة</label>
      <input
        id="share-link-input"
        className="field"
        dir="ltr"
        readOnly
        value={shareUrl}
        onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
      />

      <div className="toolrow" style={{ marginBottom: 16 }}>
        <button type="button" className="primary" onClick={() => copyText('share', shareUrl, 'الرابط الدائم')}>
          {copiedKey === 'share' ? 'تم النسخ ✓' : 'نسخ الرابط'}
        </button>
        <button type="button" className="secondary" onClick={shareNative}>
          مشاركة الرابط
        </button>
      </div>

      <div className="char-sender-box" style={{ marginBottom: 16 }}>
        <strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>كيفية استخدام الباركود</strong>
        <div className="tiny" style={{ lineHeight: 1.9 }}>
          1. افتحي كاميرا الهاتف أو تطبيق قارئ الباركود (QR).<br />
          2. وجّهي الكاميرا مباشرة نحو مربع الباركود الظاهر بالأسفل لمدة ثانيتين.<br />
          3. سيظهر رابط التطبيق على شاشة هاتفك؛ اضغطي عليه لفتح منصة زورفيكس فوراً بدون كتابة العنوان.<br />
          4. يمكنك تنزيل صورة الباركود أو طباعتها لمشاركتها أو مسحها في أي وقت.
        </div>
      </div>

      {qrSvg && (
        <div
          className="media-preview"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}
        >
          <div
            className="qr-card"
            aria-label="باركود تطبيق زورفيكس الثابت"
            dangerouslySetInnerHTML={{ __html: sanitizeSvgClient(qrSvg) }}
          />
          <div className="tiny">وجّهي كاميرا الهاتف نحو هذا الباركود لفتح التطبيق مباشرة</div>
          <div className="toolrow" style={{ justifyContent: 'center' }}>
            {qrPng && (
              <button
                type="button"
                className="primary"
                onClick={() => saveDataUrl(qrPng, 'باركود-زورفيكس.png')}
              >
                تنزيل الباركود (صورة عالية الدقة) ↓
              </button>
            )}
            <button
              type="button"
              className="secondary"
              onClick={() => saveBlob(new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' }), 'باركود-زورفيكس.svg')}
            >
              تنزيل الباركود (ملف رسومي متجه)
            </button>
          </div>
        </div>
      )}

      {status && <div className="statusbox info">{status}</div>}
    </div>
  );
}
