import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  LayoutDashboard,
  Loader2,
  Lock,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';
import { ApiClientError } from '../api/client';
import {
  getAdminClaim,
  getAdminDashboard,
  getInvestigation,
  listAdminQueue,
  overrideClaim,
} from '../api/admin';
import {
  adminDashboardCards,
  appealViewModel,
  approverEqualsActor,
  canOverrideFrom,
  formatDuration,
  formatPercent,
  investigationCards,
  investigationFlagTextKey,
  queueEntryViewModel,
  validateOverride,
  type OverrideFormState,
} from '../utils/adminQueue';
import {
  CLAIM_EVENT_TYPES,
  claimStateLabelKey,
  formatClaimDate,
  generateIdempotencyKey,
  isValidIdempotencyKey,
  verificationRulesKey,
} from '../utils/claimFlow';
import { ClaimStateBadge } from './ClaimStatusCard';
import type {
  AdminActionRow,
  AdminAuditRow,
  AdminClaimDetail,
  AdminQueueEntry,
  AdminQueueFilters,
  Appeal,
  ClaimState,
  DashboardResponse,
  InvestigationEntry,
  InvestigationResponse,
  OverrideInput,
  OverrideResult,
} from '../types';

type AdminSubview =
  | { name: 'dashboard' }
  | { name: 'queue' }
  | { name: 'investigation' }
  | { name: 'detail'; claimId: string };

type LoadStatus = 'loading' | 'ready' | 'error';

const QUEUE_TABS: ReadonlyArray<{ id: AdminSubviewTabId; labelKey: string }> = [
  { id: 'dashboard', labelKey: 'adminTabDashboard' },
  { id: 'queue', labelKey: 'adminTabQueue' },
  { id: 'investigation', labelKey: 'adminTabInvestigation' },
];

type AdminSubviewTabId = 'dashboard' | 'queue' | 'investigation';

