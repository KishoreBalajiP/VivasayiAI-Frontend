import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

interface Chat {
  _id: string;
  title?: string;
  createdAt: string;
}

interface Props {
  userEmail: string;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  refreshChats: boolean;
}

export default function ChatSidebar({ userEmail, activeChatId, setActiveChatId, refreshChats }: Props) {
  const [chats, setChats] = useState<Chat[]>([]);

  const fetchChats = async () => {
    if (!userEmail) return;

    const res = await fetch(`${import.meta.env.VITE_API_URL}/chatsessions/list/${userEmail}`);
    const data = await res.json();
    setChats(data.data?.sessions || []);
  };

  useEffect(() => {
    fetchChats();
  }, [userEmail, refreshChats]);

  const handleNewChat = async () => {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/chatsessions/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userEmail })
    });

    const data = await res.json();
    const newSession = data.data?.session;

    if (newSession?._id) {
      setActiveChatId(newSession._id);
      fetchChats();
    }
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!window.confirm("Are you sure you want to delete this chat?")) return;

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/chatsessions/${chatId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail })
      });

      if (res.ok) {
        setChats(prev => prev.filter(chat => chat._id !== chatId));
        if (activeChatId === chatId) {
          setActiveChatId(null);
        }
      }
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
  };

  const handleClearAllChats = async () => {
    if (chats.length === 0) return;
    
    if (!window.confirm("Are you sure you want to delete ALL chats? This action cannot be undone.")) return;

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/chatsessions/clear/all`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail })
      });

      if (res.ok) {
        setChats([]);
        setActiveChatId(null);
        alert("All chats have been deleted successfully!");
      }
    } catch (error) {
      console.error("Failed to clear all chats:", error);
      alert("Failed to delete all chats. Please try again.");
    }
  };

  return (
    <div className="w-64 h-full bg-gray-100 border-r p-4 flex flex-col">
      <button
        onClick={handleNewChat}
        className="bg-green-600 text-white py-2 rounded mb-4"
      >
        + New Chat
      </button>

      <div className="flex-1 overflow-y-auto mb-4">
        {chats.length === 0 && (
          <p className="text-gray-500 text-center">No chats yet</p>
        )}

        {chats.map(chat => (
          <div
            key={chat._id}
            className={`p-3 rounded mb-2 cursor-pointer group relative ${
              activeChatId === chat._id ? "bg-green-300" : "bg-white"
            }`}
            onClick={() => setActiveChatId(chat._id)}
          >
            {chat.title || `Chat ${chat._id.slice(-4)}`}
            
            <button
              onClick={(e) => handleDeleteChat(chat._id, e)}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-red-500 hover:text-red-700"
              title="Delete chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* ✅ Clear All Chats button - Always visible at bottom */}
      <button
        onClick={handleClearAllChats}
        disabled={chats.length === 0}
        className={`py-2 rounded transition-colors ${
          chats.length === 0 
            ? "bg-gray-400 text-gray-200 cursor-not-allowed" 
            : "bg-red-600 text-white hover:bg-red-700"
        }`}
      >
        🗑️ Clear All Chats
      </button>
    </div>
  );
}