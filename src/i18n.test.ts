import { describe, expect, it } from 'vitest';
import i18n from './i18n';
import { enV2 } from './locales/v2.en';
import { taV2 } from './locales/v2.ta';

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

// ── 2026-10 plan keys (src/locales/v2.*). The compile-time Record<keyof typeof enV2, string> type
// already enforces key parity; these runtime checks cover what a type cannot. ─────────────────
describe('v2 locale keys', () => {
  const enBundle = i18n.getResourceBundle('en', 'translation') as Record<string, string>;
  const taBundle = i18n.getResourceBundle('ta', 'translation') as Record<string, string>;
  const v2Keys = Object.keys(enV2) as (keyof typeof enV2)[];
  const placeholders = (value: string) => (value.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort();

  it('I18N-1: every v2 key is merged into both language bundles with its own value', () => {
    expect(v2Keys.length).toBeGreaterThan(0);
    expect(Object.keys(taV2).sort()).toEqual([...v2Keys].sort());
    for (const key of v2Keys) {
      expect(enBundle[key], key).toBe(enV2[key]);
      expect(taBundle[key], key).toBe(taV2[key]);
    }
  });

  it('I18N-3: Tamil v2 values are translated, not copied from English', () => {
    const untranslated = v2Keys.filter((key) => taV2[key].trim() === enV2[key].trim());
    expect(untranslated).toEqual([]);
  });

  it('I18N-4: {{placeholders}} match between English and Tamil for every key in the bundles', () => {
    const mismatched = Object.keys(enBundle).filter(
      (key) => typeof taBundle[key] === 'string' && placeholders(enBundle[key]).join() !== placeholders(taBundle[key]).join()
    );
    expect(mismatched).toEqual([]);
  });

  it('I18N-5: no v2 string is empty, and the wizard step labels for Parcel and "Your land" are distinct in Tamil', () => {
    for (const key of v2Keys) {
      expect(enV2[key].trim(), key).not.toBe('');
      expect(taV2[key].trim(), key).not.toBe('');
    }
    expect(taBundle.stepParcel).toBe('நிலப் பகுதி');
    expect(taBundle.stepRelationship).toBe('நிலத்துடன் உங்கள் உறவு');
    expect(taBundle.stepParcel).not.toBe(taBundle.stepRelationship);
  });
});
