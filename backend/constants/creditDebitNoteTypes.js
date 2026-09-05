export const CREDIT_DEBIT_NOTE_TYPES = [
  { value: 'CREDIT NOTE (ON SALES)', series: 'CREDIT NOTE (ON SALES)', seriesCode: 'P91', label: 'CREDIT NOTE (ON SALES)', noteKind: 'credit', noteSide: 'sales', partyType: 'customer' },
  { value: 'CREDIT NOTE (ON PURCHASES)', series: 'CREDIT NOTE (ON PURCHASES)', seriesCode: 'P92', label: 'CREDIT NOTE (ON PURCHASES)', noteKind: 'credit', noteSide: 'purchase', partyType: 'supplier' },
  { value: 'DEBIT NOTE (ON SALES)', series: 'DEBIT NOTE (ON SALES)', seriesCode: 'S91', label: 'DEBIT NOTE (ON SALES)', noteKind: 'debit', noteSide: 'sales', partyType: 'customer' },
  { value: 'DEBIT NOTE (ON PURCHASES)', series: 'DEBIT NOTE (ON PURCHASES)', seriesCode: 'S92', label: 'DEBIT NOTE (ON PURCHASES)', noteKind: 'debit', noteSide: 'purchase', partyType: 'supplier' }
];

const SLUG_ALIASES = {
  credit_note_sales: 'CREDIT NOTE (ON SALES)',
  'credit-note-sales': 'CREDIT NOTE (ON SALES)',
  credit_note_purchase: 'CREDIT NOTE (ON PURCHASES)',
  'credit-note-purchase': 'CREDIT NOTE (ON PURCHASES)',
  debit_note_sales: 'DEBIT NOTE (ON SALES)',
  'debit-note-sales': 'DEBIT NOTE (ON SALES)',
  debit_note_purchase: 'DEBIT NOTE (ON PURCHASES)',
  'debit-note-purchase': 'DEBIT NOTE (ON PURCHASES)'
};

export function parseNoteType(value) {
  const text = String(value || '').trim();
  if (!text) return CREDIT_DEBIT_NOTE_TYPES[0];
  const aliased = SLUG_ALIASES[text] || SLUG_ALIASES[text.replace(/-/g, '_')] || text;
  const exact = CREDIT_DEBIT_NOTE_TYPES.find(
    type => type.value === aliased || type.series === aliased || type.seriesCode === String(aliased).toUpperCase()
  );
  if (exact) return exact;
  const lower = text.toLowerCase();
  if (lower.includes('credit') && lower.includes('sales')) return CREDIT_DEBIT_NOTE_TYPES[0];
  if (lower.includes('credit') && lower.includes('purchase')) return CREDIT_DEBIT_NOTE_TYPES[1];
  if (lower.includes('debit') && lower.includes('sales')) return CREDIT_DEBIT_NOTE_TYPES[2];
  if (lower.includes('debit') && lower.includes('purchase')) return CREDIT_DEBIT_NOTE_TYPES[3];
  return null;
}

export function formatNoteNumber(series, voucherNumber) {
  const voucher = String(voucherNumber ?? '').trim();
  if (!voucher) return '';
  const type = parseNoteType(series);
  if (type?.seriesCode === 'P91') return `${voucher}/C`;
  if (type?.seriesCode === 'S91') return `${voucher}/D`;
  return voucher;
}

export function getAdjustDirection(noteKind) {
  return noteKind === 'credit' ? 'deduct' : 'add';
}
