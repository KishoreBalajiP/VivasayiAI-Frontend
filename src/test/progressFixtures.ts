// Progress-v1 fixtures for tests. They come from src/test/fixtures/progress-v1.example.json, a
// byte-for-byte copy of the backend builder's own output (docs/architecture/progress-v1.example.json,
// checked by `npm run contract:check`), so the tracker is tested against what the backend really
// emits, not against a hand-written guess.
import example from './fixtures/progress-v1.example.json';
import { parseClaimProgress } from '../utils/claimProgress';
import type { ClaimProgress } from '../types';

export interface ProgressExample {
  description: string;
  progress: Record<string, unknown>;
}

export const PROGRESS_EXAMPLES = example.examples as unknown as Record<string, ProgressExample>;
export const PROGRESS_RESPONSE = example.response as unknown as { statusCode: number; message: string; data: { progress: Record<string, unknown> } };
export const EXAMPLE_NOW = example.now;

/** A deep copy of one example's raw progress object, with top-level overrides (e.g. claimId). */
export const rawProgress = (name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => {
  const found = PROGRESS_EXAMPLES[name];
  if (!found) throw new Error(`unknown progress example ${name}`);
  return { ...(JSON.parse(JSON.stringify(found.progress)) as Record<string, unknown>), ...overrides };
};

/** The parsed form of rawProgress (what getClaimProgress resolves to). */
export const progressFor = (name: string, overrides: Record<string, unknown> = {}): ClaimProgress => {
  const parsed = parseClaimProgress(rawProgress(name, overrides));
  if (!parsed) throw new Error(`progress example ${name} did not parse`);
  return parsed;
};
