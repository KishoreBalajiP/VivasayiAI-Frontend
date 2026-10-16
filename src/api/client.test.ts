import { describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({
  config: {
    apiUrl: 'https://api.test.local',
    cognito: { domain: '', clientId: '', redirectUri: 'https://app.test.local' },
    auth: { storageKeyPrefix: 'vivasayi.auth.test' },
  },
}));

import { friendlyMessageKey, loginErrorKey } from './client';
import i18n from '../i18n';

describe('friendlyMessageKey', () => {
  it('gives 400/403/409/415 their own messages', () => {
    expect(friendlyMessageKey(400)).toBe('badRequest');
    expect(friendlyMessageKey(403)).toBe('forbidden');
    expect(friendlyMessageKey(409)).toBe('conflict');
    expect(friendlyMessageKey(415)).toBe('unsupportedType');
  });

  it('keeps the existing mappings', () => {
    expect(friendlyMessageKey(401)).toBe('authExpired');
    expect(friendlyMessageKey(404)).toBe('notFound');
    expect(friendlyMessageKey(429)).toBe('rateLimited');
    expect(friendlyMessageKey(503)).toBe('serviceBusy');
    expect(friendlyMessageKey(0)).toBe('networkError');
    expect(friendlyMessageKey(500)).toBe('serverError');
    expect(friendlyMessageKey(502)).toBe('serverError');
  });

  it('only calls a 413 an oversized image on an image upload', () => {
    expect(friendlyMessageKey(413)).toBe('fileTooLarge');
    expect(friendlyMessageKey(413, 'image')).toBe('imageTooLarge');
    // The context changes nothing else.
    expect(friendlyMessageKey(400, 'image')).toBe('badRequest');
  });
});

describe('loginErrorKey', () => {
  it('maps the distinct POST /auth/google statuses', () => {
    expect(loginErrorKey(401)).toBe('loginCodeRejected');
    expect(loginErrorKey(403)).toBe('loginEmailNotVerified');
    expect(loginErrorKey(409)).toBe('loginAccountConflict');
    expect(loginErrorKey(502)).toBe('loginServiceUnavailable');
    expect(loginErrorKey(0)).toBe('networkError');
  });

  it('falls back to the generic message for anything else', () => {
    expect(loginErrorKey(500)).toBe('loginFailed');
    expect(loginErrorKey(-1)).toBe('loginFailed');
  });
});

describe('every mapped key is translated in English and Tamil', () => {
  const keys = [
    ...[0, 400, 401, 403, 404, 409, 413, 415, 429, 500].map((status) => friendlyMessageKey(status)),
    friendlyMessageKey(413, 'image'),
    ...[0, 401, 403, 409, 500, 502].map((status) => loginErrorKey(status)),
  ];
  it.each(['en', 'ta'])('%s', (lng) => {
    for (const key of keys) {
      expect(i18n.exists(key, { lng }), `${lng}:${key}`).toBe(true);
    }
  });
});
