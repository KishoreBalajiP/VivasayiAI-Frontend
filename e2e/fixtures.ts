// Playwright fixtures for the hermetic e2e suite (design-testing §2.3-2.4, plan Part C).
//
//   harness      control-server client (sessions, scenarios, worker, inspect, seed-claim, images)
//   language     option ('en' | 'ta'); the farmer's profile language and localStorage `language`
//   farmer       a FRESH farmer for this test (User + profile + one parcel near Thanjavur), so per-user
//                rate limits, duplicate-area checks and data never leak between tests
//   farmerPage   the default page, signed in as `farmer`
//   signIn       injects a harness session into a context's sessionStorage (init script). There is
//                NO Cognito bypass in the app: this is exactly what the app stores after a real
//                login (vivasayi.auth:accessToken + vivasayi.auth:user), done from the test only
//   newContext   an extra, equally guarded browser context (a second user: an admin, farmer B)
//   network      every request of every guarded context; non-loopback requests are ABORTED and
//                recorded, and after each test the run fails unless both the browser's blocked list
//                and the backend guard's list (GET /__e2e/network-violations) are empty. Both lists
//                are attached to the test as `network-violations` (JSON) for the acceptance report.
//
// Before every test the harness scenario is reset to the scenarios.json defaults and a paused worker
// is resumed, so one failed test cannot change the next one's world.

