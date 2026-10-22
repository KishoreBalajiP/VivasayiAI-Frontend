import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, X, Loader2, Plus } from 'lucide-react';
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
import { Button } from './ui';

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
  // Inline confirmation target — destructive actions never fire on first click.
  const [confirmTarget, setConfirmTarget] = useState<
    { type: 'chat'; id: string } | { type: 'all' } | null
  >(null);
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

  const handleDeleteChat = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // First click arms the inline confirmation; deletion only happens on "Yes, delete".
    setConfirmTarget({ type: 'chat', id: chatId });
  };

  const doDeleteChat = async (chatId: string) => {
    if (deletingId) return;
    setDeletingId(chatId);
    setConfirmTarget(null);

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

  const handleClearAllChats = () => {
    if (chats.length === 0) return;
    // First click arms the inline confirmation; deletion only happens on "Yes, delete".
    setConfirmTarget(prev => (prev && prev.type === 'all' ? null : { type: 'all' }));
  };

  const doClearAllChats = async () => {
    if (chats.length === 0) return;
    if (isClearing) return;
    setIsClearing(true);
    setConfirmTarget(null);

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
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}

      {/* SIDEBAR — absolute inside the workspace row on mobile; static, non-clipped column on desktop */}
      <aside
        data-testid="chat-sidebar"
        className={`
          absolute lg:static top-0 left-0 z-40 h-full
          w-72 lg:w-64
          bg-surface border-r border-surface-border
          transform transition-transform duration-300
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          flex flex-col p-3
          shadow-lg lg:shadow-none
        `}
      >
        {/* MOBILE HEADER */}
        <div className="flex items-center justify-between lg:hidden mb-3">
          <h2 className="font-bold text-lg text-ink">{t('chats')}</h2>
          <button
            onClick={() => setIsOpen(false)}
            aria-label={t('closeSidebar')}
            className="p-1.5 rounded-lg hover:bg-surface-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <Button
          onClick={handleNewChat}
          loading={isCreating}
          leadingIcon={<Plus className="h-4 w-4" />}
          className="mb-3"
        >
          {t('newChat')}
        </Button>

        <div data-testid="chat-list" className="flex-1 overflow-y-auto mb-3">
          {isLoadingList && chats.length === 0 ? (
            <div className="flex items-center justify-center gap-2 text-ink-subtle text-center py-4">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>{t('loadingChats')}</span>
            </div>
          ) : chats.length === 0 && listError ? (
            <div className="text-center py-4">
              <p role="alert" className="text-ink-subtle mb-2">
                {t('chatListLoadFailed')}
              </p>
              <button
                onClick={() => void fetchChats()}
                className="bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium py-1.5 px-4 rounded-lg"
              >
                {t('retry')}
              </button>
            </div>
          ) : chats.length === 0 ? (
            <p className="text-ink-subtle text-center py-4">
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
                className={`p-3 rounded-xl mb-1.5 cursor-pointer group relative border transition-colors
                  ${activeChatId === chat._id
                    ? 'bg-brand-700 border-brand-700 text-white'
                    : 'bg-surface-muted border-surface-border hover:bg-brand-50 text-ink'}`}
              >
                <div className={`pr-6 text-sm font-medium truncate ${
                  activeChatId === chat._id ? 'text-white' : ''
                }`}>
                  {chat.title || `${t('chat')} ${chat._id.slice(-4)}`}
                </div>

                {confirmTarget?.type === 'chat' && confirmTarget.id === chat._id ? (
                  <div
                    onClick={e => e.stopPropagation()}
                    className={`mt-1.5 flex flex-wrap items-center gap-1.5 text-xs ${
                      activeChatId === chat._id ? 'text-brand-100' : 'text-ink-muted'
                    }`}
                  >
                    <span>{t('confirmDeleteChat')}</span>
                    <button
                      onClick={() => void doDeleteChat(chat._id)}
                      disabled={deletingId !== null}
                      className={`rounded-full px-2.5 py-1 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        activeChatId === chat._id
                          ? 'bg-surface text-danger-fg hover:bg-danger-bg'
                          : 'bg-danger-solid text-white hover:bg-red-800'
                      }`}
                    >
                      {deletingId === chat._id ? (
                        <Loader2 className="h-3.5 w-3.5 inline-block animate-spin" />
                      ) : (
                        t('yesDelete')
                      )}
                    </button>
                    <button
                      onClick={() => setConfirmTarget(null)}
                      className="rounded-full border border-surface-border px-2.5 py-1 font-semibold transition-colors hover:bg-surface-muted"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={e => handleDeleteChat(chat._id, e)}
                    disabled={deletingId !== null}
                    className={`absolute right-2 top-1/2 -translate-y-1/2
                      opacity-0 group-hover:opacity-100 transition-opacity
                      disabled:opacity-0 disabled:cursor-not-allowed
                      ${activeChatId === chat._id ? 'text-brand-100 hover:text-white' : 'text-danger-solid'}`}
                    aria-label={t('deleteChat')}
                    title={t('deleteChat')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {confirmTarget?.type === 'all' ? (
          <div className="rounded-xl border border-danger-border bg-danger-bg p-2.5">
            <p className="text-xs font-semibold text-danger-fg">{t('confirmClearAll')}</p>
            <p className="mt-0.5 text-2xs text-danger-solid">{t('confirmClearAllHint')}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                onClick={() => void doClearAllChats()}
                disabled={isClearing}
                className="inline-flex items-center gap-1.5 rounded-full bg-danger-solid px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-800 disabled:opacity-60"
              >
                {isClearing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('yesDelete')}
              </button>
              <button
                onClick={() => setConfirmTarget(null)}
                disabled={isClearing}
                className="rounded-full border border-surface-border bg-surface px-3 py-1 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-60"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleClearAllChats}
            disabled={chats.length === 0 || isClearing}
            className={`py-2.5 rounded-xl font-medium transition-colors
            ${
              chats.length === 0
                ? 'bg-surface-sunken text-ink-subtle'
                : 'bg-danger-solid text-white hover:bg-red-800'
            } disabled:cursor-not-allowed`}
          >
            {isClearing ? (
              <Loader2 className="w-4 h-4 animate-spin inline-block align-[-2px]" />
            ) : (
              <Trash2 className="w-4 h-4 inline-block align-[-2px]" aria-hidden="true" />
            )}{' '}
            {t('clearAllChats')}
          </button>
        )}
      </aside>
    </>
  );
}