import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { RETURN_TO_KEY } from '../routing/hashRoute';
import { createMemoryStorage } from '../test/memoryStorage';

// AuthContext's routing duties (plan B2): Cognito's redirect returns to the bare origin, and the
// callback cleanup used to replaceState(pathname) — both drop the hash. The route is saved at
// login and restored after the callback. Logout also clears per-user claim drafts.

vi.mock('../config', () => ({
  config: {
    apiUrl: '',
    cognito: { domain: 'auth.example.test', clientId: 'client-test', redirectUri: 'http://localhost:3000' },
    auth: { storageKeyPrefix: 'vivasayi.auth' },
  },
}));

const request = vi.fn();
let accessToken: string | null = null;

vi.mock('../api/client', () => ({
  ApiClientError: class ApiClientError extends Error {
    status: number;
    constructor(status: number) {
      super(`api ${status}`);
      this.status = status;
    }
  },
  clearAuthState: vi.fn(),
  getAccessToken: () => accessToken,
  setAccessToken: (token: string | null) => {
    accessToken = token;
  },
  loginErrorKey: () => 'loginFailed',
  registerUnauthorizedHandler: vi.fn(),
  request: (...args: unknown[]) => request(...args),
}));

import { AuthProvider, USER_STORAGE_KEY, useAuth } from './AuthContext';
import { decodeJwtPayload, isBackendTokenExpired } from '../utils/jwt';

let auth: ReturnType<typeof useAuth> | null = null;
const Probe = () => {
  auth = useAuth();
  return <div data-testid="probe">{auth.isLoading ? 'loading' : auth.user?.email ?? 'anonymous'}</div>;
};

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
  sessionStorage.clear();
  accessToken = null;
  auth = null;
  request.mockReset();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AuthContext routing', () => {
  it('RT-5: login() saves the current hash route before redirecting to Cognito', async () => {
    window.history.replaceState(null, '', '/#/claims/c_42');
    // jsdom cannot navigate away; swallow its "not implemented" report for the Cognito redirect.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('anonymous'));

    await act(async () => {
      await auth!.login();
    });
    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBe('#/claims/c_42');
  });

  it('RT-5: the OAuth callback strips ?code/state and restores the saved route', async () => {
    sessionStorage.setItem('vivasayi.auth:oauthState', 'state-1');
    sessionStorage.setItem(RETURN_TO_KEY, '#/claims/c_7');
    window.history.replaceState(null, '', '/?code=abc&state=state-1');
    request.mockResolvedValue({ data: { accessToken: 'tok', user: { email: 'farmer@example.test' } } });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('farmer@example.test'));
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#/claims/c_7');
    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
  });

  it('RT-5: an unsafe saved value is dropped; the callback lands on the default route', async () => {
    sessionStorage.setItem('vivasayi.auth:oauthState', 'state-2');
    sessionStorage.setItem(RETURN_TO_KEY, 'https://evil.example/#/claims');
    window.history.replaceState(null, '', '/?code=abc&state=state-2');
    request.mockResolvedValue({ data: { accessToken: 'tok', user: { email: 'farmer@example.test' } } });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('farmer@example.test'));
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('');
  });
});

describe('AuthContext storage', () => {
  it('UI-14: exports the real user storage key that AdminReviewPage reads the actor sub from', () => {
    expect(USER_STORAGE_KEY).toBe('vivasayi.auth:user');
  });

  it('DRF-7: logout clears claim drafts (vivasayi.claimDraft.*) but leaves unrelated keys', async () => {
    sessionStorage.setItem('vivasayi.claimDraft.v1:sub-1', '{}');
    sessionStorage.setItem('vivasayi.claimDraft.v1:sub-2', '{}');
    localStorage.setItem('vivasayi.claimDraft.v1:sub-1', '{}');
    sessionStorage.setItem('vivasayi.location.v2', '{}');
    localStorage.setItem('language', 'ta');

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('anonymous'));

    act(() => auth!.logout());
    expect(sessionStorage.getItem('vivasayi.claimDraft.v1:sub-1')).toBeNull();
    expect(sessionStorage.getItem('vivasayi.claimDraft.v1:sub-2')).toBeNull();
    expect(localStorage.getItem('vivasayi.claimDraft.v1:sub-1')).toBeNull();
    expect(sessionStorage.getItem('vivasayi.location.v2')).toBe('{}');
    expect(localStorage.getItem('language')).toBe('ta');
  });

  it('POLL-16: logout also clears the claim tracker progress snapshots (vivasayi.claimProgress.*)', async () => {
    sessionStorage.setItem('vivasayi.claimProgress.v1:c_1', '{}');
    sessionStorage.setItem('vivasayi.claimProgress.v1:c_2', '{}');
    sessionStorage.setItem('vivasayi.location.v2', '{}');

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('anonymous'));

    act(() => auth!.logout());
    expect(sessionStorage.getItem('vivasayi.claimProgress.v1:c_1')).toBeNull();
    expect(sessionStorage.getItem('vivasayi.claimProgress.v1:c_2')).toBeNull();
    expect(sessionStorage.getItem('vivasayi.location.v2')).toBe('{}');
  });
});

describe('AuthContext token decoding', () => {
  // A real backend JWT segment is base64url with UTF-8 inside. Build one the same way.
  const base64url = (value: unknown) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const tokenFor = (payload: unknown) => `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}.sig`;

  it('AUTH-T1: a valid token for a Tamil-named farmer is not treated as expired', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = tokenFor({ sub: 's-1', name: 'முருகன் செல்வம்', exp });
    // The payload segment contains base64url-only characters that plain atob rejects.
    expect(token.split('.')[1]).toMatch(/[-_]/);
    expect(decodeJwtPayload(token)).toMatchObject({ name: 'முருகன் செல்வம்', exp });
    expect(isBackendTokenExpired(token)).toBe(false);
  });

  it('AUTH-T2: expired, malformed and empty tokens count as expired', () => {
    expect(isBackendTokenExpired(tokenFor({ exp: Math.floor(Date.now() / 1000) - 10 }))).toBe(true);
    expect(isBackendTokenExpired('not-a-jwt')).toBe(true);
    expect(isBackendTokenExpired('')).toBe(true);
  });
});
