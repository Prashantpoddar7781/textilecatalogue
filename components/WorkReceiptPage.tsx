import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListOrdered, Loader2, Plus, Trash2 } from 'lucide-react';
import { getGstDocumentType, getItcEligibility, gstReturnSection, postingTdsAccount, postingTdsPercent, resolveDefaultTdsPercent, postingPartyAccountType, postingDiscountAccount } from '../constants/erpTransactionPostingRules';
import { getGstDefaultsForTransactionType } from '../constants/erpTransactionTypes';
import { workReceiptsApi } from '../services/api';
import { resolvePartyPan, suggestTdsPercentFromPan } from '../utils/tds';
import { AccountParty, ErpSession, LinkedSourceDocument, WorkLineItem } from '../types';
import { AccountsInformationDialog, AddPartyConfirmDialog } from './AccountsInformationDialog';
import { GstTypeSelect, useMissingGstPrompt } from './GstTypeField';
import { gstTypeFromGstin, isNonGstType } from '../utils/partyGst';
import { DeleteEntryButton } from './DeleteEntryButton';
import { ErpFormShell, useErpFormActions } from './ErpFormShell';
import { ErpSaveButton } from './ErpSaveButton';
import { ErpPageBack } from './ErpPageBack';
import { PhotoEntryButton } from './PhotoEntryButton';
import { PhotoExtraction } from '../services/api';
import { PhotoPartyDetails, matchPhotoParty, photoPartyDetails, photoPartyState } from '../utils/photoEntry';
import { ErpTopMenu } from './ErpTopMenu';
import { MasterNameInput } from './MasterNameInput';
import { partyDhara } from '../utils/partyBillingTerms';
import { roundRupee } from '../utils/rupeeRound';
import { focusAdjacentField } from '../hooks/useErpFormKeyboard';
import { useVoucherJump } from '../hooks/useVoucherJump';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const toNum = (v: string | number) => Number(v) || 0;
const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const roundTdsRupee = (v: number) => {
  const n = round2(v);
  if (!(n > 0)) return 0;
  return Math.ceil(n - 1e-9);
};
const DEFAULT_CUT = 6.3;
const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-fuchsia-400';
const readonlyClass = 'w-full rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-2 text-sm font-semibold';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';

const calcFresh = (pcs: number, plain: number, sec: number, lost: number, lace: number) =>
  round2(Math.max(0, pcs - plain - sec - lost - lace));

const computeWorkLine = (row: WorkLineItem, patch: Partial<WorkLineItem> = {}): WorkLineItem => {
  const next = { ...row, ...patch };
  const pcs = toNum(next.pcs);
  const cut = toNum(next.cut) || DEFAULT_CUT;
  const mtsQty = patch.mtsQty != null ? toNum(patch.mtsQty) : round2(pcs * cut);
  const plain = toNum(next.plain);
  const sec = toNum(next.sec);
  const lost = toNum(next.lost);
  const lace = toNum(next.lace);
  const fresh = calcFresh(pcs, plain, sec, lost, lace);
  const rate = toNum(next.rate);
  const amount = round2(fresh * rate);
  return {
    ...next,
    pcs,
    cut,
    mtsQty,
    plain,
    sec,
    lost,
    lace,
    fresh,
    rate,
    amount,
    taxableValue: amount,
    fabricRate: toNum(next.fabricRate)
  };
};

interface ChallanChoice {
  source: LinkedSourceDocument;
  pendingLine: WorkLineItem;
}

function challanLineKey(sourceId: string, lineNo?: number | null) {
  return `${sourceId}:${lineNo || 0}`;
}

/** Pieces and metres already taken on the lines above this one. */
function takenOnEarlierLines(lines: WorkLineItem[], index: number) {
  const taken = new Map<string, { pcs: number; mts: number }>();
  for (const row of lines.slice(0, index)) {
    const allocs = (row.sourceAllocations || []).filter(alloc => alloc?.sourceDespatchId);
    const parts = allocs.length
      ? allocs.map(alloc => ({
        id: alloc.sourceDespatchId || '',
        lineNo: alloc.sourceLineNo,
        pcs: Number(alloc.pcs) || 0,
        mts: Number(alloc.mtsQty) || 0
      }))
      : row.sourceDespatchId
        ? [{ id: row.sourceDespatchId, lineNo: row.sourceLineNo, pcs: Number(row.pcs) || 0, mts: Number(row.mtsQty) || 0 }]
        : [];
    for (const part of parts) {
      if (!part.id || (part.pcs <= 0 && part.mts <= 0)) continue;
      const key = challanLineKey(part.id, part.lineNo);
      const current = taken.get(key) || { pcs: 0, mts: 0 };
      current.pcs = round2(current.pcs + part.pcs);
      current.mts = round2(current.mts + part.mts);
      taken.set(key, current);
    }
  }
  return taken;
}

function challanChoices(pending: LinkedSourceDocument[], taken = new Map<string, { pcs: number; mts: number }>()): ChallanChoice[] {
  const rows: ChallanChoice[] = [];
  for (const source of pending) {
    const pendingLines = source.pendingLines?.length ? source.pendingLines : [];
    for (const pendingLine of pendingLines) {
      const used = taken.get(challanLineKey(source.sourceId, pendingLine.lineNo));
      const pendingPcs = round2(Math.max(0, (Number(pendingLine.pendingPcs) || 0) - (used?.pcs || 0)));
      const pendingMts = round2(Math.max(0, (Number(pendingLine.pendingMts) || 0) - (used?.mts || 0)));
      if (pendingPcs <= 0.001 && pendingMts <= 0.001) continue;
      rows.push({ source, pendingLine: { ...pendingLine, pendingPcs, pendingMts } });
    }
  }
  return rows;
}

function choiceLabel(choice: ChallanChoice) {
  const challan = choice.source.documentNo || '-';
  const item = choice.pendingLine.itemName || '';
  const category = choice.pendingLine.category || '';
  const pcs = Number(choice.pendingLine.pendingPcs) || 0;
  return [challan, item, category, pcs ? `${pcs} pcs` : ''].filter(Boolean).join(' · ');
}

