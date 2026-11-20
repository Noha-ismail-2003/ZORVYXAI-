import { type CSSProperties, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpenCheck,
  Bot,
  BriefcaseBusiness,
  CalendarCheck,
  Camera,
  Check,
  Code2,
  Copy,
  Download,
  FilePlus2,
  FileText,
  GraduationCap,
  HeartPulse,
  Home,
  IdCard,
  ImagePlus,
  Languages,
  Lightbulb,
  ListChecks,
  MailCheck,
  Megaphone,
  Menu,
  Palette,
  PenLine,
  Plus,
  QrCode,
  Scale,
  ScanEye,
  Sparkles,
  SpellCheck,
  Trash2,
  Video,
  Volume2,
  Wallet,
  X,
} from 'lucide-react';
import { AiArtworkCanvas } from './components/AiArtworkCanvas';
import { CvBuilderPanel } from './components/CvBuilderPanel';
import { DailyTasksPanel } from './components/DailyTasksPanel';
import { ShareQrPanel } from './components/ShareQrPanel';
import { SmartChartsPanel } from './components/SmartChartsPanel';
import { TopicVideoExplainerPanel } from './components/TopicVideoExplainerPanel';
import { VoiceChatPanel } from './components/VoiceChatPanel';
import type { ChatMessage, CvData } from './utils/mediaExport';
import {
  escHtml,
  fileToResizedDataUrl,
  safeFileName,
  saveBlob,
  stripHashMarks,
} from './utils/mediaExport';
import { buildDocxBlob, buildPdfBlob, buildPptxBlob, buildXlsxBlob } from './utils/officeExport';

type ToolKey =
  | 'writer'
  | 'learn'
  | 'ideas'
  | 'plan'
  | 'design'
  | 'translate'
  | 'summarize'
  | 'code'
  | 'marketing'
  | 'proofread'
  | 'emails'
  | 'finance'
  | 'interview'
  | 'legal'
  | 'wellness';
type ChatChannelKey = 'general' | ToolKey;
type FeatureKey = 'docs' | 'cv' | 'lens' | 'voicechat' | 'tasks' | 'charts' | 'video_explainer';
type ViewMode = 'home' | 'tool' | 'feature' | 'qr';

interface FeatureHistoryItem {
  id: string;
  prompt: string;
  createdAt: number;
  docType?: string;
  docName?: string;
  docContent?: string;
  lensImageDataUrl?: string;
  lensAnswer?: string;
}

const CHATS_STORAGE_KEY = 'zorvyx_chats_v1';
const FEATURES_STORAGE_KEY = 'zorvyx_features_v1';
const CV_STORAGE_KEY = 'zorvyx_cv_v1';

const EMPTY_CV: CvData = {
  fullName: '',
  jobTitle: '',
  email: '',
  phone: '',
  location: '',
  summary: '',
  experience: '',
  education: '',
  skills: '',
  languages: '',
};

const TOOLS: Record<ToolKey, [string, string]> = {
  writer: ['الكتابة والصياغة', 'متخصصة فقط في كتابة المقالات والقصص والنصوص الإبداعية وإعادة صياغتها.'],
  learn: ['التعلّم والشرح', 'متخصصة فقط في شرح الدروس والمفاهيم العلمية والأكاديمية بأسلوب مبسط وأمثلة.'],
  ideas: ['الأفكار والإبداع', 'متخصصة فقط في توليد أفكار المشاريع والتسميات الإبداعية والعصف الذهني.'],
  plan: ['التخطيط والتنظيم', 'متخصصة فقط في بناء الخطط العملية والجداول الزمنية وتقسيم الأهداف.'],
  design: ['مساعد التصميم', 'متخصصة فقط في الهوية البصرية والألوان والشعارات والبوسترات مع توليد نموذج بصري فوري.'],
  translate: ['الترجمة', 'متخصصة فقط في ترجمة النصوص والصور بدقة إلى اللغة التي تختارها.'],
  summarize: ['المُلخِّص الذكي', 'متخصصة فقط في تلخيص المقالات والكتب والاجتماعات الطويلة في نقاط مركّزة.'],
  code: ['المُبرمج والمُطوّر الذكي', 'متخصصة فقط في كتابة الأكواد البرمجية وإصلاح الأخطاء ومعادلات Excel.'],
  marketing: ['خبير التسويق والمحتوى', 'متخصصة فقط في الإعلانات المقنعة وخطط المحتوى وحملات زيادة المبيعات.'],
  proofread: ['المُصحِّح والتدقيق اللغوي', 'متخصصة فقط في التدقيق الإملائي والنحوي وضبط علامات الترقيم وتصحيح النصوص المرفقة.'],
  emails: ['الإيميلات والرسائل الرسمية', 'متخصصة فقط في صياغة الرسائل والإيميلات الوظيفية والتجارية والرسمية باحترافية.'],
  finance: ['المُستشار المالي والميزانية', 'متخصصة فقط في تنظيم الميزانية الشهرية وتوزيع المصاريف وخطط الادخار والحسابات المالية.'],
  interview: ['مُدرّب المقابلات الوظيفية', 'متخصصة فقط في التحضير لمقابلات العمل وأسئلة التوظيف وتقييم الإجابات بأسلوب STAR.'],
  legal: ['الصياغة القانونية والعقود', 'متخصصة فقط في صياغة ومراجعة مسودات العقود والاتفاقيات وشرح البنود القانونية.'],
  wellness: ['مستشار الصحة والتغذية واللياقة', 'متخصصة فقط في خطط التغذية الصحية، السعرات الحرارية، التمارين الرياضية، والنوم الصحي.'],
};

const FEATURE_INFO: Record<FeatureKey, [string, string, FeatureKey]> = {
  tasks: ['المهام اليومية', 'أداة متخصصة لمتابعة وإدارة مهامك اليومية بالصوت أو الإضافة السريعة أو الترتيب الذكي ليومك.', 'tasks'],
  charts: ['الرسم البياني الذكي', 'أداة متخصصة لتحويل أي أرقام أو مقارنات أو مواضيع إحصائية إلى رسوم بيانية تفاعلية جاهزة للتنزيل.', 'charts'],
  video_explainer: ['شرح الموضوع بفيديو', 'اكتبي أي موضوع معرفي أو علمي وسأحوّله إلى فيديو تفاعلي كامل يشرح الموضوع من بدايته حتى نهايته.', 'video_explainer'],
  docs: ['إنشاء المستندات والملفات', 'اكتبي المحتوى أو ولّديه بالذكاء الاصطناعي لتنزيل مستندات Word وPDF وPowerPoint وExcel وCSV وHTML.', 'docs'],
  cv: ['إنشاء سيرة ذاتية', 'صمّمي سيرتك الذاتية باحترافية بالذكاء الاصطناعي مع معاينة فورية وتنزيل ملف جاهز.', 'cv'],
  lens: ['العدسة الذكية', 'صوّري بالكاميرا أو ارفعي أي صورة، واكتبي تحتها ما تريدين حله أو معرفته ليحلّلها ZORVYX AI فوراً.', 'lens'],
  voicechat: ['المُتحدّث الصوتي الذكي', 'مخصّصة للاستماع الفوري دون أذونات؛ اكتبي سؤالك أو اطلبي التعريف بالنفس ليتحدث إليك زورفيكس بصوته الطبيعي.', 'voicechat'],
};

function createEmptyChats(): Record<ChatChannelKey, ChatMessage[]> {
  return {
    general: [],
    writer: [],
    learn: [],
    ideas: [],
    plan: [],
    design: [],
    translate: [],
    summarize: [],
    code: [],
    marketing: [],
    proofread: [],
    emails: [],
    finance: [],
    interview: [],
    legal: [],
    wellness: [],
  };
}

function createEmptyFeatureHistory(): Record<FeatureKey, FeatureHistoryItem[]> {
  return {
    tasks: [],
    charts: [],
    video_explainer: [],
    docs: [],
    cv: [],
    lens: [],
    voicechat: [],
  };
}

function loadSavedCv(): CvData {
  try {
    const raw = localStorage.getItem(CV_STORAGE_KEY);
    if (!raw) return EMPTY_CV;
    return { ...EMPTY_CV, ...JSON.parse(raw) };
  } catch {
    return EMPTY_CV;
  }
}

function loadSavedChats(): Record<ChatChannelKey, ChatMessage[]> {
  try {
    const raw = localStorage.getItem(CHATS_STORAGE_KEY);
    if (!raw) return createEmptyChats();
    return { ...createEmptyChats(), ...JSON.parse(raw) };
  } catch {
    return createEmptyChats();
  }
}

function loadSavedFeatureHistory(): Record<FeatureKey, FeatureHistoryItem[]> {
  const empty = createEmptyFeatureHistory();
  try {
    const raw = localStorage.getItem(FEATURES_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Record<string, FeatureHistoryItem[]>;
    const mergedDocs = [
      ...(Array.isArray(parsed.docs) ? parsed.docs : []),
      ...(Array.isArray(parsed.files) ? parsed.files : []),
    ].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      charts: Array.isArray(parsed.charts) ? parsed.charts : [],
      video_explainer: Array.isArray(parsed.video_explainer) ? parsed.video_explainer : [],
      docs: mergedDocs,
      cv: Array.isArray(parsed.cv) ? parsed.cv : [],
      lens: Array.isArray(parsed.lens) ? parsed.lens : [],
      voicechat: Array.isArray(parsed.voicechat) ? parsed.voicechat : [],
    };
  } catch {
    return empty;
  }
}

