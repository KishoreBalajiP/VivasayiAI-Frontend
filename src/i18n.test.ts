import { describe, expect, it } from 'vitest';
import i18n from './i18n';

// Every key must exist in BOTH locales: a key missing from Tamil silently falls back to English
// (fallbackLng), which a Tamil-speaking farmer would see as an untranslated sentence.
describe('locale parity', () => {
  const en = Object.keys(i18n.getResourceBundle('en', 'translation') as Record<string, string>);
  const ta = Object.keys(i18n.getResourceBundle('ta', 'translation') as Record<string, string>);

  it('has no English key missing from Tamil', () => {
    expect(en.filter((key) => !ta.includes(key))).toEqual([]);
  });

  it('has no Tamil key missing from English', () => {
    expect(ta.filter((key) => !en.includes(key))).toEqual([]);
  });
});
