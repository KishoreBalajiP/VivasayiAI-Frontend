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
}

export const ChatInterface = ({ activeChatId, setActiveChatId, onMessageSent }: Props) => {
  const { t, i18n } = useTranslation();
  const { user, logout, language, setLanguage } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    setInput('');
  }, [activeChatId]);

  useEffect(() => {
    if (!activeChatId) return;

    const fetchMessages = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/chatsessions/${activeChatId}`);
        const data = await res.json();
        setMessages(data.data?.session?.messages || []);
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    };

    fetchMessages();
  }, [activeChatId]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      text: input,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      const responseData = await sendChatMessage(input, language, activeChatId, user?.email);

      if (!activeChatId && responseData.data?.chatId) {
        setActiveChatId(responseData.data.chatId);
      }

      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        text: responseData?.data?.response || 'No response received.',
        sender: 'ai',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
      onMessageSent?.();

    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          text: 'Server error. Please try again.',
          sender: 'ai',
          timestamp: new Date()
        }
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

  const handleVoiceResult = (text: string) => {
    setInput(text);
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-gradient-to-b from-green-50 to-white overflow-hidden">
      
      {/* HEADER */}
      <div className="bg-green-600 text-white px-3 py-3 sm:p-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 sm:w-12 sm:h-12 bg-white rounded-full flex items-center justify-center">
              <span className="text-xl sm:text-2xl">🌾</span>
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-bold">{t('welcome')}</h1>
              <p className="text-xs sm:text-sm text-green-100 truncate">{user?.name}</p>
            </div>
          </div>

          <div className="flex gap-1">
            <button onClick={() => setShowLangMenu(!showLangMenu)} className="p-2 hover:bg-green-700 rounded-xl">
              <Languages className="w-5 h-5" />
            </button>
            <button onClick={logout} className="p-2 hover:bg-green-700 rounded-xl">
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
      </div>

      {/* CHAT BODY */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
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
      </div>

      {/* INPUT BAR – MOBILE SAFE */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-3 py-3">
        <div className="max-w-4xl mx-auto flex flex-col gap-2 sm:flex-row">
          
          <div className="flex gap-2">
            <VoiceRecorder onResult={handleVoiceResult} />
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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={t('typeMessage')}
              className="flex-1 p-3 border rounded-xl text-base"
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
      </div>
    </div>
  );
};
