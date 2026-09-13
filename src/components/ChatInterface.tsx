import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Message, ImageAttachment, SessionMessage } from '../types';
import { Send, Image as ImageIcon, LogOut, Languages, Loader2 } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { sendChatMessage, getChatSession, uploadImage } from '../api';
import { ApiClientError, friendlyMessageKey } from '../api/client';
import VoiceRecorder from './VoiceRecorder';

// Frontend UX guard — the backend remains authoritative. Values mirror the backend: the
// approved formats (utils/imageFormat.js) and the default 5MB upload cap (IMAGE_UPLOAD_MAX_BYTES).
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface Props {
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  // Reports each send; `true` means a brand-new session was created by this message
  // (the sidebar should refresh its list only then).
  onMessageSent?: (createdNew: boolean) => void;
  onOpenSidebar?: () => void;
}

// Backend messages carry no id and use ISO timestamps; the UI model needs a stable React
// key. The index-based id is a rendering key only — no backend message fields are fabricated.
const toViewMessages = (msgs: SessionMessage[]): Message[] =>
  msgs.map((m, i) => ({
    id: `srv-${i}`,
    sender: m.sender === 'user' ? 'user' : 'ai',
    timestamp: new Date(m.timestamp),
    text: m.text,
    // imageId (E3 image-turn link) is preserved in the SessionMessage type layer; historical
    // image turns render as their text/timestamp — the backend does not return diagnosis
    // payloads in session history, so no diagnosis card is fabricated for them.
  }));