export default function App() {
  const [view, setView] = useState<ViewMode>('home');
  const [activeNav, setActiveNav] = useState<string>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const mainThreadRef = useRef<HTMLDivElement | null>(null);
  const toolThreadRef = useRef<HTMLDivElement | null>(null);

  // Persistent per-icon chat threads
  const [chats, setChats] = useState<Record<ChatChannelKey, ChatMessage[]>>(loadSavedChats);
  const [featureHistory, setFeatureHistory] = useState<Record<FeatureKey, FeatureHistoryItem[]>>(
    loadSavedFeatureHistory,
  );
  const [cvData, setCvData] = useState<CvData>(loadSavedCv);

  // Main chat input
  const [prompt, setPrompt] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  // Tool panel state
  const [toolKind, setToolKind] = useState<ToolKey>('writer');
  const [toolInput, setToolInput] = useState('');
  const [toolLoading, setToolLoading] = useState(false);
  const [toolError, setToolError] = useState('');
  const [designVisualLoading, setDesignVisualLoading] = useState(false);
  const [designAutoVisual, setDesignAutoVisual] = useState(true);

  // Feature panel state
  const [featureKind, setFeatureKind] = useState<FeatureKey>('docs');
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  // Docs & Files state
  const [docType, setDocType] = useState('docx');
  const [docName, setDocName] = useState('مستند-زورفيكس');
  const [docContent, setDocContent] = useState('');
  const [docAiPrompt, setDocAiPrompt] = useState('');
  const [docAiLoading, setDocAiLoading] = useState(false);
  const [docStatus, setDocStatus] = useState('');

  // Smart Lens state (camera capture / upload + question below photo)
  const [lensImageDataUrl, setLensImageDataUrl] = useState('');
  const [lensQuestion, setLensQuestion] = useState('');
  const [lensAnswer, setLensAnswer] = useState('');
  const [lensLoading, setLensLoading] = useState(false);
  const [lensStatus, setLensStatus] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const lensCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const lensUploadInputRef = useRef<HTMLInputElement | null>(null);

  // Translate Lens state (camera capture / photo upload directly inside الترجمة)
  const [translateImageDataUrl, setTranslateImageDataUrl] = useState('');
  const [translateTargetLang, setTranslateTargetLang] = useState('العربية');
  const [translateCameraActive, setTranslateCameraActive] = useState(false);
  const translateCameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const translateCameraStreamRef = useRef<MediaStream | null>(null);
  const translateCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const translateUploadInputRef = useRef<HTMLInputElement | null>(null);

  const geminiMode = 'balanced' as const;

  function stopCameraStream() {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((tr) => tr.stop());
      cameraStreamRef.current = null;
    }
    setCameraActive(false);
    if (translateCameraStreamRef.current) {
      translateCameraStreamRef.current.getTracks().forEach((tr) => tr.stop());
      translateCameraStreamRef.current = null;
    }
    setTranslateCameraActive(false);
  }

  useEffect(() => {
    try {
      localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(chats));
    } catch {
      // Storage quota fallback ignored
    }
  }, [chats]);

  useEffect(() => {
    try {
      localStorage.setItem(FEATURES_STORAGE_KEY, JSON.stringify(featureHistory));
    } catch {
      // Storage quota fallback ignored
    }
  }, [featureHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(CV_STORAGE_KEY, JSON.stringify(cvData));
    } catch {
      // Storage quota fallback ignored
    }
  }, [cvData]);

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((tr) => tr.stop());
      }
      if (translateCameraStreamRef.current) {
        translateCameraStreamRef.current.getTracks().forEach((tr) => tr.stop());
      }
    };
  }, []);

  function syncSeoUrlAndTitle(nextView: ViewMode, nextKey?: string) {
    try {
      const baseTitle = 'ZORVYX AI – زورفيكس | منصة الذكاء الاصطناعي الشاملة';
      const baseDesc =
        'استخدم ZORVYX AI (زورفيكس) للكتابة، الترجمة، المهام اليومية، الرسوم البيانية، شرح الفيديو، المقابلات، العقود، والصحة والتغذية مجاناً.';
      let nextTitle = baseTitle;
      let nextDesc = baseDesc;
      let nextPath = '/';

      if (nextView === 'tool' && nextKey && nextKey in TOOLS) {
        const [toolTitle, toolDesc] = TOOLS[nextKey as ToolKey];
        nextTitle = `${toolTitle} | ZORVYX AI – زورفيكس`;
        nextDesc = `${toolTitle}: ${toolDesc}`;
        nextPath = `/?tool=${encodeURIComponent(nextKey)}`;
      } else if (nextView === 'feature' && nextKey && nextKey in FEATURE_INFO) {
        const [featTitle, featDesc] = FEATURE_INFO[nextKey as FeatureKey];
        nextTitle = `${featTitle} | ZORVYX AI – زورفيكس`;
        nextDesc = `${featTitle}: ${featDesc}`;
        nextPath = `/?tool=${encodeURIComponent(nextKey)}`;
      } else if (nextView === 'qr') {
        nextTitle = 'الرابط الدائم والباركود | ZORVYX AI – زورفيكس';
        nextDesc = 'الحصول على الرابط الدائم والباركود الثابت لمشاركة وفتح منصة ZORVYX AI بسهولة.';
      }

      const origin = window.location.origin.includes('ais-dev-')
        ? window.location.origin.replace('://ais-dev-', '://ais-pre-')
        : window.location.origin;
      const fullUrl = `${origin}${nextPath}`;

      document.title = nextTitle;
      window.history.replaceState(null, '', nextPath);

      const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (canonical) {
        canonical.href = fullUrl;
      }
      const ogUrl = document.querySelector('meta[property="og:url"]') as HTMLMetaElement | null;
      if (ogUrl) {
        ogUrl.content = fullUrl;
      }
      const ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null;
      if (ogTitle) {
        ogTitle.content = nextTitle;
      }
      const metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
      if (metaDesc) {
        metaDesc.content = nextDesc;
      }
      const ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null;
      if (ogDesc) {
        ogDesc.content = nextDesc;
      }
    } catch {
      // Ignore history/DOM update issues
    }
  }

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const toolParam = params.get('tool')?.trim();
      const qParam = params.get('q')?.trim();
      const sourceParam = params.get('source')?.trim();

      if (toolParam && toolParam in TOOLS) {
        const key = toolParam as ToolKey;
        setToolKind(key);
        setView('tool');
        setActiveNav(key);
        syncSeoUrlAndTitle('tool', key);
      } else if (toolParam && toolParam in FEATURE_INFO) {
        const key = toolParam as FeatureKey;
        setFeatureKind(key);
        setView('feature');
        setActiveNav(key);
        syncSeoUrlAndTitle('feature', key);
      } else if (qParam) {
        setPrompt(qParam);
        const isAutomatedBrowser =
          navigator.webdriver || /bot|crawler|spider|googlebot/i.test(navigator.userAgent || '');
        const sessionKey = `zorvyx_q_ran_${qParam}`;
        if (sourceParam === 'chrome' && !isAutomatedBrowser && !sessionStorage.getItem(sessionKey)) {
          sessionStorage.setItem(sessionKey, '1');
          void runMainQuery(qParam);
        } else {
          setTimeout(() => promptRef.current?.focus(), 80);
        }
      }
    } catch {
      // Ignore malformed query strings
    }
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goHome() {
    stopCameraStream();
    setMobileMenuOpen(false);
    setView('home');
    setActiveNav('home');
    setChatError('');
    syncSeoUrlAndTitle('home');
    scrollToTop();
  }

  function focusMain() {
    stopCameraStream();
    setMobileMenuOpen(false);
    setView('home');
    setActiveNav('assistant');
    syncSeoUrlAndTitle('home');
    scrollToTop();
    setTimeout(() => promptRef.current?.focus(), 60);
  }

  function newChat() {
    stopCameraStream();
    setMobileMenuOpen(false);
    setPrompt('');
    setChatError('');
    setView('home');
    setActiveNav('home');
    syncSeoUrlAndTitle('home');
    scrollToTop();
    setTimeout(() => promptRef.current?.focus(), 60);
  }

  function openTool(kind: ToolKey) {
    stopCameraStream();
    setMobileMenuOpen(false);
    setToolKind(kind);
    setToolInput('');
    setToolError('');
    setView('tool');
    setActiveNav(kind);
    syncSeoUrlAndTitle('tool', kind);
    scrollToTop();
  }

  function copyWithFeedback(id: string, text: string) {
    if (!text) return;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 1800);
  }

  function sendTextToDocs(titleHint: string, contentText: string) {
    const clean = stripHashMarks(contentText).trim();
    if (!clean) return;
    stopCameraStream();
    setMobileMenuOpen(false);
    setDocName(safeFileName(titleHint || 'مستند-زورفيكس'));
    setDocContent(clean);
    setDocStatus('تم نقل المحتوى إلى منشئ المستندات — اختاري الصيغة المناسبة للتنزيل.');
    setFeatureKind('docs');
    setView('feature');
    setActiveNav('docs');
    syncSeoUrlAndTitle('feature', 'docs');
    scrollToTop();
  }

  function applyHistoryItem(item: FeatureHistoryItem, kind: FeatureKey) {
    setActiveHistoryId(item.id);
    if (kind === 'docs') {
      if (item.docType) setDocType(item.docType);
      if (item.docName) setDocName(item.docName);
      if (item.docContent) setDocContent(stripHashMarks(item.docContent));
      if (item.prompt) setDocAiPrompt(item.prompt);
      return;
    }
    if (kind === 'lens') {
      setLensImageDataUrl(item.lensImageDataUrl || '');
      setLensQuestion(item.prompt || '');
      setLensAnswer(stripHashMarks(item.lensAnswer || ''));
    }
  }

  function openFeature(key: FeatureKey) {
    if (key !== 'lens') stopCameraStream();
    setMobileMenuOpen(false);
    setFeatureKind(key);
    setDocStatus('');
    setLensStatus('');

    const items = featureHistory[key] || [];
    if (items.length > 0) {
      applyHistoryItem(items[0], key);
    } else {
      setActiveHistoryId(null);
      setLensImageDataUrl('');
      setLensQuestion('');
      setLensAnswer('');
    }

    setView('feature');
    setActiveNav(key);
    syncSeoUrlAndTitle('feature', key);
    scrollToTop();
  }

  function openQrView() {
    stopCameraStream();
    setMobileMenuOpen(false);
    setView('qr');
    setActiveNav('qr');
    syncSeoUrlAndTitle('qr');
    scrollToTop();
  }

  function deleteChatMessage(channel: ChatChannelKey, msgId: string) {
    setChats((prev) => ({
      ...prev,
      [channel]: (prev[channel] || []).filter((m) => m.id !== msgId),
    }));
  }

  function clearChannelChat(channel: ChatChannelKey) {
    setChats((prev) => ({
      ...prev,
      [channel]: [],
    }));
  }

  function deleteFeatureHistoryItem(key: FeatureKey, itemId: string) {
    setFeatureHistory((prev) => {
      const nextList = (prev[key] || []).filter((it) => it.id !== itemId);
      if (activeHistoryId === itemId) {
        if (nextList.length > 0) {
          applyHistoryItem(nextList[0], key);
        } else {
          setActiveHistoryId(null);
          setLensImageDataUrl('');
          setLensAnswer('');
        }
      }
      return { ...prev, [key]: nextList };
    });
  }

  function clearFeatureHistory(key: FeatureKey) {
    setFeatureHistory((prev) => ({ ...prev, [key]: [] }));
    setActiveHistoryId(null);
    setLensImageDataUrl('');
    setLensAnswer('');
    setLensStatus('');
  }

  async function callChatAPI(
    message: string,
    kind: ChatChannelKey,
    history: ChatMessage[],
  ): Promise<string> {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        kind,
        history: history.map((m) => ({ role: m.role, text: m.text })),
        geminiMode,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(data.error || 'تعذر الاتصال بخدمة الذكاء الاصطناعي.');
    }
    return stripHashMarks(data.answer || 'لم تصل إجابة نصية.');
  }

  async function runMainQuery(queryText: string) {
    const trimmed = queryText.trim();
    if (!trimmed) {
      setChatError('اكتب سؤالك أو فكرتك أولاً.');
      return;
    }
    setChatError('');
    const currentHistory = chats.general || [];
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      createdAt: Date.now(),
    };
    setChats((prev) => ({ ...prev, general: [...(prev.general || []), userMsg] }));
    setPrompt('');
    setChatLoading(true);
    try {
      const reply = await callChatAPI(trimmed, 'general', currentHistory);
      const botMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: reply,
        createdAt: Date.now(),
      };
      setChats((prev) => ({ ...prev, general: [...(prev.general || []), botMsg] }));
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'حدث خطأ غير متوقع.');
    } finally {
      setChatLoading(false);
    }
  }

  async function askMain() {
    await runMainQuery(prompt);
  }

  async function openTranslateCamera() {
    setToolError('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      translateCaptureInputRef.current?.click();
      return;
    }
    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      translateCameraStreamRef.current = stream;
      setTranslateCameraActive(true);
      setTimeout(() => {
        if (translateCameraVideoRef.current) {
          translateCameraVideoRef.current.srcObject = stream;
          void translateCameraVideoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      translateCaptureInputRef.current?.click();
    }
  }

  function captureFromTranslateCamera() {
    const video = translateCameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setToolError('الكاميرا قيد التحضير، انتظري لحظة ثم التقطي الصورة.');
      return;
    }
    const maxDim = 1024;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(64, Math.round(video.videoWidth * scale));
    const h = Math.max(64, Math.round(video.videoHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, w, h);
      setTranslateImageDataUrl(canvas.toDataURL('image/png'));
    }
    stopCameraStream();
  }

  async function handleTranslateFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      stopCameraStream();
      const dataUrl = await fileToResizedDataUrl(files[0], 1024);
      setTranslateImageDataUrl(dataUrl);
    } catch (e) {
      setToolError(e instanceof Error ? e.message : 'تعذر قراءة الصورة.');
    } finally {
      if (translateCaptureInputRef.current) translateCaptureInputRef.current.value = '';
      if (translateUploadInputRef.current) translateUploadInputRef.current.value = '';
    }
  }

  async function runTool(overrideText?: string) {
    const trimmed = (overrideText ?? toolInput).trim();
    const hasTranslateImg = toolKind === 'translate' && Boolean(translateImageDataUrl);
    if (!trimmed && !hasTranslateImg) {
      setToolError(
        toolKind === 'translate'
          ? 'اكتب النص المطلوب ترجمته أو التقط/ارفع صورة بالعدسة أولاً.'
          : 'اكتب التفاصيل أولاً.',
      );
      return;
    }
    setToolError('');
    const currentHistory = chats[toolKind] || [];

    if (toolKind === 'translate' && translateImageDataUrl) {
      const imgSnapshot = translateImageDataUrl;
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: trimmed || `ترجمة الصورة إلى (${translateTargetLang})`,
        createdAt: Date.now(),
        imageDataUrl: imgSnapshot,
      };
      setChats((prev) => ({ ...prev, translate: [...(prev.translate || []), userMsg] }));
      if (!overrideText) setToolInput('');
      setTranslateImageDataUrl('');
      setToolLoading(true);
      try {
        const r = await fetch('/api/lens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageDataUrl: imgSnapshot,
            question: trimmed,
            mode: 'translate',
            targetLanguage: translateTargetLang,
            geminiMode,
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'تعذر ترجمة الصورة.');
        const botMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: stripHashMarks(data.answer || 'لم يتم العثور على نص واضح للترجمة.'),
          createdAt: Date.now(),
        };
        setChats((prev) => ({ ...prev, translate: [...(prev.translate || []), botMsg] }));
      } catch (e) {
        setToolError(e instanceof Error ? e.message : 'حدث خطأ أثناء ترجمة الصورة.');
      } finally {
        setToolLoading(false);
      }
      return;
    }

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      createdAt: Date.now(),
    };
    setChats((prev) => ({ ...prev, [toolKind]: [...(prev[toolKind] || []), userMsg] }));
    if (!overrideText) setToolInput('');
    setToolLoading(true);
    try {
      if (toolKind === 'design') {
        const lastArtwork = [...currentHistory].reverse().find((m) => m.artwork)?.artwork;
        const r = await fetch('/api/design-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            history: currentHistory.map((m) => ({ role: m.role, text: m.text })),
            previousArtwork: lastArtwork
              ? {
                  title: lastArtwork.title,
                  description: lastArtwork.description,
                  palette: lastArtwork.palette,
                  is3D: lastArtwork.is3D,
                }
              : undefined,
            autoVisual: designAutoVisual,
            geminiMode,
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(data.error || 'تعذر تنفيذ طلب التصميم.');
        }
        const botMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: stripHashMarks(data.answer || 'تم إعداد التصميم.'),
          createdAt: Date.now(),
          ...(data.artwork ? { artwork: data.artwork } : {}),
        };
        setChats((prev) => ({ ...prev, design: [...(prev.design || []), botMsg] }));
      } else {
        const promptForApi =
          toolKind === 'translate' && translateTargetLang
            ? `ترجم إلى (${translateTargetLang}):\n${trimmed}`
            : trimmed;
        const reply = await callChatAPI(promptForApi, toolKind, currentHistory);
        const botMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: reply,
          createdAt: Date.now(),
        };
        setChats((prev) => ({ ...prev, [toolKind]: [...(prev[toolKind] || []), botMsg] }));
      }
    } catch (e) {
      setToolError(e instanceof Error ? e.message : 'حدث خطأ غير متوقع.');
    } finally {
      setToolLoading(false);
    }
  }

  async function generateDesignPreview() {
    const trimmed = toolInput.trim();
    if (!trimmed) {
      setToolError('اكتب وصف الشعار أو التصميم أولاً.');
      return;
    }
    setToolError('');
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: `طلب نموذج بصري: ${trimmed}`,
      createdAt: Date.now(),
    };
    setChats((prev) => ({ ...prev, design: [...(prev.design || []), userMsg] }));
    setToolInput('');
    setDesignVisualLoading(true);
    try {
      const r = await fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'design', prompt: trimmed, geminiMode }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'تعذر توليد التصميم.');
      const botMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: stripHashMarks(data.artwork?.description || 'تم تصميم النموذج البصري.'),
        createdAt: Date.now(),
        artwork: data.artwork,
      };
      setChats((prev) => ({ ...prev, design: [...(prev.design || []), botMsg] }));
    } catch (e) {
      setToolError(e instanceof Error ? e.message : 'تعذر توليد التصميم البصري.');
    } finally {
      setDesignVisualLoading(false);
    }
  }

  async function generateDocWithAI() {
    const topic = docAiPrompt.trim();
    if (!topic) {
      setDocStatus('اكتبي موضوع المستند لتوليده بالذكاء الاصطناعي.');
      return;
    }
    setDocAiLoading(true);
    setDocStatus('جاري كتابة وتنسيق المستند بالذكاء الاصطناعي…');
    try {
      const r = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: topic, doctype: docType, geminiMode }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'تعذر إنشاء محتوى المستند.');
      const nextName = data.fileName || docName;
      const nextContent = stripHashMarks(data.content || '');
      setDocName(nextName);
      setDocContent(nextContent);
      const item: FeatureHistoryItem = {
        id: `doc-${Date.now()}`,
        prompt: topic,
        createdAt: Date.now(),
        docType,
        docName: nextName,
        docContent: nextContent,
      };
      setFeatureHistory((prev) => ({ ...prev, docs: [item, ...(prev.docs || [])] }));
      setActiveHistoryId(item.id);
      setDocStatus('تم إنشاء المحتوى وتنسيقه وحفظه في سجل هذه الأداة.');
    } catch (e) {
      setDocStatus(e instanceof Error ? e.message : 'حدث خطأ أثناء الإنشاء.');
    } finally {
      setDocAiLoading(false);
    }
  }

  async function downloadOfficeFile() {
    const content = docContent.trim();
    if (!content) {
      setDocStatus('اكتبي محتوى الملف أو ولّديه بالذكاء الاصطناعي أولاً.');
      return;
    }
    const name = safeFileName(docName);
    try {
      if (docType === 'docx' || docType === 'doc') {
        setDocStatus('جاري تجهيز ملف المستند النصي الاحترافي…');
        const blob = await buildDocxBlob(docName || name, content);
        saveBlob(blob, `${name}.docx`);
        setDocStatus(`تم تنزيل ملف المستند الحقيقي (${name}) بنجاح ويفتح مباشرة في برامج تحرير المستندات.`);
      } else if (docType === 'pdf') {
        setDocStatus('جاري إنشاء وتجهيز ملف الطباعة الثابت…');
        const blob = await buildPdfBlob(docName || name, content);
        saveBlob(blob, `${name}.pdf`);
        setDocStatus(`تم إنشاء وتنزيل ملف الطباعة الثابت (${name}) بنجاح.`);
      } else if (docType === 'pptx' || docType === 'ppt') {
        setDocStatus('جاري تجهيز ملف العرض التقديمي…');
        const blob = await buildPptxBlob(docName || name, content);
        saveBlob(blob, `${name}.pptx`);
        setDocStatus(`تم تنزيل ملف العرض التقديمي (${name}) بنجاح ويفتح مباشرة في برامج العروض.`);
      } else if (docType === 'xlsx' || docType === 'xls') {
        setDocStatus('جاري تجهيز جدول البيانات والعمليات الحسابية…');
        const rows = content
          .split(/\r?\n/)
          .filter(Boolean)
          .map((r) => r.split(/[\t,;|]/));
        const blob = await buildXlsxBlob(rows);
        saveBlob(blob, `${name}.xlsx`);
        setDocStatus(`تم تنزيل جدول البيانات (${name}) بنجاح ويفتح مباشرة في برامج الجداول.`);
      } else if (docType === 'csv') {
        const rows = content
          .split(/\r?\n/)
          .filter(Boolean)
          .map((r) => r.split(/[\t,;|]/));
        const csv = '\ufeff' + rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(',')).join('\r\n');
        saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
        setDocStatus(`تم تنزيل جدول البيانات المفصول بفواصل (${name}) بنجاح.`);
      } else {
        const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${escHtml(name)}</title><body style="font-family:Tahoma,Arial;white-space:pre-wrap;line-height:1.8;padding:24px;background:#f8fafc;color:#0f172a">${escHtml(content)}</body></html>`;
        saveBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${name}.html`);
        setDocStatus(`تم تنزيل صفحة الويب التفاعلية (${name}) بنجاح.`);
      }
    } catch {
      setDocStatus('تعذر تجهيز الملف، يرجى المحاولة مرة أخرى.');
    }
  }

  async function openLensCamera() {
    setLensStatus('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      lensCaptureInputRef.current?.click();
      return;
    }
    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          void cameraVideoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setLensStatus('تعذر فتح الكاميرا المباشرة في المتصفح؛ يمكنك التقاط أو اختيار صورة من الأزرار التالية.');
      lensCaptureInputRef.current?.click();
    }
  }

  function captureFromLensCamera() {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setLensStatus('الكاميرا قيد التحضير، انتظري لحظة ثم التقطي الصورة.');
      return;
    }
    const maxDim = 1024;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(64, Math.round(video.videoWidth * scale));
    const h = Math.max(64, Math.round(video.videoHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, w, h);
      setLensImageDataUrl(canvas.toDataURL('image/png'));
      setLensStatus('تم التقاط الصورة! اكتبي سؤالك تحت الصورة ثم اضغطي تحليل وحل.');
    }
    stopCameraStream();
  }

  async function handleLensFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      stopCameraStream();
      const dataUrl = await fileToResizedDataUrl(files[0], 1024);
      setLensImageDataUrl(dataUrl);
      setLensStatus('تم تحميل الصورة! اكتبي ما تريدين حله تحت الصورة واضغطي تحليل.');
    } catch (e) {
      setLensStatus(e instanceof Error ? e.message : 'تعذر قراءة الصورة.');
    } finally {
      if (lensCaptureInputRef.current) lensCaptureInputRef.current.value = '';
      if (lensUploadInputRef.current) lensUploadInputRef.current.value = '';
    }
  }

  async function analyzeLensImage() {
    if (!lensImageDataUrl) {
      setLensStatus('صوّري بالكاميرا أو ارفعي صورة أولاً ثم اكتبي سؤالك تحتها.');
      return;
    }
    setLensLoading(true);
    setLensStatus('جاري فحص الصورة وحل سؤالك بالعدسة الذكية…');
    try {
      const r = await fetch('/api/lens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: lensImageDataUrl,
          question: lensQuestion.trim(),
          geminiMode,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'تعذر تحليل الصورة.');
      const cleanAnswer = stripHashMarks(data.answer || '');
      setLensAnswer(cleanAnswer);
      const item: FeatureHistoryItem = {
        id: `lens-${Date.now()}`,
        prompt: lensQuestion.trim() || 'تحليل وحل بالعدسة الذكية',
        createdAt: Date.now(),
        lensImageDataUrl,
        lensAnswer: cleanAnswer,
      };
      setFeatureHistory((prev) => ({ ...prev, lens: [item, ...(prev.lens || [])] }));
      setActiveHistoryId(item.id);
      setLensStatus('تم الحل وحفظ النتيجة في سجل العدسة الذكية.');
    } catch (e) {
      setLensStatus(e instanceof Error ? e.message : 'حدث خطأ أثناء تحليل الصورة.');
    } finally {
      setLensLoading(false);
    }
  }

  const featureMeta = FEATURE_INFO[featureKind];
  const mainMessages = chats.general || [];
  const toolMessages = chats[toolKind] || [];
  const currentFeatureHistory = featureHistory[featureKind] || [];

  useEffect(() => {
    if (mainThreadRef.current) {
      mainThreadRef.current.scrollTop = mainThreadRef.current.scrollHeight;
    }
  }, [mainMessages.length, chatLoading]);

  useEffect(() => {
    if (toolThreadRef.current) {
      toolThreadRef.current.scrollTop = toolThreadRef.current.scrollHeight;
    }
  }, [toolMessages.length, toolLoading, toolKind]);

  return (
    <>
      {mobileMenuOpen && (
        <div
          className="mobile-drawer-backdrop"
          aria-hidden="true"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <div className="shell">
        <aside className={`side ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <div className="brand">
            <div className="brandmark">
              <img
                src="/assets/aistudio/file_00000000d6f48210967f2a13492a2ae2_cfdde145.png"
                alt="شعار ZORVYX AI"
              />
            </div>
            <div className="brandname">
              ZORVYX AI<small>الكون الذكي المتكامل</small>
            </div>
            <button
              type="button"
              className="side-close-btn"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="إغلاق القائمة"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          <button type="button" className="newchat" onClick={newChat}>
            <Plus size={16} strokeWidth={2.2} />
            محادثة جديدة
          </button>

          <div className="nav">
            <div className="navtitle">القائمة الرئيسية</div>
            <button type="button" className={activeNav === 'home' ? 'active' : ''} onClick={goHome}>
              <span className="navico" style={{ '--nav-accent': '#c4b5fd', '--nav-tint': '#292345' } as CSSProperties}>
                <Home size={16} strokeWidth={1.9} />
              </span>
              الرئيسية
            </button>
            <button type="button" className={activeNav === 'assistant' ? 'active' : ''} onClick={focusMain}>
              <span className="navico" style={{ '--nav-accent': '#67e8f9', '--nav-tint': '#153d48' } as CSSProperties}>
                <Bot size={16} strokeWidth={1.9} />
              </span>
              المساعد الذكي
            </button>
            <button type="button" className={activeNav === 'writer' ? 'active' : ''} onClick={() => openTool('writer')}>
              <span className="navico" style={{ '--nav-accent': '#fda4af', '--nav-tint': '#542536' } as CSSProperties}>
                <PenLine size={16} strokeWidth={1.9} />
              </span>
              الكتابة والصياغة
            </button>
            <button type="button" className={activeNav === 'learn' ? 'active' : ''} onClick={() => openTool('learn')}>
              <span className="navico" style={{ '--nav-accent': '#67e8f9', '--nav-tint': '#164353' } as CSSProperties}>
                <GraduationCap size={16} strokeWidth={1.9} />
              </span>
              التعلّم والشرح
            </button>
            <button type="button" className={activeNav === 'ideas' ? 'active' : ''} onClick={() => openTool('ideas')}>
              <span className="navico" style={{ '--nav-accent': '#c4b5fd', '--nav-tint': '#38265f' } as CSSProperties}>
                <Lightbulb size={16} strokeWidth={1.9} />
              </span>
              الأفكار والإبداع
            </button>
            <button type="button" className={activeNav === 'plan' ? 'active' : ''} onClick={() => openTool('plan')}>
              <span className="navico" style={{ '--nav-accent': '#fcd34d', '--nav-tint': '#514019' } as CSSProperties}>
                <CalendarCheck size={16} strokeWidth={1.9} />
              </span>
              التخطيط والتنظيم
            </button>
            <button type="button" className={activeNav === 'design' ? 'active' : ''} onClick={() => openTool('design')}>
              <span className="navico" style={{ '--nav-accent': '#86efac', '--nav-tint': '#174b37' } as CSSProperties}>
                <Palette size={16} strokeWidth={1.9} />
              </span>
              مساعد التصميم
            </button>
            <button type="button" className={activeNav === 'translate' ? 'active' : ''} onClick={() => openTool('translate')}>
              <span className="navico" style={{ '--nav-accent': '#93c5fd', '--nav-tint': '#1d3b62' } as CSSProperties}>
                <Languages size={16} strokeWidth={1.9} />
              </span>
              الترجمة
            </button>
            <button type="button" className={activeNav === 'tasks' ? 'active' : ''} onClick={() => openFeature('tasks')}>
              <span className="navico" style={{ '--nav-accent': '#34d399', '--nav-tint': '#124434' } as CSSProperties}>
                <ListChecks size={16} strokeWidth={1.9} />
              </span>
              المهام اليومية
            </button>
            <button type="button" className={activeNav === 'charts' ? 'active' : ''} onClick={() => openFeature('charts')}>
              <span className="navico" style={{ '--nav-accent': '#60a5fa', '--nav-tint': '#17345a' } as CSSProperties}>
                <BarChart3 size={16} strokeWidth={1.9} />
              </span>
              الرسم البياني الذكي
            </button>
            <button type="button" className={activeNav === 'video_explainer' ? 'active' : ''} onClick={() => openFeature('video_explainer')}>
              <span className="navico" style={{ '--nav-accent': '#f472b6', '--nav-tint': '#4d193a' } as CSSProperties}>
                <Video size={16} strokeWidth={1.9} />
              </span>
              شرح الموضوع بفيديو
            </button>
            <button type="button" className={activeNav === 'lens' ? 'active' : ''} onClick={() => openFeature('lens')}>
              <span className="navico" style={{ '--nav-accent': '#38bdf8', '--nav-tint': '#13394d' } as CSSProperties}>
                <ScanEye size={16} strokeWidth={1.9} />
              </span>
              العدسة الذكية
            </button>
            <button type="button" className={activeNav === 'voicechat' ? 'active' : ''} onClick={() => openFeature('voicechat')}>
              <span className="navico" style={{ '--nav-accent': '#2dd4bf', '--nav-tint': '#114346' } as CSSProperties}>
                <Volume2 size={16} strokeWidth={1.9} />
              </span>
              المُتحدّث الصوتي
            </button>
            <button type="button" className={activeNav === 'summarize' ? 'active' : ''} onClick={() => openTool('summarize')}>
              <span className="navico" style={{ '--nav-accent': '#fb923c', '--nav-tint': '#4a2312' } as CSSProperties}>
                <BookOpenCheck size={16} strokeWidth={1.9} />
              </span>
              المُلخِّص الذكي
            </button>
            <button type="button" className={activeNav === 'code' ? 'active' : ''} onClick={() => openTool('code')}>
              <span className="navico" style={{ '--nav-accent': '#818cf8', '--nav-tint': '#23265a' } as CSSProperties}>
                <Code2 size={16} strokeWidth={1.9} />
              </span>
              المُبرمج الذكي
            </button>
            <button type="button" className={activeNav === 'marketing' ? 'active' : ''} onClick={() => openTool('marketing')}>
              <span className="navico" style={{ '--nav-accent': '#e879f9', '--nav-tint': '#481a4e' } as CSSProperties}>
                <Megaphone size={16} strokeWidth={1.9} />
              </span>
              التسويق والمحتوى
            </button>
            <button type="button" className={activeNav === 'proofread' ? 'active' : ''} onClick={() => openTool('proofread')}>
              <span className="navico" style={{ '--nav-accent': '#a7f3d0', '--nav-tint': '#144637' } as CSSProperties}>
                <SpellCheck size={16} strokeWidth={1.9} />
              </span>
              التدقيق اللغوي
            </button>
            <button type="button" className={activeNav === 'emails' ? 'active' : ''} onClick={() => openTool('emails')}>
              <span className="navico" style={{ '--nav-accent': '#7dd3fc', '--nav-tint': '#143952' } as CSSProperties}>
                <MailCheck size={16} strokeWidth={1.9} />
              </span>
              الإيميلات الرسمية
            </button>
            <button type="button" className={activeNav === 'finance' ? 'active' : ''} onClick={() => openTool('finance')}>
              <span className="navico" style={{ '--nav-accent': '#fde047', '--nav-tint': '#4b3d12' } as CSSProperties}>
                <Wallet size={16} strokeWidth={1.9} />
              </span>
              المستشار المالي
            </button>
            <button type="button" className={activeNav === 'interview' ? 'active' : ''} onClick={() => openTool('interview')}>
              <span className="navico navico-shape-hex" style={{ '--nav-accent': '#bef264', '--nav-tint': '#253d10' } as CSSProperties}>
                <BriefcaseBusiness size={16} strokeWidth={1.9} />
              </span>
              مُدرّب المقابلات
            </button>
            <button type="button" className={activeNav === 'legal' ? 'active' : ''} onClick={() => openTool('legal')}>
              <span className="navico navico-shape-shield" style={{ '--nav-accent': '#f87171', '--nav-tint': '#4b151c' } as CSSProperties}>
                <Scale size={16} strokeWidth={1.9} />
              </span>
              العقود والقانون
            </button>
            <button type="button" className={activeNav === 'wellness' ? 'active' : ''} onClick={() => openTool('wellness')}>
              <span className="navico navico-shape-octagon" style={{ '--nav-accent': '#f1f5f9', '--nav-tint': '#1e293b' } as CSSProperties}>
                <HeartPulse size={16} strokeWidth={1.9} />
              </span>
              الصحة والتغذية
            </button>
            <button type="button" className={activeNav === 'docs' ? 'active' : ''} onClick={() => openFeature('docs')}>
              <span className="navico" style={{ '--nav-accent': '#86efac', '--nav-tint': '#174b37' } as CSSProperties}>
                <FileText size={16} strokeWidth={1.9} />
              </span>
              المستندات والملفات
            </button>
            <button type="button" className={activeNav === 'cv' ? 'active' : ''} onClick={() => openFeature('cv')}>
              <span className="navico" style={{ '--nav-accent': '#f9a8d4', '--nav-tint': '#4a2141' } as CSSProperties}>
                <IdCard size={16} strokeWidth={1.9} />
              </span>
              إنشاء سيرة ذاتية
            </button>
            <button type="button" className={activeNav === 'qr' ? 'active' : ''} onClick={openQrView}>
              <span className="navico" style={{ '--nav-accent': '#67e8f9', '--nav-tint': '#263859' } as CSSProperties}>
                <QrCode size={16} strokeWidth={1.9} />
              </span>
              الرابط والباركود
            </button>
          </div>

          <div className="sidefoot">
            تطوير وتصميم<br />
            <b>نهى إسماعيل فتحي ابو عرب</b><br />
            © جميع الحقوق محفوظة
          </div>
        </aside>

        <main className="main">
          <div className="top">
            <div className="topbrand">
              <button
                type="button"
                className="mobile-menu-btn"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="فتح قائمة الأدوات"
              >
                <Menu size={20} strokeWidth={2} />
              </button>
              <div className="brandmark">
                <img
                  src="/assets/aistudio/file_00000000d6f48210967f2a13492a2ae2_cfdde145.png"
                  alt="شعار ZORVYX AI"
                />
              </div>
              <div>
                <div className="topbrandname">
                  ZORVYX <span className="gradient">AI</span>
                </div>
                <div className="toplabel">مساحتك الذكية… كل شيء يبدأ بفكرة</div>
              </div>
            </div>

            <div className="top-actions">
              <div className="signature-mark" aria-label="توقيع نهى وشعار ZORVYX AI">
                <div className="signature-copy">
                  <span className="signature-name">نهى</span>
                </div>
                <img
                  className="signature-emblem"
                  src="/assets/aistudio/file_00000000d6f48210967f2a13492a2ae2_cfdde145.png"
                  alt="شعار ZORVYX AI"
                />
              </div>
            </div>
          </div>

          {view === 'home' && (
            <>
              <section className="hero" id="hero">
                <div className="tag">
                  <Sparkles size={13} strokeWidth={2} />
                  منصة ذكية متكاملة بأدوات متخصصة
                </div>
                <h1>
                  مرحباً بك في <span className="gradient">ZORVYX AI</span>
                </h1>
                <p>
                  اسأل، اكتب، تعلّم، ابتكر، وخطّط. مساعدك الذكي في مساحة واحدة وبواجهة صُممت لتجعل الإنجاز أسهل.
                </p>
              </section>

              <div className="icon-purpose-box icon-purpose-box--home">
                <span className="icon-purpose-title">وظيفة هذه الأيقونة: المساعد الذكي العام</span>
                <span className="icon-purpose-text">
                  مخصّصة للمحادثة المفتوحة والأسئلة العامة المتنوعة في أي موضوع تحتاجينه بسرعة ووضوح.
                </span>
              </div>

              <div className="composer" id="composer">
                <textarea
                  ref={promptRef}
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="اكتب سؤالك أو فكرتك… كيف أستطيع مساعدتك؟"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      askMain();
                    }
                  }}
                />
                <div className="composefoot">
                  <span className="tiny">↵ إرسال سريع • أو مفتاح العالي مع الإدخال لسطر جديد</span>
                  <button type="button" className="primary" id="send" disabled={chatLoading} onClick={askMain}>
                    {chatLoading ? 'جاري التفكير…' : 'اسأل ZORVYX AI\u00a0 ←'}
                  </button>
                </div>
              </div>

              {(mainMessages.length > 0 || chatLoading || chatError) && (
                <div className="panel show" id="response">
                  <div className="chat-header">
                    <h3 style={{ margin: 0 }}>محادثة المساعد الذكي (محفوظة)</h3>
                    {mainMessages.length > 0 && (
                      <button
                        type="button"
                        className="mini-btn danger"
                        onClick={() => clearChannelChat('general')}
                      >
                        <Trash2 size={12} strokeWidth={1.9} />
                        مسح المحادثة
                      </button>
                    )}
                  </div>

                  {chatError && <div className="statusbox">{chatError}</div>}

                  <div className="chat-thread" ref={mainThreadRef}>
                    {mainMessages.map((msg) => {
                      const cleanMsgText = msg.role === 'assistant' ? stripHashMarks(msg.text) : msg.text;
                      return (
                        <div key={msg.id} className={`chat-msg ${msg.role}`}>
                          <div className="chat-msg-head">
                            <span>{msg.role === 'user' ? 'أنت' : 'مساعد ZORVYX AI'}</span>
                            <span className="msg-actions">
                              <button
                                type="button"
                                className="mini-btn"
                                onClick={() => copyWithFeedback(msg.id, cleanMsgText)}
                              >
                                {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                                {copiedId === msg.id ? 'تم النسخ' : 'نسخ'}
                              </button>
                              {msg.role === 'assistant' && (
                                <button
                                  type="button"
                                  className="mini-btn"
                                  onClick={() => sendTextToDocs('مستند-زورفيكس', cleanMsgText)}
                                >
                                  <FilePlus2 size={12} />
                                  حفظ كمستند
                                </button>
                              )}
                              <button
                                type="button"
                                className="mini-btn danger"
                                onClick={() => deleteChatMessage('general', msg.id)}
                              >
                                حذف
                              </button>
                            </span>
                          </div>
                          <div>{cleanMsgText}</div>
                        </div>
                      );
                    })}
                    {chatLoading && (
                      <div className="loading">
                        <span className="dot" /> لحظة، أعمل على إعداد إجابتك…
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {view === 'tool' && (
            <div className="panel show" id="toolpanel">
              <div className="chat-header">
                <h3 id="tooltitle" style={{ margin: 0 }}>{TOOLS[toolKind][0]}</h3>
                {toolMessages.length > 0 && (
                  <button
                    type="button"
                    className="mini-btn danger"
                    onClick={() => clearChannelChat(toolKind)}
                  >
                    <Trash2 size={12} strokeWidth={1.9} />
                    مسح محادثة هذه الأداة
                  </button>
                )}
              </div>

              <div className="icon-purpose-box">
                <span className="icon-purpose-title">وظيفة هذه الأيقونة</span>
                <span id="tooldesc" className="icon-purpose-text">{TOOLS[toolKind][1]}</span>
              </div>

              {toolMessages.length > 0 && (
                <div className="chat-thread" ref={toolThreadRef} style={{ marginBottom: 14 }}>
                  {toolMessages.map((msg) => {
                    const cleanMsgText = msg.role === 'assistant' ? stripHashMarks(msg.text) : msg.text;
                    return (
                      <div key={msg.id} className={`chat-msg ${msg.role}`}>
                        <div className="chat-msg-head">
                          <span>{msg.role === 'user' ? 'أنت' : `ZORVYX AI • ${TOOLS[toolKind][0]}`}</span>
                          <span className="msg-actions">
                            <button
                              type="button"
                              className="mini-btn"
                              onClick={() => copyWithFeedback(msg.id, cleanMsgText)}
                            >
                              {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                              {copiedId === msg.id ? 'تم النسخ' : 'نسخ'}
                            </button>
                            {msg.role === 'assistant' && (
                              <button
                                type="button"
                                className="mini-btn"
                                onClick={() => sendTextToDocs(TOOLS[toolKind][0], cleanMsgText)}
                              >
                                <FilePlus2 size={12} />
                                حفظ كمستند
                              </button>
                            )}
                            <button
                              type="button"
                              className="mini-btn danger"
                              onClick={() => deleteChatMessage(toolKind, msg.id)}
                            >
                              حذف
                            </button>
                          </span>
                        </div>
                        <div>
                          {msg.imageDataUrl && (
                            <img src={msg.imageDataUrl} alt="صورة للترجمة" className="chat-msg-thumb" />
                          )}
                          {cleanMsgText}
                        </div>
                        {msg.artwork && <AiArtworkCanvas artwork={msg.artwork} />}
                      </div>
                    );
                  })}
                </div>
              )}

              {(toolLoading || designVisualLoading) && (
                <div className="loading" style={{ marginBottom: 10 }}>
                  <span className="dot" /> جاري التفكير والتنفيذ…
                </div>
              )}

              {toolError && <div className="statusbox">{toolError}</div>}

              {toolKind === 'translate' && (
                <div className="char-sender-box" style={{ marginBottom: 12 }}>
                  <input
                    ref={translateCaptureInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => handleTranslateFileSelect(e.target.files)}
                  />
                  <input
                    ref={translateUploadInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleTranslateFileSelect(e.target.files)}
                  />

                  <div className="char-sender-head" style={{ marginBottom: 8 }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>عدسة الترجمة الفورية بالصور</strong>
                      <div className="tiny">
                        التقطي صورة بالكاميرا أو حمّلي صورة من جهازك وسأقرأ النصوص وأترجمها للغة المطلوبة فوراً.
                      </div>
                    </div>
                    <div className="toolrow">
                      <select
                        className="field"
                        style={{ width: 'auto', minWidth: 130, margin: 0, minHeight: 38, padding: '6px 10px' }}
                        value={translateTargetLang}
                        onChange={(e) => setTranslateTargetLang(e.target.value)}
                      >
                        <option value="العربية">ترجمة إلى: العربية</option>
                        <option value="الإنجليزية">ترجمة إلى: الإنجليزية</option>
                        <option value="الفرنسية">ترجمة إلى: الفرنسية</option>
                        <option value="الألمانية">ترجمة إلى: الألمانية</option>
                        <option value="الإسبانية">ترجمة إلى: الإسبانية</option>
                        <option value="التركية">ترجمة إلى: التركية</option>
                        <option value="الإيطالية">ترجمة إلى: الإيطالية</option>
                      </select>
                      <button type="button" className="secondary" onClick={openTranslateCamera}>
                        <Camera size={15} strokeWidth={1.9} />
                        التقاط صورة
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => translateUploadInputRef.current?.click()}
                      >
                        <ImagePlus size={15} strokeWidth={1.9} />
                        تحميل صورة
                      </button>
                    </div>
                  </div>

                  {translateCameraActive && (
                    <div className="lens-camera-box" style={{ marginTop: 8 }}>
                      <video
                        ref={translateCameraVideoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ width: '100%', maxHeight: 300, borderRadius: 12, background: '#070712' }}
                      />
                      <div className="toolrow" style={{ justifyContent: 'center', marginTop: 10 }}>
                        <button type="button" className="primary" onClick={captureFromTranslateCamera}>
                          <Camera size={15} strokeWidth={2} />
                          التقاط للترجمة
                        </button>
                        <button type="button" className="secondary" onClick={stopCameraStream}>
                          إغلاق الكاميرا
                        </button>
                      </div>
                    </div>
                  )}

                  {translateImageDataUrl && !translateCameraActive && (
                    <div className="lens-camera-box" style={{ marginTop: 8, marginBottom: 4 }}>
                      <img src={translateImageDataUrl} alt="صورة جاهزة للترجمة" className="lens-preview-img" style={{ maxHeight: 200 }} />
                      <div className="toolrow" style={{ justifyContent: 'center', marginTop: 8 }}>
                        <button
                          type="button"
                          className="primary"
                          disabled={toolLoading}
                          onClick={() => runTool(toolInput.trim() || `ترجمة الصورة إلى (${translateTargetLang})`)}
                        >
                          <Sparkles size={15} strokeWidth={2} />
                          ترجمة الصورة الآن
                        </button>
                        <button
                          type="button"
                          className="mini-btn danger"
                          onClick={() => setTranslateImageDataUrl('')}
                        >
                          إزالة الصورة
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {toolKind === 'design' && (
                <div className="char-sender-box" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span className="tiny">
                      استوديو التصميم الذكي (مثل شات جي بي تي): اكتب طلبك أو أي تعديل وسيرد بالشرح والتصميم البصري معاً
                    </span>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={designAutoVisual}
                        onChange={(e) => setDesignAutoVisual(e.target.checked)}
                      />
                      توليد تصميم بصري تلقائياً مع كل رد
                    </label>
                  </div>
                  <div className="history-chips">
                    {[
                      'صمم لي شعاراً فاخراً لمتجر عطور عربي بالذهبي والأسود',
                      'غيّر الألوان إلى سماوي وبنفسجي متدرج مع عمق ثلاثي الأبعاد',
                      'صمم بوستر إعلاني عصري لإطلاق تطبيق ذكاء اصطناعي',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="history-chip"
                        onClick={() => runTool(preset)}
                        disabled={toolLoading}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(toolKind === 'summarize' ||
                toolKind === 'code' ||
                toolKind === 'marketing' ||
                toolKind === 'proofread' ||
                toolKind === 'emails' ||
                toolKind === 'finance' ||
                toolKind === 'interview' ||
                toolKind === 'legal' ||
                toolKind === 'wellness') && (
                <div className="char-sender-box" style={{ marginBottom: 12 }}>
                  <div className="tiny" style={{ marginBottom: 8 }}>
                    {toolKind === 'summarize'
                      ? 'اقتراحات سريعة للتلخيص واستخراج أهم النقاط:'
                      : toolKind === 'code'
                        ? 'اقتراحات برمجية جاهزة:'
                        : toolKind === 'marketing'
                          ? 'اقتراحات تسويقية وإعلانية سريعة:'
                          : toolKind === 'proofread'
                            ? 'اقتراحات للتدقيق اللغوي وتصحيح النصوص:'
                            : toolKind === 'emails'
                              ? 'قوالب سريعة للإيميلات والرسائل الرسمية:'
                              : toolKind === 'finance'
                                ? 'اقتراحات سريعة للميزانية والتخطيط المالي:'
                                : toolKind === 'interview'
                                  ? 'اقتراحات سريعة للتدريب على مقابلات العمل:'
                                  : toolKind === 'legal'
                                    ? 'قوالب سريعة لصياغة العقود ومراجعة البنود:'
                                    : 'اقتراحات سريعة للتغذية الصحية واللياقة:'}
                  </div>
                  <div className="history-chips">
                    {(toolKind === 'summarize'
                      ? [
                          'لخّص النص التالي في 5 نقاط رئيسية مركّزة',
                          'استخرج قائمة المهام والقرارات العملية من هذا الاجتماع',
                          'بسّط هذا المقال إلى ملخص سريع للمذاكرة مع أهم المصطلحات',
                        ]
                      : toolKind === 'code'
                        ? [
                            'اكتب صفحة هبوط عصرية متجاوبة باستخدام HTML وCSS',
                            'اكتب معادلة Excel لحساب صافي الربح ونسبة النمو تلقائياً',
                            'اشرح هذا الكود واكتشف الأخطاء فيه مع كتابة النسخة المصححة',
                          ]
                        : toolKind === 'marketing'
                          ? [
                              'اكتب إعلاناً تسويقياً جذاباً لمنتج عناية أو متجر إلكتروني',
                              'أعدّ لي خطة محتوى أسبوعية لزيادة التفاعل على السوشيال ميديا',
                              'اكتب 5 عناوين جذابة وسيناريو فيديو قصير للتعريف بخدمتي',
                            ]
                          : toolKind === 'proofread'
                            ? [
                                'صحّح الأخطاء الإملائية والنحوية وعلامات الترقيم في هذا النص مع ذكر سبب التصحيح',
                                'دقّق هذا البحث لغوياً واضبط همزات القطع والوصل وصحة الجمل',
                                'صحّح هذه الفقرة الإنجليزية وأعد كتابتها بأسلوب سليم قواعدياً',
                              ]
                            : toolKind === 'emails'
                              ? [
                                  'اكتب إيميل تقديم احترافي لوظيفة مع إبراز المهارات وطلب مقابلة',
                                  'اكتب رسالة اعتذار رسمية مهذبة لعميل مع تحديد موعد بديل',
                                  'اكتب إيميل متابعة رسمي لشركة بعد التقديم أو اجتماع عمل',
                                ]
                              : toolKind === 'finance'
                                ? [
                                    'قسّم راتبي الشهري بطريقة ذكية بين الالتزامات والمصاريف والادخار',
                                    'احسب لي نقطة التعادل وصافي الربح المتوقع لمشروع صغير',
                                    'أعدّ لي خطة سداد التزامات وادخار خلال 6 أشهر خطوة بخطوة',
                                  ]
                                : toolKind === 'interview'
                                  ? [
                                      'أجرِ معي محاكاة مقابلة عمل لوظيفة تسويق رقمي وطرح أول سؤال',
                                      'كيف أجيب باحترافية على سؤال: ما هي نقاط ضعفك وما الراتب المتوقع؟',
                                      'أعطني 8 أسئلة متوقعة في مقابلة مطور برمجيات مع إجابات نموذجية بأسلوب STAR',
                                    ]
                                  : toolKind === 'legal'
                                    ? [
                                        'اكتب مسودة عقد تقديم خدمات تصميم أو برمجة لحفظ حقوق الطرفين',
                                        'راجع هذا البند التعاقدي واشرح لي المخاطر المحتملة بلغة مبسطة',
                                        'صُغ اتفاقية عدم إفصاح وحفظ سرية (NDA) واضحة بين شركتين',
                                      ]
                                    : [
                                        'أعدّ لي جدول وجبات صحية متوازن لمدة أسبوع لرفع النشاط والتركيز',
                                        'احسب لي احتياجي اليومي من السعرات الحرارية والماء والبروتين',
                                        'اقترح لي برنامج تمارين منزلية لمدة 20 دقيقة يومياً للمبتدئين',
                                      ]
                    ).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="history-chip"
                        onClick={() => setToolInput((prev) => (prev.trim() ? `${preset}:\n${prev}` : preset))}
                        disabled={toolLoading}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <textarea
                id="toolinput"
                value={toolInput}
                onChange={(e) => setToolInput(e.target.value)}
                placeholder={
                  toolKind === 'design'
                    ? 'اطلب أي تصميم أو شعار أو بوستر، أو اكتب تعديلاً على التصميم السابق...'
                    : toolKind === 'translate'
                      ? 'اكتب النص المطلوب ترجمته أو اكتب ملاحظة تحت الصورة المرفقة للترجمة...'
                      : toolKind === 'summarize'
                        ? 'ألصق المقال أو الدرس أو النص الطويل هنا لأقوم بتلخيصه في نقاط مركّزة...'
                        : toolKind === 'code'
                          ? 'اكتب فكرة البرنامج أو ألصق الكود لإصلاحه أو شرحه...'
                          : toolKind === 'marketing'
                            ? 'صف منتجك أو خدمتك والجمهور المستهدف لكتابة حملة أو منشورات تسويقية...'
                            : toolKind === 'proofread'
                              ? 'ألصق النص العربي أو الإنجليزي هنا لتدقيقه إملائياً ونحوياً وتصحيح الأخطاء فقط...'
                              : toolKind === 'emails'
                                ? 'اكتب موضوع الرسالة والجهة المستلمة وأهم النقاط لأصوغ لك إيميلاً رسمياً متكاملاً...'
                                : toolKind === 'finance'
                                  ? 'اكتب دخلك أو مصاريفك أو أرقام مشروعك لأعدّ لك ميزانية وخطة ادخار دقيقة...'
                                  : toolKind === 'interview'
                                    ? 'اكتب المسمى الوظيفي أو الصق إجابتك لأقيّمها وأدربك على أسئلة المقابلة...'
                                    : toolKind === 'legal'
                                      ? 'اكتب نوع العقد أو ألصق البند القانوني لمراجعته وشرحه وصياغة مسودة واضحة...'
                                      : toolKind === 'wellness'
                                        ? 'اكتب هدفك الصحي أو عمرك ووزنك ومستوى نشاطك لأرتّب لك خطة تغذية ولياقة مناسبة...'
                                        : `اكتب طلبك المتخصص في (${TOOLS[toolKind][0]}) هنا...`
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    runTool();
                  }
                }}
              />
              <div className="toolrow">
                <button type="button" className="primary" id="toolbtn" disabled={toolLoading} onClick={() => runTool()}>
                  {toolLoading
                    ? 'جاري التصميم والكتابة…'
                    : toolKind === 'design'
                      ? 'صمّم الآن (نص + صورة) ←'
                      : toolKind === 'translate' && translateImageDataUrl
                        ? 'ترجمة الصورة والنص الآن ←'
                        : 'إرسال في هذه المحادثة ←'}
                </button>
                {toolKind === 'design' && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={designVisualLoading}
                    onClick={generateDesignPreview}
                  >
                    <Sparkles size={15} strokeWidth={1.9} />
                    {designVisualLoading ? 'جاري التصميم…' : 'رسم نموذج بصري منفرد'}
                  </button>
                )}
              </div>
            </div>
          )}

          {view === 'feature' && (
            <div className="feature-panel show" id="featurepanel">
              <div className="chat-header">
                <h3 id="featuretitle" style={{ margin: 0 }}>{featureMeta[0]}</h3>
                {currentFeatureHistory.length > 0 && (
                  <button
                    type="button"
                    className="mini-btn danger"
                    onClick={() => clearFeatureHistory(featureKind)}
                  >
                    <Trash2 size={12} strokeWidth={1.9} />
                    مسح سجل هذه الأداة
                  </button>
                )}
              </div>

              <div className="icon-purpose-box">
                <span className="icon-purpose-title">وظيفة هذه الأيقونة</span>
                <span id="featuredesc" className="icon-purpose-text">{featureMeta[1]}</span>
              </div>

              {featureMeta[2] === 'tasks' && <DailyTasksPanel geminiMode={geminiMode} />}

              {featureMeta[2] === 'charts' && <SmartChartsPanel geminiMode={geminiMode} />}

              {featureMeta[2] === 'video_explainer' && <TopicVideoExplainerPanel geminiMode={geminiMode} />}

              {featureMeta[2] === 'docs' && (
                <div id="docControls">
                  <label className="mini-label" htmlFor="docAiPrompt">
                    إنشاء المحتوى بالذكاء الاصطناعي (اختياري)
                  </label>
                  <div className="toolrow">
                    <input
                      id="docAiPrompt"
                      className="field"
                      style={{ flex: 1, margin: 0 }}
                      value={docAiPrompt}
                      onChange={(e) => setDocAiPrompt(e.target.value)}
                      placeholder="مثال: خطة عمل متجر إلكتروني أو جدول مصاريف شهري..."
                    />
                    <button
                      type="button"
                      className="primary"
                      disabled={docAiLoading}
                      onClick={generateDocWithAI}
                    >
                      <Sparkles size={15} strokeWidth={2} />
                      {docAiLoading ? 'جاري التوليد…' : 'إنشاء بالذكاء الاصطناعي'}
                    </button>
                  </div>

                  <label className="mini-label" htmlFor="doctype">
                    صيغة ونوع الملف
                  </label>
                  <select className="field" id="doctype" value={docType} onChange={(e) => setDocType(e.target.value)}>
                    <option value="docx">مستند Word (DOCX)</option>
                    <option value="pdf">ملف PDF للطباعة والمشاركة</option>
                    <option value="pptx">عرض شرائح PowerPoint (PPTX)</option>
                    <option value="xlsx">جدول بيانات Excel (XLSX)</option>
                    <option value="csv">ملف جداول CSV</option>
                    <option value="html">صفحة ويب HTML</option>
                  </select>

                  <label className="mini-label" htmlFor="docname">
                    اسم الملف
                  </label>
                  <input
                    className="field"
                    id="docname"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                  />

                  <label className="mini-label" htmlFor="doccontent">
                    المحتوى أو البيانات
                  </label>
                  <textarea
                    className="field"
                    id="doccontent"
                    value={docContent}
                    onChange={(e) => setDocContent(e.target.value)}
                    placeholder="اكتبي النص أو البيانات هنا..."
                    style={{ minHeight: 180 }}
                  />
                  <div className="toolrow">
                    <button type="button" className="primary" onClick={downloadOfficeFile}>
                      <Download size={15} strokeWidth={2} />
                      إنشاء وتنزيل الملف
                    </button>
                  </div>
                  <div className={`statusbox ${docStatus ? 'info' : ''}`}>
                    {docStatus ||
                      'يمكنك كتابة المحتوى مباشرة أو استخدام الذكاء الاصطناعي لتعبئة وتنسيق المستندات وملفات الطباعة والعروض التقديمية وجداول البيانات وصفحات الويب الحقيقية وتنزيلها فوراً.'}
                  </div>
                </div>
              )}

              {featureMeta[2] === 'cv' && <CvBuilderPanel cv={cvData} onChange={setCvData} geminiMode={geminiMode} />}

              {featureMeta[2] === 'lens' && (
                <div id="lensControls">
                  <input
                    ref={lensCaptureInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => handleLensFileSelect(e.target.files)}
                  />
                  <input
                    ref={lensUploadInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleLensFileSelect(e.target.files)}
                  />

                  <div className="toolrow" style={{ marginBottom: 12 }}>
                    <button type="button" className="primary" onClick={openLensCamera}>
                      <Camera size={15} strokeWidth={2} />
                      التقاط صورة بالكاميرا
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => lensUploadInputRef.current?.click()}
                    >
                      <ImagePlus size={15} strokeWidth={1.9} />
                      اختيار صورة من الجهاز
                    </button>
                    {lensImageDataUrl && (
                      <button
                        type="button"
                        className="mini-btn danger"
                        onClick={() => {
                          setLensImageDataUrl('');
                          setLensAnswer('');
                          setLensStatus('');
                        }}
                      >
                        مسح الصورة
                      </button>
                    )}
                  </div>

                  {cameraActive && (
                    <div className="lens-camera-box">
                      <video
                        ref={cameraVideoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ width: '100%', maxHeight: 340, borderRadius: 12, background: '#070712' }}
                      />
                      <div className="toolrow" style={{ justifyContent: 'center', marginTop: 10 }}>
                        <button type="button" className="primary" onClick={captureFromLensCamera}>
                          <Camera size={15} strokeWidth={2} />
                          التقاط اللقطة الآن
                        </button>
                        <button type="button" className="secondary" onClick={stopCameraStream}>
                          إغلاق الكاميرا
                        </button>
                      </div>
                    </div>
                  )}

                  {lensImageDataUrl && !cameraActive && (
                    <div className="lens-camera-box">
                      <img src={lensImageDataUrl} alt="الصورة الملتقطة" className="lens-preview-img" />
                    </div>
                  )}

                  <label className="mini-label" htmlFor="lensquestion">
                    اكتبي تحت الصورة ماذا تريدين (السؤال أو المطلوب حله)
                  </label>
                  <textarea
                    id="lensquestion"
                    className="field"
                    value={lensQuestion}
                    onChange={(e) => setLensQuestion(e.target.value)}
                    placeholder="اكتبي هنا سؤالك تحت الصورة (مثلاً: احسب ناتج هذه المسألة بالخطوات، أو اشرح هذا الدرس، أو ما هذا؟)..."
                    style={{ minHeight: 110 }}
                  />

                  <div className="toolrow">
                    <button
                      type="button"
                      className="primary"
                      disabled={lensLoading}
                      onClick={analyzeLensImage}
                    >
                      <Sparkles size={15} strokeWidth={2} />
                      {lensLoading ? 'جاري فحص الصورة والحل…' : 'حل وتحليل الصورة الآن'}
                    </button>
                  </div>

                  {lensStatus && <div className="statusbox info">{lensStatus}</div>}

                  {lensAnswer && (
                    <div className="result" style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ color: '#67e8f9' }}>الحل والشرح بالعدسة الذكية</strong>
                        <div className="msg-actions">
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() => copyWithFeedback('lens-answer', lensAnswer)}
                          >
                            {copiedId === 'lens-answer' ? <Check size={12} /> : <Copy size={12} />}
                            {copiedId === 'lens-answer' ? 'تم النسخ' : 'نسخ الحل'}
                          </button>
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() => sendTextToDocs('حل-العدسة-الذكية', lensAnswer)}
                          >
                            <FilePlus2 size={12} />
                            حفظ كمستند
                          </button>
                        </div>
                      </div>
                      <div>{lensAnswer}</div>
                    </div>
                  )}
                </div>
              )}

              {featureMeta[2] === 'voicechat' && <VoiceChatPanel geminiMode={geminiMode} />}

              {currentFeatureHistory.length > 0 && (
                <div className="history-strip">
                  <div className="tiny">الأعمال والمحادثات المحفوظة لهذه الأداة ({currentFeatureHistory.length}):</div>
                  <div className="history-chips">
                    {currentFeatureHistory.map((item) => (
                      <div
                        key={item.id}
                        className={`history-chip ${item.id === activeHistoryId ? 'active' : ''}`}
                      >
                        <button
                          type="button"
                          style={{ background: 'none', border: 0, color: 'inherit', padding: 0 }}
                          onClick={() => applyHistoryItem(item, featureKind)}
                        >
                          {item.prompt.slice(0, 32)}{item.prompt.length > 32 ? '…' : ''}
                        </button>
                        <button
                          type="button"
                          className="mini-btn danger"
                          style={{ padding: '1px 6px' }}
                          onClick={() => deleteFeatureHistoryItem(featureKind, item.id)}
                          aria-label="حذف"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {view === 'qr' && <ShareQrPanel />}

          <div className="section">
            <h2>اكتشف أدواتك الذكية</h2>
          </div>

          <div className="grid">
            <button type="button" className="card writer" onClick={() => openTool('writer')}>
              <span className="ico"><PenLine size={22} strokeWidth={1.85} /></span>
              <strong>الكتابة والصياغة</strong>
              <small>رسائل، مقالات، قصص، تلخيص وتحسين النصوص.</small>
            </button>
            <button type="button" className="card learn" onClick={() => openTool('learn')}>
              <span className="ico"><GraduationCap size={22} strokeWidth={1.85} /></span>
              <strong>التعلّم والشرح</strong>
              <small>تبسيط المعلومات، شرح الدروس والإجابة عن الأسئلة.</small>
            </button>
            <button type="button" className="card ideas" onClick={() => openTool('ideas')}>
              <span className="ico"><Lightbulb size={22} strokeWidth={1.85} /></span>
              <strong>الأفكار والإبداع</strong>
              <small>أفكار مشاريع، أسماء، محتوى وحلول مبتكرة.</small>
            </button>
            <button type="button" className="card plan" onClick={() => openTool('plan')}>
              <span className="ico"><CalendarCheck size={22} strokeWidth={1.85} /></span>
              <strong>التخطيط والتنظيم</strong>
              <small>خطط يومية، أهداف، قوائم وخطوات عملية.</small>
            </button>
            <button type="button" className="card design" onClick={() => openTool('design')}>
              <span className="ico"><Palette size={22} strokeWidth={1.85} /></span>
              <strong>مساعد التصميم</strong>
              <small>أفكار هوية بصرية، ألوان، شعارات ووصف تصاميم.</small>
            </button>
            <button type="button" className="card translate" onClick={() => openTool('translate')}>
              <span className="ico"><Languages size={22} strokeWidth={1.85} /></span>
              <strong>الترجمة وعدسة النصوص</strong>
              <small>ترجمة فورية للنصوص والصور (التقاط كاميرا أو تحميل صورة) بلغات متعددة.</small>
            </button>
            <button type="button" className="card lens" onClick={() => openFeature('lens')}>
              <span className="ico"><ScanEye size={22} strokeWidth={1.85} /></span>
              <strong>العدسة الذكية</strong>
              <small>صوّري بالكاميرا واكتبي سؤالك تحت الصورة للحصول على الحل فوراً.</small>
            </button>
            <button type="button" className="card docs" onClick={() => openFeature('docs')}>
              <span className="ico"><FileText size={22} strokeWidth={1.85} /></span>
              <strong>إنشاء المستندات والملفات</strong>
              <small>مستندات وورد، ملفات طباعة ثابتة، عروض تقديمية، جداول إكسل وصفحات ويب.</small>
            </button>
            <button type="button" className="card cv" onClick={() => openFeature('cv')}>
              <span className="ico"><IdCard size={22} strokeWidth={1.85} /></span>
              <strong>إنشاء سيرة ذاتية</strong>
              <small>تصميم سيرة ذاتية احترافية بالذكاء الاصطناعي وتنزيلها كمستند أو ملف طباعة.</small>
            </button>
            <button type="button" className="card tasks" onClick={() => openFeature('tasks')}>
              <span className="ico"><ListChecks size={22} strokeWidth={1.85} /></span>
              <strong>المهام اليومية</strong>
              <small>قائمة مهام يومية تفاعلية مع شريط إنجاز وترتيب ذكي لأولويات يومك.</small>
            </button>
            <button type="button" className="card charts" onClick={() => openFeature('charts')}>
              <span className="ico"><BarChart3 size={22} strokeWidth={1.85} /></span>
              <strong>الرسم البياني الذكي</strong>
              <small>إنشاء مخططات أعمدة وخطية ودائرية ومساحية لأي بيانات أو مقارنات فوراً.</small>
            </button>
            <button type="button" className="card video-explainer" onClick={() => openFeature('video_explainer')}>
              <span className="ico"><Video size={22} strokeWidth={1.85} /></span>
              <strong>شرح الموضوع بفيديو</strong>
              <small>اكتبي أي موضوع ليحوّله ZORVYX AI إلى فيديو كامل بالمشاهد والتعليق الصوتي المتصل.</small>
            </button>
            <button type="button" className="card voicechat" onClick={() => openFeature('voicechat')}>
              <span className="ico"><Volume2 size={22} strokeWidth={1.85} /></span>
              <strong>المُتحدّث الصوتي الذكي</strong>
              <small>اكتبي أو اختاري أي سؤال ليتحدّث إليك زورفيكس بصوته الطبيعي دون أي أذونات.</small>
            </button>
            <button type="button" className="card summarize" onClick={() => openTool('summarize')}>
              <span className="ico"><BookOpenCheck size={22} strokeWidth={1.85} /></span>
              <strong>المُلخِّص الذكي</strong>
              <small>تلخيص المقالات والكتب والاجتماعات الطويلة في نقاط واضحة ومهام عملية فوراً.</small>
            </button>
            <button type="button" className="card code" onClick={() => openTool('code')}>
              <span className="ico"><Code2 size={22} strokeWidth={1.85} /></span>
              <strong>المُبرمج والمُطوّر الذكي</strong>
              <small>كتابة الأكواد والمواقع وإصلاح الأخطاء البرمجية وشرحها مع معادلات إكسل.</small>
            </button>
            <button type="button" className="card marketing" onClick={() => openTool('marketing')}>
              <span className="ico"><Megaphone size={22} strokeWidth={1.85} /></span>
              <strong>خبير التسويق والمحتوى</strong>
              <small>كتابة الإعلانات المقنعة وخطط المحتوى ومنشورات السوشيال ميديا لزيادة المبيعات.</small>
            </button>
            <button type="button" className="card proofread" onClick={() => openTool('proofread')}>
              <span className="ico"><SpellCheck size={22} strokeWidth={1.85} /></span>
              <strong>المُصحِّح والتدقيق اللغوي</strong>
              <small>تدقيق إملائي ونحوي وضبط علامات الترقيم وتصحيح النصوص العربية والإنجليزية.</small>
            </button>
            <button type="button" className="card emails" onClick={() => openTool('emails')}>
              <span className="ico"><MailCheck size={22} strokeWidth={1.85} /></span>
              <strong>الإيميلات والرسائل الرسمية</strong>
              <small>صياغة الرسائل والإيميلات الوظيفية والتجارية والرسمية بأسلوب مهني راقٍ.</small>
            </button>
            <button type="button" className="card finance" onClick={() => openTool('finance')}>
              <span className="ico"><Wallet size={22} strokeWidth={1.85} /></span>
              <strong>المُستشار المالي والميزانية</strong>
              <small>تنظيم الميزانية الشهرية وتوزيع المصاريف وخطط الادخار وحسابات الأرباح.</small>
            </button>
            <button type="button" className="card interview" onClick={() => openTool('interview')}>
              <span className="ico ico-shape-hex"><BriefcaseBusiness size={22} strokeWidth={1.85} /></span>
              <strong>مُدرّب المقابلات الوظيفية</strong>
              <small>محاكاة مقابلات العمل وأسئلة التوظيف وتقييم إجاباتك بأسلوب احترافي.</small>
            </button>
            <button type="button" className="card legal" onClick={() => openTool('legal')}>
              <span className="ico ico-shape-shield"><Scale size={22} strokeWidth={1.85} /></span>
              <strong>الصياغة القانونية والعقود</strong>
              <small>صياغة ومراجعة مسودات العقود والاتفاقيات وشرح البنود القانونية بوضوح.</small>
            </button>
            <button type="button" className="card wellness" onClick={() => openTool('wellness')}>
              <span className="ico ico-shape-octagon"><HeartPulse size={22} strokeWidth={1.85} /></span>
              <strong>مستشار الصحة والتغذية واللياقة</strong>
              <small>خطط تغذية صحية، حساب السعرات، برامج تمارين، وتنظيم النوم والعادات اليومية.</small>
            </button>
          </div>

          <div className="quick-actions-bar">
            <button type="button" className="pill" onClick={openQrView}>
              <QrCode size={15} strokeWidth={1.9} />
              الرابط الدائم والباركود
            </button>
          </div>

          <footer>
            منصة ZORVYX AI للذكاء الاصطناعي — تصميم وتطوير: Noha Ismail Fathi Abu Arab<br />
            نهى إسماعيل فتحي ابو عرب<br />
            © جميع الحقوق محفوظة
          </footer>
        </main>
      </div>

      <div className="mobile">
        <button type="button" className={activeNav === 'home' ? 'active' : ''} onClick={goHome}>
          <span className="mobile-ico"><Home size={18} strokeWidth={1.9} /></span>
          الرئيسية
        </button>
        <button type="button" className={activeNav === 'assistant' ? 'active' : ''} onClick={focusMain}>
          <span className="mobile-ico"><Bot size={18} strokeWidth={1.9} /></span>
          اسأل المساعد
        </button>
        <button type="button" className={activeNav === 'lens' ? 'active' : ''} onClick={() => openFeature('lens')}>
          <span className="mobile-ico"><ScanEye size={18} strokeWidth={1.9} /></span>
          العدسة
        </button>
        <button type="button" className={activeNav === 'summarize' ? 'active' : ''} onClick={() => openTool('summarize')}>
          <span className="mobile-ico"><BookOpenCheck size={18} strokeWidth={1.9} /></span>
          المُلخِّص
        </button>
        <button type="button" className={activeNav === 'docs' ? 'active' : ''} onClick={() => openFeature('docs')}>
          <span className="mobile-ico"><FileText size={18} strokeWidth={1.9} /></span>
          المستندات
        </button>
        <button type="button" className={activeNav === 'qr' ? 'active' : ''} onClick={openQrView}>
          <span className="mobile-ico"><QrCode size={18} strokeWidth={1.9} /></span>
          الباركود
        </button>
      </div>
    </>
  );
}
