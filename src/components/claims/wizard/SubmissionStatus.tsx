import { useTranslation } from 'react-i18next';
import { Stepper, type StepStatus, type StepperItem } from '../../ui';
import type { StagedDocument, StagedEvidence } from '../../../utils/claimFlow';
import type { SubmissionPhase } from '../../../utils/claimSubmission';

// What the submission is doing right now, as an ordered list. Counts come from the items' own
// statuses; there are no byte percentages (a fetch PUT reports no upload progress), so nothing
// here pretends to know more than it does.

const PHASES: SubmissionPhase[] = ['create', 'photos', 'documents', 'submit'];

export interface SubmissionStatusProps {
  phase: SubmissionPhase;
  evidence: StagedEvidence[];
  documents: StagedDocument[];
}

export const SubmissionStatus = ({ phase, evidence, documents }: SubmissionStatusProps) => {
  const { t } = useTranslation();
  const current = PHASES.indexOf(phase);
  const photosDone = evidence.filter((e) => e.status === 'uploaded').length;
  const documentsDone = documents.filter((d) => d.status === 'attached').length;

  const phases = PHASES.filter((p) => p !== 'documents' || documents.length > 0);
  const items: StepperItem[] = phases.map((p) => {
    const index = PHASES.indexOf(p);
    const status: StepStatus = index < current ? 'complete' : index === current ? 'active' : 'upcoming';
    const progress =
      p === 'photos'
        ? t('wizardPhaseProgress', { done: photosDone, total: evidence.length })
        : p === 'documents'
          ? t('wizardPhaseProgress', { done: documentsDone, total: documents.length })
          : undefined;
    return {
      id: p,
      label: t(`wizardPhase_${p}`),
      status,
      description: progress,
      attributes: { 'data-testid': 'submission-phase', 'data-phase': p, 'data-phase-status': status },
    };
  });

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="submission-status"
      data-phase={phase}
      className="mt-3 rounded-control border border-info-border bg-info-bg px-3 py-3"
    >
      <p className="mb-2 text-sm font-semibold text-info-fg">{t('wizardSubmittingTitle')}</p>
      <Stepper items={items} currentId={phase} aria-label={t('wizardSubmittingTitle')} />
    </div>
  );
};

export default SubmissionStatus;
