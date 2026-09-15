import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../context/LocationContext';
import { Message, ImageAttachment, SessionMessage } from '../types';
import {
  Send,
  Image as ImageIcon,
  Loader2,
  Sprout,
  MapPin,
  MessageSquarePlus,
} from 'lucide-react';
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
  const { t } = useTranslation();
  const { user, language } = useAuth();
  const { district: locationDistrict, status: locStatus } = useLocation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<ImageAttachment | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
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

  // Time-of-day greeting (premium entry into the assistant).
  const displayName =
    user?.name?.trim() || user?.email?.split('@')[0]?.trim() || 'Vivasayi';
  const hour = new Date().getHours();
  const greetKey =
    hour < 12 ? 'goodMorning' : hour < 17 ? 'goodAfternoon' : 'goodEvening';

  const suggestionKeys = ['cropSuggestions', 'pestControl', 'fertilizerQuestion', 'weather'];

  const canSend = Boolean(input.trim()) || Boolean(selectedImage);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50">
      {/* WORKSPACE HEADER (slim: hamburger + context) */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 sm:px-4">
        <button
          onClick={onOpenSidebar}
          aria-label={t('openSidebar')}
          title={t('openSidebar')}
          className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 lg:hidden"
        >
          <MessageSquarePlus className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <Sprout className="h-5 w-5 shrink-0 text-emerald-600" />
          <h2 className="truncate text-sm font-semibold text-gray-800">
            {activeChatId ? t('chat') : t('appTitle')}
          </h2>
        </div>
      </header>

      {/* CHAT BODY */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-3 px-3 py-4 sm:px-4">
          {messages.map((m, i) => (
            <MessageBubble key={`${m.id}-${i}`} message={m} />
          ))}

          {messages.length === 0 && !isLoadingHistory && !isProcessing && !historyError && (
            <div className="flex flex-col items-center px-2 pt-10 sm:pt-16 text-center">
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-700 shadow-lg">
                <Sprout className="h-8 w-8 text-white" />
              </div>

              <h3 className="text-xl font-bold text-gray-800 sm:text-2xl">
                {t(greetKey, { name: displayName })}
              </h3>
              <p className="mt-1 text-sm text-gray-500 sm:text-base">
                {t('askVivasayi')}
              </p>

              {locationDistrict && locStatus === 'granted' && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
                  <MapPin className="h-3.5 w-3.5" />
                  {t('locationYourDistrict', { district: locationDistrict })}
                </div>
              )}

              <div className="mt-6 flex max-w-xl flex-wrap items-center justify-center gap-2">
                {suggestionKeys.map((key) => (
                  <button
                    key={key}
                    onClick={() => setInput(t(key))}
                    disabled={isProcessing}
                    className="rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isLoadingHistory && (
            <div className="flex items-center gap-2 px-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
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
            <div className="flex items-center gap-2 px-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
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

      {/* COMPOSER (premium single bar) */}
      <footer className="shrink-0 border-t border-gray-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="mx-auto max-w-3xl">
          {attachError && (
            <p
              role="alert"
              className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {t(attachError)}
            </p>
          )}

          {selectedImage && (
            <div className="mb-2 relative w-fit max-w-full">
              <img
                src={selectedImage.previewUrl}
                alt={t('attachImage')}
                className="max-h-36 max-w-[140px] rounded-xl border object-cover shadow-sm"
              />
              <button
                onClick={removeImage}
                disabled={isProcessing}
                aria-label={t('removeImage')}
                title={t('removeImage')}
                className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-sm text-white shadow hover:bg-red-600 disabled:opacity-50"
              >
                <span className="leading-none">×</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white py-1 pl-1.5 pr-1.5 shadow-sm transition-shadow focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100">
            <VoiceRecorder onResult={setInput} />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              aria-label={t('attachImage')}
              title={t('attachImage')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImageIcon className="h-5 w-5" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />

            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder={t('typeMessage')}
              aria-label={t('typeMessage')}
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[15px] leading-relaxed text-gray-800 outline-none placeholder:text-gray-400 sm:text-base"
            />

            <button
              onClick={handleSend}
              disabled={isProcessing || !canSend}
              aria-label={t('send')}
              title={t('send')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-green-700 text-white shadow-sm transition-all hover:from-emerald-700 hover:to-green-800 disabled:cursor-not-allowed disabled:from-gray-300 disabled:to-gray-300"
            >
              {isProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};