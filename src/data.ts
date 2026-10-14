/** Fake object model — treaty as data object, attention as cases into it. */

import {
  TREATY_VIEW_CATALOG,
  defaultColumnsByView,
  defaultEnabledViews,
  type ViewId,
} from './schema.ts';

export type AttentionKind = 'resolve' | 'chase' | 'review' | 'watch' | 'wait';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  detail: string;
  /** Links to a data object the desk can project. */
  objectId: string | null;
  /** Grouped wait rows collapse into one home card. */
  groupCount?: number;
  /** When the item landed on the attention list (ISO). */
  addedAt: string;
}

/** Higher = more urgent. */
export const URGENCY_RANK: Record<AttentionKind, number> = {
  resolve: 5,
  chase: 4,
  review: 3,
  watch: 2,
  wait: 1,
};

export type AttentionSort = 'urgency' | 'added';

export function sortAttention(
  items: readonly AttentionItem[],
  mode: AttentionSort,
): AttentionItem[] {
  const copy = [...items];
  if (mode === 'urgency') {
    copy.sort((a, b) => {
      const byKind = URGENCY_RANK[b.kind] - URGENCY_RANK[a.kind];
      if (byKind !== 0) return byKind;
      return b.addedAt.localeCompare(a.addedAt);
    });
  } else {
    copy.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }
  return copy;
}

export interface SectionRow {
  section: string;
  status: 'Open' | 'Tied';
  itd: string;
  previous: string;
  due: string;
  dueEmphasis?: boolean;
}

/** Mirrors SignedLineView on the broker detail page. */
export interface SignedLineRow {
  section: string;
  entity: string;
  line: string;
  commType: string;
  commRate: string;
  fwMargin: string;
  fet: string;
  brokerage: string;
  asic: string;
  anic: string;
  aiel: string;
  aiuk: string;
  aicc: string;
}

/** Cedant × section × currency row — ALLIANZ_STATEMENT_ENTITIES grain. */
export interface ContractRow {
  reinsured: string;
  section: string;
  currency: string;
  signedLine: string;
  subjectPremium: string;
  cedingCommission: string;
  lossRatio: string;
  /** Numeric LR for threshold filters. */
  lossRatioPct: number;
}

/** Measure threshold applied to a view (e.g. loss ratio > 10). */
export interface MeasureThreshold {
  key: string;
  op: '>' | '<' | '>=' | '<=';
  value: number;
}

/** Statement ledger row — statement-history.ts grain. */
export interface StatementRow {
  code: string;
  type: string;
  section: string;
  currency: string;
  /** ISO YYYY-MM-DD for date filtering; display uses formatted date. */
  dateIso: string;
  date: string;
  premiumBasis: string;
  amount: string;
  status: string;
}

export type DeskTab = ViewId;

/** Selected facet values for one dimension key. */
export type DimFilterMap = Record<string, Set<string>>;

export interface DateRange {
  from: string;
  to: string;
}

/** View state on the projected display object — shared by human controls + agent. */
export interface ViewState {
  tab: DeskTab;
  /** Case pin for sections (null = all sections allowed by facet). */
  section: string | null;
  highlightDue: boolean;
  /** Which catalog recipes are visible as desk tabs. */
  enabledViews: Set<ViewId>;
  /** User/agent has expanded beyond the case’s scoped row. */
  exploredPeers: boolean;
  columnsByView: Record<ViewId, Set<string>>;
  /** Dimension facet selections per view — keys are column keys. */
  filtersByView: Record<ViewId, DimFilterMap>;
  /** Date-range controls when a date column is visible. */
  dateRangeByView: Record<ViewId, DateRange | null>;
  /** Optional measure thresholds per view (e.g. lossRatio > 10). */
  thresholdsByView: Record<ViewId, MeasureThreshold[]>;
}

export interface TreatyObject {
  id: string;
  label: string;
  signedLineBlended: string;
  settlement: string;
  period: string;
  residualNote: string;
  residualScale: string;
  sections: SectionRow[];
  signedLines: SignedLineRow[];
  contracts: ContractRow[];
  statements: StatementRow[];
}

