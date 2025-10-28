import { useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { LanguageSelection } from './components/LanguageSelection';
import { ChatInterface } from './components/ChatInterface';
import ChatSidebar from './components/ChatSidebar';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

function App() {
  const { user, language, isLoading } = useAuth();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [refreshChats, setRefreshChats] = useState(false); // ✅ Added for refreshing sidebar

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
    <div className="flex h-screen">
      {/* ✅ Sidebar */}
      <ChatSidebar
        userEmail={user.email}
        activeChatId={activeChatId}
        setActiveChatId={setActiveChatId}
        refreshChats={refreshChats} // ✅ Pass refresh prop
      />

      {/* ✅ Chat Window */}
      <div className="flex-1">
        <ChatInterface 
          activeChatId={activeChatId}
          setActiveChatId={setActiveChatId}
          onMessageSent={() => setRefreshChats(prev => !prev)} // ✅ Add callback to trigger refresh
        />
      </div>
    </div>
  );
}

export default App;