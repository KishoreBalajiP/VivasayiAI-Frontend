import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Message } from '../types';
import { Send, Mic, Image as ImageIcon, LogOut, Languages, Loader2 } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { sendChatMessage } from '../api';

interface Props {
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  onMessageSent?: () => void; // Optional callback to notify parent
}

export const ChatInterface = ({ activeChatId, setActiveChatId, onMessageSent }: Props) => {
  const { t, i18n } = useTranslation();
  const { user, logout, language, setLanguage } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ✅ Load chat messages when chat changes
  useEffect(() => {
    if (!activeChatId) return;
    const fetchMessages = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/chatsessions/${activeChatId}`);
        const data = await res.json();
        setMessages(data.data?.session?.messages || []);
      } catch (err) {
        console.error("Failed to load messages:", err);
      }
    };
    fetchMessages();
  }, [activeChatId]);

  // const saveMessageToDB = async (sender: string, text: string) => {
  //   if (!activeChatId) return;
  //   try {
  //     await fetch(`${import.meta.env.VITE_API_URL}/chatsessions/${activeChatId}/message`, {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({ sender, text })
  //     });
  //   } catch (error) {
  //     console.error("Message save failed:", error);
  //   }
  // };

  const handleSend = async () => {
    if (!input.trim()) return;

    console.log('🔴 DEBUG: Sending message, activeChatId:', activeChatId);

    const textToSend = input;

    const userMessage: Message = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // ✅ Fixed: More unique ID
      text: textToSend,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // ✅ Save User Message in DB
    // saveMessageToDB('user', textToSend);

    setIsProcessing(true);

    try {
      const responseData = await sendChatMessage(
        textToSend,
        language,
        activeChatId,
        user?.email
      );

      console.log('🟡 DEBUG: Backend response:', responseData);

        if (!activeChatId && responseData.data?.chatId) {
          console.log('🟠 DEBUG: Setting new activeChatId:', responseData.data.chatId);
          setActiveChatId(responseData.data.chatId);
        }

      const replyText =
        responseData?.data?.response && responseData.data.response.trim() !== ''
          ? responseData.data.response
          : 'No response received.';

      const aiMessage: Message = {
        id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // ✅ Fixed: More unique ID
        text: replyText,
        sender: 'ai',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);

      console.log('🟢 DEBUG: Calling onMessageSent callback');
      if (onMessageSent) onMessageSent();

      // ✅ Save AI Message in DB
      // saveMessageToDB('ai', replyText);

    } catch (error) {
      const errorMsg = 'Server error. Please try again.';
      const errorMessage: Message = {
        id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // ✅ Fixed: More unique ID
        text: errorMsg,
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);

      // ✅ Save error reply too (optional, but consistent)
      // saveMessageToDB('ai', errorMsg);
    }

    setIsProcessing(false);
  };

  const handleVoiceRecord = () => {
    setIsRecording(!isRecording);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      const userMessage: Message = {
        id: `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // ✅ Fixed: More unique ID
        text: language === 'ta' ? 'படம் பதிவேற்றப்பட்டது' : 'Image uploaded',
        sender: 'user',
        timestamp: new Date(),
        imageUrl
      };
      setMessages(prev => [...prev, userMessage]);
    }
  };

  const toggleLanguage = () => {
    const newLang = language === 'en' ? 'ta' : 'en';
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
    setShowLangMenu(false);
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-green-50 to-white">
      <div className="bg-green-600 text-white p-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
              <span className="text-2xl">🌾</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">{t('welcome')}</h1>
              <p className="text-sm text-green-100">{user?.name}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="p-3 hover:bg-green-700 rounded-xl transition-colors"
            >
              <Languages className="w-6 h-6" />
            </button>

            <button
              onClick={logout}
              className="p-3 hover:bg-green-700 rounded-xl transition-colors"
            >
              <LogOut className="w-6 h-6" />
            </button>
          </div>
        </div>

        {showLangMenu && (
          <div className="max-w-4xl mx-auto mt-3 bg-white rounded-xl shadow-lg overflow-hidden">
            <button
              onClick={toggleLanguage}
              className="w-full p-4 text-left text-gray-800 hover:bg-green-50 transition-colors font-semibold text-lg"
            >
              {language === 'en' ? 'தமிழ் (Tamil)' : 'English'}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((message, index) => (
            <MessageBubble key={`${message.id}-${index}`} message={message} />
          ))}

          {isProcessing && (
            <div className="flex items-center gap-3 text-gray-600">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-lg">{t('processing')}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="bg-white border-t-2 border-gray-200 p-4 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3 items-end">
            <button
              onClick={handleVoiceRecord}
              className={`p-5 rounded-2xl transition-all shadow-lg ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-green-600'} text-white`}
            >
              <Mic className="w-8 h-8" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl transition-all shadow-lg"
            >
              <ImageIcon className="w-8 h-8" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            <div className="flex-1 flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={t('typeMessage')}
                className="flex-1 p-5 border-2 border-gray-300 rounded-2xl"
              />

              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="p-5 bg-green-600 text-white rounded-2xl shadow-lg disabled:bg-gray-400"
              >
                <Send className="w-8 h-8" />
              </button>
            </div>
          </div>

          {isRecording && (
            <div className="mt-3 text-center text-red-600 font-semibold text-lg animate-pulse">
              {t('recording')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};