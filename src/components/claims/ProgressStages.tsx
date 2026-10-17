import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardBody, CardHeader, CardTitle, Stepper, type StepStatus, type StepperItem } from '../ui';
import {
  currentStage,
  formatDateTime,
  stageExplanationKeys,
  stageLabelKey,
  stageStatusLabelKey,
} from '../../utils/claimProgress';
import type { ProgressStage } from '../../types';

// The backend's stages, in the backend's order, and nothing else (design §7.1). No percentages and
// no progress bar: each stage shows what the backend reported — its status, its explanation and,
// only when a check is really scheduled, "Next check around …".
//
// e2e selector contract: every stage is `data-testid="tracker-stage"` with `data-stage-id` and
// `data-stage-status` equal to the API strings.

const STEP_STATUS: Record<ProgressStage['status'], StepStatus> = {
  pending: 'upcoming',
  active: 'active',
  complete: 'complete',
  waiting: 'waiting',
  blocked: 'blocked',
  not_applicable: 'skipped',
  failed_technical: 'failed',
  unknown: 'upcoming',
};

export interface ProgressStagesProps {
  stages: ProgressStage[];
  language: string;
}

export const ProgressStages = ({ stages, language }: ProgressStagesProps) => {
  const { t } = useTranslation();
  const titleId = useId();
  const current = currentStage(stages);

  const items: StepperItem[] = stages.map((stage, index) => {
    const isCurrent = stage === current;
    // A stage that has not started says nothing yet unless it is the one to look at.
    const explain = isCurrent || stage.status !== 'pending';
    return {
      id: `${stage.id}:${index}`,
      label: t(stageLabelKey(stage.id)),
      status: STEP_STATUS[stage.status],
      description: explain ? t(stageExplanationKeys(stage)) : undefined,
      meta: (
        <>
          {/* The Stepper already announces the status to screen readers. */}
          <span aria-hidden="true">{t(stageStatusLabelKey(stage.status))}</span>
          {stage.nextCheckAt && (
            <span data-testid="tracker-stage-next-check">
              {' · '}
              {t('trackerNextCheck', { time: formatDateTime(stage.nextCheckAt, language) })}
            </span>
          )}
        </>
      ),
      attributes: {
        'data-testid': 'tracker-stage',
        'data-stage-id': stage.id,
        'data-stage-status': stage.status,
      },
    };
  });

  return (
    <Card titleId={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>{t('trackerStagesTitle')}</CardTitle>
      </CardHeader>
      <CardBody>
        <Stepper
          items={items}
          currentId={current ? `${current.id}:${stages.indexOf(current)}` : undefined}
          aria-label={t('trackerStagesTitle')}
        />
      </CardBody>
    </Card>
  );
};

export default ProgressStages;
