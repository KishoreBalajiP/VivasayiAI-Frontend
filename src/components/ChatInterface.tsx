import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Message } from '../types';
import { Send, Mic, Image as ImageIcon, LogOut, Languages, Loader2 } from 'lucide-react';
import { MessageBubble } from './MessageBubble';

export const ChatInterface = () => {
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

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: language === 'ta'
          ? 'உங்கள் கேள்விக்கு நன்றி. இது ஒரு மாதிரி பதில். உண்மையான AI ஒருங்கிணைப்பு விரைவில் வரும்.'
          : 'Thank you for your question. This is a sample response. Real AI integration coming soon.',
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
      setIsProcessing(false);
    }, 1500);
  };

  const handleVoiceRecord = () => {
    setIsRecording(!isRecording);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      const userMessage: Message = {
        id: Date.now().toString(),
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
              title={t('changeLanguage')}
            >
              <Languages className="w-6 h-6" />
            </button>

            <button
              onClick={logout}
              className="p-3 hover:bg-green-700 rounded-xl transition-colors"
              title={t('logout')}
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
          {messages.length === 0 && (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🌾</div>
              <h2 className="text-2xl font-semibold text-gray-700 mb-2">
                {t('askQuestion')}
              </h2>
              <p className="text-gray-500 text-lg">
                {language === 'ta'
                  ? 'குரல், உரை அல்லது படத்தைப் பயன்படுத்தி கேளுங்கள்'
                  : 'Use voice, text, or images to ask'}
              </p>
            </div>
          )}

          {messages.map(message => (
            <MessageBubble key={message.id} message={message} />
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
              className={`p-5 rounded-2xl transition-all shadow-lg ${
                isRecording
                  ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                  : 'bg-green-600 hover:bg-green-700'
              } text-white flex-shrink-0`}
              title={t('tapToSpeak')}
            >
              <Mic className="w-8 h-8" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl transition-all shadow-lg flex-shrink-0"
              title={t('uploadImage')}
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
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder={t('typeMessage')}
                className="flex-1 p-5 border-2 border-gray-300 rounded-2xl focus:outline-none focus:border-green-600 text-lg"
              />

              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="p-5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-2xl transition-all shadow-lg flex-shrink-0"
                title={t('send')}
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
