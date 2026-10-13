/**
 * Fixed catalog of treaty display recipes — mirrors the broker detail
 * projections (sections / signed lines / contracts / statements).
 *
 * Tabs = enable a recipe; columns = properties on that recipe.
 * Desk filters are derived from visible dimension/date columns — never from measures.
 */

export type FieldRole =
  /** Low-cardinality categorical — facet filter when column is on. */
  | 'dimension'
  /** Continuous / money / rate — never gets a filter. */
  | 'measure'
  /** Date control when column is on. */
  | 'date'
  /** High-cardinality identity (codes, long names) — no facet. */
  | 'id';

export interface FieldDef {
  key: string;
  label: string;
  role: FieldRole;
  /** Shown by default when the view opens. */
  defaultOn?: boolean;
  /** Known enum for dimension facets; otherwise derived from row data. */
  values?: string[];
}

export type ViewId = 'sections' | 'signed-lines' | 'contracts' | 'statements';

export interface ViewRecipe {
  id: ViewId;
  label: string;
  /** On when the desk first opens this treaty. */
  defaultEnabled?: boolean;
  columns: FieldDef[];
}

const dim = (
  key: string,
  label: string,
  values?: string[],
  defaultOn = true,
): FieldDef => ({ key, label, role: 'dimension', values, defaultOn });

const measure = (key: string, label: string, defaultOn = true): FieldDef => ({
  key,
  label,
  role: 'measure',
  defaultOn,
});

const date = (key: string, label: string, defaultOn = true): FieldDef => ({
  key,
  label,
  role: 'date',
  defaultOn,
});

const id = (key: string, label: string, defaultOn = true): FieldDef => ({
  key,
  label,
  role: 'id',
  defaultOn,
});

/** Tie-out rollup used by the TOR case desk. */
const SECTIONS: ViewRecipe = {
  id: 'sections',
  label: 'Sections',
  defaultEnabled: true,
  columns: [
    dim('section', 'Section'),
    dim('status', 'Status', ['Open', 'Tied']),
    measure('itd', 'ITD'),
    measure('previous', 'Previously reported'),
    measure('due', 'Due'),
  ],
};

/** Signed lines by entity — SIGNED_LINES_BY_ENTITY_COLUMNS on detail. */
const SIGNED_LINES: ViewRecipe = {
  id: 'signed-lines',
  label: 'Signed lines',
  defaultEnabled: false,
  columns: [
    dim('section', 'Section', ['A', 'B', 'C', 'D']),
    dim('entity', 'Cedant entity'),
    measure('line', 'Signed line'),
    dim('commType', 'Commission type', ['Sliding scale', 'Provisional', 'Fixed']),
    measure('commRate', 'Ceding commission rate'),
    measure('fwMargin', 'FW margin rate', false),
    measure('fet', 'FET', false),
    measure('brokerage', 'Brokerage', false),
    measure('asic', 'ASIC', false),
    measure('anic', 'ANIC', false),
    measure('aiel', 'AIEL', false),
    measure('aiuk', 'AIUK', false),
    measure('aicc', 'AICC', false),
  ],
};

/** Contracts tab — cedant economics grain on detail. */
const CONTRACTS: ViewRecipe = {
  id: 'contracts',
  label: 'Contracts',
  defaultEnabled: false,
  columns: [
    dim('reinsured', 'Cedant entity'),
    dim('section', 'Section'),
    dim('currency', 'Ccy', ['USD', 'EUR', 'GBP', 'CAD', 'NOK', 'SEK']),
    measure('signedLine', 'Signed line'),
    measure('subjectPremium', 'Subject premium'),
    measure('cedingCommission', 'Ceding commission'),
    measure('lossRatio', 'Loss ratio', false),
  ],
};

/** Statements history tab on detail. */
const STATEMENTS: ViewRecipe = {
  id: 'statements',
  label: 'Statements',
  defaultEnabled: false,
  columns: [
    id('code', 'Transaction code'),
    dim('type', 'Type', ['Premium', 'Claim', 'Commission', 'Fee']),
    dim('section', 'Section'),
    dim('currency', 'Currency', ['USD', 'EUR', 'GBP', 'CAD']),
    date('date', 'Date'),
    dim('premiumBasis', 'Premium basis', ['Written', 'Earned', 'Sliding', 'Provisional'], false),
    measure('amount', 'Amount'),
    dim('status', 'Status', ['Written', 'Earned', 'Paid', 'Outstanding', 'IBNR', 'Posted']),
  ],
};

/** Preset catalog — order is desk / settings tab order. */
export const TREATY_VIEW_CATALOG: ViewRecipe[] = [
  SECTIONS,
  SIGNED_LINES,
  CONTRACTS,
  STATEMENTS,
];

export function recipe(id: ViewId): ViewRecipe {
  return TREATY_VIEW_CATALOG.find((v) => v.id === id) ?? SECTIONS;
}

export function defaultKeys(fields: FieldDef[]): Set<string> {
  return new Set(fields.filter((f) => f.defaultOn !== false).map((f) => f.key));
}

export function defaultEnabledViews(): Set<ViewId> {
  return new Set(TREATY_VIEW_CATALOG.filter((v) => v.defaultEnabled).map((v) => v.id));
}

export function defaultColumnsByView(): Record<ViewId, Set<string>> {
  const out = {} as Record<ViewId, Set<string>>;
  for (const v of TREATY_VIEW_CATALOG) {
    out[v.id] = defaultKeys(v.columns);
  }
  return out;
}

/** Dimension/date fields that should expose filters given current visible columns. */
export function activeFilterFields(viewId: ViewId, visibleColumns: Set<string>): FieldDef[] {
  return recipe(viewId).columns.filter(
    (c) => visibleColumns.has(c.key) && (c.role === 'dimension' || c.role === 'date'),
  );
}

export function isDimension(field: FieldDef): boolean {
  return field.role === 'dimension';
}

export function isDateField(field: FieldDef): boolean {
  return field.role === 'date';
}
