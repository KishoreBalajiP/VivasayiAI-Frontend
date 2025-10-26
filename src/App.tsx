import { useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { LanguageSelection } from './components/LanguageSelection';
import { ChatInterface } from './components/ChatInterface';
import { Loader2 } from 'lucide-react';

function App() {
  const { user, language, isLoading } = useAuth();

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

  if (!user) {
    return <LoginScreen />;
  }

  if (!language) {
    return <LanguageSelection />;
  }

  return <ChatInterface />;
}

export default App;
