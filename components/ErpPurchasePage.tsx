import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { bankEntriesApi, purchasesApi } from '../services/api';
import { ErpSession, PurchaseBill, SalesItemMaster, SalesLineItem, Supplier } from '../types';
import {
  DEFAULT_PURCHASE_TRANSACTION_TYPE,
  ERP_TRANSACTION_TYPES,
  getGstDefaultsForTransactionType
} from '../constants/erpTransactionTypes';
import {
  formatSeriesBillNumber,
  getGstDocumentType,
  getItcEligibility,
  gstReturnSection,
  postingPartyAccountType,
  postingSummary
} from '../constants/erpTransactionPostingRules';
import { AccountsInformationDialog, AddPartyConfirmDialog } from './AccountsInformationDialog';
import { ErpFormShell } from './ErpFormShell';
import { ErpSaveButton } from './ErpSaveButton';
import { ErpTopMenu } from './ErpTopMenu';
import { gstTypeLabel, isInterStateSupply } from '../utils/gstState';
import { AccountParty } from '../types';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const toNum = (v: string | number | undefined | null) => Number(v) || 0;
const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-indigo-400';
const readonlyClass = 'w-full rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-2 text-sm font-semibold';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';

const blankLine = (lineNo = 1, gstRate = 5, hsnCode = '5407'): SalesLineItem => ({
  lineNo,
  sourceLineNo: lineNo,
  itemName: '',
  bundles: 0,
  mainScreen: '',
  screenName: '',
  packing: 'NAKED',
  unit: 'PCS',
  pcs: 0,
  cut: 0,
  mtsQty: 0,
  rate: 0,
  amount: 0,
  rd: 0,
  discountPercent: 0,
  discountAmount: 0,
  manualAddLess: 0,
  gstRate,
  taxAmount: 0,
  taxableAmount: 0,
  totalAmount: 0,
  hsnCode
});

function calcLine(input: SalesLineItem, businessState: string, partyState: string): SalesLineItem {
  const pcs = toNum(input.pcs);
  const cut = toNum(input.cut);
  const mtsQty = input.mtsQty != null && String(input.mtsQty) !== ''
    ? toNum(input.mtsQty)
    : round2(pcs * cut);
  const rate = toNum(input.rate);
  const amount = round2(pcs * rate);
  const discountAmount = round2(amount * toNum(input.discountPercent) / 100);
  const taxableAmount = round2(amount - discountAmount + toNum(input.manualAddLess));
  const gstRate = toNum(input.gstRate);
  const taxAmount = round2(taxableAmount * gstRate / 100);
  const interState = isInterStateSupply(partyState, businessState);
  return {
    ...input,
    pcs,
    cut,
    mtsQty,
    rate,
    amount,
    discountAmount,
    taxableAmount,
    taxAmount,
    cgstRate: interState ? 0 : gstRate / 2,
    sgstRate: interState ? 0 : gstRate / 2,
    igstRate: interState ? gstRate : 0,
    cgstAmount: interState ? 0 : round2(taxAmount / 2),
    sgstAmount: interState ? 0 : round2(taxAmount / 2),
    igstAmount: interState ? taxAmount : 0,
    totalAmount: round2(taxableAmount + taxAmount),
    screenName: input.screenName || input.itemName || input.mainScreen || ''
  };
}

