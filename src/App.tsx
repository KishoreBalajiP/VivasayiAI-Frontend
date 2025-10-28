import { useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { LanguageSelection } from './components/LanguageSelection';
import { ChatInterface } from './components/ChatInterface';
import ChatSidebar from './components/ChatSidebar';
import { Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';

function App() {
  const { user, language, isLoading } = useAuth();
  const { i18n } = useTranslation();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [refreshChats, setRefreshChats] = useState(false);

  // Sync i18n with auth language on component mount
  useEffect(() => {
    if (language && i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-green-600 animate-spin mx-auto mb-4" />
          <p className="text-xl text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginScreen />;
  if (!language) return <LanguageSelection />;

  return (
    <>
      <div className="flex h-screen">
        {/* Sidebar */}
        <ChatSidebar
          userEmail={user.email}
          activeChatId={activeChatId}
          setActiveChatId={setActiveChatId}
          refreshChats={refreshChats}
        />

        {/* Chat Window */}
        <div className="flex-1">
          <ChatInterface 
            activeChatId={activeChatId}
            setActiveChatId={setActiveChatId}
            onMessageSent={() => setRefreshChats(prev => !prev)}
          />
        </div>
      </div>

      {/* Sonner Toaster */}
      <Toaster 
        position="top-right"
        duration={3000}
        richColors
        closeButton
        expand={false}
        visibleToasts={3}
      />
    </>
  );
}

export default App;