import { test as base, expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { Harness, type HarnessSession, type Language, type NetworkViolation } from './lib/harness';
import { isExternalUrl } from './lib/env';

export { expect };
export type { Language, HarnessSession };

export interface RecordedRequest {
  method: string;
  url: string;
  resourceType: string;
  context: string;
  at: number;
}

export interface RecordedResponse {
  method: string;
  url: string;
  status: number;
  context: string;
  at: number;
}

export interface BlockedRequest {
  url: string;
  method: string;
  context: string;
  kind: 'request' | 'websocket';
}

export class NetworkRecorder {
  readonly requests: RecordedRequest[] = [];
  readonly responses: RecordedResponse[] = [];
  readonly blocked: BlockedRequest[] = [];

  async guard(context: BrowserContext, label: string): Promise<void> {
    // Abort (never fulfil) anything that is not loopback: tiles, the geocoder and the API all point at
    // 127.0.0.1 in an e2e run, so a request elsewhere is a hermeticity bug, not a test detail.
    await context.route(
      (url) => isExternalUrl(url.href),
      async (route) => {
        const request = route.request();
        this.blocked.push({ url: request.url(), method: request.method(), context: label, kind: 'request' });
        await route.abort('blockedbyclient');
      }
    );
    context.on('request', (request) => {
      this.requests.push({ method: request.method(), url: request.url(), resourceType: request.resourceType(), context: label, at: Date.now() });
    });
    context.on('response', (response) => {
      this.responses.push({ method: response.request().method(), url: response.url(), status: response.status(), context: label, at: Date.now() });
    });
    // WebSockets are not routed; record (and so fail on) any that is not loopback (Vite's HMR socket is).
    const watchPage = (page: Page) =>
      page.on('websocket', (socket) => {
        if (isExternalUrl(socket.url())) this.blocked.push({ url: socket.url(), method: 'WEBSOCKET', context: label, kind: 'websocket' });
      });
    context.pages().forEach(watchPage);
    context.on('page', watchPage);
  }

  /** Requests whose method matches and whose URL path matches `path`. */
  matching(method: string, path: RegExp, context?: string): RecordedRequest[] {
    return this.requests.filter(
      (request) =>
        request.method === method && (!context || request.context === context) && path.test(new URL(request.url).pathname)
    );
  }

  responsesMatching(method: string, path: RegExp): RecordedResponse[] {
    return this.responses.filter((response) => response.method === method && path.test(new URL(response.url).pathname));
  }
}

/** Sign a context in as a harness session: exactly the storage a real login leaves behind. */
export const signIn = async (context: BrowserContext, session: HarnessSession, language: Language = session.language): Promise<void> => {
  await context.addInitScript(
    ({ token, user, lang }) => {
      try {
        // Only when absent: a reload keeps the tab's own session and the farmer's language choice.
        if (window.sessionStorage.getItem('vivasayi.auth:accessToken') === null) {
          window.sessionStorage.setItem('vivasayi.auth:accessToken', token);
          window.sessionStorage.setItem('vivasayi.auth:user', JSON.stringify(user));
        }
        if (window.localStorage.getItem('language') === null) window.localStorage.setItem('language', lang);
      } catch {
        // about:blank and other opaque origins have no storage
      }
    },
    { token: session.accessToken, user: session.user, lang: language }
  );
};

/** A full-page screenshot written to the test's output folder and attached (indexed by the acceptance report). */
export const screenshot = async (page: Page, testInfo: TestInfo, name: string): Promise<string> => {
  const file = testInfo.outputPath(`${name.replace(/[^A-Za-z0-9._-]+/g, '-')}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
  return file;
};

/** A short, unique, ASCII parcel name per test (the admin queue can search for it). */
export const uniqueName = (prefix: string, testInfo: TestInfo): string =>
  `${prefix} ${testInfo.testId.slice(0, 6)}${Math.random().toString(36).slice(2, 6)}`;

interface Fixtures {
  language: Language;
  harness: Harness;
  network: NetworkRecorder;
  harnessReset: void;
  farmer: HarnessSession;
  farmerPage: Page;
  signIn: typeof signIn;
  newContext: (label?: string) => Promise<BrowserContext>;
}

export const test = base.extend<Fixtures>({
  language: ['en', { option: true }],

  harness: async ({}, use) => {
    await use(new Harness());
  },

  network: async ({ harness }, use, testInfo) => {
    const recorder = new NetworkRecorder();
    await use(recorder);
    // After the test (and after its contexts closed): the hermeticity verdict.
    let backend: NetworkViolation[] | { error: string } = [];
    try {
      backend = await harness.networkViolations();
    } catch (error) {
      backend = { error: `could not read /__e2e/network-violations: ${(error as Error).message}` };
    }
    const backendList = Array.isArray(backend) ? backend : [backend];
    const violations = [
      ...recorder.blocked.map((entry) => ({ source: 'browser', ...entry })),
      ...backendList.map((entry) => ({ source: 'backend', ...entry })),
    ];
    await testInfo.attach('network-violations', {
      body: JSON.stringify({ violations, browserBlocked: recorder.blocked, backend }, null, 2),
      contentType: 'application/json',
    });
    expect(recorder.blocked, 'browser requests to non-loopback hosts (aborted)').toEqual([]);
    expect(backend, 'backend network guard violations (GET /__e2e/network-violations)').toEqual([]);
  },

  harnessReset: [
    async ({ harness }, use) => {
      await harness.scenario({ reset: true });
      const worker = await harness.worker('status');
      if (worker.state !== 'running' && worker.mode !== 'off') await harness.worker(worker.mode === 'process' ? 'start' : 'resume');
      await use();
    },
    { auto: true },
  ],

  context: async ({ context, network }, use) => {
    await network.guard(context, 'main');
    await use(context);
  },

  signIn: async ({}, use) => {
    await use(signIn);
  },

  farmer: async ({ harness, language }, use, testInfo) => {
    await use(await harness.session({ role: 'farmer', language, parcel: { name: uniqueName('E2E field', testInfo) } }));
  },

  farmerPage: async ({ page, context, farmer }, use) => {
    await signIn(context, farmer);
    await use(page);
  },

  newContext: async ({ browser, network }, use, testInfo) => {
    const created: BrowserContext[] = [];
    const options = testInfo.project.use;
    await use(async (label = `context-${created.length + 2}`) => {
      const context = await browser.newContext({
        baseURL: options.baseURL,
        viewport: options.viewport,
        userAgent: options.userAgent,
        deviceScaleFactor: options.deviceScaleFactor,
        isMobile: options.isMobile,
        hasTouch: options.hasTouch,
        locale: options.locale,
        timezoneId: options.timezoneId,
        serviceWorkers: options.serviceWorkers,
      });
      await network.guard(context, label);
      created.push(context);
      return context;
    });
    for (const context of created) await context.close().catch(() => undefined);
  },
});
