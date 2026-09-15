import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, X, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  listChatSessions,
  createChatSession,
  deleteChatSession,
  clearAllChatSessions,
} from '../api';
import { ApiClientError, friendlyMessageKey } from '../api/client';
import type { ChatSessionRecord } from '../types';

interface Props {
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  refreshChats: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export default function ChatSidebar({
  activeChatId,
  setActiveChatId,
  refreshChats,
  isOpen,
  setIsOpen,
}: Props) {
  const [chats, setChats] = useState<ChatSessionRecord[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  // Intentional list states: loading (first paint), and a separate list-fetch failure that
  // keeps the empty state from being mistaken for "no chats".
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState(false);
  const { t } = useTranslation();

  // Monotonic id per list fetch: only the newest request may write state, so overlapping
  // fetches (mount + refresh churn) can never deliver stale data out of order.
  const listRequestId = useRef(0);

  // Friendly, translated toast for session-operation failures. 401 is intentionally ignored
  // here — the Phase 1 auth layer flips the app back to the login screen. Raw backend
  // messages are never shown. Uses the single global key mapping (friendlyMessageKey) so
  // every surface reacts identically to the same status.
  const toastSessionError = (err: unknown, fallbackKey: string) => {
    if (err instanceof ApiClientError) {
      if (err.status === 401) return;
      toast.error(t(friendlyMessageKey(err.status)), { duration: 4000 });
      return;
    }
    toast.error(t(fallbackKey), { duration: 4000 });
  };

  const fetchChats = useCallback(async () => {
    const id = ++listRequestId.current;
    setIsLoadingList(true);
    setListError(false);
    try {
      // Ownership derives from the authenticated token — no identity in URL/body/query.
      const sessions = await listChatSessions();
      if (listRequestId.current !== id) return; // a newer fetch superseded this one
      setChats(sessions);
    } catch (err) {
      if (listRequestId.current !== id) return;
      setListError(true);
      toastSessionError(err, 'chatListLoadFailed');
    } finally {
      if (listRequestId.current === id) setIsLoadingList(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchChats();
  }, [fetchChats, refreshChats]);

  const handleNewChat = async () => {
    if (isCreating) return;
    setIsCreating(true);

    try {
      const session = await createChatSession();
      setActiveChatId(session._id);
      await fetchChats();
      setIsOpen(false);
      toast.success(t('chatCreated'), { duration: 3000 });
    } catch (err) {
      toastSessionError(err, 'chatCreateFailed');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingId) return;
    setDeletingId(chatId);

    try {
      await deleteChatSession(chatId);
      setChats(prev => prev.filter(c => c._id !== chatId));
      if (activeChatId === chatId) setActiveChatId(null);
      toast.success(t('chatDeleted'), { duration: 3000 });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return;
      if (err instanceof ApiClientError && err.status === 404) {
        // Already gone — return the UI to a safe state without error noise.
        setChats(prev => prev.filter(c => c._id !== chatId));
        if (activeChatId === chatId) setActiveChatId(null);
        return;
      }
      toastSessionError(err, 'deleteFailed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAllChats = async () => {
    if (chats.length === 0) return;
    if (isClearing) return;
    setIsClearing(true);

    try {
      await clearAllChatSessions();
      setChats([]);
      setActiveChatId(null);
      setIsOpen(false);
      toast.success(t('allDeleted'), { duration: 3000 });
    } catch (err) {
      toastSessionError(err, 'deleteFailed');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      {/* OVERLAY */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`
          fixed lg:static top-0 left-0 z-50 h-full
          w-72 lg:w-64
          bg-gray-100 border-r
          transform transition-transform duration-300
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          flex flex-col p-4
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
          disabled={isCreating}
          className="bg-green-600 text-white py-2 rounded-lg font-medium mb-3
            hover:bg-green-700 disabled:opacity-70 disabled:cursor-not-allowed
            disabled:hover:bg-green-600"
        >
          {isCreating ? (
            <Loader2 className="w-4 h-4 animate-spin inline-block align-[-2px]" />
          ) : (
            <span>+</span>
          )}{' '}
          {t('newChat')}
        </button>

        <div className="flex-1 overflow-y-auto mb-3">
          {isLoadingList && chats.length === 0 ? (
            <div className="flex items-center justify-center gap-2 text-gray-500 text-center py-4">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>{t('loadingChats')}</span>
            </div>
          ) : chats.length === 0 && listError ? (
            <div className="text-center py-4">
              <p role="alert" className="text-gray-500 mb-2">
                {t('chatListLoadFailed')}
              </p>
              <button
                onClick={() => void fetchChats()}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg"
              >
                {t('retry')}
              </button>
            </div>
          ) : chats.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              {t('noChats')}
            </p>
          ) : (
            chats.map(chat => (
              <div
                key={chat._id}
                onClick={() => {
                  setActiveChatId(chat._id);
                  setIsOpen(false);
                }}
                className={`p-3 rounded-lg mb-2 cursor-pointer group relative
                  ${activeChatId === chat._id ? 'bg-green-300' : 'bg-white'}
                  hover:bg-green-50`}
              >
                <div className="pr-6 text-sm truncate">
                  {chat.title || `${t('chat')} ${chat._id.slice(-4)}`}
                </div>

                <button
                  onClick={e => handleDeleteChat(chat._id, e)}
                  disabled={deletingId !== null}
                  className="absolute right-2 top-1/2 -translate-y-1/2
                    opacity-0 group-hover:opacity-100 text-red-500
                    disabled:opacity-0 disabled:cursor-not-allowed"
                  aria-label={t('deleteChat')}
                  title={t('deleteChat')}
                >
                  {deletingId === chat._id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        <button
          onClick={handleClearAllChats}
          disabled={chats.length === 0 || isClearing}
          className={`py-2 rounded-lg font-medium
            ${
              chats.length === 0
                ? 'bg-gray-400 text-gray-200'
                : 'bg-red-600 text-white hover:bg-red-700'
            } disabled:cursor-not-allowed`}
        >
          {isClearing ? (
            <Loader2 className="w-4 h-4 animate-spin inline-block align-[-2px]" />
          ) : (
            '🗑️'
          )}{' '}
          {t('clearAllChats')}
        </button>
      </aside>
    </>
  );
}