/** Challan is the first cell. Type a number or a name to pick that despatch on this line. */
function LineChallanPick({
  value,
  pending,
  taken,
  onPick,
  onClear
}: {
  value: string;
  pending: LinkedSourceDocument[];
  taken: Map<string, { pcs: number; mts: number }>;
  onPick: (choice: ChallanChoice) => void;
  onClear: () => void;
}) {
  const actions = useErpFormActions();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const blankEnters = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return challanChoices(pending, taken).filter(choice => {
      if (!q) return true;
      const hay = `${choice.source.documentNo || ''} ${choice.pendingLine.itemName || ''} ${choice.pendingLine.category || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [pending, query, taken]);

  const placeBox = () => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setBox({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) });
  };

  const focusNext = (input: HTMLInputElement) => {
    const row = input.closest('[data-erp-line]');
    if (!row) return;
    const fields = Array.from(row.querySelectorAll<HTMLInputElement>('input:not([readonly])'));
    const index = fields.indexOf(input);
    fields[index + 1]?.focus();
  };

  const lineBlank = (input: HTMLInputElement) => {
    const row = input.closest('[data-erp-line]');
    if (!row) return !input.value.trim();
    return !Array.from(row.querySelectorAll<HTMLInputElement>('input')).some(field => {
      if (field === input || field.hasAttribute('data-erp-line-default')) return false;
      const text = field.value.trim();
      return text !== '' && text !== '0';
    }) && !input.value.trim();
  };

  return (
    <div className="relative min-w-[7.5rem]">
      <input
        ref={inputRef}
        data-erp-enter-custom
        data-erp-arrow-custom
        className={inputClass}
        placeholder="Challan"
        value={query}
        onFocus={() => {
          setOpen(true);
          setHighlight(query.trim() ? 0 : -1);
          placeBox();
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
          if (!query.trim()) onClear();
          else setQuery(value);
        }}
        onChange={e => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          setHighlight(next.trim() ? 0 : -1);
          blankEnters.current = 0;
          placeBox();
          if (!next.trim()) onClear();
        }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'ArrowUp' && !(open && matches.length && highlight > 0)) {
              setOpen(false);
              const row = e.currentTarget.closest('[data-erp-line]');
              const grid = row?.closest('[data-erp-line-grid]');
              const rows = grid ? Array.from(grid.querySelectorAll('[data-erp-line]')) : [];
              const rowIndex = row ? rows.indexOf(row) : -1;
              if (row && rowIndex > 0) {
                const col = Array.from(row.querySelectorAll('input')).indexOf(e.currentTarget);
                const fields = Array.from(rows[rowIndex - 1].querySelectorAll<HTMLInputElement>('input'));
                fields[Math.max(col, 0)]?.focus();
                return;
              }
              focusAdjacentField(e.currentTarget, -1);
              return;
            }
            if (open && matches.length) {
              setHighlight(current => {
                const start = current < 0 ? 0 : current;
                if (e.key === 'ArrowUp') return Math.max(start - 1, 0);
                return Math.min(start + 1, matches.length - 1);
              });
              return;
            }
            const row = e.currentTarget.closest('[data-erp-line]');
            const grid = row?.closest('[data-erp-line-grid]');
            const rows = grid ? Array.from(grid.querySelectorAll('[data-erp-line]')) : [];
            const rowIndex = row ? rows.indexOf(row) : -1;
            const nextRow = rows[rowIndex + (e.key === 'ArrowDown' ? 1 : -1)];
            if (nextRow) {
              const mine = row ? Array.from(row.querySelectorAll('input')) : [];
              const col = mine.indexOf(e.currentTarget);
              const fields = Array.from(nextRow.querySelectorAll<HTMLInputElement>('input'));
              fields[Math.max(col, 0)]?.focus();
            } else if (e.key === 'ArrowUp') {
              focusAdjacentField(e.currentTarget, -1);
            }
            return;
          }
          if (e.key !== 'Enter') return;
          e.preventDefault();
          e.stopPropagation();
          const typed = query.trim();
          const chosen = typed && matches.length
            ? matches[highlight >= 0 ? highlight : 0]
            : null;
          if (chosen) {
            blankEnters.current = 0;
            onPick(chosen);
            setOpen(false);
            focusNext(e.currentTarget);
            return;
          }
          if (lineBlank(e.currentTarget)) {
            if (blankEnters.current >= 1) {
              blankEnters.current = 0;
              actions?.requestSave();
              return;
            }
            blankEnters.current += 1;
            return;
          }
          blankEnters.current = 0;
          focusNext(e.currentTarget);
        }}
      />
      {open && box && (
        <div
          className="fixed z-[70] max-h-64 overflow-y-auto rounded-lg border border-fuchsia-200 bg-white shadow-xl"
          style={{ top: box.top, left: box.left, width: box.width }}
        >
          {matches.length === 0 && (
            <p className="px-3 py-2 text-[11px] font-semibold text-gray-500">No pending challan for that search.</p>
          )}
          {matches.slice(0, 40).map((choice, index) => (
            <button
              key={`${choice.source.sourceId}:${choice.pendingLine.lineNo || index}`}
              type="button"
              className={`block w-full px-3 py-1.5 text-left text-[11px] font-bold ${index === highlight ? 'bg-fuchsia-100 text-fuchsia-900' : 'text-gray-800 hover:bg-fuchsia-50'}`}
              onMouseDown={e => {
                e.preventDefault();
                onPick(choice);
                setQuery(choice.source.documentNo || '');
                setOpen(false);
                if (inputRef.current) focusNext(inputRef.current);
              }}
            >
              {choiceLabel(choice)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const blankLine = (lineNo: number): WorkLineItem => ({
  lineNo,
  sourceDespatchId: null,
  sourceChallanNo: null,
  sourceLineNo: null,
  itemName: '',
  jobType: 'HAND WORK',
  unit: 'PCS',
  pcs: 0,
  cut: DEFAULT_CUT,
  mtsQty: 0,
  plain: 0,
  sec: 0,
  lost: 0,
  lace: 0,
  fresh: 0,
  rate: 0,
  amount: 0,
  fabricRate: 0,
  taxableValue: 0
});

export const WorkReceiptPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const urlEditId = useMemo(() => new URLSearchParams(window.location.search).get('edit'), []);
  const [editId, setEditId] = useState<string | null>(urlEditId);
  const isEditMode = Boolean(editId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingNewParty, setPendingNewParty] = useState('');
  const [showAddConfirm, setShowAddConfirm] = useState(false);
  const [showAccountsDialog, setShowAccountsDialog] = useState(false);
  const [allowUnknownParty, setAllowUnknownParty] = useState(false);
  const [newPartyDetails, setNewPartyDetails] = useState<PhotoPartyDetails | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [businessState, setBusinessState] = useState('');
  const gstTouched = useRef(false);
  const { askIfMissing, dialog: missingGstDialog } = useMissingGstPrompt();
  const [transactionTypes, setTransactionTypes] = useState<string[]>([]);
  const [parties, setParties] = useState<Array<{ name: string; gstNumber?: string | null; state?: string | null; brokerName?: string | null; suggestedTdsPercent?: number | null; dhara?: number | null; graceDays?: number | null; interestRate?: number | null }>>([]);
  const [transactionType, setTransactionType] = useState('WORK REC. BILL');
  const gstDocumentType = getGstDocumentType(transactionType);
  const gstReturn = gstReturnSection(transactionType);
  const itcEligibility = getItcEligibility(transactionType);
  const tdsAccount = postingTdsAccount(transactionType);
  const masterTdsPercent = postingTdsPercent(transactionType);
  const discountAccount = postingDiscountAccount(transactionType);
  const [companyGstRate, setCompanyGstRate] = useState(5);
  const [companyHsnCode, setCompanyHsnCode] = useState('');
  const [voucherNo, setVoucherNo] = useState('1');
  const [committedNo, setCommittedNo] = useState('1');
  const [nextByType, setNextByType] = useState<Record<string, number>>({});
  const companyGstRef = useRef(companyGstRate);
  const companyHsnRef = useRef(companyHsnCode);
  const jumpEpoch = useRef(0);
  const fillReceiptRef = useRef<(entry: any, sources?: any[]) => void>(() => {});
  const openReceiptRef = useRef<(found: { id: string; editPath: string }) => Promise<void>>(async () => {});
  const missingReceiptRef = useRef<(voucher: number) => void>(() => {});
  companyGstRef.current = companyGstRate;
  companyHsnRef.current = companyHsnCode;
  const onOpenReceipt = useCallback(
    (found: { id: string; editPath: string }) => openReceiptRef.current(found),
    []
  );
  const onMissingReceipt = useCallback((voucher: number) => missingReceiptRef.current(voucher), []);
  const workReceiptVoucherJump = useVoucherJump({
    module: 'work-receipt',
    transactionType,
    currentId: editId,
    shownNumber: committedNo,
    onOpen: onOpenReceipt,
    nextBlank: nextByType[transactionType] || null,
    onMissing: onMissingReceipt,
    onNotice: message => { if (message) setSuccess(message); },
    onError: setError
  });
  const [gstRate, setGstRate] = useState(
    () => String(getGstDefaultsForTransactionType('WORK REC. BILL').gstRate)
  );
  const [partyName, setPartyName] = useState('');
  const [partyGstin, setPartyGstin] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [gstType, setGstType] = useState('');
  const [challanNo, setChallanNo] = useState('');
  const [receiptDate, setReceiptDate] = useState(today());
  const [brokerName, setBrokerName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [workType, setWorkType] = useState('');
  const [hsnCode, setHsnCode] = useState(
    () => getGstDefaultsForTransactionType('WORK REC. BILL').hsnCode
  );
  const [remarks, setRemarks] = useState('');
  const [billNo, setBillNo] = useState('');
  // One bill may cover several despatch challans.
  const [selectedSources, setSelectedSources] = useState<LinkedSourceDocument[]>([]);
  const [pending, setPending] = useState<LinkedSourceDocument[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [lines, setLines] = useState<WorkLineItem[]>([blankLine(1)]);
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [otherLess, setOtherLess] = useState('');
  const [otherAdd, setOtherAdd] = useState('');
  const [tdsPercent, setTdsPercent] = useState('');
  const [tdsPercentTouched, setTdsPercentTouched] = useState(false);
  const [tdsOnAmt, setTdsOnAmt] = useState('');
  const [tdsAmount, setTdsAmount] = useState('0');
  const [tdsOnAmtTouched, setTdsOnAmtTouched] = useState(false);
  const [grossAmount, setGrossAmount] = useState(0);
  const [invoiceValue, setInvoiceValue] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [taxableAmount, setTaxableAmount] = useState(0);
  const [netAfterTds, setNetAfterTds] = useState(0);
  const [cgstAmount, setCgstAmount] = useState('0');
  const [sgstAmount, setSgstAmount] = useState('0');
  const [igstAmount, setIgstAmount] = useState('0');
  const [cgstRate, setCgstRate] = useState('0');
  const [sgstRate, setSgstRate] = useState('0');
  const [igstRate, setIgstRate] = useState('0');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const meta = await workReceiptsApi.getMeta();
        if (cancelled) return;
        setCompanyName(meta.companyName || '');
        setBusinessState(meta.businessState || '');
        const seriesNext = meta.nextByType || {};
        setNextByType(seriesNext);
        setTransactionTypes(meta.transactionTypes || []);
        const companyGst = Number(meta.companyGstRate) || 5;
        const companyHsn = meta.companyHsnCode || '';
        companyGstRef.current = companyGst;
        companyHsnRef.current = companyHsn;
        setCompanyGstRate(companyGst);
        setCompanyHsnCode(companyHsn);
        setParties(meta.parties || []);

        if (urlEditId) {
          const { entry, sources } = await workReceiptsApi.getById(urlEditId);
          if (cancelled) return;
          fillReceiptRef.current(entry, sources);
        } else {
          const startType = meta.transactionTypes?.[0] || 'WORK REC. BILL';
          const nextNo = String(seriesNext[startType] || meta.nextVoucherNo || 1);
          setTransactionType(startType);
          setVoucherNo(nextNo);
          setCommittedNo(nextNo);
          const startDefaults = getGstDefaultsForTransactionType(startType, companyGst, companyHsn);
          setGstRate(String(startDefaults.gstRate));
          setHsnCode(startDefaults.hsnCode);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load work receipt.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [urlEditId]);

  const applyTdsDefaults = (
    type: string,
    opts?: { party?: string; gstin?: string | null; panNumber?: string | null }
  ) => {
    if (tdsPercentTouched) return;
    const name = (opts?.party || partyName).trim().toLowerCase();
    const match = parties.find(p => p.name.toLowerCase() === name);
    const pan = resolvePartyPan({
      panNumber: opts?.panNumber,
      gstNumber: opts?.gstin || match?.gstNumber || partyGstin
    });
    const fromPan = match?.suggestedTdsPercent != null
      ? match.suggestedTdsPercent
      : suggestTdsPercentFromPan(pan);
    const pct = resolveDefaultTdsPercent(type, fromPan);
    setTdsPercent(pct != null ? String(pct) : '');
  };

  const applyGstFromNumber = (gstin: string, force = false) => {
    if (!force && gstTouched.current && isNonGstType(gstType)) return;
    const next = gstTypeFromGstin(gstin, businessState);
    if (!next) {
      if (force) setGstType('');
      return;
    }
    gstTouched.current = false;
    setGstType(next);
    if (toNum(gstRate) === 0) {
      setGstRate(String(getGstDefaultsForTransactionType(transactionType, companyGstRate, companyHsnCode).gstRate));
    }
  };

  const fillPartyDefaults = (match: { name: string; gstNumber?: string | null; state?: string | null; brokerName?: string | null }) => {
    setPartyGstin(match.gstNumber || '');
    setBrokerName(match.brokerName || '');
    if (match.state) setPlaceOfSupply(match.state);
    if (!isEditMode) setDiscountPercent(String(partyDhara(match) || ''));
    applyTdsDefaults(transactionType, { party: match.name, gstin: match.gstNumber });
    applyGstFromNumber(match.gstNumber || '', true);
  };

  const applyPartyDefaults = (name: string) => {
    const match = parties.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
    if (!match) return;
    if (!String(match.gstNumber || '').trim()) {
      askIfMissing(match, () => fillPartyDefaults(match), () => {
        setPartyName('');
        setPartyGstin('');
        setGstType('');
        gstTouched.current = false;
      });
      return;
    }
    fillPartyDefaults(match);
  };

  const promptIfNewParty = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (parties.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) return;
    setPendingNewParty(trimmed);
    setShowAddConfirm(true);
  };

  const onPartySaved = (party: AccountParty) => {
    setPartyName(party.name);
    if (party.gstNumber) setPartyGstin(party.gstNumber);
    if (party.brokerName) setBrokerName(party.brokerName);
    if (party.state) setPlaceOfSupply(party.state);
    setAllowUnknownParty(false);
    const pan = resolvePartyPan({ panNumber: party.panNumber, gstNumber: party.gstNumber });
    const suggested = suggestTdsPercentFromPan(pan);
    setParties(prev => {
      if (prev.some(row => row.name.toLowerCase() === party.name.toLowerCase())) return prev;
      return [...prev, {
        name: party.name,
        gstNumber: party.gstNumber,
        state: party.state,
        brokerName: party.brokerName,
        dhara: party.dhara,
        graceDays: party.graceDays,
        interestRate: party.interestRate,
        suggestedTdsPercent: suggested
      }];
    });
    if (!isEditMode) setDiscountPercent(String(partyDhara(party) || ''));
    applyTdsDefaults(transactionType, {
      party: party.name,
      gstin: party.gstNumber,
      panNumber: party.panNumber
    });
  };

  const startBlankReceipt = (type: string, voucherOverride?: string) => {
    workReceiptVoucherJump.cancelPendingJump();
    jumpEpoch.current += 1;
    setEditId(null);
    setError('');
    setSuccess('');
    setTransactionType(type);
    const nextNo = voucherOverride || String(nextByType[type] || 1);
    setVoucherNo(nextNo);
    setCommittedNo(nextNo);
    const defaults = getGstDefaultsForTransactionType(type, companyGstRate, companyHsnCode);
    setGstRate(String(defaults.gstRate));
    setHsnCode(defaults.hsnCode);
    setPartyName('');
    setPartyGstin('');
    setPlaceOfSupply('');
    setStateCode('');
    setGstType('');
    gstTouched.current = false;
    setChallanNo('');
    setReceiptDate(today());
    setBrokerName('');
    setVehicleNo('');
    setWorkType('');
    setRemarks('');
    setBillNo('');
    setSelectedSources([]);
    setPending([]);
    setChecked({});
    setPickerOpen(false);
    setLines([blankLine(1)]);
    setDiscountPercent('');
    setDiscountAmount(0);
    setOtherLess('');
    setOtherAdd('');
    setTdsPercent('');
    setTdsPercentTouched(false);
    setTdsOnAmt('');
    setTdsAmount('0');
    setTdsOnAmtTouched(false);
    setGrossAmount(0);
    setInvoiceValue(0);
    setTaxableAmount(0);
    setNetAfterTds(0);
    setCgstAmount('0');
    setSgstAmount('0');
    setIgstAmount('0');
    setCgstRate('0');
    setSgstRate('0');
    setIgstRate('0');
    if (window.location.search) window.history.replaceState(null, '', '/erp/work-receipt');
  };

  fillReceiptRef.current = (entry, sources) => {
    setSelectedSources(sources || []);
    setEditId(entry.id);
    if (entry.companyName) setCompanyName(entry.companyName);
    const savedType = entry.transactionType || 'WORK REC. BILL';
    const savedDefaults = getGstDefaultsForTransactionType(savedType, companyGstRef.current, companyHsnRef.current);
    setTransactionType(savedType);
    const number = String(entry.voucherNo ?? '');
    setVoucherNo(number);
    setCommittedNo(number);
    setGstRate(String(entry.gstRate ?? savedDefaults.gstRate));
    setPartyName(entry.partyName || '');
    setPartyGstin(entry.partyGstin || '');
    setPlaceOfSupply(entry.placeOfSupply || '');
    setStateCode(entry.stateCode || '');
    setGstType(entry.gstType || '');
    gstTouched.current = isNonGstType(entry.gstType);
    setChallanNo(entry.challanNo || entry.workDespatch?.challanNo || '');
    setReceiptDate(entry.receiptDate ? String(entry.receiptDate).slice(0, 10) : today());
    setBrokerName(entry.brokerName || '');
    setVehicleNo(entry.vehicleNo || '');
    setWorkType(entry.workType || '');
    setHsnCode(entry.hsnCode || savedDefaults.hsnCode);
    setRemarks(entry.remarks || '');
    setBillNo(entry.billNo || '');
    setLines((entry.lineItems || []).map((row: WorkLineItem) => {
      const pcs = toNum(row.pcs);
      const plain = toNum(row.plain);
      const sec = toNum(row.sec);
      const lost = toNum(row.lost);
      const lace = toNum(row.lace);
      const fresh = row.fresh != null ? toNum(row.fresh) : calcFresh(pcs, plain, sec, lost, lace);
      const rate = toNum(row.rate);
      const storedAmount = toNum(row.amount);
      const amount = storedAmount > 0 ? round2(storedAmount) : round2(fresh * rate);
      return {
        ...row,
        pcs,
        cut: toNum(row.cut) || DEFAULT_CUT,
        mtsQty: toNum(row.mtsQty),
        plain,
        sec,
        lost,
        lace,
        fresh,
        rate,
        amount,
        taxableValue: amount,
        fabricRate: toNum(row.fabricRate)
      };
    }));
    setDiscountPercent(String(entry.discountPercent || ''));
    setDiscountAmount(Number(entry.discountAmount) || 0);
    setOtherLess(String(entry.otherLess || ''));
    setOtherAdd(String(entry.otherAdd || ''));
    setGrossAmount(Number(entry.grossAmount) || 0);
    setTaxableAmount(Number(entry.taxableAmount) || 0);
    setInvoiceValue(Number(entry.invoiceValue) || 0);
    setCgstAmount(String(entry.cgstAmount ?? 0));
    setSgstAmount(String(entry.sgstAmount ?? 0));
    setIgstAmount(String(entry.igstAmount ?? 0));
    setCgstRate(String(entry.cgstRate ?? 0));
    setSgstRate(String(entry.sgstRate ?? 0));
    setIgstRate(String(entry.igstRate ?? 0));
    setTdsPercent(entry.tdsPercent ? String(entry.tdsPercent) : '');
    setTdsPercentTouched(Boolean(Number(entry.tdsPercent) > 0));
    const taxable = Number(entry.taxableAmount) || 0;
    const pct = Number(entry.tdsPercent) || 0;
    setTdsOnAmt(taxable > 0 ? String(taxable) : '');
    setTdsOnAmtTouched(false);
    const tdsAmt = round2(taxable * pct / 100);
    setTdsAmount(String(tdsAmt));
    setNetAfterTds(round2((Number(entry.invoiceValue) || 0) - tdsAmt));
    setError('');
  };

  openReceiptRef.current = async (found) => {
    const epoch = ++jumpEpoch.current;
    setError('');
    try {
      const { entry, sources } = await workReceiptsApi.getById(found.id);
      if (jumpEpoch.current !== epoch) return;
      fillReceiptRef.current(entry, sources);
      window.history.replaceState(null, '', found.editPath || `/erp/work-receipt?edit=${entry.id}`);
    } catch (err: any) {
      if (jumpEpoch.current !== epoch) return;
      setError(err.message || 'Could not open that voucher.');
    }
  };

  missingReceiptRef.current = (voucher) => {
    if (!editId && Number(committedNo) === voucher) {
      setVoucherNo(String(voucher));
      return;
    }
    startBlankReceipt(transactionType, String(voucher));
  };

  const loadPending = async () => {
    if (!partyName.trim()) {
      setError('Select / enter party name first, then pick work desp challan.');
      return;
    }
    setPendingLoading(true);
    setError('');
    try {
      const { sources } = await workReceiptsApi.getPendingSources({
        transactionType,
        partyName: partyName.trim(),
        excludeId: editId || undefined
      });
      setPending(sources || []);
      // Pre-tick the designs already on this bill so editing is additive.
      setChecked(Object.fromEntries(
        lines
          .filter(line => line.sourceDespatchId)
          .map(line => [`${line.sourceDespatchId}:${line.sourceLineNo || 0}`, true])
      ));
      setPickerOpen(true);
      if (!sources?.length) {
        setError(`No pending work desp challans for ${partyName.trim()}. You can still add bill lines without a challan.`);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load pending despatches.');
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    const party = partyName.trim();
    if (!party) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { sources } = await workReceiptsApi.getPendingSources({
            transactionType,
            partyName: party,
            excludeId: editId || undefined
          });
          if (!cancelled) setPending(sources || []);
        } catch {
          if (!cancelled) setPending([]);
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [partyName, transactionType, editId]);

  const toggleChecked = (key: string) => {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const checkedCount = useMemo(() => Object.values(checked).filter(Boolean).length, [checked]);

  const formatPickDate = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  };

  const pickerRows = useMemo(() => pending.flatMap(source =>
    (source.pendingLines || []).map(line => ({
      source,
      line,
      key: `${source.sourceId}:${line.lineNo || 0}`,
      pendPcs: Number(line.pendingPcs ?? line.pcs) || 0,
      pendMts: Number(line.pendingMts ?? line.mtsQty) || 0
    }))
  ), [pending]);

  /** Pulls each ticked despatch line into this bill. One design on a challan can be picked on its own. */
  const applySelectedSources = async () => {
    const keys = Object.entries(checked).filter(([, on]) => on).map(([key]) => key);
    if (!keys.length) {
      setError('Tick at least one line.');
      return;
    }
    const wanted = new Set(keys);
    const ids = [...new Set(keys.map(key => key.slice(0, key.lastIndexOf(':'))))];
    setPendingLoading(true);
    try {
      const { sources, lineItems } = await workReceiptsApi.seedFromSources({
        transactionType,
        sourceDespatchIds: ids,
        excludeId: editId || undefined
      });
      const picked = lineItems.filter(row => wanted.has(`${row.sourceDespatchId}:${row.sourceLineNo}`));
      const primary = sources[0];
      setSelectedSources(sources.filter(source => ids.includes(source.sourceId)));
      if (primary) {
        setPartyName(primary.partyName || '');
        setPartyGstin(primary.partyGstin || '');
        setBrokerName(primary.brokerName || '');
        setWorkType(primary.workType || '');
        applyTdsDefaults(transactionType, {
          party: primary.partyName || '',
          gstin: primary.partyGstin || null
        });
      }
      setChallanNo(sources.map(source => source.documentNo).filter(Boolean).join(', '));
      setLines(picked.map((row, index) => {
        const pcs = toNum(row.pcs);
        const cut = toNum(row.cut) || DEFAULT_CUT;
        const mtsQty = toNum(row.mtsQty) || round2(pcs * cut);
        const rate = toNum(row.rate);
        const fresh = pcs;
        const amount = round2(fresh * rate);
        return {
          lineNo: index + 1,
          sourceDespatchId: row.sourceDespatchId,
          sourceChallanNo: row.sourceChallanNo,
          sourceLineNo: row.sourceLineNo,
          itemName: row.itemName,
          category: row.category || null,
          bundles: row.bundles || 0,
          jobType: row.jobType || '',
          unit: row.unit || 'PCS',
          pcs,
          cut,
          mtsQty,
          plain: 0,
          sec: 0,
          lost: 0,
          lace: 0,
          fresh,
          rate,
          amount,
          fabricRate: row.fabricRate || 0,
          taxableValue: amount
        };
      }));
      setPickerOpen(false);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Could not load the picked challans.');
    } finally {
      setPendingLoading(false);
    }
  };

  const applyPhoto = (x: PhotoExtraction) => {
    const notes: string[] = [];
    const match = matchPhotoParty(parties, x);
    if (match) {
      setPartyName(match.name);
      applyPartyDefaults(match.name);
    } else if (x.party.name) {
      setPartyName(x.party.name);
      if (x.party.gstin) {
        setPartyGstin(x.party.gstin);
        setStateCode(x.party.gstin.slice(0, 2));
      }
      const pos = photoPartyState(x);
      if (pos) setPlaceOfSupply(pos);
      setPendingNewParty(x.party.name);
      setNewPartyDetails(photoPartyDetails(x));
      setShowAddConfirm(true);
      notes.push(`"${x.party.name}" is not in your party master — add it with the details from the bill.`);
    }
    if (x.docNo) setBillNo(x.docNo);
    if (x.docDate) setReceiptDate(x.docDate);
    if (x.challanNo) setChallanNo(x.challanNo);
    if (x.broker) setBrokerName(x.broker);
    if (x.transport.vehicleNo) setVehicleNo(x.transport.vehicleNo);
    if (x.remarks) setRemarks(x.remarks);
    const hsn = x.hsn || x.lines.find(line => line.hsn)?.hsn;
    if (hsn) setHsnCode(hsn);
    const rate = x.gstRate || x.lines.find(line => line.gstRate)?.gstRate;
    if (rate) setGstRate(String(rate));
    if (x.discountPercent) setDiscountPercent(String(x.discountPercent));
    if (x.otherAdd) setOtherAdd(String(x.otherAdd));
    if (x.otherLess) setOtherLess(String(x.otherLess));
    if (x.lines.length) {
      setLines(x.lines.map((line, index) => {
        const pcs = line.pcs || line.qty || line.mts;
        const fits = pcs > 0 && Math.abs(pcs * line.rate - line.amount) <= Math.max(1, line.amount * 0.01);
        return computeWorkLine(blankLine(index + 1), {
          itemName: line.description,
          pcs,
          ...(line.cut ? { cut: line.cut } : {}),
          ...(line.mts ? { mtsQty: line.mts } : {}),
          rate: fits || !pcs ? line.rate : Math.round((line.amount / pcs) * 100) / 100
        });
      }));
      notes.push('Lines are not linked to a despatch challan — use Pick Desp Challan if this job came from one.');
    }
    return notes;
  };

  const withLineLink = (row: WorkLineItem): WorkLineItem => {
    if (!row.sourceDespatchId) return { ...row, sourceAllocations: [] };
    const allocs = Array.isArray(row.sourceAllocations) ? row.sourceAllocations.filter(alloc => alloc?.sourceDespatchId) : [];
    if (allocs.length > 1) return row;
    return {
      ...row,
      sourceAllocations: [{
        sourceDespatchId: row.sourceDespatchId,
        sourceChallanNo: row.sourceChallanNo || null,
        sourceLineNo: row.sourceLineNo ?? null,
        pcs: row.pcs,
        mtsQty: row.mtsQty
      }]
    };
  };

  const updateLine = (index: number, patch: Partial<WorkLineItem>) => {
    setLines(prev => prev.map((row, i) => i === index ? withLineLink(computeWorkLine(row, patch)) : row));
  };

  const linkLineChallan = (index: number, choice: ChallanChoice) => {
    setSelectedSources(prev => prev.some(source => source.sourceId === choice.source.sourceId) ? prev : [...prev, choice.source]);
    setLines(prev => {
      const next = prev.map((row, i) => {
        if (i !== index) return row;
        const itemName = String(row.itemName || '').trim() || choice.pendingLine.itemName || '';
        const category = String(row.category || '').trim() || choice.pendingLine.category || null;
        const remainPcs = Number(choice.pendingLine.pendingPcs) || 0;
        const remainMts = Number(choice.pendingLine.pendingMts) || 0;
        const typedPcs = toNum(row.pcs);
        const pcs = typedPcs > 0 ? Math.min(typedPcs, remainPcs > 0 ? remainPcs : typedPcs) : remainPcs;
        const cut = toNum(choice.pendingLine.cut) || toNum(row.cut) || DEFAULT_CUT;
        const rate = toNum(row.rate) > 0 ? toNum(row.rate) : toNum(choice.pendingLine.rate);
        return withLineLink(computeWorkLine(row, {
          sourceDespatchId: choice.source.sourceId,
          sourceChallanNo: choice.source.documentNo || null,
          sourceLineNo: choice.pendingLine.lineNo ?? null,
          itemName,
          category,
          pcs,
          cut,
          rate,
          ...(typedPcs > 0 ? {} : { mtsQty: remainMts || round2(pcs * cut) })
        }));
      });
      const nos = [...new Set(next.map(row => row.sourceChallanNo).filter(Boolean))];
      if (nos.length) setChallanNo(nos.join(', '));
      return next;
    });
  };

  const clearLineChallan = (index: number) => {
    updateLine(index, { sourceDespatchId: null, sourceChallanNo: null, sourceLineNo: null, sourceAllocations: [] });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        if (!lines.length) {
          setGrossAmount(0);
          setTaxableAmount(0);
          setInvoiceValue(0);
          setRoundOff(0);
          setNetAfterTds(0);
          setTdsAmount('0');
          return;
        }
        try {
          const { totals } = await workReceiptsApi.calculate({
            lineItems: lines,
            gstRate: toNum(gstRate),
            gstType,
            partyGstin,
            placeOfSupply,
            stateCode,
            discountPercent: discountPercent || undefined,
            otherLess: toNum(otherLess),
            otherAdd: toNum(otherAdd),
            tdsPercent: toNum(tdsPercent),
            // Only send On Amt when user manually overrode; else backend uses taxable
            tdsOnAmt: tdsOnAmtTouched && toNum(tdsOnAmt) > 0 ? toNum(tdsOnAmt) : undefined
          });
          setGrossAmount(Number(totals.grossAmount) || 0);
          setDiscountAmount(Number(totals.discountAmount) || 0);
          setTaxableAmount(Number(totals.taxableAmount) || 0);
          setInvoiceValue(Number(totals.invoiceValue) || 0);
          setRoundOff(Number(totals.roundOff) || 0);
          setNetAfterTds(Number(totals.netAfterTds) || Number(totals.invoiceValue) || 0);
          setCgstAmount(String(totals.cgstAmount ?? 0));
          setSgstAmount(String(totals.sgstAmount ?? 0));
          setIgstAmount(String(totals.igstAmount ?? 0));
          setCgstRate(String(totals.cgstRate ?? 0));
          setSgstRate(String(totals.sgstRate ?? 0));
          setIgstRate(String(totals.igstRate ?? 0));
          setTdsAmount(String(totals.tdsAmount ?? 0));
          if (!tdsOnAmtTouched && Number(totals.taxableAmount) > 0) {
            setTdsOnAmt(String(totals.tdsOnAmt ?? totals.taxableAmount));
          }
          if (!gstTouched.current) {
            const auto = gstTypeFromGstin(partyGstin, businessState);
            if (auto) setGstType(auto);
          }
          if (totals.placeOfSupply) setPlaceOfSupply(String(totals.placeOfSupply));
          if (totals.stateCode) setStateCode(String(totals.stateCode));
        } catch {
          const gross = round2(lines.reduce((s, r) => s + toNum(r.amount), 0));
          const invoice = roundRupee(gross);
          setGrossAmount(gross);
          setTaxableAmount(gross);
          setInvoiceValue(invoice);
          setRoundOff(round2(invoice - gross));
          setNetAfterTds(invoice);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [lines, gstRate, gstType, partyGstin, placeOfSupply, stateCode, discountPercent, otherLess, otherAdd, tdsPercent, tdsOnAmt, tdsOnAmtTouched, businessState]);

  // Instant TDS when On Amt / % / bill change (same as mill receipt)
  useEffect(() => {
    const base = tdsOnAmtTouched && toNum(tdsOnAmt) > 0
      ? toNum(tdsOnAmt)
      : taxableAmount;
    const pct = toNum(tdsPercent);
    const amt = roundTdsRupee(base * pct / 100);
    const invoice = roundRupee(invoiceValue);
    setTdsAmount(String(amt));
    if (invoiceValue > 0 && invoice !== invoiceValue) setInvoiceValue(invoice);
    setNetAfterTds(round2(invoice - amt));
    if (pct > 0 && !tdsOnAmtTouched && taxableAmount > 0) {
      setTdsOnAmt(String(taxableAmount));
    }
  }, [tdsOnAmt, tdsPercent, taxableAmount, invoiceValue, tdsOnAmtTouched]);

  const totals = useMemo(() => ({
    pcs: round2(lines.reduce((s, r) => s + toNum(r.pcs), 0)),
    mts: round2(lines.reduce((s, r) => s + toNum(r.mtsQty), 0)),
    fresh: round2(lines.reduce((s, r) => s + toNum(r.fresh), 0)),
    amount: round2(lines.reduce((s, r) => s + toNum(r.amount), 0))
  }), [lines]);

  const buildPayload = () => ({
    sourceDespatchIds: [...new Set([
      ...selectedSources.map(source => source.sourceId),
      ...lines.map(line => line.sourceDespatchId).filter((id): id is string => Boolean(id))
    ])],
    companyName,
    transactionType,
    partyName: partyName.trim(),
    partyGstin: partyGstin || undefined,
    placeOfSupply: placeOfSupply || undefined,
    stateCode: stateCode || undefined,
    challanNo: challanNo || undefined,
    voucherNo: toNum(voucherNo),
    receiptDate,
    brokerName: brokerName || undefined,
    vehicleNo: vehicleNo || undefined,
    workType: workType || undefined,
    hsnCode,
    remarks: remarks || undefined,
    billNo: billNo || undefined,
    gstRate: toNum(gstRate),
    gstType: gstType || undefined,
    discountPercent: toNum(discountPercent),
    otherLess: toNum(otherLess),
    otherAdd: toNum(otherAdd),
    tdsPercent: toNum(tdsPercent),
    tdsOnAmt: tdsOnAmtTouched && toNum(tdsOnAmt) > 0
      ? toNum(tdsOnAmt)
      : (taxableAmount || undefined),
    lineItems: lines,
    grossAmount,
    taxableAmount
  });

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!partyName.trim()) throw new Error('Party is required.');
      if (!parties.some(p => p.name.toLowerCase() === partyName.trim().toLowerCase()) && !allowUnknownParty) {
        promptIfNewParty(partyName);
        return;
      }
      if (!lines.length) throw new Error('Add received lines.');
      if (isEditMode && editId) {
        await workReceiptsApi.update(editId, buildPayload());
        setSuccess('Work receipt updated. Ledger reflects EMB JOB CHARGES.');
      } else {
        await workReceiptsApi.create(buildPayload());
        setSuccess('Work receipt saved. Ledger posted as EMB JOB CHARGES.');
        const meta = await workReceiptsApi.getMeta();
        const seriesNext = meta.nextByType || {};
        setNextByType(seriesNext);
        const nextNo = String(seriesNext[transactionType] || meta.nextVoucherNo || 1);
        setVoucherNo(nextNo);
        setCommittedNo(nextNo);
        setSelectedSources([]);
        setChecked({});
        setChallanNo('');
        setLines([blankLine(1)]);
        setRemarks('');
        setBillNo('');
        setDiscountPercent('');
        setOtherLess('');
        setOtherAdd('');
        setTdsPercent('');
        setTdsOnAmt('');
        setTdsOnAmtTouched(false);
        setGrossAmount(0);
        setInvoiceValue(0);
        setTaxableAmount(0);
        setNetAfterTds(0);
      }
    } catch (err: any) {
      setError(err.message || 'Could not save work receipt.');
    } finally {
      setSaving(false);
    }
  };

  const deleteDocument = async () => {
    if (!editId) return;
    try {
      await workReceiptsApi.delete(editId);
      window.location.href = '/erp/work-receipt';
    } catch (err: any) {
      setError(err.message || 'Could not delete this entry.');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7FB]">
        <Loader2 className="h-8 w-8 animate-spin text-fuchsia-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Work Receipt" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <ErpPageBack onBack={onBack} />
          <div className="flex gap-2">
            <button type="button" onClick={() => { window.location.href = '/erp/reports/work-receipt'; }} className="rounded-xl border bg-white px-3 py-2 text-xs font-black uppercase text-fuchsia-800">
              Work Recpt Report
            </button>
            <button type="button" onClick={() => void loadPending()} className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-700 px-3 py-2 text-xs font-black uppercase text-white">
              <ListOrdered className="h-3.5 w-3.5" /> Pick Desp Challan
            </button>
            <PhotoEntryButton kind="work_receipt" onApply={applyPhoto} disabled={loading} />
          </div>
        </div>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        {success && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</div>}

        <ErpFormShell onSave={() => void handleSave()} saving={saving}>
          <section className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/40 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h1 className="text-lg font-black uppercase tracking-wide text-gray-900">
                Work Rec. Bill {isEditMode ? '· Edit' : '· Add Mode'}
              </h1>
              <div className="flex items-center gap-2">
                {isEditMode && <DeleteEntryButton onDelete={deleteDocument} disabled={saving} />}
                <span className="rounded-full bg-fuchsia-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-fuchsia-800">
                  Posts EMB JOB CHARGES
                </span>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
              <label><span className={labelClass}>Company</span><input className={inputClass} value={companyName} onChange={e => setCompanyName(e.target.value)} /></label>
              <label>
                <span className={labelClass}>Type</span>
                <select
                  className={inputClass}
                  value={transactionType}
                  onChange={e => {
                    const next = e.target.value;
                    if (!editId) {
                      startBlankReceipt(next);
                      return;
                    }
                    setTransactionType(next);
                    applyTdsDefaults(next, { party: partyName, gstin: partyGstin });
                    const d = getGstDefaultsForTransactionType(next, companyGstRate, companyHsnCode);
                    setGstRate(String(d.gstRate));
                    setHsnCode(d.hsnCode);
                  }}
                >
                  {transactionTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label>
                <span className={labelClass}>Voucher</span>
                <input
                  className={inputClass}
                  value={voucherNo}
                  onChange={e => setVoucherNo(e.target.value)}
                  {...workReceiptVoucherJump.voucherFieldProps}
                />
              </label>
              <label><span className={labelClass}>Date</span><input type="date" className={inputClass} value={receiptDate} onChange={e => setReceiptDate(e.target.value)} /></label>
              <label className="md:col-span-2">
                <span className={labelClass}>Party</span>
                <input
                  className={inputClass}
                  list="work-rec-parties"
                  value={partyName}
                  onChange={e => {
                    setPartyName(e.target.value);
                    setAllowUnknownParty(false);
                    applyPartyDefaults(e.target.value);
                  }}
                  onBlur={e => promptIfNewParty(e.target.value)}
                />
                <datalist id="work-rec-parties">
                  {parties.map(p => <option key={p.name} value={p.name} />)}
                </datalist>
              </label>
              <label>
                <span className={labelClass}>
                  Pick desp challan (optional)
                  {selectedSources.length > 1 ? ` · ${selectedSources.length}` : ''}
                </span>
                <button type="button" onClick={() => void loadPending()} className={`${inputClass} truncate text-left text-fuchsia-800`}>
                  {challanNo || 'Optional — pick to prefill, or add lines below'}
                </button>
              </label>
              <label><span className={labelClass}>Bill No.</span><input className={inputClass} value={billNo} onChange={e => setBillNo(e.target.value)} /></label>
              <label><span className={labelClass}>Work Type</span><input className={inputClass} value={workType} onChange={e => setWorkType(e.target.value)} /></label>
              <label>
                <span className={labelClass}>Broker</span>
                <MasterNameInput
                  className={inputClass}
                  listId="work-receipt-brokers"
                  value={brokerName}
                  onChange={setBrokerName}
                  suggestPattern={/broker|brok/i}
                  suggestedAccountType={postingPartyAccountType('PURCHASE (COMM)') || 'CREDITORS FOR BROKERAGE'}
                />
              </label>
              <label><span className={labelClass}>Vehicle No.</span><input className={inputClass} value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} /></label>
              <label>
                <span className={labelClass}>Party GSTIN</span>
                <input
                  className={inputClass}
                  value={partyGstin}
                  onChange={e => {
                    const next = e.target.value;
                    setPartyGstin(next);
                    applyGstFromNumber(next);
                  }}
                />
              </label>
              <label>
                <span className={labelClass}>GST Type</span>
                <GstTypeSelect
                  className={inputClass}
                  value={gstType}
                  onChange={value => {
                    gstTouched.current = true;
                    setGstType(value);
                    if (isNonGstType(value)) setGstRate('0');
                    else if (toNum(gstRate) === 0) {
                      setGstRate(String(getGstDefaultsForTransactionType(transactionType, companyGstRate, companyHsnCode).gstRate));
                    }
                  }}
                />
              </label>
              <label className="md:col-span-2">
                <span className={labelClass}>GST Document{gstReturn !== 'NONE' ? ` · ${gstReturn}` : ''}{itcEligibility ? ` · ITC ${itcEligibility}` : ''}</span>
                <input className={readonlyClass} value={gstDocumentType || '—'} readOnly />
              </label>
              <label><span className={labelClass}>GST %</span><input className={inputClass} type="number" value={gstRate} onChange={e => setGstRate(e.target.value)} /></label>
              <label><span className={labelClass}>HSN</span><input className={inputClass} value={hsnCode} onChange={e => setHsnCode(e.target.value)} /></label>
              <label className="md:col-span-2"><span className={labelClass}>Remark</span><input className={inputClass} value={remarks} onChange={e => setRemarks(e.target.value)} /></label>
            </div>

            {selectedSources.length > 0 && (
              <div className="mt-3 rounded-xl border border-fuchsia-200 bg-white p-3">
                <p className={labelClass}>{selectedSources.length > 1 ? `This bill covers ${selectedSources.length} desp challans` : 'Despatch on this bill'}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedSources.map(source => {
                    const billed = lines.reduce((sum, line) => {
                      const allocs = (line.sourceAllocations || []).filter(alloc => alloc?.sourceDespatchId === source.sourceId);
                      if (allocs.length) return sum + allocs.reduce((part, alloc) => part + toNum(alloc.pcs), 0);
                      return line.sourceDespatchId === source.sourceId ? sum + toNum(line.pcs) : sum;
                    }, 0);
                    return (
                      <span
                        key={source.sourceId}
                        className="rounded-lg bg-fuchsia-50 px-2.5 py-1 text-[11px] font-bold text-fuchsia-900"
                        title={`${source.pendingPcs} pcs pending on this challan`}
                      >
                        {source.documentNo || source.sourceId} · {round2(billed)} pcs
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section data-erp-line-grid className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b bg-fuchsia-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-fuchsia-800">
                {selectedSources.length
                  ? 'Particulars · Fresh = Pcs − (plain + sec + lost + lace) · Amount = Fresh × Rate'
                  : 'Add lines here, or pick a desp challan above to prefill'}
              </p>
              <button
                type="button"
                data-erp-add-line
                onClick={() => setLines(prev => [...prev, blankLine(Math.max(0, ...prev.map(line => toNum(line.lineNo))) + 1)])}
                className="inline-flex items-center gap-1 rounded-lg bg-fuchsia-600 px-3 py-1.5 text-[10px] font-black uppercase text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Add Line
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                  <tr>
                    <th className="px-2 py-2">Challan</th>
                    <th className="px-2 py-2">Ref / Item</th>
                    <th className="px-2 py-2">Category</th>
                    <th className="px-2 py-2">Job Type</th>
                    <th className="px-2 py-2 text-right">Pcs</th>
                    <th className="px-2 py-2 text-right">Cut</th>
                    <th className="px-2 py-2 text-right">Mts</th>
                    <th className="px-2 py-2 text-right">Plain</th>
                    <th className="px-2 py-2 text-right">Sec</th>
                    <th className="px-2 py-2 text-right">Lost</th>
                    <th className="px-2 py-2 text-right">Lace</th>
                    <th className="px-2 py-2 text-right">Fresh</th>
                    <th className="px-2 py-2 text-right">Rate</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {!lines.length && (
                    <tr><td colSpan={15} className="px-4 py-8 text-center text-sm text-gray-500">Add lines, or pick a work desp challan to load pcs / rate / cut / mts.</td></tr>
                  )}
                  {lines.map((line, index) => (
                    <tr key={index} data-erp-line className="border-b">
                      <td className="px-2 py-2">
                        <LineChallanPick
                          value={line.sourceChallanNo || ''}
                          pending={pending}
                          taken={takenOnEarlierLines(lines, index)}
                          onPick={choice => linkLineChallan(index, choice)}
                          onClear={() => clearLineChallan(index)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input className={inputClass} value={line.itemName} onChange={e => updateLine(index, { itemName: e.target.value })} placeholder="Item / design" />
                      </td>
                      <td className="px-2 py-2">
                        <input className={inputClass} value={line.category || ''} onChange={e => updateLine(index, { category: e.target.value })} placeholder="Category" />
                      </td>
                      <td className="px-2 py-2">
                        <input data-erp-line-default className={inputClass} value={line.jobType || ''} onChange={e => updateLine(index, { jobType: e.target.value })} />
                      </td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" value={line.pcs || ''} onChange={e => updateLine(index, { pcs: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input data-erp-line-default className={inputClass} type="number" step="0.01" value={line.cut} onChange={e => updateLine(index, { cut: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.mtsQty || ''} onChange={e => updateLine(index, { mtsQty: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.plain || ''} onChange={e => updateLine(index, { plain: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.sec || ''} onChange={e => updateLine(index, { sec: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.lost || ''} onChange={e => updateLine(index, { lost: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.lace || ''} onChange={e => updateLine(index, { lace: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2 text-right font-black text-emerald-800">{toNum(line.fresh).toFixed(2)}</td>
                      <td className="px-2 py-2"><input className={inputClass} type="number" step="0.01" value={line.rate || ''} onChange={e => updateLine(index, { rate: toNum(e.target.value) })} /></td>
                      <td className="px-2 py-2 text-right font-black">{toNum(line.amount).toFixed(2)}</td>
                      <td className="px-2 py-2">
                        <button type="button" onClick={() => setLines(prev => prev.filter((_, i) => i !== index))} className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 border-t px-4 py-3 md:grid-cols-4 xl:grid-cols-8">
              <div><span className={labelClass}>Pcs</span><input className={readonlyClass} value={totals.pcs} readOnly /></div>
              <div><span className={labelClass}>Mts</span><input className={readonlyClass} value={totals.mts.toFixed(2)} readOnly /></div>
              <div><span className={labelClass}>Fresh</span><input className={readonlyClass} value={totals.fresh.toFixed(2)} readOnly /></div>
              <div><span className={labelClass}>Gross</span><input className={readonlyClass} value={grossAmount.toFixed(2)} readOnly /></div>
              <div><span className={labelClass}>Disc %</span><input className={inputClass} type="number" step="0.01" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} /></div>
              <div><span className={labelClass}>Disc Amt</span><input className={readonlyClass} value={discountAmount.toFixed(2)} readOnly /></div>
              {discountAccount && (
                <div><span className={labelClass}>Disc A/C</span><input className={readonlyClass} value={discountAccount} readOnly /></div>
              )}
              <div><span className={labelClass}>Other Less</span><input className={inputClass} type="number" step="0.01" value={otherLess} onChange={e => setOtherLess(e.target.value)} /></div>
              <div><span className={labelClass}>Other Add</span><input className={inputClass} type="number" step="0.01" value={otherAdd} onChange={e => setOtherAdd(e.target.value)} /></div>
            </div>
            <div className="grid gap-3 border-t bg-slate-50 px-4 py-3 md:grid-cols-4 xl:grid-cols-8">
              <div><span className={labelClass}>Taxable</span><input className={readonlyClass} value={taxableAmount.toFixed(2)} readOnly /></div>
              <div><span className={labelClass}>CGST {cgstRate}%</span><input className={readonlyClass} value={cgstAmount} readOnly /></div>
              <div><span className={labelClass}>SGST {sgstRate}%</span><input className={readonlyClass} value={sgstAmount} readOnly /></div>
              <div><span className={labelClass}>IGST {igstRate}%</span><input className={readonlyClass} value={igstAmount} readOnly /></div>
              <div>
                <span className={labelClass}>TDS A/C</span>
                <input className={readonlyClass} value={tdsAccount || '—'} readOnly />
              </div>
              <div>
                <span className={labelClass}>TDS %</span>
                <input
                  className={inputClass}
                  type="number"
                  step="0.001"
                  value={tdsPercent}
                  onChange={e => {
                    setTdsPercentTouched(true);
                    setTdsPercent(e.target.value);
                  }}
                  placeholder={tdsAccount ? 'Auto from master / PAN' : '—'}
                />
                {!tdsPercentTouched && masterTdsPercent != null && (
                  <p className="mt-1 text-[10px] font-semibold text-fuchsia-700">
                    Auto from Transaction Types → {masterTdsPercent}%
                  </p>
                )}
                {!tdsPercentTouched && masterTdsPercent == null && (() => {
                  const match = parties.find(p => p.name.toLowerCase() === partyName.trim().toLowerCase());
                  const panRate = match?.suggestedTdsPercent != null
                    ? match.suggestedTdsPercent
                    : suggestTdsPercentFromPan(resolvePartyPan({ gstNumber: partyGstin || match?.gstNumber }));
                  if (panRate != null) {
                    return (
                      <p className="mt-1 text-[10px] font-semibold text-fuchsia-700">
                        Auto from PAN → {panRate}%
                      </p>
                    );
                  }
                  if (tdsAccount && partyName.trim()) {
                    return (
                      <p className="mt-1 text-[10px] font-semibold text-amber-700">
                        TDS A/C from master — enter TDS % (no PAN)
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
              <div>
                <span className={labelClass}>TDS On Amt</span>
                <input
                  className={inputClass}
                  type="number"
                  step="0.01"
                  value={tdsOnAmt}
                  onChange={e => {
                    setTdsOnAmtTouched(true);
                    setTdsOnAmt(e.target.value);
                  }}
                />
              </div>
              <div><span className={labelClass}>TDS Amt</span><input className={readonlyClass} value={tdsAmount} readOnly /></div>
              <div><span className={labelClass}>Round Off</span><input className={readonlyClass} value={roundOff.toFixed(2)} readOnly /></div>
              <div><span className={labelClass}>Net Amt</span><input className={`${readonlyClass} font-black text-fuchsia-900`} value={netAfterTds.toFixed(2)} readOnly /></div>
            </div>
            <div className="border-t px-4 py-2 text-right text-xs font-bold text-gray-600">
              Bill Amt (before TDS): {invoiceValue.toFixed(2)}
            </div>
          </section>

          <div className="mt-4 flex justify-end">
            <ErpSaveButton saving={saving} label={isEditMode ? 'Update Work Receipt' : 'Save Work Receipt'} />
          </div>
        </ErpFormShell>
      </main>

      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase">Work Desp Lines · {partyName || 'All'}</h3>
                <p className="text-[11px] font-semibold text-gray-500">
                  Each design is its own row. Tick the lines this bill received.
                </p>
              </div>
              <button type="button" onClick={() => setPickerOpen(false)} className="rounded-lg border px-3 py-1 text-xs font-bold">Close</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {pendingLoading ? (
                <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b text-[10px] uppercase text-gray-500">
                    <tr>
                      <th className="p-2">
                        <input
                          type="checkbox"
                          checked={pickerRows.length > 0 && checkedCount === pickerRows.length}
                          onChange={e => setChecked(
                            e.target.checked
                              ? Object.fromEntries(pickerRows.map(row => [row.key, true]))
                              : {}
                          )}
                        />
                      </th>
                      <th className="p-2">Chal</th>
                      <th className="p-2">Quality</th>
                      <th className="p-2 text-right">Cut</th>
                      <th className="p-2 text-right">Rate</th>
                      <th className="p-2 text-right">Ref</th>
                      <th className="p-2">Category</th>
                      <th className="p-2 text-right">Pend Pcs</th>
                      <th className="p-2">Date</th>
                      <th className="p-2 text-right">Pend Mts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickerRows.map(row => (
                      <tr
                        key={row.key}
                        className={`cursor-pointer border-b hover:bg-fuchsia-50 ${checked[row.key] ? 'bg-fuchsia-50' : ''}`}
                        onClick={() => toggleChecked(row.key)}
                      >
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={Boolean(checked[row.key])}
                            onChange={() => toggleChecked(row.key)}
                            onClick={e => e.stopPropagation()}
                          />
                        </td>
                        <td className="p-2 font-bold text-fuchsia-800">{row.source.documentNo || '-'}</td>
                        <td className="p-2">{row.line.itemName || '-'}</td>
                        <td className="p-2 text-right">{Number(row.line.cut || 0).toFixed(2)}</td>
                        <td className="p-2 text-right">{Number(row.line.rate || 0).toFixed(2)}</td>
                        <td className="p-2 text-right">{row.source.refNo || '-'}</td>
                        <td className="p-2 font-bold">{row.line.category || '-'}</td>
                        <td className="p-2 text-right font-bold text-fuchsia-800">{row.pendPcs}</td>
                        <td className="p-2 text-xs">{formatPickDate(row.source.documentDate)}</td>
                        <td className="p-2 text-right font-bold text-fuchsia-800">{row.pendMts.toFixed(2)}</td>
                      </tr>
                    ))}
                    {!pickerRows.length && (
                      <tr><td colSpan={10} className="p-8 text-center text-gray-500">No pending lines for this party.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex items-center justify-between border-t bg-gray-50 px-4 py-3">
              <span className="text-xs font-bold text-gray-600">
                {checkedCount} line{checkedCount === 1 ? '' : 's'} ticked ·{' '}
                {round2(pickerRows.filter(row => checked[row.key]).reduce((sum, row) => sum + row.pendPcs, 0))} pcs pending
              </span>
              <button
                type="button"
                disabled={!checkedCount || pendingLoading}
                onClick={() => void applySelectedSources()}
                className="rounded-xl bg-fuchsia-700 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-40"
              >
                Add to bill
              </button>
            </div>
          </div>
        </div>
      )}

      {missingGstDialog}
      <AddPartyConfirmDialog
        open={showAddConfirm}
        partyName={pendingNewParty}
        onNo={() => {
          setShowAddConfirm(false);
          setAllowUnknownParty(true);
        }}
        onYes={() => {
          setShowAddConfirm(false);
          setShowAccountsDialog(true);
        }}
      />
      <AccountsInformationDialog
        open={showAccountsDialog}
        initialName={pendingNewParty}
        initialDetails={newPartyDetails}
        context="work"
        suggestedAccountType={postingPartyAccountType(transactionType) || undefined}
        onClose={() => setShowAccountsDialog(false)}
        onSaved={onPartySaved}
      />
    </div>
  );
};
