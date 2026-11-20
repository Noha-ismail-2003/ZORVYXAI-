import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Play, Trash2, Copy, Check, Send } from 'lucide-react';
import {
  getGlobalAudioContext,
  stripHashMarks,
  unlockGlobalAudioContext,
} from '../utils/mediaExport';

interface VoiceTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  audioBase64?: string;
  createdAt: number;
}

const VOICE_CHAT_STORAGE_KEY = 'zorvyx_voice_chat_v1';

const VOICE_STYLES = [
  { id: 'kore_warm', label: 'صوت امرأة دافئ وهادئ (ليلى)' },
  { id: 'zephyr_bright', label: 'صوت امرأة حيوي ومشرق (سارة)' },
  { id: 'charon_calm', label: 'صوت رجل رصين وهادئ (عمر)' },
  { id: 'puck_dynamic', label: 'صوت رجل شبابي نشيط (طارق)' },
];

function loadSavedVoiceTurns(): VoiceTurn[] {
  try {
    const raw = localStorage.getItem(VOICE_CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function base64ToAudioArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

interface VoiceChatProps {
  geminiMode?: 'fast' | 'balanced' | 'pro';
}

export function VoiceChatPanel({ geminiMode = 'balanced' }: VoiceChatProps) {
  const [turns, setTurns] = useState<VoiceTurn[]>(loadSavedVoiceTurns);
  const [voicePreset, setVoicePreset] = useState('kore_warm');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const compact = turns.slice(-24).map((t) => ({ ...t, audioBase64: undefined }));
      localStorage.setItem(VOICE_CHAT_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // ignore quota limit
    }
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [turns]);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  function stopPlayback() {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // ignore
      }
      currentSourceRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }

  async function playAssistantAudio(replyText: string, audioBase64?: string) {
    stopPlayback();
    const ctx = unlockGlobalAudioContext() || getGlobalAudioContext();

    if (audioBase64 && ctx) {
      try {
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        const ab = base64ToAudioArrayBuffer(audioBase64);
        const decoded = await ctx.decodeAudioData(ab);
        const src = ctx.createBufferSource();
        src.buffer = decoded;
        src.connect(ctx.destination);
        currentSourceRef.current = src;
        setIsSpeaking(true);
        src.onended = () => {
          if (currentSourceRef.current === src) currentSourceRef.current = null;
          setIsSpeaking(false);
        };
        src.start(0);
        return;
      } catch {
        // fallback to speechSynthesis below
      }
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const chunks = replyText
        .split(/(?<=[.!؟\n])\s+/)
        .map((c) => c.trim())
        .filter(Boolean);
      const list = chunks.length > 0 ? chunks : [replyText];
      let idx = 0;
      setIsSpeaking(true);

      const speakNext = () => {
        if (idx >= list.length) {
          setIsSpeaking(false);
          return;
        }
        const utter = new SpeechSynthesisUtterance(list[idx]);
        utter.lang = 'ar-SA';
        utter.rate = 0.96;
        utter.onend = () => {
          idx += 1;
          speakNext();
        };
        utter.onerror = () => {
          setIsSpeaking(false);
        };
        window.speechSynthesis.speak(utter);
      };
      speakNext();
    }
  }

  async function sendVoiceMessage(messageText: string) {
    const clean = messageText.trim();
    if (!clean || isProcessing) return;
    unlockGlobalAudioContext();
    stopPlayback();
    setIsProcessing(true);
    setStatusMsg('زورفيكس يجهّز الرد ويتحدّث إليك الآن…');
    try {
      const historyPayload = turns.slice(-10).map((t) => ({ role: t.role, text: t.text }));
      const r = await fetch('/api/voice-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: clean,
          voicePreset,
          history: historyPayload,
          geminiMode,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(data.error || 'تعذر إتمام المحادثة الصوتية.');
      }

      const cleanUser = stripHashMarks(data.userTranscript || clean);
      const cleanReply = stripHashMarks(data.replyText || 'أهلاً بك! كيف أساعدك؟');
      const now = Date.now();

      const nextTurns: VoiceTurn[] = [
        { id: `vu-${now}`, role: 'user', text: cleanUser, createdAt: now },
        {
          id: `va-${now + 1}`,
          role: 'assistant',
          text: cleanReply,
          audioBase64: data.audioBase64,
          createdAt: now + 1,
        },
      ];
      setTurns((prev) => [...prev, ...nextTurns]);
      setStatusMsg('');
      await playAssistantAudio(cleanReply, data.audioBase64);
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : 'حدث خطأ أثناء المحادثة الصوتية.');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleTextVoiceSend() {
    const clean = textDraft.trim();
    if (!clean || isProcessing) return;
    setTextDraft('');
    await sendVoiceMessage(clean);
  }

  function handleOrbClick() {
    if (isSpeaking) {
      stopPlayback();
      return;
    }
    const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant');
    if (lastAssistant) {
      void playAssistantAudio(lastAssistant.text, lastAssistant.audioBase64);
    } else {
      void sendVoiceMessage('عرّفني بنفسك');
    }
  }

  function copyTurn(id: string, text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
  }

  return (
    <div id="voiceChatControls" className="voice-chat-shell">
      <div className="voice-orb-stage">
        <button
          type="button"
          className={`voice-orb ${isSpeaking ? 'speaking' : isProcessing ? 'thinking' : ''}`}
          aria-live="polite"
          disabled={isProcessing}
          onClick={handleOrbClick}
          title={isSpeaking ? 'إيقاف الصوت الحالي' : 'اضغطي ليستمع إليك ويتحدث بصوته'}
        >
          <div className="voice-orb-core">
            {isSpeaking ? <VolumeX size={34} /> : <Volume2 size={36} />}
          </div>
        </button>

        <div className="voice-state-caption">
          {isProcessing
            ? 'زورفيكس يجهّز حديثه الصوتي الآن…'
            : isSpeaking
              ? 'زورفيكس يتحدث إليك بصوته الآن…'
              : 'يفتح المُتحدّث الصوتي مباشرة دون أي أذونات — اكتبي أو اختاري أي سؤال ليحدّثك زورفيكس بصوته'}
        </div>

        <div className="history-chips" style={{ justifyContent: 'center', marginBottom: 4 }}>
          {[
            'عرّفني بنفسك',
            'أعطني نصيحة محفّزة وجميلة ليومي',
            'اشرح لي فكرة علمية مدهشة باختصار',
          ].map((starter) => (
            <button
              key={starter}
              type="button"
              className="history-chip"
              disabled={isProcessing}
              onClick={() => void sendVoiceMessage(starter)}
            >
              {starter}
            </button>
          ))}
        </div>

        <div className="voice-controls-row">
          <button
            type="button"
            className="primary voice-main-btn"
            disabled={isProcessing}
            onClick={() => void sendVoiceMessage('عرّفني بنفسك')}
          >
            <Volume2 size={18} />
            استمع للتعريف الصوتي
          </button>

          {isSpeaking && (
            <button type="button" className="secondary" onClick={stopPlayback}>
              <VolumeX size={17} />
              إيقاف الصوت الحالي
            </button>
          )}
        </div>
      </div>

      <div className="voice-text-fallback">
        <input
          type="text"
          className="field"
          style={{ marginBottom: 0, flex: 1 }}
          value={textDraft}
          onChange={(e) => setTextDraft(e.target.value)}
          placeholder="اكتبي رسالتك أو سؤالك هنا ليتحدث زورفيكس ويجيبك بصوته فوراً…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleTextVoiceSend();
            }
          }}
        />
        <button
          type="button"
          className="primary"
          disabled={isProcessing || !textDraft.trim()}
          onClick={() => void handleTextVoiceSend()}
        >
          <Send size={15} style={{ display: 'inline', marginLeft: 6 }} />
          إرسال والاستماع للرد
        </button>
      </div>

      <div className="voice-settings-bar">
        <div style={{ flex: 1, minWidth: 210 }}>
          <label className="mini-label" htmlFor="voiceChatPreset" style={{ marginTop: 0 }}>
            نبرة صوت المساعد الذكي
          </label>
          <select
            id="voiceChatPreset"
            className="field"
            style={{ marginBottom: 0 }}
            value={voicePreset}
            onChange={(e) => setVoicePreset(e.target.value)}
          >
            {VOICE_STYLES.map((vs) => (
              <option key={vs.id} value={vs.id}>
                {vs.label}
              </option>
            ))}
          </select>
        </div>

        {turns.length > 0 && (
          <button
            type="button"
            className="mini-btn danger"
            style={{ alignSelf: 'flex-end', marginBottom: 8 }}
            onClick={() => {
              stopPlayback();
              setTurns([]);
            }}
          >
            <Trash2 size={13} style={{ display: 'inline', marginLeft: 4 }} />
            مسح المحادثة
          </button>
        )}
      </div>

      {statusMsg && <div className="statusbox info">{statusMsg}</div>}

      {turns.length > 0 && (
        <div className="chat-thread" ref={threadRef} style={{ marginTop: 8, maxHeight: 340 }}>
          {turns.map((turn) => (
            <div key={turn.id} className={`chat-msg ${turn.role}`}>
              <div className="chat-msg-head">
                <span>{turn.role === 'user' ? 'أنت' : 'زورفيكس الناطق'}</span>
                <span className="msg-actions">
                  {turn.role === 'assistant' && (
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => void playAssistantAudio(turn.text, turn.audioBase64)}
                    >
                      <Play size={11} style={{ display: 'inline', marginLeft: 4 }} />
                      استماع
                    </button>
                  )}
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => copyTurn(turn.id, turn.text)}
                  >
                    {copiedId === turn.id ? <Check size={11} /> : <Copy size={11} />}
                  </button>
                </span>
              </div>
              <div>{turn.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
