const PLACEHOLDER = /^(select|select customer|select supplier|select party|select state|select mill)$/i;

/** Caption of the field that has the cursor, from its label. */
function fieldCaption(el: HTMLElement): string {
  const wrap = el.closest('label');
  if (wrap) {
    const clone = wrap.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, select, textarea, datalist').forEach(node => node.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }
  let node: HTMLElement | null = el.parentElement;
  for (let depth = 0; depth < 4 && node; depth += 1) {
    const caption = Array.from(node.children).find(child =>
      child !== el && (child.tagName === 'LABEL' || child.tagName === 'SPAN')
    );
    const text = (caption?.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text;
    node = node.parentElement;
  }
  return '';
}

function isPartyCaption(raw: string): boolean {
  const text = raw.replace(/^\d+\.\s*/, '').trim().toLowerCase();
  if (!text) return false;
  if (/gstin|\bgst\b|msme|bill|broker/.test(text)) return false;
  if (text === 'party type') return false;
  if (text === 'party' || text.startsWith('party ') || text.startsWith('party(')) return true;
  return text === 'a/c name' || text === 'party a/c' || text === 'mill a/c';
}

/** Party typed or chosen in the field that has the cursor. Blank when the cursor is elsewhere. */
export function partyNameFromFocus(): string {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) {
    return '';
  }
  if (!isPartyCaption(fieldCaption(el))) return '';
  if (el instanceof HTMLSelectElement) {
    const text = (el.selectedOptions[0]?.textContent || '').trim();
    if (!el.value.trim() || PLACEHOLDER.test(text)) return '';
    return text;
  }
  const value = el.value.trim();
  if (!value || PLACEHOLDER.test(value)) return '';
  return value;
}
