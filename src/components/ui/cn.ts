// Join class names, skipping falsy parts. A tiny stand-in for clsx so the design system adds no
// dependency. It does NOT resolve Tailwind conflicts (e.g. `px-2` vs `px-4`): primitives expose
// variants and sizes instead of expecting callers to override spacing through className.
export type ClassPart = string | false | null | undefined | 0;

export const cn = (...parts: ClassPart[]): string => parts.filter(Boolean).join(' ');
