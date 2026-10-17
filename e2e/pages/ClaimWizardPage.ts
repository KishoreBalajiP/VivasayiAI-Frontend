// Page object: the five-step claim wizard at #/claims/new (Parcel → Your land → Event → Evidence →
// Review). English labels: the wizard journeys run in English; Tamil is covered on the tracker
// (E2E-20). State is read from `data-testid="claim-wizard"` [data-step], never from text.

import { expect, type Locator, type Page } from '@playwright/test';

export type WizardStep = 'parcel' | 'relationship' | 'event' | 'evidence' | 'review';

export interface WizardFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** `#/claims/<id>` but not `#/claims/new`. */
export const TRACKER_URL = /#\/claims\/(?!new(?:[/?#]|$))([A-Za-z0-9_-]{1,64})$/;

export class ClaimWizardPage {
  readonly root: Locator;
  readonly continueButton: Locator;
  readonly submitButton: Locator;
  readonly photoInput: Locator;
  readonly documentInput: Locator;
  readonly submitError: Locator;

  constructor(readonly page: Page) {
    this.root = page.getByTestId('claim-wizard');
    this.continueButton = this.root.getByTestId('wizard-footer').getByRole('button', { name: 'Continue' });
    this.submitButton = this.root.getByTestId('wizard-footer').getByRole('button', { name: /Submit claim|Submitting/ });
    this.photoInput = this.root.getByTestId('wizard-photo-input');
    this.documentInput = this.root.getByTestId('wizard-document-input');
    this.submitError = this.root.getByTestId('wizard-submit-error');
  }

  async goto(): Promise<void> {
    await this.page.goto('/#/claims/new');
    await expect(this.root).toBeVisible();
  }

  async expectStep(step: WizardStep): Promise<void> {
    await expect(this.root).toHaveAttribute('data-step', step);
  }

  async next(expected: WizardStep): Promise<void> {
    await expect(this.continueButton).toBeEnabled();
    await this.continueButton.click();
    await this.expectStep(expected);
  }

  /** The farmer has one parcel with a boundary, so the wizard selects it and opens "Your land". */
  async expectParcelAutoSelected(): Promise<void> {
    await this.expectStep('relationship');
  }

  async chooseRelationship(label: string | RegExp): Promise<void> {
    const option = this.root.getByRole('button', { name: label });
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
  }

  /** Event step: type chip, date (UTC calendar date, as the API takes it), whole-parcel area. */
  async describeEvent({ type = 'Flood', date }: { type?: string; date: string }): Promise<void> {
    await this.expectStep('event');
    const chip = this.root.getByRole('button', { name: type, exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await this.root.locator('input[type="date"]').fill(date);
    // The map is never drawn on: "Entire parcel" sends the parcel boundary as the claim geometry.
    const wholeParcel = this.root.getByRole('button', { name: /Entire parcel/ });
    await wholeParcel.click();
    await expect(wholeParcel).toHaveAttribute('aria-pressed', 'true');
    await expect(this.root.getByTestId('event-missing-hint')).toHaveCount(0);
  }

  async addPhotos(files: WizardFile[]): Promise<void> {
    await this.photoInput.setInputFiles(files);
  }

  async addDocuments(files: WizardFile[]): Promise<void> {
    await this.documentInput.setInputFiles(files);
  }

  photos(): Locator {
    return this.root.getByTestId('wizard-photo');
  }

  documents(): Locator {
    return this.root.getByTestId('wizard-document');
  }

  async submit(): Promise<void> {
    await this.expectStep('review');
    await expect(this.submitButton).toBeEnabled();
    await this.submitButton.click();
  }

  /** After a successful submit the wizard replaces itself with #/claims/<id>. Returns the id. */
  async waitForTracker(timeout = 60_000): Promise<string> {
    await this.page.waitForURL(TRACKER_URL, { timeout });
    const match = TRACKER_URL.exec(new URL(this.page.url()).hash);
    if (!match) throw new Error(`not a tracker URL: ${this.page.url()}`);
    return match[1];
  }
}
