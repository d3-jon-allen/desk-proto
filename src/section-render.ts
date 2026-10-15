import type { SectionRow, TreatyObject } from './data.ts';
import type { SectionDeskObject } from './desk.ts';
import { esc } from './util.ts';

export interface SectionRenderOptions {
  /** Flash / agent-touched state. */
  flash?: boolean;
  showRemove?: boolean;
  /** Half-width when sitting beside a pinned insight. */
  besideInsight?: boolean;
}

function displaySectionName(section: string): string {
  return section.replace(' - ', ' – ');
}

function measure(
  label: string,
  value: string,
  opts?: { emphasis?: boolean; numeric?: boolean },
): string {
  const classes = ['section-measure', opts?.emphasis ? 'is-emphasis' : '']
    .filter(Boolean)
    .join(' ');
  const valueClass = opts?.numeric ? 'section-measure-value num' : 'section-measure-value';
  return `<div class="${classes}">
    <span class="section-measure-label">${esc(label)}</span>
    <span class="${valueClass}">${esc(value)}</span>
  </div>`;
}

/** Light section-focus card — treaty as tags, one record’s measures (no derived share). */
export function renderSectionObject(
  sectionObj: SectionDeskObject,
  treaty: TreatyObject,
  row: SectionRow,
  opts: SectionRenderOptions = {},
): string {
  const highlightDue = sectionObj.highlightDue || row.dueEmphasis;
  const flash = opts.flash ? ' agent-touched' : '';
  const beside = opts.besideInsight ? ' is-beside' : '';
  const remove = opts.showRemove
    ? `<button type="button" class="icon-btn" data-action="request-remove" data-table-id="${esc(sectionObj.id)}" aria-label="Remove">✕</button>`
    : '';

  return `<section class="section-object${flash}${beside}" data-section-id="${esc(sectionObj.id)}" data-table-id="${esc(sectionObj.id)}">
    <div class="section-object-head">
      <div>
        <h3>Section: ${esc(displaySectionName(row.section))}</h3>
        <div class="pills">
          <span class="pill">${esc(treaty.label)}</span>
          <span class="pill">Signed line <span class="pill--num">${esc(treaty.signedLineBlended)}</span></span>
        </div>
      </div>
      ${remove ? `<div class="display-head-actions">${remove}</div>` : ''}
    </div>
    <div class="section-measures" role="group" aria-label="Section measures">
      ${measure('Status', row.status)}
      ${measure('ITD', row.itd, { numeric: true })}
      ${measure('Previously reported', row.previous, { numeric: true })}
      ${measure('Due', row.due === '0' ? '—' : row.due, {
        numeric: true,
        emphasis: highlightDue && row.due !== '0',
      })}
    </div>
  </section>`;
}