export const ChatInterface = ({
  activeChatId,
  setActiveChatId,
  onMessageSent,
  onOpenSidebar,
}: Props) => {
  const { t, i18n } = useTranslation();
  const { user, logout, language, setLanguage } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<ImageAttachment | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  // Real send stages backing the loader copy: upload → analyze (image only) → processing.
  const [sendStage, setSendStage] = useState<'idle' | 'uploading' | 'analyzing' | 'processing'>('idle');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Hard double-submit guard (state updates are async — a ref is synchronous).
  const submittingRef = useRef(false);
  // Mirrors the latest composer image so the unmount cleanup releases its object URL.
  const selectedImageRef = useRef<ImageAttachment | null>(null);
  // Monotonic id per history load: only the newest request may write message state, so a
  // slow old session fetch can never overwrite the session the user just switched to.
  const historyRequestId = useRef(0);
  // Latest active session, readable inside async send/flows after re-renders.
  const activeChatIdRef = useRef(activeChatId);
  const mountedRef = useRef(true);

  // ✅ AUTO SCROLL ONLY MESSAGE AREA
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // Cleanup on unmount so async tasks of a departed component never write React state.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Keep the cleanup ref in sync with the latest composer image.
  useEffect(() => {
    selectedImageRef.current = selectedImage;
  }, [selectedImage]);

  // Revoke any composer object URL that would outlive the chat UI. URLs held by rendered
  // message bubbles are still in use (the message displays the user's chosen image), so
  // they are intentionally left alive.
  useEffect(() => {
    return () => {
      if (selectedImageRef.current) {
        URL.revokeObjectURL(selectedImageRef.current.previewUrl);
      }
    };
  }, []);

  useEffect(() => setInput(''), [activeChatId]);

  useEffect(() => {
    const id = ++historyRequestId.current;
    setHistoryError(null);
    if (!activeChatId) {
      setMessages([]);
      setIsLoadingHistory(false);
      return;
    }

    // Switching sessions resets the body immediately: the previous session's bubbles must
    // never linger under the new session label. A failed load leaves the error state visible
    // (see the catch below) rather than silently showing an empty body.
    setMessages([]);
    setIsLoadingHistory(true);

    (async () => {
      try {
        // Routed through the authenticated client so the Backend access token is attached.
        const session = await getChatSession(activeChatId);
        if (historyRequestId.current !== id) return; // user switched sessions meanwhile
        setMessages(toViewMessages(session.messages));
      } catch (err) {
        if (historyRequestId.current !== id) return; // stale failure for a superseded request
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 429)) {
          return; // 401 → auth layer routes to login; 429 silent here is acceptable as the
          // request is retried on next session switch, and the rate-limit toasts apply to
          // user-initiated actions.
        }
        if (err instanceof ApiClientError && err.status === 404) {
          // Session unavailable (deleted/unowned): safe empty state, no raw details.
          setMessages([]);
          return;
        }
        // Network/server failure: user-visible, existing friendly error.
        setHistoryError('serverError');
      } finally {
        if (historyRequestId.current === id) setIsLoadingHistory(false);
      }
    })();
  }, [activeChatId]);

  const removeImage = () => {
    if (selectedImage) URL.revokeObjectURL(selectedImage.previewUrl);
    setSelectedImage(null);
    setAttachError(null);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file for a new turn
    if (!file) return;
    // Frontend UX guard only — the backend's magic-byte + size validation stays authoritative.
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setAttachError('unsupportedImage');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setAttachError('imageTooLarge');
      return;
    }
    if (selectedImage) URL.revokeObjectURL(selectedImage.previewUrl);
    setAttachError(null);
    setSelectedImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const handleSend = async () => {
    if (submittingRef.current) return;
    const text = input.trim();
    if (!text && !selectedImage) return;

    const hasImage = Boolean(selectedImage);
    // The session this turn is being sent to — the user may switch away while the request is
    // in flight, and appended bubbles must never land in a session they were not for.
    const sessionIdAtSend = activeChatId;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      timestamp: new Date(),
      text: text || undefined,
      image: selectedImage || undefined,
    };

    // Text-only keeps its existing behavior (input clears immediately). For an image turn the
    // composer keeps the image + text until the backend accepted the flow, so a failure leaves
    // enough UI state to retry and the user always sees exactly what was attempted.
    if (!hasImage) setInput('');
    setAttachError(null);
    setMessages(prev => [...prev, userMessage]);

    submittingRef.current = true;
    setIsProcessing(true);
    setSendStage(hasImage ? 'uploading' : 'processing');

    let uploadDone = false;
    try {
      // Sequence: upload first, then send the message with the returned uploadId. The image
      // is never uploaded just by selecting it — this runs only on an intentional Send.
      let uploadId: string | undefined;
      if (hasImage && selectedImage) {
        uploadId = (await uploadImage(selectedImage.file)).uploadId;
        uploadDone = true;
        setSendStage('analyzing');
      }

      // Owned by the authenticated token — no userEmail/cognitoSub/userId is sent.
      const res = await sendChatMessage(text, language, sessionIdAtSend, uploadId);

      // The turn was accepted/completed. If the component unmounted or the user switched
      // sessions mid-flight, abandon ALL UI updates for this turn (the backend already
      // persisted it to the original session — history reloads it correctly).
      if (!mountedRef.current || sessionIdAtSend !== activeChatIdRef.current) return;

      // Success: the turn was accepted/completed — release composer state now.
      setInput('');
      setSelectedImage(null);
      setSendStage('idle');

      const createdNew = !sessionIdAtSend && Boolean(res.chatId);
      if (createdNew) {
        setActiveChatId(res.chatId);
      }

      setMessages(prev => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          text: res.response || t('noResponse'),
          sender: 'ai',
          timestamp: new Date(),
          // Present only when the backend ran the image path (res.image); undefined for
          // text-only turns, so no empty/fake diagnosis card is ever rendered.
          diagnosis: res.image,
        },
      ]);

      onMessageSent?.(createdNew);
    } catch (error) {
      // A failure belongs to the session it was sent in: if the component is gone or the
      // user switched sessions, abandon the composer error instead of surfacing it in the
      // new context. (finally below still releases the busy flags.)
      if (!mountedRef.current || sessionIdAtSend !== activeChatIdRef.current) return;
      if (hasImage) {
        // Keep the image + text in the composer so the user can retry. Friendly keys only —
        // raw server errors, S3/Gemini details and stack traces are never shown.
        const status = error instanceof ApiClientError ? error.status : 0;
        const errKey =
          status === 400
            ? 'unsupportedImage'
            : status === 413
              ? 'imageTooLarge'
              : uploadDone
                ? friendlyMessageKey(status)
                : 'imageUploadFailed';
        setAttachError(errKey);
      } else {
        // Preserve the existing text-only failure behavior exactly.
        setMessages(prev => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            text: 'Server error. Please try again.',
            sender: 'ai',
            timestamp: new Date(),
          },
        ]);
      }
    } finally {
      submittingRef.current = false;
      setIsProcessing(false);
      setSendStage('idle');
    }
  };

  const toggleLanguage = () => {
    const newLang = language === 'en' ? 'ta' : 'en';
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
    setShowLangMenu(false);
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-green-50 to-white overflow-hidden">

      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-green-600 text-white px-3 py-2 shadow-lg">
        <div className="flex items-center justify-between max-w-4xl mx-auto">

          <div className="flex items-center gap-2 overflow-hidden">
            <button
              onClick={onOpenSidebar}
              className="lg:hidden p-2 hover:bg-green-700 rounded-lg"
            >
              ☰
            </button>

            <div className="w-9 h-9 sm:w-11 sm:h-11 bg-white rounded-full flex items-center justify-center">
              <span className="text-xl sm:text-2xl">🌾</span>
            </div>

            <div className="overflow-hidden">
              <h1 className="text-sm sm:text-lg font-bold truncate">
                {t('appTitle')}
              </h1>
              <p className="hidden sm:block text-xs text-green-100 truncate">
                {user?.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="p-2 hover:bg-green-700 rounded-lg"
            >
              <Languages className="w-5 h-5" />
            </button>

            <button
              onClick={logout}
              className="p-2 hover:bg-green-700 rounded-lg"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showLangMenu && (
          <div className="max-w-4xl mx-auto mt-2 bg-white rounded-xl shadow overflow-hidden">
            <button
              onClick={toggleLanguage}
              className="w-full p-3 text-left text-gray-800 hover:bg-green-50 font-semibold"
            >
              {language === 'en' ? 'தமிழ் (Tamil)' : 'English'}
            </button>
          </div>
        )}
      </header>

      {/* CHAT BODY */}
      <main className="flex-1 overflow-y-auto px-3 py-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((m, i) => (
            <MessageBubble key={`${m.id}-${i}`} message={m} />
          ))}

          {messages.length === 0 && !isLoadingHistory && !isProcessing && !historyError && (
            <div className="text-center pt-16 sm:pt-24 px-4">
              <div className="text-5xl mb-4">🌾</div>
              <p className="text-gray-600 text-base sm:text-lg">{t('chatEmptyState')}</p>
            </div>
          )}

          {isLoadingHistory && (
            <div className="flex items-center gap-2 text-gray-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t('processing')}</span>
            </div>
          )}

          {historyError && (
            <MessageBubble
              message={{
                id: 'history-error',
                sender: 'ai',
                timestamp: new Date(),
                text: t(historyError),
              }}
            />
          )}

          {isProcessing && (
            <div className="flex items-center gap-2 text-gray-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>
                {sendStage === 'uploading'
                  ? t('uploadingImage')
                  : sendStage === 'analyzing'
                    ? t('analyzingImage')
                    : t('processing')}
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* INPUT BAR */}
      <footer className="bg-white border-t border-gray-200 px-3 py-3">
        <div className="max-w-4xl mx-auto">

          {/* IMAGE ATTACH ERROR (user-safe i18n) */}
          {attachError && (
            <p
              role="alert"
              className="mb-2 text-sm sm:text-base text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
            >
              {t(attachError)}
            </p>
          )}

          {/* IMAGE PREVIEW (ChatGPT-style) */}
          {selectedImage && (
            <div className="mb-2 relative w-fit max-w-full">
              <img
                src={selectedImage.previewUrl}
                alt={t('attachImage')}
                className="max-w-[160px] max-h-40 rounded-xl border object-cover"
              />
              <button
                onClick={removeImage}
                disabled={isProcessing}
                aria-label={t('removeImage')}
                title={t('removeImage')}
                className="absolute -top-2 -right-2 bg-black text-white rounded-full w-6 h-6 text-sm"
              >
                ×
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex gap-2">
              <VoiceRecorder onResult={setInput} />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                aria-label={t('attachImage')}
                title={t('attachImage')}
                className="p-3 bg-blue-600 text-white rounded-xl disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <ImageIcon className="w-5 h-5" />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            <div className="flex gap-2 flex-1">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={t('typeMessage')}
                className="flex-1 p-3 border rounded-xl"
              />
              <button
                onClick={handleSend}
                disabled={isProcessing || (!input.trim() && !selectedImage)}
                className="p-3 bg-green-600 text-white rounded-xl disabled:bg-gray-400"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
