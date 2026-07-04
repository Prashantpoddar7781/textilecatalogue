export const CREDIT_DEBIT_NOTE_TYPES = [
  { value: 'credit_note_sales', label: 'Credit Note (Sales)', noteKind: 'credit', noteSide: 'sales', partyType: 'customer' },
  { value: 'credit_note_purchase', label: 'Credit Note (Purchase)', noteKind: 'credit', noteSide: 'purchase', partyType: 'supplier' },
  { value: 'debit_note_sales', label: 'Debit Note (Sales)', noteKind: 'debit', noteSide: 'sales', partyType: 'customer' },
  { value: 'debit_note_purchase', label: 'Debit Note (Purchase)', noteKind: 'debit', noteSide: 'purchase', partyType: 'supplier' }
];

export function parseNoteType(value) {
  const text = String(value || '').trim();
  const match = CREDIT_DEBIT_NOTE_TYPES.find(type => type.value === text);
  if (match) return match;
  if (text.includes('credit') && text.includes('sales')) return CREDIT_DEBIT_NOTE_TYPES[0];
  if (text.includes('credit') && text.includes('purchase')) return CREDIT_DEBIT_NOTE_TYPES[1];
  if (text.includes('debit') && text.includes('sales')) return CREDIT_DEBIT_NOTE_TYPES[2];
  if (text.includes('debit') && text.includes('purchase')) return CREDIT_DEBIT_NOTE_TYPES[3];
  return null;
}

export function getAdjustDirection(noteKind, noteSide) {
  // Credit notes reduce payable/receivable; debit notes increase it.
  if (noteKind === 'credit') return 'deduct';
  return 'add';
}
