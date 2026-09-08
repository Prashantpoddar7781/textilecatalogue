export type PartyBillingTerms = {
  dhara?: number | null;
  discountRate?: number | null;
  graceDays?: number | null;
  interestRate?: number | null;
};

export function partyDhara(party?: PartyBillingTerms | null) {
  if (!party) return 0;
  const n = Number(party.dhara ?? party.discountRate);
  return Number.isFinite(n) ? n : 0;
}

export function partyGraceDays(party?: PartyBillingTerms | null) {
  const n = Number(party?.graceDays);
  return Number.isFinite(n) ? n : 0;
}

export function partyInterestRate(party?: PartyBillingTerms | null) {
  const n = Number(party?.interestRate);
  return Number.isFinite(n) ? n : 0;
}