export const ErpPurchasePage: React.FC<Props> = ({ onBack, erpSession }) => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const editId = params.get('edit');
  const typeFromUrl = params.get('type');

  const [transactionType, setTransactionType] = useState(
    typeFromUrl || DEFAULT_PURCHASE_TRANSACTION_TYPE
  );
  const isPurchaseReturn = transactionType.toUpperCase().includes('PURCHASE RETURN');
  const isEditMode = Boolean(editId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [businessState, setBusinessState] = useState('');
  const [companyHsnCode, setCompanyHsnCode] = useState('5407');
  const [companyGstRate, setCompanyGstRate] = useState(5);
  const [defaultHsnCode, setDefaultHsnCode] = useState(
    () => getGstDefaultsForTransactionType(typeFromUrl || DEFAULT_PURCHASE_TRANSACTION_TYPE).hsnCode
  );
  const [defaultGstRate, setDefaultGstRate] = useState(
    () => getGstDefaultsForTransactionType(typeFromUrl || DEFAULT_PURCHASE_TRANSACTION_TYPE).gstRate
  );
  const [typeBillNumber, setTypeBillNumber] = useState<number | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<SalesItemMaster[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [partyGstin, setPartyGstin] = useState('');
  const [partyMsme, setPartyMsme] = useState('');
  const [state, setState] = useState('');
  const [station, setStation] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [transportName, setTransportName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [haste, setHaste] = useState('');
  const [supplierBillNo, setSupplierBillNo] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [dhara, setDhara] = useState('0');
  const [grace, setGrace] = useState('0');
  const [screenSeries, setScreenSeries] = useState('');
  const [billDate, setBillDate] = useState(today());
  const [remarks, setRemarks] = useState('');
  const [hsnCode, setHsnCode] = useState(
    () => getGstDefaultsForTransactionType(typeFromUrl || DEFAULT_PURCHASE_TRANSACTION_TYPE).hsnCode
  );
  const [lineItems, setLineItems] = useState<SalesLineItem[]>(() => {
    const d = getGstDefaultsForTransactionType(typeFromUrl || DEFAULT_PURCHASE_TRANSACTION_TYPE);
    return [blankLine(1, d.gstRate, d.hsnCode)];
  });
  const [pendingNewParty, setPendingNewParty] = useState('');
  const [showAddConfirm, setShowAddConfirm] = useState(false);
  const [showAccountsDialog, setShowAccountsDialog] = useState(false);

  const applyTypeGstDefaults = (type: string) => {
    const d = getGstDefaultsForTransactionType(type, companyGstRate, companyHsnCode);
    setDefaultGstRate(d.gstRate);
    setDefaultHsnCode(d.hsnCode);
    setHsnCode(d.hsnCode);
    return d;
  };

  const gstType = gstTypeLabel(state, businessState);
  const gstDocumentType = getGstDocumentType(transactionType);
  const gstReturn = gstReturnSection(transactionType);
  const itcEligibility = getItcEligibility(transactionType);

  const totals = useMemo(() => lineItems.reduce((acc, line) => ({
    pcs: round2(acc.pcs + toNum(line.pcs)),
    mts: round2(acc.mts + toNum(line.mtsQty)),
    amount: round2(acc.amount + toNum(line.amount)),
    taxable: round2(acc.taxable + toNum(line.taxableAmount)),
    tax: round2(acc.tax + toNum(line.taxAmount)),
    net: round2(acc.net + toNum(line.totalAmount)),
    cgst: round2(acc.cgst + toNum(line.cgstAmount)),
    sgst: round2(acc.sgst + toNum(line.sgstAmount)),
    igst: round2(acc.igst + toNum(line.igstAmount))
  }), { pcs: 0, mts: 0, amount: 0, taxable: 0, tax: 0, net: 0, cgst: 0, sgst: 0, igst: 0 }), [lineItems]);

  const applyBillDoc = (bill: PurchaseBill, companyState: string, gstRate: number, hsn: string) => {
    setTransactionType(bill.transactionType || DEFAULT_PURCHASE_TRANSACTION_TYPE);
    setTypeBillNumber(bill.typeBillNumber || null);
    setSupplierId(bill.supplierId || '');
    setPartyName(bill.supplier?.name || '');
    setPartyGstin(bill.partyGstin || bill.supplier?.gstNumber || '');
    setPartyMsme(bill.partyMsme || bill.supplier?.msmeType || '');
    setState(bill.supplier?.state || '');
    setStation(bill.station || '');
    setBrokerName(bill.agentName || '');
    setTransportName(bill.transportName || '');
    setVehicleNo(bill.vehicleNo || '');
    setLrNo(bill.lrNo || '');
    setHaste(bill.haste || '');
    setSupplierBillNo(bill.supplierBillNo || bill.billNumber || '');
    setOrderRef(bill.orderRef || '');
    setDhara(String(bill.dhara ?? 0));
    setGrace(String(bill.grace ?? 0));
    setScreenSeries(bill.screenSeries || '');
    setBillDate(bill.billDate ? bill.billDate.slice(0, 10) : today());
    setRemarks(bill.remarks || '');
    setCompanyName(bill.companyName || companyName);
    setHsnCode(hsn);
    const raw = Array.isArray(bill.lineItems) ? bill.lineItems : [];
    setLineItems(raw.length ? raw.map((line: any, index: number) => calcLine({
      ...blankLine(index + 1, gstRate, hsn),
      ...line,
      lineNo: line.lineNo || index + 1,
      sourceLineNo: line.sourceLineNo || line.lineNo || index + 1,
      itemName: line.itemName || line.description || '',
      mainScreen: line.mainScreen || line.category || '',
      screenName: line.screenName || line.itemName || line.description || '',
      pcs: toNum(line.pcs ?? line.quantity),
      packing: line.packing || 'NAKED',
      unit: line.unit || 'PCS'
    }, companyState, bill.supplier?.state || '')) : [blankLine(1, gstRate, hsn)]);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const meta = await purchasesApi.getMeta();
        if (cancelled) return;
        setCompanyName(meta.companyName || '');
        setBusinessState(meta.businessState || '');
        const companyGst = meta.defaultGstRate || 5;
        const companyHsn = meta.defaultHsnCode || '5407';
        setCompanyGstRate(companyGst);
        setCompanyHsnCode(companyHsn);
        setSuppliers(meta.suppliers || []);
        setItems(meta.items || []);
        if (!editId) {
          const d = getGstDefaultsForTransactionType(transactionType, companyGst, companyHsn);
          setDefaultGstRate(d.gstRate);
          setDefaultHsnCode(d.hsnCode);
          setHsnCode(d.hsnCode);
          setLineItems([blankLine(1, d.gstRate, d.hsnCode)]);
        } else {
          const { bill } = await purchasesApi.getBill(editId);
          if (cancelled) return;
          applyBillDoc(bill, meta.businessState || '', companyGst, companyHsn);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load purchase entry.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  useEffect(() => {
    if (isEditMode) return;
    void bankEntriesApi.getNextTypeBillNumber({ transactionType, source: 'purchase_bill' })
      .then(result => setTypeBillNumber(result.typeBillNumber))
      .catch(() => setTypeBillNumber(null));
  }, [transactionType, isEditMode]);

  const chooseSupplier = (id: string) => {
    const supplier = suppliers.find(row => row.id === id);
    if (!supplier) return;
    const nextState = supplier.state || '';
    setSupplierId(id);
    setPartyName(supplier.name);
    setPartyGstin(supplier.gstNumber || '');
    setPartyMsme(supplier.msmeType || '');
    setState(nextState);
    setStation(supplier.city || '');
    setLineItems(prev => prev.map(line => calcLine(line, businessState, nextState)));
  };

  const applyPartyByName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setSupplierId('');
      return;
    }
    const supplier = suppliers.find(row => row.name.toLowerCase() === trimmed.toLowerCase());
    if (supplier) {
      chooseSupplier(supplier.id);
      return;
    }
    setSupplierId('');
    setPendingNewParty(trimmed);
    setShowAddConfirm(true);
  };

  const onPartySaved = (party: AccountParty) => {
    setSuppliers(prev => {
      if (prev.some(row => row.id === party.id)) return prev;
      return [...prev, {
        id: party.id,
        userId: '',
        name: party.name,
        gstNumber: party.gstNumber,
        panNumber: party.panNumber,
        mobileNumber: party.mobileNumber,
        address: party.address,
        city: party.city,
        state: party.state,
        pincode: party.pincode,
        msmeType: party.msmeType,
        accountType: party.accountType,
        createdAt: '',
        updatedAt: ''
      }];
    });
    setSupplierId(party.id);
    setPartyName(party.name);
    setPartyGstin(party.gstNumber || '');
    setPartyMsme(party.msmeType || '');
    setState(party.state || '');
    setStation(party.city || '');
    if (party.brokerName) setBrokerName(party.brokerName);
    setLineItems(prev => prev.map(line => calcLine(line, businessState, party.state || '')));
  };

  const updateLine = (index: number, key: keyof SalesLineItem, value: string | number) => {
    setLineItems(prev => prev.map((line, row) => {
      if (row !== index) return line;
      const next = { ...line, [key]: value };
      if (key === 'pcs' || key === 'cut') next.mtsQty = round2(toNum(next.pcs) * toNum(next.cut));
      if (key === 'mainScreen' && !next.itemName) next.itemName = String(value);
      if (key === 'itemName' && !next.screenName) next.screenName = String(value);
      return calcLine(next, businessState, state);
    }));
  };

  const applyItem = (index: number, item: SalesItemMaster) => {
    setLineItems(prev => prev.map((line, row) => row === index ? calcLine({
      ...line,
      itemMasterId: item.id,
      itemName: item.name,
      mainScreen: item.mainScreen,
      screenName: item.name,
      packing: item.packing || 'NAKED',
      unit: item.unit || 'PCS',
      cut: toNum(item.cut),
      rate: toNum(item.sellingRate),
      gstRate: toNum(item.gstRate) || defaultGstRate,
      hsnCode: item.hsnSac || defaultHsnCode
    }, businessState, state) : line));
  };

  const sharedPayload = () => ({
    transactionType,
    companyName,
    supplierId: supplierId || undefined,
    partyName: partyName.trim(),
    partyGstin,
    partyMsme,
    state,
    station,
    brokerName,
    agentName: brokerName,
    transportName,
    vehicleNo,
    lrNo,
    haste,
    supplierBillNo: supplierBillNo.trim() || undefined,
    billNumber: supplierBillNo.trim() || undefined,
    orderRef: orderRef.trim() || undefined,
    orderNumber: orderRef.trim() || undefined,
    dhara: toNum(dhara),
    grace: toNum(grace),
    screenSeries,
    billDate,
    orderDate: billDate,
    remarks,
    hsnCode,
    gstType,
    lineItems: lineItems
      .filter(line => (line.mainScreen || line.itemName).trim() && (toNum(line.pcs) > 0 || toNum(line.amount) > 0))
      .map(line => ({
        ...line,
        itemName: line.itemName || line.mainScreen,
        description: line.itemName || line.mainScreen,
        screenName: line.screenName || line.itemName || line.mainScreen,
        category: line.mainScreen || ''
      }))
  });

  const handleSave = async () => {
    if (!partyName.trim()) {
      setError('Party is required.');
      return;
    }
    const payload = sharedPayload();
    if (!payload.lineItems.length) {
      setError('Add at least one line.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = editId
        ? await purchasesApi.updateEntry(editId, payload)
        : await purchasesApi.createEntry(payload);
      const no = formatSeriesBillNumber(transactionType, result.bill.typeBillNumber)
        || result.bill.voucherNumber || result.bill.billNumber || '-';
      setSuccess(
        isPurchaseReturn
          ? `Purchase Return #${no} ${isEditMode ? 'updated' : 'saved'}. Debited supplier ledger.`
          : `Finish Purchase #${no} ${isEditMode ? 'updated' : 'saved'}. Credited supplier ledger.`
      );
      if (!isEditMode) {
        setLineItems([blankLine(1, defaultGstRate, defaultHsnCode)]);
        setSupplierBillNo('');
        setOrderRef('');
        setRemarks('');
        setLrNo('');
        setVehicleNo('');
        void bankEntriesApi.getNextTypeBillNumber({ transactionType, source: 'purchase_bill' })
          .then(resultBill => setTypeBillNumber(resultBill.typeBillNumber));
      }
    } catch (err: any) {
      setError(err.message || 'Could not save purchase entry.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7FB]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Purchase Entry" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { window.location.href = '/erp/reports/finish-purchase'; }} className="rounded-xl border bg-white px-3 py-2 text-xs font-black uppercase text-emerald-800">
              Purchase Report
            </button>
            <button type="button" onClick={() => { window.location.href = '/erp/purchase/scan'; }} className="rounded-xl border bg-white px-3 py-2 text-xs font-black uppercase text-indigo-800">
              Scan bill
            </button>
          </div>
        </div>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        {success && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</div>}

        <ErpFormShell onSave={() => void handleSave()} saving={saving}>
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h1 className="text-lg font-black uppercase tracking-wide text-gray-900">
                {isPurchaseReturn ? 'Purchase Return' : 'Finish Purchase'}
                {isEditMode ? ' · Edit' : ' · Add Mode'}
              </h1>
              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                isPurchaseReturn ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {isPurchaseReturn ? 'Return · Debits supplier' : 'Bill · Credits supplier ledger'}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
              <label><span className={labelClass}>Company</span><input className={readonlyClass} value={companyName} readOnly /></label>
              <label>
                <span className={labelClass}>Type</span>
                <select
                  className={inputClass}
                  value={transactionType}
                  disabled={isEditMode}
                  onChange={e => {
                    const next = e.target.value;
                    setTransactionType(next);
                    const d = applyTypeGstDefaults(next);
                    setLineItems([blankLine(1, d.gstRate, d.hsnCode)]);
                  }}
                >
                  {ERP_TRANSACTION_TYPES.filter(type =>
                    type.value === 'FINISH PURCHASE' || type.value === 'FINISH PURCHASE RETURN'
                  ).map(type => (
                    <option key={type.value} value={type.value}>{type.value}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className={labelClass}>Bill / Voucher No.</span>
                <input
                  className={readonlyClass}
                  value={formatSeriesBillNumber(transactionType, typeBillNumber) || '—'}
                  readOnly
                />
              </label>
              <label><span className={labelClass}>Date</span><input type="date" className={inputClass} value={billDate} onChange={e => setBillDate(e.target.value)} /></label>
              <label><span className={labelClass}>GST Type</span><input className={readonlyClass} value={gstType} readOnly /></label>
              <label className="md:col-span-2">
                <span className={labelClass}>GST Document{gstReturn !== 'NONE' ? ` · ${gstReturn}` : ''}{itcEligibility ? ` · ITC ${itcEligibility}` : ''}</span>
                <input className={readonlyClass} value={gstDocumentType || '—'} readOnly />
              </label>
              <label className="md:col-span-2">
                <span className={labelClass}>Posts To</span>
                <input className={readonlyClass} value={postingSummary(transactionType)} readOnly />
              </label>
              <label className="md:col-span-2">
                <span className={labelClass}>{isPurchaseReturn ? '1. Party (required first)' : 'Party'}</span>
                <input
                  className={`${inputClass} ${isPurchaseReturn ? 'border-amber-400 bg-amber-50' : ''}`}
                  list="erp-purchase-parties"
                  value={partyName}
                  placeholder="Select or type supplier name"
                  onChange={e => {
                    setPartyName(e.target.value);
                    if (!e.target.value.trim()) setSupplierId('');
                  }}
                  onBlur={e => applyPartyByName(e.target.value)}
                />
                <datalist id="erp-purchase-parties">
                  {suppliers.map(supplier => <option key={supplier.id} value={supplier.name} />)}
                </datalist>
              </label>
              {isPurchaseReturn && (
                <label className="md:col-span-2">
                  <span className={labelClass}>2. Ref / Original Bill (optional)</span>
                  <input
                    className={`${inputClass} border-amber-300 bg-amber-50`}
                    value={orderRef}
                    onChange={e => setOrderRef(e.target.value)}
                    placeholder="Original purchase bill / challan reference"
                  />
                </label>
              )}
              <label>
                <span className={labelClass}>State</span>
                <input
                  className={inputClass}
                  value={state}
                  onChange={e => {
                    const next = e.target.value;
                    setState(next);
                    setLineItems(prev => prev.map(line => calcLine(line, businessState, next)));
                  }}
                />
              </label>
              <label><span className={labelClass}>Haste</span><input className={inputClass} value={haste} onChange={e => setHaste(e.target.value)} /></label>
              <label><span className={labelClass}>Broker</span><input className={inputClass} value={brokerName} onChange={e => setBrokerName(e.target.value)} /></label>
              <label><span className={labelClass}>Station</span><input className={inputClass} value={station} onChange={e => setStation(e.target.value)} /></label>
              <label><span className={labelClass}>Transport</span><input className={inputClass} value={transportName} onChange={e => setTransportName(e.target.value)} /></label>
              <label><span className={labelClass}>LR No.</span><input className={inputClass} value={lrNo} onChange={e => setLrNo(e.target.value)} /></label>
              <label><span className={labelClass}>Vehicle No.</span><input className={inputClass} value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} /></label>
              <label><span className={labelClass}>Supplier Bill No.</span><input className={inputClass} value={supplierBillNo} onChange={e => setSupplierBillNo(e.target.value)} /></label>
              {!isPurchaseReturn && (
                <label><span className={labelClass}>Ord / Ref</span><input className={inputClass} value={orderRef} onChange={e => setOrderRef(e.target.value)} placeholder="Order / reference" /></label>
              )}
              <label><span className={labelClass}>Dhara</span><input className={inputClass} type="number" value={dhara} onChange={e => setDhara(e.target.value)} /></label>
              <label><span className={labelClass}>Grace</span><input className={inputClass} type="number" value={grace} onChange={e => setGrace(e.target.value)} /></label>
              <label><span className={labelClass}>Screen Series</span><input className={inputClass} value={screenSeries} onChange={e => setScreenSeries(e.target.value)} /></label>
              <label><span className={labelClass}>Party GSTIN</span><input className={inputClass} value={partyGstin} onChange={e => setPartyGstin(e.target.value)} /></label>
              <label><span className={labelClass}>MSME</span><input className={inputClass} value={partyMsme} onChange={e => setPartyMsme(e.target.value)} /></label>
              <label><span className={labelClass}>HSN</span><input className={inputClass} value={hsnCode} onChange={e => setHsnCode(e.target.value)} /></label>
              <label className="md:col-span-2"><span className={labelClass}>Remark</span><input className={inputClass} value={remarks} onChange={e => setRemarks(e.target.value)} /></label>
            </div>
          </section>

          <section className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b bg-indigo-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-800">
                {isPurchaseReturn
                  ? 'Return items · editable lines · amount debits supplier ledger'
                  : 'Particulars · Item Name · Category / Main Screen · Amount = PCS × Rate'}
              </p>
              <button
                type="button"
                onClick={() => setLineItems(prev => [...prev, blankLine(Math.max(0, ...prev.map(line => toNum(line.lineNo))) + 1, defaultGstRate, defaultHsnCode)])}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-black uppercase text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Add Line
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1500px] w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                  <tr>
                    {['#', 'Item Name', 'Bundles', 'Category / Main Screen', 'Packing', 'Unit', 'PCS', 'Cut', 'MTS', 'Rate', 'Amount', 'Disc %', 'Add/Less', 'GST %', 'Tax', 'Net', ''].map(head => (
                      <th key={head} className="px-2 py-2 font-black">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((line, index) => (
                    <tr key={index} className="border-b odd:bg-white even:bg-slate-50">
                      <td className="px-2 py-1.5 font-black">{index + 1}</td>
                      <td className="min-w-[140px] px-1 py-1.5">
                        <input
                          className={inputClass}
                          list="purchase-item-names"
                          value={line.itemName}
                          onChange={e => updateLine(index, 'itemName', e.target.value)}
                          onBlur={e => {
                            const found = items.find(item => item.name.toLowerCase() === e.target.value.trim().toLowerCase());
                            if (found) applyItem(index, found);
                          }}
                        />
                      </td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.bundles || ''} onChange={e => updateLine(index, 'bundles', toNum(e.target.value))} /></td>
                      <td className="min-w-[140px] px-1 py-1.5">
                        <input
                          className={inputClass}
                          list="purchase-main-screens"
                          value={line.mainScreen}
                          onChange={e => updateLine(index, 'mainScreen', e.target.value)}
                        />
                      </td>
                      <td className="px-1 py-1.5"><input className={inputClass} value={line.packing} onChange={e => updateLine(index, 'packing', e.target.value)} /></td>
                      <td className="px-1 py-1.5"><input className={inputClass} value={line.unit} onChange={e => updateLine(index, 'unit', e.target.value)} /></td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.pcs || ''} onChange={e => updateLine(index, 'pcs', toNum(e.target.value))} /></td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.cut || ''} onChange={e => updateLine(index, 'cut', toNum(e.target.value))} /></td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.mtsQty || ''} onChange={e => updateLine(index, 'mtsQty', toNum(e.target.value))} /></td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.rate || ''} onChange={e => updateLine(index, 'rate', toNum(e.target.value))} /></td>
                      <td className="px-2 py-1.5 text-right font-bold">{round2(toNum(line.amount)).toFixed(2)}</td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.discountPercent || ''} onChange={e => updateLine(index, 'discountPercent', toNum(e.target.value))} /></td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.manualAddLess || ''} onChange={e => updateLine(index, 'manualAddLess', toNum(e.target.value))} /></td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.gstRate || ''} onChange={e => updateLine(index, 'gstRate', toNum(e.target.value))} /></td>
                      <td className="px-2 py-1.5 text-right font-bold">{round2(toNum(line.taxAmount)).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right font-black text-indigo-800">{round2(toNum(line.totalAmount)).toFixed(2)}</td>
                      <td className="px-1 py-1.5">
                        <button
                          type="button"
                          onClick={() => setLineItems(prev => prev.length === 1
                            ? [blankLine(1, defaultGstRate, defaultHsnCode)]
                            : prev.filter((_, row) => row !== index))}
                          className="rounded-lg bg-rose-50 p-1.5 text-rose-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-black">
                  <tr>
                    <td colSpan={6} className="px-2 py-2 text-right uppercase">Grand Totals</td>
                    <td className="px-2 py-2 text-right">{totals.pcs.toFixed(2)}</td>
                    <td />
                    <td className="px-2 py-2 text-right">{totals.mts.toFixed(2)}</td>
                    <td />
                    <td className="px-2 py-2 text-right">{totals.amount.toFixed(2)}</td>
                    <td colSpan={4} className="px-2 py-2 text-right">Taxable {totals.taxable.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right text-indigo-800">{totals.net.toFixed(2)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              <datalist id="purchase-item-names">{items.map(item => <option key={item.id} value={item.name}>{item.mainScreen}</option>)}</datalist>
              <datalist id="purchase-main-screens">{Array.from(new Set(items.map(item => item.mainScreen))).map(name => <option key={name} value={name} />)}</datalist>
            </div>
          </section>

          <section className="mt-4 grid gap-4 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
            <label><span className={labelClass}>Taxable</span><input className={readonlyClass} value={totals.taxable.toFixed(2)} readOnly /></label>
            <label><span className={labelClass}>CGST</span><input className={readonlyClass} value={totals.cgst.toFixed(2)} readOnly /></label>
            <label><span className={labelClass}>SGST</span><input className={readonlyClass} value={totals.sgst.toFixed(2)} readOnly /></label>
            <label><span className={labelClass}>IGST</span><input className={readonlyClass} value={totals.igst.toFixed(2)} readOnly /></label>
            <label><span className={labelClass}>Bill Amt</span><input className={readonlyClass} value={totals.net.toFixed(2)} readOnly /></label>
            <label><span className={labelClass}>Net</span><input className={`${readonlyClass} font-black text-indigo-800`} value={totals.net.toFixed(2)} readOnly /></label>
          </section>

          <ErpSaveButton
            saving={saving}
            label={isEditMode
              ? (isPurchaseReturn ? 'Update Purchase Return' : 'Update Finish Purchase')
              : (isPurchaseReturn ? 'Save Purchase Return' : 'Save Finish Purchase')}
            savingLabel="Saving..."
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
          />
        </ErpFormShell>
      </main>

      <AddPartyConfirmDialog
        open={showAddConfirm}
        partyName={pendingNewParty}
        onNo={() => setShowAddConfirm(false)}
        onYes={() => {
          setShowAddConfirm(false);
          setShowAccountsDialog(true);
        }}
      />
      <AccountsInformationDialog
        open={showAccountsDialog}
        initialName={pendingNewParty}
        context="purchase"
        suggestedAccountType={postingPartyAccountType(transactionType) || undefined}
        onClose={() => setShowAccountsDialog(false)}
        onSaved={onPartySaved}
      />
    </div>
  );
};
