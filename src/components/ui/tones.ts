// The ONE mapping from a semantic tone to Tailwind classes (tokens in tailwind.config.js).
// Class names are spelled out in full so Tailwind's content scan can see every one of them.
//
// Tone never carries meaning on its own: Badge/StatusPill/Alert always pair it with an icon and
// text, so the state reads the same for colour-blind farmers and in high-contrast modes.
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'quiet';
export type ToneVariant = 'soft' | 'solid' | 'outline';

export const TONES: readonly Tone[] = ['success', 'warning', 'danger', 'info', 'quiet'];

export const TONE_CLASSES: Record<Tone, Record<ToneVariant, string>> = {
  success: {
    soft: 'border border-success-border bg-success-bg text-success-fg',
    solid: 'border border-success-solid bg-success-solid text-white',
    outline: 'border border-success-border bg-white text-success-fg',
  },
  warning: {
    soft: 'border border-warning-border bg-warning-bg text-warning-fg',
    solid: 'border border-warning-solid bg-warning-solid text-white',
    outline: 'border border-warning-border bg-white text-warning-fg',
  },
  danger: {
    soft: 'border border-danger-border bg-danger-bg text-danger-fg',
    solid: 'border border-danger-solid bg-danger-solid text-white',
    outline: 'border border-danger-border bg-white text-danger-fg',
  },
  info: {
    soft: 'border border-info-border bg-info-bg text-info-fg',
    solid: 'border border-info-solid bg-info-solid text-white',
    outline: 'border border-info-border bg-white text-info-fg',
  },
  quiet: {
    soft: 'border border-quiet-border bg-quiet-bg text-quiet-fg',
    solid: 'border border-quiet-solid bg-quiet-solid text-white',
    outline: 'border border-quiet-border bg-white text-quiet-fg',
  },
};

// Icon colour on a soft/outline surface (solid surfaces use white text and inherit it).
export const TONE_ICON_CLASSES: Record<Tone, string> = {
  success: 'text-success-solid',
  warning: 'text-warning-solid',
  danger: 'text-danger-solid',
  info: 'text-info-solid',
  quiet: 'text-quiet-solid',
};

export const toneClasses = (tone: Tone, variant: ToneVariant = 'soft'): string =>
  TONE_CLASSES[tone][variant];
