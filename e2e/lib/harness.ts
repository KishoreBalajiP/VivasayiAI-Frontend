// A typed client for the hermetic backend harness (ADR-024): the e2e control server (loopback,
// bearer token) and direct product-API reads with a farmer's or admin's token. Used by the fixtures
// and specs. Talks to 127.0.0.1 only.

import fs from 'node:fs';
import { API_URL, CONTROL_URL, HARNESS_OUT } from './env';

export type Language = 'en' | 'ta';
export type Role = 'farmer' | 'admin';

export interface SessionUser {
  email: string;
  name: string;
  role: Role;
  cognitoSub: string;
}

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface HarnessSession {
  accessToken: string;
  user: SessionUser;
  parcelId: string | null;
  parcel: { parcelId: string; geometry: GeoJsonPolygon } | null;
  expiresInMs: number;
  /** Not from the harness: the language the session was created with (also the profile language). */
  language: Language;
}

export interface ScenarioSetup {
  ai?: string;
  landDocument?: string;
  holderNames?: string[];
  satellite?: string;
  weather?: string;
  landRecord?: string;
}

export interface ScenarioState extends Required<Pick<ScenarioSetup, 'ai' | 'landDocument' | 'satellite' | 'weather' | 'landRecord'>> {
  calls: Record<string, number>;
  version: number;
  [key: string]: unknown;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  matrixScenario: string;
  dc?: string;
  setup: ScenarioSetup;
  claim: Record<string, unknown>;
  settle: 'decided' | 'held' | 'held_after_recovery';
  expected: {
    outcome: string | null;
    overallStatus: string;
    decision: string | null;
    held?: boolean;
    recoveryRound?: number;
    satelliteStatus?: string;
    satelliteReasonCode?: string;
    satelliteNextCheckAt?: boolean;
    supportingOnly?: boolean;
    decisionExplanationKey?: string;
    weatherExplanationKey?: string;
    reviewCases?: number;
    stages?: Record<string, string>;
    audits?: Record<string, number>;
    neverShown?: string[];
    modelCalls?: number;
    [key: string]: unknown;
  };
}

export interface ScenariosDocument {
  schema: string;
  policy: string;
  defaults: { setup: ScenarioSetup; claim: Record<string, unknown> };
  scenarios: ScenarioDefinition[];
}

export interface InspectJob {
  step: string;
  status: string;
  attempts: number;
  planKey: string | null;
  recoveryRound: number;
  runAt: string | null;
  lastErrorKind: string | null;
  requeued: boolean;
}

export interface Inspection {
  claimId: string;
  state: string;
  submissionRound: number | null;
  firstSubmittedAt: string | null;
  decidedAt: string | null;
  audits: Record<string, number>;
  jobs: InspectJob[];
  reviewCases: number;
  satelliteRows: number;
  assessment: {
    status: string | null;
    state: string | null;
    verificationStatus: string | null;
    held: boolean;
    policy: { id: string; hash: string | null } | null;
  } | null;
  settled: { decided: boolean; held: boolean; activeDecisionJobs: number; pendingSoon: number; maxRecoveryRound: number };
}

export interface SeedClaimInput {
  accessToken: string;
  scenario?: string;
  eventDaysAgo?: number;
  eventType?: string;
  photos?: number;
  documents?: { category?: string }[];
  relationship?: string | null;
  geometry?: 'parcel' | 'over_limit' | GeoJsonPolygon;
  overlap?: 'other_farmer_claim';
  parcelId?: string;
  submit?: boolean;
}

export interface SeededClaim {
  claimId: string;
  eventDate: string;
  photos: string[];
  documents: string[];
  submitted: boolean;
  neighbour: { claimId: string; cognitoSub: string } | null;
}

export interface WorkerStatus {
  mode: 'inline' | 'process' | 'off';
  state: string;
  starts: number;
  pid: number | null;
  lastExit: { code: number | null; signal: string | null; at: string } | null;
  processed?: number;
  outcomes?: string[];
}

export interface NetworkViolation {
  kind?: string;
  host?: string;
  port?: number | string;
  process?: string;
  [key: string]: unknown;
}

export interface ApiResult<T = unknown> {
  status: number;
  data: T | null;
  message: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The control token: the one playwright.config.ts gave the harness, or the harness out file's. */
export const controlToken = (): string => {
  if (process.env.E2E_CONTROL_TOKEN && process.env.E2E_CONTROL_TOKEN.length >= 16) return process.env.E2E_CONTROL_TOKEN;
  const out = JSON.parse(fs.readFileSync(HARNESS_OUT, 'utf8')) as { controlToken: string };
  return out.controlToken;
};

export class HarnessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export class Harness {
  constructor(
    private readonly token: string = controlToken(),
    readonly controlUrl: string = CONTROL_URL,
    readonly apiUrl: string = API_URL
  ) {}

