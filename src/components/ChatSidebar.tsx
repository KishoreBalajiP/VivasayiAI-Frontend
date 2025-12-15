import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

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

export default function ChatSidebar({
  userEmail,
  activeChatId,
  setActiveChatId,
  refreshChats
}: Props) {

  const [chats, setChats] = useState<Chat[]>([]);
  const [isOpen, setIsOpen] = useState(false); // ✅ mobile drawer
  const { t } = useTranslation();

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
      setIsOpen(false);

      toast.success(t('chatCreated'), { duration: 3000 });
    } else {
      toast.error(t('chatCreateFailed'), { duration: 4000 });
    }
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/chatsessions/${chatId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail })
      });

      if (res.ok) {
        setChats(prev => prev.filter(chat => chat._id !== chatId));
        if (activeChatId === chatId) setActiveChatId(null);
        toast.success(t('chatDeleted'), { duration: 3000 });
      }
    } catch {
      toast.error(t('deleteFailed'), { duration: 4000 });
    }
  };

  const handleClearAllChats = async () => {
    if (chats.length === 0) return;

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/chatsessions/clear/all`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail })
      });

      if (res.ok) {
        setChats([]);
        setActiveChatId(null);
        setIsOpen(false);
        toast.success(t('allDeleted'), { duration: 3000 });
      }
    } catch {
      toast.error(t('deleteFailed'), { duration: 4000 });
    }
  };

  return (
    <>
      {/* ✅ MOBILE OPEN BUTTON */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-4 left-3 z-40 bg-green-600 text-white px-3 py-2 rounded-lg shadow"
      >
        ☰
      </button>

      {/* OVERLAY */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
        />
      )}

      {/* SIDEBAR */}
      <div
        className={`
          fixed lg:static z-50 top-0 left-0 h-full
          w-72 lg:w-64
          bg-gray-100 border-r
          transform transition-transform duration-300
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
          flex flex-col p-3 sm:p-4
        `}
      >
        {/* MOBILE HEADER */}
        <div className="flex items-center justify-between lg:hidden mb-3">
          <h2 className="font-bold text-lg">{t('chats')}</h2>
          <button onClick={() => setIsOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <button
          onClick={handleNewChat}
          className="bg-green-600 text-white py-2 rounded-lg font-medium mb-3 hover:bg-green-700"
        >
          + {t('newChat')}
        </button>

        <div className="flex-1 overflow-y-auto mb-3">
          {chats.length === 0 && (
            <p className="text-gray-500 text-center py-4">{t('noChats')}</p>
          )}

          {chats.map(chat => (
            <div
              key={chat._id}
              onClick={() => {
                setActiveChatId(chat._id);
                setIsOpen(false);
              }}
              className={`p-3 rounded-lg mb-2 cursor-pointer group relative ${
                activeChatId === chat._id ? "bg-green-300" : "bg-white"
              } hover:bg-green-50`}
            >
              <div className="pr-6 text-sm">
                {chat.title || `${t('chat')} ${chat._id.slice(-4)}`}
              </div>

              <button
                onClick={(e) => handleDeleteChat(chat._id, e)}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleClearAllChats}
          disabled={chats.length === 0}
          className={`py-2 rounded-lg font-medium ${
            chats.length === 0
              ? "bg-gray-400 text-gray-200"
              : "bg-red-600 text-white hover:bg-red-700"
          }`}
        >
          🗑️ {t('clearAllChats')}
        </button>
      </div>
    </>
  );
}
