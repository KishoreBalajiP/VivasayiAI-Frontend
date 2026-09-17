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
    <div className="mt-2.5 min-w-0 break-words rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-sm text-emerald-950">
      <p className="mb-1.5 flex items-center gap-1.5 font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">🌱</span>
        {t('imageDiagnosis')}
      </p>

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
          <p className="mb-1 font-semibold">{t('symptoms')}</p>
          <ul className="list-disc list-inside space-y-0.5">
            {vision.symptoms.map((symptom, index) => (
              <li key={index}>{symptom}</li>
            ))}
          </ul>
        </div>
      )}

      {vision.likelyIssues && vision.likelyIssues.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 font-semibold">{t('likelyIssues')}</p>
          {vision.likelyIssues.map((issue, index) => {
            const confLabel = confidenceLabel(issue);
            return (
              <div key={index} className="mb-2 last:mb-0">
                <p>
                  {issue.name ?? t('issueUnnamed')}
                  {confLabel && <span className="ml-1 rounded-full bg-white px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">{confLabel}</span>}
                </p>
                {issue.evidence && issue.evidence.length > 0 && (
                  <ul className="pl-2 text-xs list-disc list-inside space-y-0.5 opacity-90">
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
        <p className="text-emerald-900">{t('diagnosisUnavailable')}</p>
      )}

      {vision.uncertain && (
        <p className="mt-2 font-medium text-emerald-900">{t('diagnosisUncertain')}</p>
      )}
    </div>
  );
};