function money(ccy: string, amount: number): string {
  const abs = Math.abs(amount);
  const mag =
    abs >= 1_000_000
      ? `${(abs / 1_000_000).toFixed(1)}M`
      : abs >= 1_000
        ? `${(abs / 1_000).toFixed(0)}K`
        : abs.toFixed(0);
  const neg = amount < 0;
  if (ccy === 'EUR') return neg ? `−€${mag}` : `€${mag}`;
  if (ccy === 'GBP') return neg ? `−£${mag}` : `£${mag}`;
  if (ccy === 'CAD') return neg ? `−CA$${mag}` : `CA$${mag}`;
  if (ccy === 'USD') return neg ? `−$${mag}` : `$${mag}`;
  return neg ? `−${ccy} ${mag}` : `${ccy} ${mag}`;
}

function moneyM(ccy: string, amountM: number): string {
  return money(ccy, amountM * 1_000_000);
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function pct(n: number, digits = 2): string {
  return `${n.toFixed(digits)}%`;
}

/** From ALLIANZ_STATEMENT_ENTITIES — TOR/Allianz whole-account QS seed. */
function contractFromSeed(seed: {
  reinsured: string;
  section: string;
  currency: string;
  signedLinePct: number;
  orderPct: number;
  subjectPremium: number;
  commissionPct: number;
  lossRatioPct: number;
}): ContractRow {
  const written = seed.subjectPremium * (seed.signedLinePct / 100) * (seed.orderPct / 100);
  const commission = written * (seed.commissionPct / 100);
  return {
    reinsured: seed.reinsured,
    section: seed.section,
    currency: seed.currency,
    signedLine: pct(seed.signedLinePct),
    subjectPremium: money(seed.currency, seed.subjectPremium),
    cedingCommission: money(seed.currency, commission),
    lossRatio: pct(seed.lossRatioPct, 1),
    lossRatioPct: seed.lossRatioPct,
  };
}

export function thresholdAllows(thresholds: MeasureThreshold[], key: string, numeric: number): boolean {
  for (const t of thresholds) {
    if (t.key !== key) continue;
    if (t.op === '>' && !(numeric > t.value)) return false;
    if (t.op === '>=' && !(numeric >= t.value)) return false;
    if (t.op === '<' && !(numeric < t.value)) return false;
    if (t.op === '<=' && !(numeric <= t.value)) return false;
  }
  return true;
}

export const USER_NAME = 'Carol';
export const TODAY = 'Feb 9, 2025';

export const ATTENTION: AttentionItem[] = [
  {
    id: 'tor-fix',
    kind: 'resolve',
    title: 'TOR statement landed with a tie-out break',
    detail: 'Internal tie out by €40K on A - EU.',
    objectId: 'tor-qs-2025',
    addedAt: '2025-02-09T08:40:00Z',
  },
  {
    id: 'rvi-chase',
    kind: 'chase',
    title: 'RVI statement overdue',
    detail: 'Awaited; expected by 28 May 2026, 18 days overdue.',
    objectId: null,
    addedAt: '2025-02-07T14:20:00Z',
  },
  {
    id: 'art-review',
    kind: 'review',
    title: 'ART commission trued up 43.70% → 44.20%',
    detail: 'Sliding-scale true-up as LR landed at 50%; net cash effect ~$1.15M.',
    objectId: null,
    addedAt: '2025-02-09T07:15:00Z',
  },
  {
    id: 'pet-watch',
    kind: 'watch',
    title: 'PET near premium cap',
    detail: 'Premium at 83% of cap ($62.2M / $75M).',
    objectId: null,
    addedAt: '2025-02-05T11:00:00Z',
  },
  {
    id: 'provisional-group',
    kind: 'review',
    title: '3 statements still provisional – within lag',
    detail: 'HRA, JAF, MAL · ~60-day bordereaux lag for Q1 2026.',
    objectId: null,
    groupCount: 3,
    addedAt: '2025-02-08T16:45:00Z',
  },
];

export const TREATIES: Record<string, TreatyObject> = {
  'tor-qs-2025': {
    id: 'tor-qs-2025',
    label: 'Quota share · 2025',
    signedLineBlended: '29.73%',
    settlement: 'Funds withheld',
    period: 'Jul 1, 2025 – Jun 30, 2026',
    residualNote: 'Residual €40K on Due',
    residualScale: '€40K is 3.2% of section ITD on A - EU · tolerance €1',
    sections: [
      {
        section: 'A - EU',
        status: 'Open',
        itd: '€1,240,000',
        previous: '€1,200,000',
        due: '€40,000',
        dueEmphasis: true,
      },
      { section: 'B - UK', status: 'Tied', itd: '€980,000', previous: '€980,000', due: '0' },
      { section: 'C - US', status: 'Tied', itd: '€1,100,000', previous: '€1,100,000', due: '0' },
      { section: 'D - Nordics', status: 'Tied', itd: '€420,000', previous: '€420,000', due: '0' },
      { section: 'E - APAC', status: 'Tied', itd: '€610,000', previous: '€610,000', due: '0' },
      { section: 'F - LatAm', status: 'Tied', itd: '€290,000', previous: '€290,000', due: '0' },
      { section: 'G - MENA', status: 'Tied', itd: '€180,000', previous: '€180,000', due: '0' },
      { section: 'H - Canada', status: 'Tied', itd: '€350,000', previous: '€350,000', due: '0' },
      { section: 'I - Other', status: 'Tied', itd: '€95,000', previous: '€95,000', due: '0' },
    ],
    signedLines: [
      {
        section: 'A',
        entity: 'aicc',
        line: '33.33%',
        commType: 'Sliding scale',
        commRate: '40.0% @ 50% LR',
        fwMargin: '2.5%',
        fet: '—',
        brokerage: '5.0%',
        asic: '—',
        anic: '—',
        aiel: '—',
        aiuk: '—',
        aicc: '33.33%',
      },
      {
        section: 'A',
        entity: 'aiel',
        line: '27.78%',
        commType: 'Sliding scale',
        commRate: '40.0% @ 50% LR',
        fwMargin: '2.5%',
        fet: '—',
        brokerage: '5.0%',
        asic: '—',
        anic: '—',
        aiel: '27.78%',
        aiuk: '—',
        aicc: '—',
      },
      {
        section: 'A',
        entity: 'aiuk',
        line: '16.67%',
        commType: 'Provisional',
        commRate: '38.0%',
        fwMargin: '2.5%',
        fet: '—',
        brokerage: '5.0%',
        asic: '—',
        anic: '—',
        aiel: '—',
        aiuk: '16.67%',
        aicc: '—',
      },
      {
        section: 'B',
        entity: 'anic',
        line: '22.50%',
        commType: 'Fixed',
        commRate: '42.0%',
        fwMargin: '—',
        fet: '1.0%',
        brokerage: '4.5%',
        asic: '—',
        anic: '22.50%',
        aiel: '—',
        aiuk: '—',
        aicc: '—',
      },
      {
        section: 'B',
        entity: 'asic',
        line: '18.00%',
        commType: 'Fixed',
        commRate: '42.0%',
        fwMargin: '—',
        fet: '1.0%',
        brokerage: '4.5%',
        asic: '18.00%',
        anic: '—',
        aiel: '—',
        aiuk: '—',
        aicc: '—',
      },
      {
        section: 'C',
        entity: 'hadron_specialty',
        line: '15.00%',
        commType: 'Provisional',
        commRate: '38.5%',
        fwMargin: '—',
        fet: '—',
        brokerage: '5.0%',
        asic: '—',
        anic: '—',
        aiel: '—',
        aiuk: '—',
        aicc: '—',
      },
      {
        section: 'C',
        entity: 'hadron_uk',
        line: '12.00%',
        commType: 'Provisional',
        commRate: '38.5%',
        fwMargin: '—',
        fet: '—',
        brokerage: '5.0%',
        asic: '—',
        anic: '—',
        aiel: '—',
        aiuk: '—',
        aicc: '—',
      },
      {
        section: 'D',
        entity: 'sierra',
        line: '10.00%',
        commType: 'Sliding scale',
        commRate: '41.0% @ 48% LR',
        fwMargin: '3.0%',
        fet: '—',
        brokerage: '5.0%',
        asic: '—',
        anic: '—',
        aiel: '—',
        aiuk: '—',
        aicc: '—',
      },
    ],
    // ALLIANZ_STATEMENT_ENTITIES — same seed TOR detail uses.
    contracts: [
      contractFromSeed({
        reinsured: 'Accelerant Specialty Insurance Company',
        section: 'A - US',
        currency: 'USD',
        signedLinePct: 29.73,
        orderPct: 100,
        subjectPremium: 152_400_000,
        commissionPct: 43.7,
        lossRatioPct: 3.89,
      }),
      contractFromSeed({
        reinsured: 'Accelerant National Insurance Company',
        section: 'B - US',
        currency: 'USD',
        signedLinePct: 28.5,
        orderPct: 100,
        subjectPremium: 178_600_000,
        commissionPct: 43.7,
        lossRatioPct: 6.94,
      }),
      contractFromSeed({
        reinsured: 'Accelerant Re I.I. (Non-US Business)',
        section: 'C - EU',
        currency: 'EUR',
        signedLinePct: 27.8,
        orderPct: 100,
        subjectPremium: 43_200_000,
        commissionPct: 43.7,
        lossRatioPct: 2.35,
      }),
      contractFromSeed({
        reinsured: 'Accelerant Re I.I. (Non-US Business)',
        section: 'C - EU',
        currency: 'NOK',
        signedLinePct: 27.8,
        orderPct: 100,
        subjectPremium: 345_300_000,
        commissionPct: 43.7,
        lossRatioPct: 2.1,
      }),
      contractFromSeed({
        reinsured: 'Accelerant Re I.I. (Non-US Business)',
        section: 'C - EU',
        currency: 'SEK',
        signedLinePct: 27.8,
        orderPct: 100,
        subjectPremium: 295_000_000,
        commissionPct: 43.7,
        lossRatioPct: 1.94,
      }),
      contractFromSeed({
        reinsured: 'Accelerant Re I.I. (Non-US Business)',
        section: 'C - EU',
        currency: 'GBP',
        signedLinePct: 27.8,
        orderPct: 100,
        subjectPremium: 22_300_000,
        commissionPct: 43.7,
        lossRatioPct: 2.62,
      }),
      contractFromSeed({
        reinsured: 'Accelerant Insurance UK Limited',
        section: 'D - UK',
        currency: 'GBP',
        signedLinePct: 30,
        orderPct: 100,
        subjectPremium: 22_000_000,
        commissionPct: 38.5,
        lossRatioPct: 23.12,
      }),
      contractFromSeed({
        reinsured: 'Accelerant Insurance Company of Canada',
        section: 'E',
        currency: 'CAD',
        signedLinePct: 26.4,
        orderPct: 100,
        subjectPremium: 39_400_000,
        commissionPct: 40.2,
        lossRatioPct: 16.74,
      }),
      contractFromSeed({
        reinsured: 'Hadron UK Ins. Co.',
        section: 'F',
        currency: 'GBP',
        signedLinePct: 28.9,
        orderPct: 100,
        subjectPremium: 49_800_000,
        commissionPct: 39.1,
        lossRatioPct: 16.03,
      }),
      contractFromSeed({
        reinsured: 'Hadron Specialty Ins.',
        section: 'G',
        currency: 'USD',
        signedLinePct: 29.73,
        orderPct: 100,
        subjectPremium: 138_200_000,
        commissionPct: 43.7,
        lossRatioPct: 0.47,
      }),
      contractFromSeed({
        reinsured: 'Southlake Specialty',
        section: 'H',
        currency: 'USD',
        signedLinePct: 29.73,
        orderPct: 100,
        subjectPremium: 23_200_000,
        commissionPct: 43.7,
        lossRatioPct: 1.99,
      }),
      contractFromSeed({
        reinsured: 'Sierra Specialty Ins.',
        section: 'I',
        currency: 'USD',
        signedLinePct: 25,
        orderPct: 100,
        subjectPremium: 78_000_000,
        commissionPct: 43.7,
        lossRatioPct: 0.03,
      }),
    ],
    // ALLIANZ_TXNS — statementHistoryFor('torgus').
    statements: (
      [
        {
          code: 'TX-0001',
          type: 'Premium',
          section: 'aicc',
          currency: 'CAD',
          dateIso: '2025-07-15',
          premiumBasis: 'Written',
          amountM: 55.6,
          status: 'Written',
        },
        {
          code: 'TX-0044',
          type: 'Claim',
          section: 'aicc',
          currency: 'CAD',
          dateIso: '2025-11-12',
          premiumBasis: null,
          amountM: -1.8,
          status: 'Paid',
        },
        {
          code: 'TX-0102',
          type: 'Premium',
          section: 'aiuk',
          currency: 'GBP',
          dateIso: '2025-07-15',
          premiumBasis: 'Written',
          amountM: 11.0,
          status: 'Earned',
        },
        {
          code: 'TX-0138',
          type: 'Premium',
          section: 'hadron_specialty',
          currency: 'USD',
          dateIso: '2025-07-15',
          premiumBasis: 'Written',
          amountM: 30.0,
          status: 'Written',
        },
        {
          code: 'TX-0155',
          type: 'Claim',
          section: 'sierra',
          currency: 'USD',
          dateIso: '2026-02-03',
          premiumBasis: null,
          amountM: -0.9,
          status: 'Outstanding',
        },
        {
          code: 'TX-0188',
          type: 'Commission',
          section: 'aiuk',
          currency: 'GBP',
          dateIso: '2026-03-31',
          premiumBasis: 'Sliding',
          amountM: -4.85,
          status: 'Posted',
        },
        {
          code: 'TX-0210',
          type: 'Claim',
          section: 'hadron_specialty',
          currency: 'USD',
          dateIso: '2026-01-18',
          premiumBasis: null,
          amountM: -0.4,
          status: 'IBNR',
        },
        {
          code: 'TX-0244',
          type: 'Premium',
          section: 'aicc',
          currency: 'EUR',
          dateIso: '2026-03-31',
          premiumBasis: 'Earned',
          amountM: 12.4,
          status: 'Earned',
        },
        {
          code: 'TX-0271',
          type: 'Fee',
          section: 'aiuk',
          currency: 'GBP',
          dateIso: '2025-09-30',
          premiumBasis: null,
          amountM: -0.12,
          status: 'Paid',
        },
        {
          code: 'TX-0305',
          type: 'Premium',
          section: 'A - EU',
          currency: 'EUR',
          dateIso: '2026-05-27',
          premiumBasis: 'Written',
          amountM: 8.2,
          status: 'Written',
        },
      ] as const
    ).map((t) => ({
      code: t.code,
      type: t.type,
      section: t.section,
      currency: t.currency,
      dateIso: t.dateIso,
      date: fmtDate(t.dateIso),
      premiumBasis: t.premiumBasis ?? '—',
      amount: moneyM(t.currency, t.amountM),
      status: t.status,
    })),
  },
  /** Slim stub for cross-object residual compare demos. */
  'allianz-qs-2025': {
    id: 'allianz-qs-2025',
    label: 'Allianz · Quota share · 2025',
    signedLineBlended: '29.73%',
    settlement: 'Funds withheld',
    period: 'Jul 1, 2025 – Jun 30, 2026',
    residualNote: 'No open residual',
    residualScale: 'Last statement tied within €1 tolerance',
    sections: [
      { section: 'A - US', status: 'Tied', itd: '$45,300,000', previous: '$45,300,000', due: '0' },
      { section: 'C - EU', status: 'Tied', itd: '€12,000,000', previous: '€12,000,000', due: '0' },
    ],
    signedLines: [],
    contracts: [],
    statements: [],
  },
};

export const KIND_LABEL: Record<AttentionKind, string> = {
  resolve: 'Resolve',
  chase: 'Chase',
  review: 'Review',
  watch: 'Watch',
  wait: '',
};

/** Distinct values for a dimension from catalog enums or row data. */
export function dimensionValues(
  viewId: ViewId,
  key: string,
  obj: TreatyObject | null,
): string[] {
  const field = TREATY_VIEW_CATALOG.find((v) => v.id === viewId)?.columns.find((c) => c.key === key);
  if (field?.values?.length) return [...field.values];
  if (!obj) return [];
  if (viewId === 'sections' && key === 'section') {
    return obj.sections.map((r) => r.section);
  }
  if (viewId === 'signed-lines') {
    if (key === 'section') return [...new Set(obj.signedLines.map((r) => r.section))];
    if (key === 'entity') return [...new Set(obj.signedLines.map((r) => r.entity))];
    if (key === 'commType') return [...new Set(obj.signedLines.map((r) => r.commType))];
  }
  if (viewId === 'contracts') {
    if (key === 'reinsured') return [...new Set(obj.contracts.map((r) => r.reinsured))];
    if (key === 'section') return [...new Set(obj.contracts.map((r) => r.section))];
    if (key === 'currency') return [...new Set(obj.contracts.map((r) => r.currency))];
  }
  if (viewId === 'statements') {
    if (key === 'type') return [...new Set(obj.statements.map((r) => r.type))];
    if (key === 'section') return [...new Set(obj.statements.map((r) => r.section))];
    if (key === 'currency') return [...new Set(obj.statements.map((r) => r.currency))];
    if (key === 'premiumBasis') {
      return [...new Set(obj.statements.map((r) => r.premiumBasis).filter((v) => v !== '—'))];
    }
    if (key === 'status') return [...new Set(obj.statements.map((r) => r.status))];
  }
  return field?.values ? [...field.values] : [];
}

function defaultFiltersForObject(obj: TreatyObject | null): Record<ViewId, DimFilterMap> {
  const out = {} as Record<ViewId, DimFilterMap>;
  const cols = defaultColumnsByView();
  for (const v of TREATY_VIEW_CATALOG) {
    const map: DimFilterMap = {};
    for (const col of v.columns) {
      if (col.role !== 'dimension' || !cols[v.id].has(col.key)) continue;
      map[col.key] = new Set(dimensionValues(v.id, col.key, obj));
    }
    out[v.id] = map;
  }
  return out;
}

function emptyDateRanges(): Record<ViewId, DateRange | null> {
  const out = {} as Record<ViewId, DateRange | null>;
  for (const v of TREATY_VIEW_CATALOG) out[v.id] = null;
  return out;
}

function emptyThresholds(): Record<ViewId, MeasureThreshold[]> {
  const out = {} as Record<ViewId, MeasureThreshold[]>;
  for (const v of TREATY_VIEW_CATALOG) out[v.id] = [];
  return out;
}

export function defaultViewState(objectId: string): ViewState {
  const obj = TREATIES[objectId] ?? null;
  const open = obj?.sections.find((s) => s.status === 'Open');
  return {
    tab: 'sections',
    section: open?.section ?? null,
    highlightDue: true,
    enabledViews: defaultEnabledViews(),
    exploredPeers: false,
    columnsByView: defaultColumnsByView(),
    filtersByView: defaultFiltersForObject(obj),
    dateRangeByView: emptyDateRanges(),
    thresholdsByView: emptyThresholds(),
  };
}
