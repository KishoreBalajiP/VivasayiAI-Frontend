// Page object: the farmer's claim tracker at #/claims/:id (plan B4). Reads ONLY the selector contract
// (values are the API strings, so assertions do not depend on the language):
//   claim-tracker [data-claim-id, data-overall-status, data-stale]
//   tracker-stage [data-stage-id, data-stage-status]   tracker-satellite [data-satellite-status]
//   tracker-last-updated [data-last-updated]            tracker-refresh-error
//   decision-card [data-decision]                       claim-action [data-action-code]

import { expect, type Locator, type Page } from '@playwright/test';

export const REFRESH_LABEL = { en: 'Check for updates', ta: 'புதிய தகவலைப் பார்' } as const;

export const STAGE_IDS = ['received', 'photos', 'land_documents', 'weather', 'area_checks', 'decision'] as const;

export class ClaimTrackerPage {
  readonly root: Locator;
  readonly stages: Locator;
  readonly decisionCard: Locator;
  readonly satellite: Locator;
  readonly lastUpdated: Locator;
  readonly refreshError: Locator;
  readonly actions: Locator;

  constructor(readonly page: Page) {
    this.root = page.getByTestId('claim-tracker');
    this.stages = this.root.getByTestId('tracker-stage');
    this.decisionCard = this.root.getByTestId('decision-card');
    this.satellite = this.root.getByTestId('tracker-satellite');
    this.lastUpdated = this.root.getByTestId('tracker-last-updated');
    this.refreshError = this.root.getByTestId('tracker-refresh-error');
    this.actions = this.root.getByTestId('claim-action');
  }

  async goto(claimId: string): Promise<void> {
    await this.page.goto(`/#/claims/${claimId}`);
    await expect(this.root).toHaveAttribute('data-claim-id', claimId);
  }

  stage(id: string): Locator {
    return this.root.locator(`[data-testid="tracker-stage"][data-stage-id="${id}"]`);
  }

  refreshButton(language: 'en' | 'ta' = 'en'): Locator {
    return this.root.getByRole('button', { name: REFRESH_LABEL[language] });
  }

  /** "Check for updates": a farmer-initiated read (used only where a test is not about polling). */
  async checkForUpdates(language: 'en' | 'ta' = 'en'): Promise<void> {
    await this.refreshButton(language).click();
  }

  /** A fresh (not snapshot) read shows `status`. Polling brings it; nothing is clicked. */
  async expectOverall(status: string | RegExp, timeout = 60_000): Promise<void> {
    await expect(this.root).toHaveAttribute('data-overall-status', status, { timeout });
    await expect(this.root).not.toHaveAttribute('data-stale', 'true', { timeout });
  }

  async expectDecision(decision: string, timeout = 60_000): Promise<void> {
    await expect(this.decisionCard).toHaveAttribute('data-decision', decision, { timeout });
  }

  async overallStatus(): Promise<string | null> {
    return this.root.getAttribute('data-overall-status');
  }

  async stageStatuses(): Promise<Record<string, string>> {
    return this.stages.evaluateAll((nodes) =>
      Object.fromEntries(nodes.map((node) => [node.getAttribute('data-stage-id') ?? '?', node.getAttribute('data-stage-status') ?? '?']))
    );
  }

  async actionCodes(): Promise<string[]> {
    return this.actions.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-action-code') ?? '?'));
  }

  async lastUpdatedAt(): Promise<string | null> {
    return this.lastUpdated.getAttribute('data-last-updated');
  }

  /** No control that would run verification exists (owner decision: checks start on submit). */
  async expectNoVerifyButton(): Promise<void> {
    await expect(this.page.getByRole('button', { name: /Run AI verification|AI சரிபார்ப்பை இயக்கு|^verify/i })).toHaveCount(0);
    await expect(this.page.getByText(/Run AI verification|AI சரிபார்ப்பை இயக்கு/)).toHaveCount(0);
  }
}
