import { describe, expect, it } from 'vitest';
import {
  CLAIM_ID_PATTERN,
  formatRoute,
  isSameRoute,
  parseHash,
  routeForSection,
  sanitizeReturnTo,
  type AppRoute,
} from './hashRoute';

// Pure route table (plan B2). No DOM: runs in the node project.

describe('hash route parse/format', () => {
  const routes: [string, AppRoute][] = [
    ['#/chat', { section: 'chat' }],
    ['#/claims', { section: 'claims', view: 'list' }],
    ['#/claims/new', { section: 'claims', view: 'new' }],
    ['#/claims/c_1', { section: 'claims', view: 'detail', claimId: 'c_1' }],
    ['#/claims/665f1b2c9a1e4b0012345678', { section: 'claims', view: 'detail', claimId: '665f1b2c9a1e4b0012345678' }],
    ['#/admin', { section: 'admin' }],
  ];

  it.each(routes)('RT-1: %s round-trips through parseHash and formatRoute', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
    expect(formatRoute(route)).toBe(hash);
    expect(parseHash(formatRoute(route))).toEqual(route);
  });

  it('RT-1: the empty hash and its variants are the default chat route, not unknown', () => {
    for (const hash of ['', '#', '#/', '#//', undefined, null]) {
      expect(parseHash(hash)).toEqual({ section: 'chat' });
    }
  });

  it('RT-1: trailing slashes, a query part and section case are tolerated', () => {
    expect(parseHash('#/claims/')).toEqual({ section: 'claims', view: 'list' });
    expect(parseHash('#/Claims/NEW')).toEqual({ section: 'claims', view: 'new' });
    expect(parseHash('#/claims/c_1?tab=photos')).toEqual({ section: 'claims', view: 'detail', claimId: 'c_1' });
    expect(parseHash('#/admin/')).toEqual({ section: 'admin' });
    // A hand-typed hash without the slash is read the same way (returnTo still requires '#/').
    expect(parseHash('#claims')).toEqual({ section: 'claims', view: 'list' });
  });

  it('RT-1: routeForSection maps navbar sections to their landing routes', () => {
    expect(routeForSection('chat')).toEqual({ section: 'chat' });
    expect(routeForSection('claims')).toEqual({ section: 'claims', view: 'list' });
    expect(routeForSection('admin')).toEqual({ section: 'admin' });
    expect(isSameRoute({ section: 'claims', view: 'list' }, parseHash('#/claims/'))).toBe(true);
  });
});

describe('claim id sanitising', () => {
  it.each([
    '#/claims/..%2F..%2Fadmin',
    '#/claims/<script>',
    '#/claims/a.b',
    '#/claims/%E0%A4%A',
    `#/claims/${'x'.repeat(65)}`,
    '#/claims/c 1',
    '#/claims/c_1/extra',
  ])('RT-2: %s is refused and marked unknown (rendered as chat)', (hash) => {
    expect(parseHash(hash)).toEqual({ section: 'chat', unknown: true });
  });

  it('RT-2: unknown sections and extra segments are marked unknown', () => {
    for (const hash of ['#/settings', '#/chat/1', '#/admin/x', '#/javascript:alert(1)']) {
      expect(parseHash(hash)).toEqual({ section: 'chat', unknown: true });
    }
  });

  it('RT-2: formatRoute never emits an id that parseHash would refuse', () => {
    expect(formatRoute({ section: 'claims', view: 'detail', claimId: '../admin' })).toBe('#/claims');
    expect(CLAIM_ID_PATTERN.test('c_1')).toBe(true);
    expect(CLAIM_ID_PATTERN.test('x'.repeat(64))).toBe(true);
    expect(CLAIM_ID_PATTERN.test('x'.repeat(65))).toBe(false);
  });
});

describe('returnTo sanitising', () => {
  it('RT-5: only in-app "#/" routes that parse are accepted, in canonical form', () => {
    expect(sanitizeReturnTo('#/claims/c_1')).toBe('#/claims/c_1');
    expect(sanitizeReturnTo('#/claims/')).toBe('#/claims');
    expect(sanitizeReturnTo('#/admin')).toBe('#/admin');
  });

  it.each([
    null,
    undefined,
    '',
    '#',
    '#claims',
    '/claims',
    'https://evil.example/#/claims',
    '//evil.example',
    '#/claims/<x>',
    '#/nope',
  ])('RT-5: %s is rejected', (value) => {
    expect(sanitizeReturnTo(value)).toBeNull();
  });
});
