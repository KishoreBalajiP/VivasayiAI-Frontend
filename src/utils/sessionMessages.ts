import type { Message, SessionMessage } from '../types';

// Backend session messages carry no id and use ISO timestamps; the UI model needs a stable
// React key. The index-based id is a rendering key only — no backend message fields are
// fabricated. The image-turn link (SessionMessage.imageId) is preserved so a reloaded
// history renders an image turn with its persisted placeholder (and text), exactly like the
// live turn did. Legacy messages without imageId (no image metadata) keep rendering the
// same text/timestamp-only bubble they always did.
export const toViewMessages = (msgs: SessionMessage[]): Message[] =>
  msgs.map((m, i) => ({
    id: `srv-${i}`,
    sender: m.sender === 'user' ? 'user' : 'ai',
    timestamp: new Date(m.timestamp),
    text: m.text,
    imageId: m.imageId,
  }));