// Page object: the admin review workspace at #/admin (render-gated by the signed `role`). The subview
// is not hash-routed: Dashboard → "Review queue" tab → click a row → detail. English labels.

import { expect, type Locator, type Page } from '@playwright/test';

export class AdminReviewPage {
  readonly queueTab: Locator;
  readonly heldFilter: Locator;
  readonly appealFilter: Locator;
  readonly search: Locator;
  readonly rows: Locator;
  readonly diagnostics: Locator;
  readonly heldNote: Locator;

  constructor(readonly page: Page) {
    this.queueTab = page.getByRole('navigation', { name: 'Admin workspace' }).getByRole('button', { name: 'Review queue' });
    this.heldFilter = page.getByLabel('Held claims');
    this.appealFilter = page.getByLabel('Appeal filter');
    this.search = page.getByRole('textbox', { name: 'Search' });
    this.rows = page.locator('tbody tr');
    this.diagnostics = page.getByTestId('admin-verification-diagnostics');
    this.heldNote = page.getByTestId('admin-held-note');
  }

  async goto(): Promise<void> {
    await this.page.goto('/#/admin');
    await expect(this.page.getByText('Claim review workspace')).toBeVisible();
  }

  async openQueue(): Promise<void> {
    await this.queueTab.click();
    await expect(this.heldFilter).toBeVisible();
  }

  /** Narrow the queue to one claim by its (unique, per-test) parcel name and open it. */
  async openClaimByParcelName(parcelName: string): Promise<void> {
    await this.search.fill(parcelName);
    const row = this.rows.filter({ hasText: parcelName });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await row.click();
    await expect(this.page.getByRole('button', { name: 'Back to queue' })).toBeVisible();
  }

  row(parcelName: string): Locator {
    return this.rows.filter({ hasText: parcelName });
  }

  /** "Override decision" → New decision + Reason (≥10 chars) → "Apply override". */
  async override({ toState, reason }: { toState: string; reason: string }): Promise<void> {
    await this.page.getByRole('button', { name: 'Override decision' }).click();
    await this.page.getByLabel('New decision').selectOption(toState);
    await this.page.getByLabel('Reason (required)').fill(reason);
    const apply = this.page.getByRole('button', { name: 'Apply override' });
    await expect(apply).toBeEnabled();
    await apply.click();
  }
}
