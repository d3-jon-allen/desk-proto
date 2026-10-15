/**
 * Insight widget contract — a short derived story on the desk.
 *
 * One primary question per card. Blocks support trust and action;
 * exploration (tabs, facets, large tables) belongs on Object / Chart cards.
 */

/** How subject frames are arranged inside the card. */
export type InsightLayout = 'stack' | 'subjects-split';

/**
 * Operations a user (or agent chip) can take on / from an insight.
 * Not every instance supports every op — see `ops` on the widget.
 */
export type InsightOpType =
  | 'remove'
  | 'set-layout'
  | 'add-subject'
  | 'remove-subject'
  | 'set-emphasis'
  | 'reveal-source'
  | 'apply-as-filter'
  | 'show-provenance'
  | 'copy-narrative'
  | 'draft-from-narrative'
  | 'recompute';

export type InsightOp =
  | { type: 'remove' }
  | { type: 'set-layout'; layout: InsightLayout }
  | { type: 'add-subject'; subjectId: string }
  | { type: 'remove-subject'; subjectId: string }
  | { type: 'set-emphasis'; subjectId: string }
  | { type: 'reveal-source'; subjectId?: string }
  | { type: 'apply-as-filter' }
  | { type: 'show-provenance' }
  | { type: 'copy-narrative' }
  | { type: 'draft-from-narrative' }
  | { type: 'recompute' };

/** One term or operator in a calculation sequence. */
export type CalcPart =
  | { kind: 'term'; label: string; value: string; role?: 'input' | 'output' | 'muted' }
  | { kind: 'op'; symbol: '÷' | '−' | '+' | '×' | '=' };

export interface CalculationBlock {
  type: 'calculation';
  /** `row` = Due ÷ ITD = Share. `sum` = stacked addends → total (PDF residual metrics-1). */
  layout?: 'row' | 'sum';
  parts: CalcPart[];
}

export interface MetricsBlock {
  type: 'metrics';
  items: { label: string; value: string }[];
}

/** Compact evidence — key/values, not a full table. */
export interface DataBlock {
  type: 'data';
  rows: { label: string; value: string }[];
}

export interface NarrativeBlock {
  type: 'narrative';
  text: string;
}

export interface ProvenanceBlock {
  type: 'provenance';
  text: string;
}

export interface CaveatBlock {
  type: 'caveat';
  text: string;
}

export interface LinksBlock {
  type: 'links';
  items: { label: string; op: InsightOp }[];
}

export type InsightBlock =
  | CalculationBlock
  | MetricsBlock
  | DataBlock
  | NarrativeBlock
  | ProvenanceBlock
  | CaveatBlock
  | LinksBlock;

export interface InsightSubject {
  id: string;
  label: string;
  /** Optional tether to an entity (treaty, peer, …). */
  entityId?: string;
  status?: string;
  emphasis?: boolean;
  /** Blocks scoped to this subject frame (calc, metrics, small data). */
  blocks: InsightBlock[];
}

/**
 * Desk insight card — show the answer in structure (equation, status, peers).
 * Avoid prose that restates what the equation already says.
 * - Per-subject: calculation, metrics, data
 * - Card-level: links (optional data only when it isn’t visible above)
 */
export interface InsightWidget {
  id: string;
  kind: 'insight';
  title: string;
  /** Optional scope chip under the title (period, section, …). */
  scope?: string;
  layout: InsightLayout;
  subjects: InsightSubject[];
  blocks: InsightBlock[];
  /** Ops this instance exposes in chrome / gallery. */
  ops?: InsightOpType[];
}

export const INSIGHT_RESIDUAL_ID = 'insight-residual';

export const INSIGHT_OP_CATALOG: { type: InsightOpType; label: string; blurb: string }[] = [
  { type: 'remove', label: 'Remove', blurb: 'Drop the card from the desk.' },
  { type: 'set-layout', label: 'Set layout', blurb: 'Stack vs subjects side-by-side.' },
  { type: 'add-subject', label: 'Add subject', blurb: 'Expand the story with a peer frame.' },
  { type: 'remove-subject', label: 'Remove subject', blurb: 'Drop a peer from the compare.' },
  { type: 'set-emphasis', label: 'Set emphasis', blurb: 'Mark the case-focus subject.' },
  { type: 'reveal-source', label: 'Reveal source', blurb: 'Highlight rows on the related Object card.' },
  { type: 'apply-as-filter', label: 'Apply as filter', blurb: 'Push the insight scope onto an Object view.' },
  { type: 'show-provenance', label: 'Show provenance', blurb: 'Surface definition / as-of.' },
  { type: 'copy-narrative', label: 'Copy narrative', blurb: 'Copy the verdict text.' },
  { type: 'draft-from-narrative', label: 'Draft from narrative', blurb: 'Seed a query draft from the verdict.' },
  { type: 'recompute', label: 'Recompute', blurb: 'Refresh calculated terms.' },
];

const DEFAULT_OPS: InsightOpType[] = [
  'remove',
  'set-layout',
  'add-subject',
  'reveal-source',
  'draft-from-narrative',
];

export function residualCalc(due: string, itd: string, share: string): CalculationBlock {
  return {
    type: 'calculation',
    parts: [
      { kind: 'term', label: 'Due', value: due, role: 'input' },
      { kind: 'op', symbol: '÷' },
      {
        kind: 'term',
        label: 'ITD',
        value: itd,
        role: itd === '—' ? 'muted' : 'input',
      },
      { kind: 'op', symbol: '=' },
      { kind: 'term', label: 'Share', value: share, role: 'output' },
    ],
  };
}

/** Canonical TOR residual equation — shared by chat readout and desk pin. */
export function residualTorCalculation(): CalculationBlock {
  return residualCalc('€40K', '€1.24M', '3.2%');
}

