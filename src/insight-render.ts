import type {
  CalcPart,
  InsightBlock,
  InsightSubject,
  InsightWidget,
  LinksBlock,
} from './insight.ts';
import { esc } from './util.ts';

export interface InsightRenderOptions {
  /** Pulse border after agent pin. */
  flash?: boolean;
  /** Show remove control in the card head. */
  showRemove?: boolean;
  /** Render link/ops affordances (desk) or keep them visible but inert (gallery). */
  interactiveLinks?: boolean;
}

function renderCalcPart(part: CalcPart): string {
  if (part.kind === 'op') {
    return `<div class="math-op" aria-hidden="true">${esc(part.symbol)}</div>`;
  }
  const role = part.role ?? 'input';
  const roleClass =
    role === 'output' ? ' math-term--result' : role === 'muted' ? ' math-term--muted' : '';
  return `<div class="math-term${roleClass}">
    <span class="math-term-label">${esc(part.label)}</span>
    <span class="math-term-value">${esc(part.value)}</span>
  </div>`;
}

/** Stacked addends → total (value + label rows, rule before result). */
function renderSumCalculation(
  block: Extract<InsightBlock, { type: 'calculation' }>,
): string {
  const rows: string[] = [];
  let pendingOp: string | null = null;
  let pastEquals = false;

  for (const part of block.parts) {
    if (part.kind === 'op') {
      if (part.symbol === '=') {
        pastEquals = true;
        pendingOp = '=';
      } else {
        pendingOp = part.symbol;
      }
      continue;
    }
    if (pastEquals) {
      rows.push(`<div class="math-sum-rule" aria-hidden="true"></div>`);
      rows.push(`<div class="math-sum-row math-sum-row--result">
        <span class="math-sum-op" aria-hidden="true">${esc(pendingOp ?? '=')}</span>
        <span class="math-sum-value">${esc(part.value)}</span>
        <span class="math-sum-label">${esc(part.label)}</span>
      </div>`);
      pendingOp = null;
      continue;
    }
    rows.push(`<div class="math-sum-row">
      <span class="math-sum-op"${pendingOp ? '' : ' aria-hidden="true"'}>${
        pendingOp ? esc(pendingOp) : ''
      }</span>
      <span class="math-sum-value">${esc(part.value)}</span>
      <span class="math-sum-label">${esc(part.label)}</span>
    </div>`);
    pendingOp = null;
  }

  return `<div class="math-formula math-formula--sum" role="group" aria-label="Calculation">
    ${rows.join('')}
  </div>`;
}

/** Calculation strip — used in desk insights and in chat readouts. */
export function renderCalculationBlock(
  block: Extract<InsightBlock, { type: 'calculation' }>,
  opts?: { compact?: boolean },
): string {
  if (block.layout === 'sum') {
    return renderSumCalculation(block);
  }
  return `<div class="math-formula${opts?.compact ? ' math-formula--chat' : ''}" role="group" aria-label="Calculation">
    ${block.parts.map(renderCalcPart).join('')}
  </div>`;
}

function renderBlock(block: InsightBlock): string {
  switch (block.type) {
    case 'calculation':
      return renderCalculationBlock(block);
    case 'metrics':
      return `<dl class="insight-metrics">
        ${block.items
          .map(
            (i) => `<div class="insight-metric">
          <dt>${esc(i.label)}</dt>
          <dd>${esc(i.value)}</dd>
        </div>`,
          )
          .join('')}
      </dl>`;
    case 'data':
      return `<dl class="insight-data">
        ${block.rows
          .map(
            (r) => `<div class="insight-data-row">
          <dt>${esc(r.label)}</dt>
          <dd>${esc(r.value)}</dd>
        </div>`,
          )
          .join('')}
      </dl>`;
    case 'narrative':
      return `<p class="insight-verdict">${esc(block.text)}</p>`;
    case 'provenance':
      return `<p class="insight-provenance">${esc(block.text)}</p>`;
    case 'caveat':
      return `<p class="insight-caveat">${esc(block.text)}</p>`;
    case 'links':
      return ''; // rendered in footer
  }
}

function renderLinksFooter(block: LinksBlock, opts: InsightRenderOptions): string {
  const inert = opts.interactiveLinks === false ? ' disabled' : '';
  return `<footer class="insight-footer">
    <div class="insight-links">
      ${block.items
        .map(
          (item) =>
            `<button type="button" class="btn insight-link-btn" data-insight-op="${esc(item.op.type)}"${inert}>${esc(item.label)}</button>`,
        )
        .join('')}
    </div>
  </footer>`;
}

function renderSubject(subject: InsightSubject): string {
  const body = subject.blocks.map((b) => renderBlock(b)).join('');
  return `<div class="insight-subject" data-subject-id="${esc(subject.id)}">
    <div class="insight-subject-head">
      <span class="insight-subject-label">${esc(subject.label)}</span>
      ${subject.status ? `<span class="insight-subject-status">${esc(subject.status)}</span>` : ''}
    </div>
    ${body}
  </div>`;
}

/** Pure HTML for an Insight widget (desk + gallery). */
export function renderInsightWidget(
  obj: InsightWidget,
  opts: InsightRenderOptions = {},
): string {
  const flash = opts.flash ? ' agent-touched' : '';
  const showRemove = opts.showRemove !== false;
  const multi = obj.layout === 'subjects-split' && obj.subjects.length > 1;
  const single = obj.subjects.length <= 1;
  const subjects = obj.subjects.map((s) => renderSubject(s)).join('');
  const bodyBlocks = obj.blocks.filter((b) => b.type !== 'links');
  const links = obj.blocks.find((b): b is LinksBlock => b.type === 'links');
  const cardBlocks = bodyBlocks.map((b) => renderBlock(b)).join('');
  const sizeClass = single ? ' insight-object--single' : '';

  return `<section class="display-object insight-object${sizeClass}${flash}" data-object-id="${esc(obj.id)}" data-insight-layout="${esc(obj.layout)}">
    <div class="display-head math-head">
      <div>
        <h3>${esc(obj.title)}</h3>
      </div>
      ${
        showRemove
          ? `<div class="display-head-actions">
        <button type="button" class="icon-btn" data-action="request-remove" data-table-id="${esc(obj.id)}" aria-label="Remove panel">✕</button>
      </div>`
          : ''
      }
    </div>
    <div class="insight-subjects${multi ? ' insight-subjects--multi' : ''}">${subjects}</div>
    ${cardBlocks ? `<div class="insight-card-blocks">${cardBlocks}</div>` : ''}
    ${links ? renderLinksFooter(links, opts) : ''}
  </section>`;
}
