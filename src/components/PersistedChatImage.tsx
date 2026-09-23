import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon } from 'lucide-react';
import { getChatImageUrl } from '../api';

interface PersistedChatImageProps {
  // Stable backend link (`img_<uuid>` uploadId) stored on the historical chat message.
  // The bubble fetches an authorized short-lived signed URL on demand — the URL is never
  // persisted, never stored on the message, and expires short so the frontend re-resolves
  // it every time the history is reconstructed.
  imageId: string;
  alt?: string;
}

type LoadState = 'loading' | 'loaded' | 'error';

// Renders a chat image that comes from persisted history (private-S3 pixels) rather than a
// local composer preview. Loads/errors are bounded: ONE signed-URL request per mount and the
// `<img>` onError collapses to the controlled unavailable chip — no retry loops (a timed-out
// signed URL simply shows a controlled hint instead of breaking the conversation).
export const PersistedChatImage = ({ imageId, alt }: PersistedChatImageProps) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setUrl(null);
    getChatImageUrl(imageId)
      .then((data) => {
        if (cancelled) return;
        setUrl(data.signedUrl);
        setState('loaded');
      })
      .catch(() => {
        if (cancelled) return;
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [imageId]);

  if (state === 'loaded' && url) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        onError={() => setState('error')}
        className="mb-2 max-h-64 w-full rounded-xl object-cover"
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={state === 'error' ? t('imageUnavailable') : t('photoAttached')}
      className={`mb-2 flex max-w-full items-center gap-2 rounded-xl bg-black/15 px-3 py-2 text-sm font-medium ${
        state === 'error' ? 'opacity-70' : ''
      }`}
    >
      <ImageIcon className="h-4 w-4 shrink-0" />
      <span className="truncate">
        {state === 'error' ? t('imageUnavailable') : t('photoAttached')}
      </span>
    </div>
  );
};