/** Vertical ITD rollup — gallery / optional chat (Residual metrics-1.pdf). */
export function residualItdSumCalculation(count = 5, each = '€1.24M', total = '6.20M'): CalculationBlock {
  const addends: CalcPart[] = Array.from({ length: count - 1 }, () => ({
    kind: 'term' as const,
    label: 'ITD',
    value: each,
    role: 'input' as const,
  }));
  return {
    type: 'calculation',
    layout: 'sum',
    parts: [
      ...addends,
      { kind: 'op', symbol: '+' },
      { kind: 'term', label: 'ITD', value: each, role: 'input' },
      { kind: 'op', symbol: '=' },
      { kind: 'term', label: 'Total ITD', value: total, role: 'output' },
    ],
  };
}

/** TOR-only residual pin — equation + actions; no prose restating the math. */
export function residualInsightTor(): InsightWidget {
  return {
    id: INSIGHT_RESIDUAL_ID,
    kind: 'insight',
    title: 'Residual / ITD',
    layout: 'stack',
    subjects: [
      {
        id: 'tor',
        label: 'Torgus Re',
        entityId: 'tor-qs-2025',
        status: 'Open · A – EU',
        emphasis: true,
        blocks: [residualTorCalculation()],
      },
    ],
    blocks: [],
    ops: DEFAULT_OPS,
  };
}

/** Peer compare — parallel equations; status carries open vs tied. */
export function residualInsightPeers(): InsightWidget {
  return {
    id: INSIGHT_RESIDUAL_ID,
    kind: 'insight',
    title: 'Residual vs peers',
    layout: 'subjects-split',
    subjects: [
      {
        id: 'tor',
        label: 'Torgus Re',
        entityId: 'tor-qs-2025',
        status: 'Open · A – EU',
        emphasis: true,
        blocks: [residualTorCalculation()],
      },
      {
        id: 'allianz',
        label: 'Allianz',
        entityId: 'allianz-qs-2025',
        status: 'Tied · within €1',
        blocks: [residualCalc('€0', '—', '0%')],
      },
    ],
    blocks: [],
    ops: [...DEFAULT_OPS, 'remove-subject'],
  };
}

/** Gallery-only: metrics + compact facts (no formula, no prose). */
export function residualInsightMetrics(): InsightWidget {
  return {
    id: 'insight-metrics',
    kind: 'insight',
    title: 'Open residual',
    layout: 'stack',
    subjects: [
      {
        id: 'tor',
        label: 'Torgus Re',
        entityId: 'tor-qs-2025',
        status: 'Open · A – EU',
        emphasis: true,
        blocks: [
          {
            type: 'metrics',
            items: [
              { label: 'Due', value: '€40K' },
              { label: 'Share', value: '3.2%' },
              { label: 'Tolerance', value: '€1' },
            ],
          },
        ],
      },
    ],
    blocks: [],
    ops: ['remove', 'reveal-source', 'draft-from-narrative'],
  };
}

/** Loss-ratio style calc — threshold / contracts scenario. */
export function lossRatioInsight(): InsightWidget {
  return {
    id: 'insight-loss-ratio',
    kind: 'insight',
    title: 'Loss ratio',
    layout: 'stack',
    subjects: [
      {
        id: 'contract-a',
        label: 'Contract A · EUR',
        status: 'LR > 10%',
        emphasis: true,
        blocks: [
          {
            type: 'calculation',
            parts: [
              { kind: 'term', label: 'Incurred', value: '€1.2M', role: 'input' },
              { kind: 'op', symbol: '÷' },
              { kind: 'term', label: 'Earned', value: '€8.4M', role: 'input' },
              { kind: 'op', symbol: '=' },
              { kind: 'term', label: 'LR', value: '14.3%', role: 'output' },
            ],
          },
        ],
      },
    ],
    blocks: [],
    ops: DEFAULT_OPS,
  };
}

/** Commission true-up — review scenario (delta, not a restated story). */
export function commissionTrueUpInsight(): InsightWidget {
  return {
    id: 'insight-commission',
    kind: 'insight',
    title: 'Commission true-up',
    layout: 'stack',
    subjects: [
      {
        id: 'art',
        label: 'ART',
        status: 'Sliding scale',
        emphasis: true,
        blocks: [
          {
            type: 'calculation',
            parts: [
              { kind: 'term', label: 'Was', value: '43.70%', role: 'input' },
              { kind: 'op', symbol: '−' },
              { kind: 'term', label: 'Now', value: '44.20%', role: 'input' },
              { kind: 'op', symbol: '=' },
              { kind: 'term', label: 'Δ', value: '+0.50pp', role: 'output' },
            ],
          },
        ],
      },
    ],
    blocks: [],
    ops: DEFAULT_OPS,
  };
}

/** Premium vs cap — watch scenario. */
export function premiumCapInsight(): InsightWidget {
  return {
    id: 'insight-premium-cap',
    kind: 'insight',
    title: 'Premium / cap',
    layout: 'stack',
    subjects: [
      {
        id: 'pet',
        label: 'PET',
        status: 'Near cap',
        emphasis: true,
        blocks: [
          {
            type: 'calculation',
            parts: [
              { kind: 'term', label: 'Premium', value: '$62.2M', role: 'input' },
              { kind: 'op', symbol: '÷' },
              { kind: 'term', label: 'Cap', value: '$75M', role: 'input' },
              { kind: 'op', symbol: '=' },
              { kind: 'term', label: 'Used', value: '83%', role: 'output' },
            ],
          },
        ],
      },
    ],
    blocks: [],
    ops: DEFAULT_OPS,
  };
}
