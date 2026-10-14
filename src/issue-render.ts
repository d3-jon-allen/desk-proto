import { KIND_LABEL, type AttentionItem } from './data.ts';
import { esc } from './util.ts';

export interface IssueRenderOptions {
  /** Interactive open control (home). Gallery uses inert. */
  interactive?: boolean;
}

/** Attention / issue card used on the home list. */
export function renderAttentionCard(
  item: AttentionItem,
  opts: IssueRenderOptions = {},
): string {
  const kind = KIND_LABEL[item.kind];
  const interactive = opts.interactive !== false;
  const tag = interactive ? 'button' : 'div';
  const openAttr = interactive ? ` data-open="${esc(item.id)}" type="button"` : '';
  return `<${tag} class="attention-card${kind ? '' : ' no-kind'}"${openAttr}>
    ${kind ? `<span class="kind">${esc(kind)}</span>` : ''}
    <span class="attention-copy">
      <h2>${esc(item.title)}</h2>
      <p>${esc(item.detail)}</p>
    </span>
    <span class="arrow-btn" aria-hidden="true">→</span>
  </${tag}>`;
}