export const AdminReviewPage = () => {
  const { i18n, t } = useTranslation();
  const language = i18n.language === 'ta' ? 'ta' : 'en';
  const [subview, setSubview] = useState<AdminSubview>({ name: 'dashboard' });

  const openDetail = useCallback((claimId: string) => {
    setSubview({ name: 'detail', claimId });
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            {t('adminReviewTitle')}
          </div>
          <nav aria-label={t('adminSectionLabel')} className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 p-0.5 text-sm">
            {QUEUE_TABS.map((tab) => {
              const active = subview.name === tab.id || (tab.id === 'queue' && subview.name === 'detail');
              return (
                <button
                  key={tab.id}
                  onClick={() => setSubview({ name: tab.id } as AdminSubview)}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-colors ${
                    active ? 'bg-emerald-700 text-white shadow' : 'text-gray-600 hover:bg-white hover:text-emerald-800'
                  }`}
                >
                  {tab.id === 'dashboard' && <LayoutDashboard className="h-3.5 w-3.5" />}
                  {tab.id === 'queue' && <FileSearch className="h-3.5 w-3.5" />}
                  {tab.id === 'investigation' && <ScanSearch className="h-3.5 w-3.5" />}
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {subview.name === 'dashboard' && <DashboardView onOpenQueue={() => setSubview({ name: 'queue' })} />}
        {subview.name === 'queue' && <QueueView language={language} onOpenClaim={openDetail} />}
        {subview.name === 'investigation' && <InvestigationView />}
        {subview.name === 'detail' && (
          <DetailView claimId={subview.claimId} language={language} onBack={() => setSubview({ name: 'queue' })} />
        )}
      </div>
    </div>
  );
};

// ── Dashboard (operations metrics, server-computed) ────────────────────────────────────

const RANGE_OPTIONS = [
  { days: 30, labelKey: 'adminRange30' },
  { days: 90, labelKey: 'adminRange90' },
  { days: 180, labelKey: 'adminRange180' },
];

const DashboardView = ({ onOpenQueue }: { onOpenQueue: () => void }) => {
  const { t } = useTranslation();
  const [rangeDays, setRangeDays] = useState(90);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    getAdminDashboard(rangeDays)
      .then((res) => {
        if (!active) return;
        setData(res);
        setStatus('ready');
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiClientError && err.status === 401) return;
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [rangeDays, retryKey]);

  const cards = useMemo(() => (data ? adminDashboardCards(data.metrics) : []), [data]);
  const { metrics } = data ?? { metrics: null };

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-gray-800">{t('adminDashboardTitle', { rangeDays })}</h2>
        <div role="group" aria-label={t('adminRangeLabel')} className="flex items-center gap-1 rounded-full border border-gray-200 bg-white p-0.5 text-sm">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setRangeDays(opt.days)}
              aria-pressed={rangeDays === opt.days}
              className={`rounded-full px-3 py-1 font-semibold transition-colors ${
                rangeDays === opt.days ? 'bg-emerald-700 text-white' : 'text-gray-600 hover:text-emerald-800'
              }`}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t('adminLoading')}
        </div>
      )}
      {status === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="mb-3 text-sm text-red-700">{t('adminLoadFailed')}</p>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-3 py-1 text-sm font-semibold text-red-700 hover:bg-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('retry')}
          </button>
        </div>
      )}
      {status === 'ready' && data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cards.map((card) => (
              <div
                key={card.id}
                className={`rounded-2xl border bg-white p-3 shadow-sm ${
                  card.tone === 'positive'
                    ? 'border-emerald-200'
                    : card.tone === 'danger'
                      ? 'border-red-200'
                      : card.tone === 'warning'
                        ? 'border-amber-200'
                        : 'border-gray-100'
                }`}
              >
                <div className="text-xs font-medium text-gray-500">{t(card.labelKey)}</div>
                <div
                  className={`mt-1 text-2xl font-bold ${
                    card.tone === 'positive'
                      ? 'text-emerald-700'
                      : card.tone === 'danger'
                        ? 'text-red-600'
                        : card.tone === 'warning'
                          ? 'text-amber-700'
                          : 'text-gray-800'
                  }`}
                >
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-600 shadow-sm">
            <span>
              {t('adminPiRate')}:{' '}
              <b className="text-gray-800">{formatPercent(metrics ? metrics.aiUncertaintyRate : null)}</b>
            </span>
            <span>
              {t('adminAvgTime')}:{' '}
              <b className="text-gray-800">{formatDuration(metrics ? metrics.averageVerificationTimeMs : null)}</b>
            </span>
            <button
              onClick={onOpenQueue}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600"
            >
              {t('adminOpenQueue')}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ── Review queue (read-only list + filters) ────────────────────────────────────────────

const EMPTY_FILTERS: AdminQueueFilters = {
  status: '',
  eventType: '',
  search: '',
  withAppeal: '',
  aiFailed: '',
};

const QueueView = ({
  language,
  onOpenClaim,
}: {
  language: string;
  onOpenClaim: (claimId: string) => void;
}) => {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<AdminQueueFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AdminQueueEntry[]; total: number; page: number; limit: number } | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [searchDraft, setSearchDraft] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const searchTimer = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    listAdminQueue({ ...filters, page, limit: 20 })
      .then((res) => {
        if (!active) return;
        setData(res);
        setStatus('ready');
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiClientError && err.status === 401) return;
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [filters, page, retryKey]);

  // Debounced free-text search → page reset.
  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      setFilters((prev) => (prev.search === searchDraft ? prev : { ...prev, search: searchDraft }));
      setPage(1);
    }, 350);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [searchDraft]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.limit || 20))) : 1;

  return (
    <div className="mx-auto max-w-6xl space-y-3 px-4 py-5">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t('adminFilterStatus')}
          value={filters.status}
          onChange={(e) => {
            setFilters((prev) => ({ ...prev, status: e.target.value as ClaimState | '' }));
            setPage(1);
          }}
          className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-emerald-500 focus:outline-none"
        >
          <option value="">{t('adminFilterAllStates')}</option>
          {(['rejected', 'out_of_limit', 'duplicate_area', 'more_evidence_required'] as const).map((s) => (
            <option key={s} value={s}>
              {t(claimStateLabelKey(s))}
            </option>
          ))}
        </select>

        <select
          aria-label={t('adminFilterEvent')}
          value={filters.eventType}
          onChange={(e) => {
            setFilters((prev) => ({ ...prev, eventType: e.target.value as AdminQueueFilters['eventType'] }));
            setPage(1);
          }}
          className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-emerald-500 focus:outline-none"
        >
          <option value="">{t('adminFilterAllEvents')}</option>
          {CLAIM_EVENT_TYPES.map((evt) => (
            <option key={evt} value={evt}>
              {t(`claimEvent_${evt}`)}
            </option>
          ))}
        </select>

        <select
          aria-label={t('adminFilterAppeal')}
          value={filters.withAppeal}
          onChange={(e) => {
            setFilters((prev) => ({ ...prev, withAppeal: e.target.value as AdminQueueFilters['withAppeal'] }));
            setPage(1);
          }}
          className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-emerald-500 focus:outline-none"
        >
          <option value="">{t('adminFilterAnyAppeal')}</option>
          <option value="true">{t('adminFilterHasAppeal')}</option>
          <option value="false">{t('adminFilterNoAppeal')}</option>
        </select>

        <select
          aria-label={t('adminFilterAiFailed')}
          value={filters.aiFailed}
          onChange={(e) => {
            setFilters((prev) => ({ ...prev, aiFailed: e.target.value as AdminQueueFilters['aiFailed'] }));
            setPage(1);
          }}
          className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-emerald-500 focus:outline-none"
        >
          <option value="">{t('adminFilterAiAny')}</option>
          <option value="true">{t('adminFilterAiStuck')}</option>
        </select>

        <input
          aria-label={t('adminSearch')}
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder={t('adminSearchPlaceholder')}
          className="min-w-0 flex-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 focus:border-emerald-500 focus:outline-none"
        />

        <button
          onClick={() => setRetryKey((k) => k + 1)}
          aria-label={t('adminRefresh')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:text-emerald-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {status === 'loading' && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t('adminLoading')}
        </div>
      )}
      {status === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="mb-3 text-sm text-red-700">{t('adminLoadFailed')}</p>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-3 py-1 text-sm font-semibold text-red-700 hover:bg-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('retry')}
          </button>
        </div>
      )}
      {status === 'ready' && data && (
        <>
          {data.items.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-400">
              {t('adminQueueEmpty')}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2.5">{t('adminColClaim')}</th>
                      <th className="px-3 py-2.5">{t('adminColEvent')}</th>
                      <th className="px-3 py-2.5">{t('adminColState')}</th>
                      <th className="px-3 py-2.5">{t('adminColDecidedAt')}</th>
                      <th className="px-3 py-2.5">{t('adminColSignals')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((entry) => {
                      const row = queueEntryViewModel(entry);
                      return (
                        <tr
                          key={row.id}
                          onClick={() => onOpenClaim(row.id)}
                          className="cursor-pointer border-b border-gray-50 transition-colors last:border-0 hover:bg-emerald-50/60"
                        >
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-gray-800">{row.parcelName ?? row.id.slice(-6)}</div>
                            <div className="text-xs text-gray-500">
                              {row.crop ?? '—'} · {t('adminClaimedAcres', { acres: row.claimedAreaAcres })}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-gray-700">{t(`claimEvent_${entry.eventType}`)}</span>
                            <div className="text-xs text-gray-500">{formatClaimDate(entry.eventDate, language)}</div>
                          </td>
                          <td className="px-3 py-2.5">
                            <ClaimStateBadge state={entry.state} />
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">
                            {row.decidedAt ? formatClaimDate(row.decidedAt, language) : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {row.aiFailed && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                  <AlertTriangle className="h-3 w-3" />
                                  {t('adminSignalAiFailed')}
                                </span>
                              )}
                              {row.hasAppeal && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                                  <UserRoundCheck className="h-3 w-3" />
                                  {t('adminSignalAppeal')}
                                </span>
                              )}
                              {!row.hasAppeal && !row.aiFailed && (
                                <span className="text-xs text-gray-400">{t('adminSignalNone')}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between gap-3 text-sm text-gray-600">
            <span>
              {t('adminPagination', { total: data.total, page: data.page })}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 font-semibold disabled:opacity-40"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t('adminPrev')}
              </button>
              <span className="px-2 text-xs">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 font-semibold disabled:opacity-40"
              >
                {t('adminNext')}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ── Claim detail (read-only review surface + override action) ──────────────────────────

const DetailView = ({
  claimId,
  language,
  onBack,
}: {
  claimId: string;
  language: string;
  onBack: () => void;
}) => {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<AdminClaimDetail | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [retryKey, setRetryKey] = useState(0);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const actorSub = useMemo(() => {
    try {
      const stored = sessionStorage.getItem('vivasayi:user');
      if (!stored) return '';
      const parsed = JSON.parse(stored) as { cognitoSub?: string };
      return parsed.cognitoSub ?? '';
    } catch {
      return '';
    }
  }, []);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    getAdminClaim(claimId)
      .then((res) => {
        if (!active) return;
        setDetail(res);
        setStatus('ready');
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiClientError && err.status === 401) return;
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [claimId, retryKey]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:text-emerald-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('adminBackToQueue')}
        </button>
        {detail && (
          <div className="flex items-center gap-2">
            <ClaimStateBadge state={detail.state} />
            {canOverrideFrom(detail.state) && (
              <button
                onClick={() => setOverrideOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {t('adminOverrideAction')}
              </button>
            )}
          </div>
        )}
      </div>

      {status === 'loading' && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t('adminLoading')}
        </div>
      )}
      {status === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="mb-3 text-sm text-red-700">{t('adminClaimLoadFailed')}</p>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-3 py-1 text-sm font-semibold text-red-700 hover:bg-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('retry')}
          </button>
        </div>
      )}
      {status === 'ready' && detail && (
        <>
          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-bold text-gray-800">{t('adminDetailClaimHeading')}</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-gray-500">{t('adminColClaim')}</dt>
                <dd className="font-semibold text-gray-800">{detail.id}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t('adminDetailParcel')}</dt>
                <dd className="text-gray-700">{detail.parcel?.name ?? t('adminNotAvailable')}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t('adminDetailCrop')}</dt>
                <dd className="text-gray-700">{detail.parcel?.crop ?? t('adminNotAvailable')}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t('adminDetailParcelArea')}</dt>
                <dd className="text-gray-700">
                  {detail.parcel?.calculatedAreaAcres != null
                    ? `${detail.parcel.calculatedAreaAcres} ${t('acre')}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t('adminDetailEvent')}</dt>
                <dd className="text-gray-700">{t(`claimEvent_${detail.eventType}`)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t('adminDetailEventDate')}</dt>
                <dd className="text-gray-700">{formatClaimDate(detail.eventDate, language)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t('adminDetailClaimedArea')}</dt>
                <dd className="text-gray-700">{detail.claimedAreaAcres} {t('acre')}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t('adminDetailSubmitted')}</dt>
                <dd className="text-gray-700">{formatClaimDate(detail.submittedAt, language)}</dd>
              </div>
            </dl>
          </section>

          {detail.assessment?.state && (
            <AssessmentCard detail={detail} language={language} />
          )}

          <EvidenceUrlsCard detail={detail} />

          <AppealsCard appeals={detail.appeals} language={language} />

          <AuditCard rows={detail.audit} language={language} />

          <AdminActionsCard rows={detail.adminActions} language={language} />
        </>
      )}

      {overrideOpen && detail && (
        <OverrideDialog
          claimId={detail.id}
          currentState={detail.state}
          claimedAreaAcres={detail.claimedAreaAcres}
          actorSub={actorSub}
          onClose={() => setOverrideOpen(false)}
          onApplied={() => {
            setOverrideOpen(false);
            setRetryKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
};

// Assessment card re-uses the shared verification vocabulary (rules are backend-declared).
const AssessmentCard = ({ detail, language }: { detail: AdminClaimDetail; language: string }) => {
  const { t } = useTranslation();
  const assessment = detail.assessment;
  if (!assessment || !assessment.state) return null;
  const outcomeState = assessment.state as ClaimState;

  const ruleRows = assessment.rules
    ? Object.entries(assessment.rules).filter(([, check]) => check && 'passed' in check)
    : [];

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-bold text-gray-800">{t('adminDetailAssessmentHeading')}</h3>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-gray-500">{t('adminDetailOutcome')}</span>
        <ClaimStateBadge state={outcomeState} />
      </div>
      {assessment.reason && (
        <div className="mb-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {assessment.reason}
        </div>
      )}
      {ruleRows.length > 0 && (
        <ul className="space-y-1">
          {ruleRows.map(([name, check]) => (
            <li key={name} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{t(verificationRulesKey(name))}</span>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold ${check?.passed ? 'text-emerald-700' : 'text-red-600'}`}>
                {check?.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                {check?.passed ? t('rulePassed') : t('ruleFailed')}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-2 text-xs text-gray-500">
        {assessment.decidedAt && (
          <span>{t('decidedAtLabel')}: {formatClaimDate(assessment.decidedAt, language)}</span>
        )}
        {assessment.decidedBy && (
          <span>
            {t('decidedByLabel')}: {assessment.decidedBy === 'engine' ? t('engineLabel') : assessment.decidedBy}
          </span>
        )}
        {assessment.approvedAreaAcres != null && (
          <span>{t('adminDetailApprovedArea', { acres: assessment.approvedAreaAcres })}</span>
        )}
      </div>
    </section>
  );
};

// Evidence uses short-lived presigned URLs (observation only; no S3 keys are ever shown).
const EvidenceUrlsCard = ({ detail }: { detail: AdminClaimDetail }) => {
  const { t } = useTranslation();
  if (detail.evidence.length === 0 && detail.evidenceUrls.length === 0) return null;
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-bold text-gray-800">{t('evidenceAmount')}</h3>
      {detail.evidenceUrls.length === 0 ? (
        <p className="text-sm text-gray-400">{t('noEvidenceText')}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {detail.evidenceUrls.map((item) => (
            <a
              key={item.uploadId}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="aspect-square overflow-hidden rounded-xl border border-gray-100 bg-gray-50"
            >
              <img
                src={item.url}
                alt={t('adminEvidenceThumb')}
                className="h-full w-full object-cover"
              />
            </a>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-gray-400">{t('adminEvidenceExpiry', { seconds: detail.evidenceUrls[0]?.expiresIn ?? 0 })}</p>
    </section>
  );
};

const APPEAL_STATUS_TONE: Record<string, string> = {
  submitted: 'bg-sky-100 text-sky-800',
  under_review: 'bg-amber-100 text-amber-800',
  resolved: 'bg-gray-100 text-gray-700',
};

const AppealsCard = ({ appeals, language }: { appeals: Appeal[]; language: string }) => {
  const { t } = useTranslation();
  if (appeals.length === 0) return null;
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-bold text-gray-800">{t('adminAppealsHeading')}</h3>
      <div className="space-y-3">
        {appeals.map((appeal) => {
          const model = appealViewModel(appeal);
          return (
            <div key={model.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${APPEAL_STATUS_TONE[appeal.status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {t(model.statusLabelKey)}
                </span>
                <span className="text-xs text-gray-500">{formatClaimDate(model.createdAt, language)}</span>
              </div>
              <p className="text-sm text-gray-700">{model.reason}</p>
              {model.statement && <p className="mt-1 text-xs text-gray-500">{model.statement}</p>}
              {model.decisionToState && (
                <p className="mt-1 text-xs font-semibold text-emerald-700">
                  {t('adminAppealResolvedTo')}: {t(claimStateLabelKey(model.decisionToState))}
                </p>
              )}
              {appeal.evidence.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  {t('adminAppealEvidence', { count: appeal.evidence.length })}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

const AuditCard = ({ rows, language }: { rows: AdminAuditRow[]; language: string }) => {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800">{t('adminAuditHeading')}</h3>
        <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
          <Lock className="h-3 w-3" />
          {t('adminAuditImmutable')}
        </span>
      </div>
      <div className="space-y-1.5">
        {rows.map((row, idx) => (
          <div key={idx} className="flex flex-wrap items-start gap-x-4 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs">
            <span className="font-mono text-gray-500">{formatClaimDate(row.createdAt, language)}</span>
            <span className="font-semibold text-gray-700">{row.actor}</span>
            <span>
              {t(claimStateLabelKey(row.fromState))} → {t(claimStateLabelKey(row.toState))}
            </span>
            <span className="text-gray-500">{row.action}</span>
            {row.reason && <span className="text-gray-600">· {row.reason}</span>}
          </div>
        ))}
      </div>
    </section>
  );
};

const AdminActionsCard = ({ rows, language }: { rows: AdminActionRow[]; language: string }) => {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-bold text-gray-800">{t('adminActionsHeading')}</h3>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-gray-500">{formatClaimDate(row.createdAt, language)}</span>
              <span className="font-semibold text-gray-800">
                {t(claimStateLabelKey(row.priorState))} → {t(claimStateLabelKey(row.targetState))}
              </span>
              {row.appealId ? (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">{t('adminActionForAppeal')}</span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">{t('adminActionManual')}</span>
              )}
            </div>
            <p className="mt-1 text-gray-700">{row.reason}</p>
            {row.adminNote && <p className="mt-0.5 text-gray-500">{row.adminNote}</p>}
            {row.approverSub && <p className="mt-0.5 text-gray-500">{t('adminActionApprover')}: {row.approverSub}</p>}
          </div>
        ))}
      </div>
    </section>
  );
};

// ── Override dialog (the only mutable admin operation; replay-safe) ────────────────────

interface OverrideDialogProps {
  claimId: string;
  currentState: string;
  claimedAreaAcres: number;
  actorSub: string;
  onClose: () => void;
  onApplied: () => void;
}

const OverrideDialog = ({
  claimId,
  currentState,
  claimedAreaAcres,
  actorSub,
  onClose,
  onApplied,
}: OverrideDialogProps) => {
  const { t } = useTranslation();
  const [form, setForm] = useState<OverrideFormState>({
    toState: '',
    reason: '',
    adminNote: '',
    approverSub: '',
    overrideKey: generateIdempotencyKey().replace(/^clm_/, 'ovr_'),
    currentState,
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const validation = useMemo(
    () => validateOverride({ ...form, currentState }),
    [form, currentState]
  );
  const selfApproval = approverEqualsActor(actorSub, form.approverSub);

  const canSubmit =
    validation.ok &&
    !selfApproval &&
    isValidIdempotencyKey(form.overrideKey);

  const setField = <K extends keyof OverrideFormState>(key: K, value: OverrideFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrorKey(null);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const input: OverrideInput = {
      toState: form.toState as ClaimState,
      reason: form.reason.trim(),
      adminNote: form.adminNote?.trim() || undefined,
      approverSub: form.approverSub?.trim() || undefined,
      overrideKey: form.overrideKey.trim(),
    };
    try {
      const result: OverrideResult = await overrideClaim(claimId, input);
      toast.success(
        result.idempotent ? t('adminOverrideIdempotent') : t('adminOverrideApplied'),
        { duration: 3500 }
      );
      onApplied();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 401) return;
        if (err.status === 409 || err.status === 422 || err.status === 400) {
          setErrorKey('adminOverrideConflict');
        } else if (err.status === 403) {
          setErrorKey('adminOverrideDenied');
        } else {
          setErrorKey('adminOverrideFailed');
        }
        return;
      }
      setErrorKey('adminOverrideFailed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <button className="fixed inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-bold text-gray-800">{t('adminOverrideTitle')}</h3>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
              {t('adminOverrideWarning')}
            </span>
            <span>{t('adminOverrideClaimedAcres', { acres: claimedAreaAcres })}</span>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">{t('adminOverrideTarget')}</span>
            <select
              value={form.toState}
              onChange={(e) => setField('toState', e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">{t('adminOverrideSelectState')}</option>
              {(['verified', 'partially_verified', 'rejected', 'out_of_limit', 'duplicate_area', 'more_evidence_required'] as const)
                .filter((s) => s !== currentState)
                .map((s) => (
                  <option key={s} value={s}>
                    {t(claimStateLabelKey(s))}
                  </option>
                ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">{t('adminOverrideReason')}</span>
            <textarea
              value={form.reason}
              onChange={(e) => setField('reason', e.target.value)}
              rows={3}
              placeholder={t('adminOverrideReasonPlaceholder')}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">{t('adminOverrideNote')}</span>
            <input
              value={form.adminNote ?? ''}
              onChange={(e) => setField('adminNote', e.target.value)}
              placeholder={t('adminOverrideNotePlaceholder')}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">{t('adminOverrideApprover')}</span>
            <input
              value={form.approverSub ?? ''}
              onChange={(e) => setField('approverSub', e.target.value)}
              placeholder={t('adminOverrideApproverPlaceholder')}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-emerald-500 focus:outline-none"
            />
            {selfApproval && (
              <span className="mt-1 block text-xs text-red-600">{t('adminOverrideSelfApproval')}</span>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">{t('adminOverrideKey')}</span>
            <div className="flex items-center gap-1">
              <input
                value={form.overrideKey}
                onChange={(e) => setField('overrideKey', e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-mono text-sm text-gray-800 focus:border-emerald-500 focus:outline-none"
              />
              <button
                onClick={() => setField('overrideKey', generateIdempotencyKey().replace(/^clm_/, 'ovr_'))}
                aria-label={t('adminOverrideRegenerateKey')}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:text-emerald-700"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <span className="mt-1 block text-[11px] text-gray-400">{t('adminOverrideKeyHint')}</span>
          </label>

          {errorKey && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {t(errorKey)}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={() => void submit()}
            disabled={!canSubmit || submitting}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t('adminOverrideSubmit')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Fraud investigation (observation-only) ─────────────────────────────────────────────

const SEVERITY_TONE: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-gray-100 text-gray-600',
};

const InvestigationView = () => {
  const { t } = useTranslation();
  const [rangeDays, setRangeDays] = useState(90);
  const [data, setData] = useState<InvestigationResponse | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    getInvestigation(rangeDays)
      .then((res) => {
        if (!active) return;
        setData(res);
        setStatus('ready');
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiClientError && err.status === 401) return;
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [rangeDays, retryKey]);

  const cards = useMemo(() => (data ? investigationCards(data.summary) : []), [data]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-800">{t('adminInvestigationTitle', { rangeDays })}</h2>
          <p className="text-xs text-gray-500">{t('adminInvestigationHint')}</p>
        </div>
        <div role="group" aria-label={t('adminRangeLabel')} className="flex items-center gap-1 rounded-full border border-gray-200 bg-white p-0.5 text-sm">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setRangeDays(opt.days)}
              aria-pressed={rangeDays === opt.days}
              className={`rounded-full px-3 py-1 font-semibold transition-colors ${
                rangeDays === opt.days ? 'bg-emerald-700 text-white' : 'text-gray-600 hover:text-emerald-800'
              }`}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t('adminLoading')}
        </div>
      )}
      {status === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="mb-3 text-sm text-red-700">{t('adminLoadFailed')}</p>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-3 py-1 text-sm font-semibold text-red-700 hover:bg-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('retry')}
          </button>
        </div>
      )}
      {status === 'ready' && data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {cards.map((card) => (
              <div
                key={card.id}
                className={`rounded-2xl border bg-white p-3 shadow-sm ${
                  card.tone === 'danger'
                    ? 'border-red-200'
                    : card.tone === 'warning'
                      ? 'border-amber-200'
                      : 'border-gray-100'
                }`}
              >
                <div className="text-xs font-medium text-gray-500">{t(card.labelKey)}</div>
                <div
                  className={`mt-1 text-2xl font-bold ${
                    card.tone === 'danger'
                      ? 'text-red-600'
                      : card.tone === 'warning'
                        ? 'text-amber-700'
                        : 'text-gray-800'
                  }`}
                >
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          {data.entries.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-400">
              {t('adminInvestigationEmpty')}
            </div>
          ) : (
            <div className="space-y-3">
              {data.entries.map((entry) => (
                <InvestigationEntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const InvestigationEntryCard = ({ entry }: { entry: InvestigationEntry }) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <span className="font-semibold text-gray-800">{entry.farmerEmail ?? entry.ownerKey.slice(-8)}</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
            {t('adminInvestClaimCount', { count: entry.claimCount })}
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {entry.flags.map((flag) => (
          <span
            key={flag.code}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_TONE[flag.severity] ?? 'bg-gray-100 text-gray-600'}`}
            title={flag.message}
          >
            {t(investigationFlagTextKey(flag.code))}
          </span>
        ))}
      </div>
    </div>
  );
};