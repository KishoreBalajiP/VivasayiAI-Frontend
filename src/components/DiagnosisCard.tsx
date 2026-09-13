import { useTranslation } from 'react-i18next';
import type { ImageAnalysisResult, VisionIssue } from '../types';

interface DiagnosisCardProps {
  diagnosis: ImageAnalysisResult;
}

// Compact diagnosis section attached to the assistant response for image turns where the
// backend returned the `image` block. Renders ONLY fields actually returned by the backend:
// crop, summary, symptoms, likelyIssues (+ their confidence/evidence) — never fabricated.
// `vision.uncertain` is respected and surfaced explicitly; an uncertain result is NEVER
// presented as a definitive diagnosis.
export const DiagnosisCard = ({ diagnosis }: DiagnosisCardProps) => {
  const { t } = useTranslation();
  const vision = diagnosis.vision;

  if (!vision) return null;

  const confidenceLabel = (issue: VisionIssue) => {
    if (!issue.confidence || issue.confidence === 'uncertain') return null;
    switch (issue.confidence) {
      case 'high':
        return t('confHigh');
      case 'medium':
        return t('confMedium');
      case 'low':
        return t('confLow');
      default:
        return null;
    }
  };

  const hasFindings =
    (vision.symptoms && vision.symptoms.length > 0) ||
    (vision.likelyIssues && vision.likelyIssues.length > 0);

  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold mb-1">{t('imageDiagnosis')}</p>

      {vision.summary && (
        <p className="mb-2 leading-relaxed whitespace-pre-wrap">{vision.summary}</p>
      )}

      {vision.crop && (
        <p className="mb-1">
          <span className="font-semibold">{t('crop')}:</span> {vision.crop}
        </p>
      )}

      {vision.symptoms && vision.symptoms.length > 0 && (
        <div className="mb-2">
          <p className="font-semibold mb-1">{t('symptoms')}</p>
          <ul className="list-disc list-inside space-y-0.5">
            {vision.symptoms.map((symptom, index) => (
              <li key={index}>{symptom}</li>
            ))}
          </ul>
        </div>
      )}

      {vision.likelyIssues && vision.likelyIssues.length > 0 && (
        <div className="mb-2">
          <p className="font-semibold mb-1">{t('likelyIssues')}</p>
          {vision.likelyIssues.map((issue, index) => {
            const confLabel = confidenceLabel(issue);
            return (
              <div key={index} className="mb-2">
                <p>
                  {issue.name ?? t('issueUnnamed')}
                  {confLabel && <span className="ml-1 font-medium">({confLabel})</span>}
                </p>
                {issue.evidence && issue.evidence.length > 0 && (
                  <ul className="list-disc list-inside pl-2 text-xs space-y-0.5 opacity-90">
                    {issue.evidence.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!hasFindings && (
        <p className="text-amber-800">{t('diagnosisUnavailable')}</p>
      )}

      {vision.uncertain && (
        <p className="mt-2 text-amber-800 font-medium">{t('diagnosisUncertain')}</p>
      )}
    </div>
  );
};