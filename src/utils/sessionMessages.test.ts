import { describe, expect, it } from 'vitest';
import { toViewMessages } from './sessionMessages';
import type { SessionMessage } from '../types';

describe('toViewMessages — persisted chat history → render model', () => {
  it('carries imageId for an image-only turn so the bubble shows the persisted image reference', () => {
    const msgs: SessionMessage[] = [
      {
        sender: 'user',
        text: '',
        imageId: 'img_up_123',
        timestamp: '2026-09-23T10:00:00.000Z',
      },
    ];
    const [m] = toViewMessages(msgs);
    expect(m.sender).toBe('user');
    expect(m.imageId).toBe('img_up_123');
    expect(m.text).toBe('');
    expect(m.timestamp).toBeInstanceOf(Date);
  });

  it('carries text AND imageId for an image + text turn', () => {
    const msgs: SessionMessage[] = [
      {
        sender: 'user',
        text: 'check my paddy leaves',
        imageId: 'img_up_456',
        timestamp: '2026-09-23T10:00:00.000Z',
      },
    ];
    const [m] = toViewMessages(msgs);
    expect(m.text).toBe('check my paddy leaves');
    expect(m.imageId).toBe('img_up_456');
  });

  it('leaves imageId undefined for a text-only turn (existing behavior unchanged)', () => {
    const msgs: SessionMessage[] = [
      {
        sender: 'user',
        text: 'hello, how is my paddy?',
        timestamp: '2026-09-23T09:00:00.000Z',
      },
    ];
    const [m] = toViewMessages(msgs);
    expect(m.imageId).toBeUndefined();
    expect(m.text).toBe('hello, how is my paddy?');
  });

  it('renders legacy messages WITHOUT any image metadata safely (pre-image-era history)', () => {
    const msgs: SessionMessage[] = [
      { sender: 'user', text: 'old message', timestamp: '2026-01-01T00:00:00.000Z' },
      { sender: 'ai', text: 'old reply', timestamp: '2026-01-01T00:00:01.000Z' },
    ];
    const views = toViewMessages(msgs);
    expect(views[0].imageId).toBeUndefined();
    expect(views[0].text).toBe('old message');
    expect(views[0].sender).toBe('user');
    expect(views[1].imageId).toBeUndefined();
    expect(views[1].sender).toBe('ai');
  });

  it('orders messages and assigns stable render keys in order', () => {
    const msgs: SessionMessage[] = [
      { sender: 'ai', text: 'first', timestamp: '2026-09-23T10:00:00.000Z' },
      { sender: 'user', text: 'second', imageId: 'img_up_789', timestamp: '2026-09-23T10:00:01.000Z' },
    ];
    const views = toViewMessages(msgs);
    expect(views.map((m) => m.id)).toEqual(['srv-0', 'srv-1']);
    expect(views[1].imageId).toBe('img_up_789');
  });

  it('maps a system message to the ai side (safe collapse)', () => {
    const msgs: SessionMessage[] = [
      { sender: 'system', text: 'note', timestamp: '2026-09-23T10:00:00.000Z' },
    ];
    const [m] = toViewMessages(msgs);
    expect(m.sender).toBe('ai');
  });
});