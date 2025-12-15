import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Message } from '../types';
import { Send, Image as ImageIcon, LogOut, Languages, Loader2 } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { sendChatMessage } from '../api';
import VoiceRecorder from './VoiceRecorder';

interface Props {
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  onMessageSent?: () => void;
  onOpenSidebar: () => void; // ✅ mobile hamburger action
}

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => setInput(''), [activeChatId]);

  useEffect(() => {
    if (!activeChatId) return;
    fetch(`${import.meta.env.VITE_API_URL}/chatsessions/${activeChatId}`)
      .then(res => res.json())
      .then(data => setMessages(data.data?.session?.messages || []))
      .catch(() => {});
  }, [activeChatId]);

  const handleSend = async () => {
    if (!input.trim()) return;

    setMessages(prev => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        text: input,
        sender: 'user',
        timestamp: new Date(),
      },
    ]);

    setInput('');
    setIsProcessing(true);

    try {
      const res = await sendChatMessage(input, language, activeChatId, user?.email);

      if (!activeChatId && res.data?.chatId) {
        setActiveChatId(res.data.chatId);
      }

      setMessages(prev => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          text: res.data?.response || 'No response received.',
          sender: 'ai',
          timestamp: new Date(),
        },
      ]);

      onMessageSent?.();
    } catch {
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

    setIsProcessing(false);
  };

  const toggleLanguage = () => {
    const newLang = language === 'en' ? 'ta' : 'en';
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
    setShowLangMenu(false);
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-gradient-to-b from-green-50 to-white">

      {/* HEADER */}
      <header className="bg-green-600 text-white px-3 py-2 shadow-lg">
        <div className="flex items-center justify-between max-w-4xl mx-auto">

          {/* LEFT */}
          <div className="flex items-center gap-2 overflow-hidden">
            {/* ☰ Hamburger */}
            <button
              onClick={onOpenSidebar}
              className="lg:hidden p-2 hover:bg-green-700 rounded-lg"
              aria-label="Open chats"
            >
              ☰
            </button>

            {/* 🌾 LOGO */}
            <div className="w-9 h-9 sm:w-11 sm:h-11 bg-white rounded-full flex items-center justify-center">
              <span className="text-xl sm:text-2xl">🌾</span>
            </div>

            <div className="overflow-hidden">
              <h1 className="text-sm sm:text-lg font-bold truncate">
                Tamil Nadu Farming Assistant
              </h1>
              <p className="hidden sm:block text-xs text-green-100 truncate">
                {user?.email}
              </p>
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="p-2 hover:bg-green-700 rounded-lg"
            >
              <Languages className="w-5 h-5" />
            </button>

            {/* ✅ LOGOUT VISIBLE ON MOBILE */}
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

          {isProcessing && (
            <div className="flex items-center gap-2 text-gray-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t('processing')}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* INPUT BAR */}
      <footer className="sticky bottom-0 bg-white border-t border-gray-200 px-3 py-3">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-2">
          <div className="flex gap-2">
            <VoiceRecorder onResult={setInput} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3 bg-blue-600 text-white rounded-xl"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" />
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
              disabled={!input.trim()}
              className="p-3 bg-green-600 text-white rounded-xl disabled:bg-gray-400"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
