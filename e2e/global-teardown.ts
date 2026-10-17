// After the whole run (and before the web servers stop): write the backend harness's cumulative
// network-violation list to <raw dir>/network-violations.json, where the acceptance report
// (VivasayiAI/scripts/acceptance/report.js) reads it. Per-test lists are attached to each test as
// `network-violations` by e2e/fixtures.ts. An empty list ([]) is the expected result.

import fs from 'node:fs';
import path from 'node:path';
import { Harness } from './lib/harness';
import { NETWORK_VIOLATIONS_OUT, PROCESS_API_URL, PROCESS_CONTROL_URL } from './lib/env';

export default async function globalTeardown(): Promise<void> {
  const harnesses = { inline: new Harness(), process: new Harness(undefined, PROCESS_CONTROL_URL, PROCESS_API_URL) };
  const violations: unknown[] = [];
  for (const [name, harness] of Object.entries(harnesses)) {
    try {
      for (const entry of await harness.networkViolations()) violations.push({ harness: name, ...entry });
    } catch (error) {
      violations.push(`could not read /__e2e/network-violations from the ${name} harness: ${(error as Error).message}`);
    }
  }
  fs.mkdirSync(path.dirname(NETWORK_VIOLATIONS_OUT), { recursive: true });
  fs.writeFileSync(NETWORK_VIOLATIONS_OUT, `${JSON.stringify(violations, null, 2)}\n`);
  process.stdout.write(`[e2e] backend network violations: ${violations.length} -> ${NETWORK_VIOLATIONS_OUT}\n`);
}
