// The handful of Node.js APIs the e2e suite uses, declared here because @types/node is not a
// dependency of this app (the bundle must never see Node types). Only for `npm run e2e:typecheck`;
// Playwright runs the suite on the real Node.js runtime.

declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
  stdout: { write(chunk: string): boolean };
};

declare class Buffer extends Uint8Array {
  static from(data: ArrayBuffer | ArrayLike<number> | string, encoding?: 'utf8' | 'latin1' | 'base64'): Buffer;
  toString(encoding?: 'utf8' | 'latin1' | 'base64'): string;
}

declare module 'node:fs' {
  function readFileSync(path: string, encoding: 'utf8'): string;
  function writeFileSync(path: string, data: string): void;
  function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  const fs: { readFileSync: typeof readFileSync; writeFileSync: typeof writeFileSync; mkdirSync: typeof mkdirSync };
  export default fs;
}

declare module 'node:path' {
  const path: {
    join(...parts: string[]): string;
    resolve(...parts: string[]): string;
    dirname(path: string): string;
  };
  export default path;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

declare module 'node:crypto' {
  export function randomBytes(size: number): { toString(encoding: 'hex'): string };
}