  async control<T>(method: 'GET' | 'POST', route: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.controlUrl}${route}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok) throw new HarnessError(`control ${method} ${route} -> ${response.status} ${json?.error ?? ''}`.trim(), response.status);
    return json as T;
  }

  health() {
    return this.control<{ ok: boolean; worker: WorkerStatus; policy: { id: string; hash: string } }>('GET', '/__e2e/health');
  }

  /** A fresh farmer (User, profile, one parcel near Thanjavur) or admin, with a signed session token. */
  async session(input: { role?: Role; name?: string; language?: Language; district?: string; parcel?: { name?: string; geometry?: GeoJsonPolygon } } = {}): Promise<HarnessSession> {
    const language = input.language ?? 'en';
    const session = await this.control<Omit<HarnessSession, 'language'>>('POST', '/__e2e/session', { role: input.role ?? 'farmer', ...input, language });
    return { ...session, language };
  }

  scenario(body: ScenarioSetup | { id: string } | { reset: true }) {
    return this.control<ScenarioState>('POST', '/__e2e/scenario', body);
  }

  currentScenario() {
    return this.control<ScenarioState>('GET', '/__e2e/scenario');
  }

  scenarios() {
    return this.control<ScenariosDocument>('GET', '/__e2e/scenarios');
  }

  worker(action: 'pause' | 'resume' | 'drain-once' | 'status' | 'kill' | 'start') {
    return this.control<WorkerStatus>('POST', '/__e2e/worker', { action });
  }

  inspect(claimId: string) {
    return this.control<Inspection>('GET', `/__e2e/claims/${claimId}/inspect`);
  }

  seedClaim(input: SeedClaimInput) {
    return this.control<SeededClaim>('POST', '/__e2e/seed-claim', input);
  }

  networkViolations() {
    return this.control<NetworkViolation[]>('GET', '/__e2e/network-violations');
  }

  /** A seeded-noise JPEG (distinct bytes per seed, so evidence fingerprints differ). */
  async fixtureImage(seed: string, width = 800, height = 600): Promise<Buffer> {
    const response = await fetch(`${this.controlUrl}/__e2e/fixture-image?seed=${encodeURIComponent(seed)}&w=${width}&h=${height}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) throw new HarnessError(`fixture-image -> ${response.status}`, response.status);
    return Buffer.from(await response.arrayBuffer());
  }

  /** A product-API call with a user's token, straight from the test (not through the browser). */
  async api<T = unknown>(method: 'GET' | 'POST', route: string, token: string, body?: unknown): Promise<ApiResult<T>> {
    const response = await fetch(`${this.apiUrl}${route}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as { data?: T; message?: string } | null;
    return { status: response.status, data: json?.data ?? null, message: json?.message ?? null };
  }

  /**
   * Poll /__e2e/claims/:id/inspect until `done` holds (the scenarios.json settle rules), so a test
   * never sleeps for a fixed time. Returns the last inspection; throws with it on timeout.
   */
  async waitForInspection(claimId: string, done: (inspection: Inspection) => boolean, { timeoutMs = 150_000, intervalMs = 500, what = 'condition' } = {}): Promise<Inspection> {
    const until = Date.now() + timeoutMs;
    let last: Inspection | null = null;
    while (Date.now() < until) {
      last = await this.inspect(claimId);
      if (done(last)) return last;
      await sleep(intervalMs);
    }
    throw new Error(`claim ${claimId}: ${what} not reached in ${timeoutMs} ms; last inspection ${JSON.stringify(last)}`);
  }

  /** The scenarios.json settle rule for one scenario (decided / held / held_after_recovery). */
  static settled(scenario: Pick<ScenarioDefinition, 'settle' | 'expected'>, inspection: Inspection): boolean {
    if (scenario.settle === 'decided') return inspection.settled.decided;
    if (scenario.settle === 'held') return inspection.settled.held;
    return (
      inspection.settled.held &&
      inspection.settled.maxRecoveryRound >= (scenario.expected.recoveryRound ?? 0) &&
      inspection.jobs.every((job) => job.step !== 'ai_assessment' || job.status !== 'queued')
    );
  }
}

/** UTC calendar date `days` days ago, as the date input and the API take it (critique E1). */
export const utcDateDaysAgo = (days: number, now = new Date()): string =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)).toISOString().slice(0, 10);
