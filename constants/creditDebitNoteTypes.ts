export interface CreditDebitNoteType {
  value: string;
  label: string;
  noteKind: 'credit' | 'debit';
  noteSide: 'sales' | 'purchase';
  partyType: 'customer' | 'supplier';
}

export const CREDIT_DEBIT_NOTE_TYPES: CreditDebitNoteType[] = [
  { value: 'credit_note_sales', label: 'Credit Note (Sales)', noteKind: 'credit', noteSide: 'sales', partyType: 'customer' },
  { value: 'credit_note_purchase', label: 'Credit Note (Purchase)', noteKind: 'credit', noteSide: 'purchase', partyType: 'supplier' },
  { value: 'debit_note_sales', label: 'Debit Note (Sales)', noteKind: 'debit', noteSide: 'sales', partyType: 'customer' },
  { value: 'debit_note_purchase', label: 'Debit Note (Purchase)', noteKind: 'debit', noteSide: 'purchase', partyType: 'supplier' }
];

export const ADDITIONAL_ERP_FEATURES = CREDIT_DEBIT_NOTE_TYPES.map(type => ({
  title: type.label,
  href: `/erp/notes/${type.value.replace(/_/g, '-')}`
}));

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
  'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

export function parseNoteTypeFromPath(pathSegment: string): CreditDebitNoteType | undefined {
  const normalized = pathSegment.replace(/-/g, '_');
  return CREDIT_DEBIT_NOTE_TYPES.find(type => type.value === normalized);
}

export function getAdjustDirection(noteKind: 'credit' | 'debit') {
  return noteKind === 'credit' ? 'deduct' : 'add';
}
