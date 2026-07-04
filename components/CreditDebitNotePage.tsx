import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { bankEntriesApi, creditDebitNotesApi, customersApi, purchasesApi } from '../services/api';
import { CreditDebitNoteType, INDIAN_STATES } from '../constants/creditDebitNoteTypes';
import { Customer, Supplier } from '../types';

interface Props {
  noteType: CreditDebitNoteType;
  onBack: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const toNum = (v: string | number) => Number(v) || 0;
const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500';

export const CreditDebitNotePage: React.FC<Props> = ({ noteType, onBack }) => {
  const [companyName, setCompanyName] = useState('');
  const [businessState, setBusinessState] = useState('');
  const [voucherNumber, setVoucherNumber] = useState<number | null>(null);
  const [noteNumber, setNoteNumber] = useState('');
  const [noteDate, setNoteDate] = useState(today());
  const [partyName, setPartyName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [gstType, setGstType] = useState('');
  const [refBillNumber, setRefBillNumber] = useState('');
  const [refBillDate, setRefBillDate] = useState('');
  const [challanNumber, setChallanNumber] = useState('');
  const [saleAccount, setSaleAccount] = useState('');
  const [purchaseType, setPurchaseType] = useState('');
  const [pieces, setPieces] = useState('');
  const [quantity, setQuantity] = useState('');
  const [grossAmount, setGrossAmount] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [otherLess, setOtherLess] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [returnGoods, setReturnGoods] = useState('');
  const [hsnSac, setHsnSac] = useState('');
  const [taxableAmount, setTaxableAmount] = useState('');
  const [gstRate, setGstRate] = useState('5');
  const [cgstRate, setCgstRate] = useState('');
  const [cgstAmount, setCgstAmount] = useState('');
  const [sgstRate, setSgstRate] = useState('');
  const [sgstAmount, setSgstAmount] = useState('');
  const [igstRate, setIgstRate] = useState('');
  const [igstAmount, setIgstAmount] = useState('');
  const [tcsRate, setTcsRate] = useState('');
  const [tcsAmount, setTcsAmount] = useState('');
  const [netAmount, setNetAmount] = useState('');
  const [netAmountAfterTds, setNetAmountAfterTds] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [adjustBillNumber, setAdjustBillNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isTally, setIsTally] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pendingBills, setPendingBills] = useState<Array<{ billNumber: string; billId: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadMaster = useCallback(async () => {
    try {
      const result = await creditDebitNotesApi.getNextVoucher(noteType.value);
      setCompanyName(result.companyName);
      setBusinessState(result.businessState || '');
      setVoucherNumber(result.voucherNumber);
      setNoteNumber(String(result.voucherNumber));
      setPlaceOfSupply(result.businessState || '');
    } catch {
      setVoucherNumber(1);
    }
  }, [noteType.value]);

  useEffect(() => {
    void loadMaster();
    if (noteType.partyType === 'customer') {
      void customersApi.getAll().then(r => setCustomers(r.customers || [])).catch(() => setCustomers([]));
    } else {
      void purchasesApi.getSuppliers().then(r => setSuppliers(r.suppliers || [])).catch(() => setSuppliers([]));
    }
  }, [loadMaster, noteType.partyType]);

  const recalculate = useCallback(async () => {
    try {
      const { totals } = await creditDebitNotesApi.calculate({
        grossAmount: toNum(grossAmount),
        discountPercent: toNum(discountPercent),
        discountAmount: discountAmount ? toNum(discountAmount) : undefined,
        otherLess: toNum(otherLess),
        addAmount: toNum(addAmount),
        returnGoods: toNum(returnGoods),
        taxableAmount: taxableAmount ? toNum(taxableAmount) : undefined,
        gstRate: toNum(gstRate),
        tcsRate: toNum(tcsRate),
        placeOfSupply
      });
      setGstType(String(totals.gstType || ''));
      setTaxableAmount(String(totals.taxableAmount ?? ''));
      setCgstRate(String(totals.cgstRate ?? ''));
      setCgstAmount(String(totals.cgstAmount ?? ''));
      setSgstRate(String(totals.sgstRate ?? ''));
      setSgstAmount(String(totals.sgstAmount ?? ''));
      setIgstRate(String(totals.igstRate ?? ''));
      setIgstAmount(String(totals.igstAmount ?? ''));
      setTcsAmount(String(totals.tcsAmount ?? ''));
      setNetAmount(String(totals.netAmount ?? ''));
      setNetAmountAfterTds(String(totals.netAmountAfterTds ?? totals.netAmount ?? ''));
    } catch {
      // keep manual values
    }
  }, [addAmount, discountAmount, discountPercent, grossAmount, gstRate, otherLess, placeOfSupply, returnGoods, tcsRate, taxableAmount]);

  useEffect(() => {
    const timer = setTimeout(() => { void recalculate(); }, 300);
    return () => clearTimeout(timer);
  }, [recalculate]);

  useEffect(() => {
    if (!partyName.trim()) {
      setPendingBills([]);
      return;
    }
    void bankEntriesApi.getPendingBills({
      partyName,
      partyType: noteType.partyType
    }).then(result => {
      setPendingBills(
        (result.bills || [])
          .filter(b => b.billType !== 'credit_debit_note')
          .map(b => ({ billNumber: b.billNumber, billId: b.billId }))
      );
    }).catch(() => setPendingBills([]));
  }, [partyName, noteType.partyType]);

  const gstHint = useMemo(() => {
    if (!placeOfSupply || !businessState) return 'Select place of supply to apply GST.';
    if (placeOfSupply.trim().toLowerCase() === businessState.trim().toLowerCase()) {
      return 'Same state → CGST + SGST applied.';
    }
    return 'Different state → IGST applied.';
  }, [businessState, placeOfSupply]);

  const saveNote = async () => {
    if (!partyName.trim()) {
      alert(`${noteType.partyType === 'customer' ? 'Customer' : 'Supplier'} name is required.`);
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { note } = await creditDebitNotesApi.create({
        noteType: noteType.value,
        companyName,
        noteNumber: noteNumber || String(voucherNumber),
        noteDate,
        partyName,
        customerId: customerId || undefined,
        supplierId: supplierId || undefined,
        placeOfSupply,
        refBillNumber: refBillNumber || undefined,
        refBillDate: refBillDate || undefined,
        challanNumber: challanNumber || undefined,
        saleAccount: saleAccount || undefined,
        purchaseType: purchaseType || undefined,
        pieces: toNum(pieces),
        quantity: toNum(quantity),
        grossAmount: toNum(grossAmount),
        discountPercent: toNum(discountPercent),
        discountAmount: toNum(discountAmount),
        otherLess: toNum(otherLess),
        addAmount: toNum(addAmount),
        returnGoods: toNum(returnGoods),
        hsnSac: hsnSac || undefined,
        taxableAmount: toNum(taxableAmount),
        gstRate: toNum(gstRate),
        tcsRate: toNum(tcsRate),
        netAmountAfterTds: toNum(netAmountAfterTds || netAmount),
        paidAmount: toNum(paidAmount),
        isPaid,
        adjustBillNumber: adjustBillNumber || undefined,
        adjustBillId: pendingBills.find(b => b.billNumber === adjustBillNumber)?.billId,
        remarks: remarks || undefined,
        isTally
      });
      setSuccess(`Saved ${noteType.label} voucher #${note.voucherNumber} for ${note.partyName}.`);
      setGrossAmount('');
      setRemarks('');
      void loadMaster();
    } catch (err: any) {
      setError(err.message || 'Could not save note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            ERP
          </button>
          <h1 className="text-lg font-black text-gray-900">{noteType.label}</h1>
          <div className="w-12" />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-fuchsia-700">{noteType.label}</h2>
          <p className="mt-1 text-xs text-gray-500">ADD MODE — {gstHint}</p>

          {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
          {success && <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{success}</div>}

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div><label className={labelClass}>Company</label><input className={inputClass} value={companyName} onChange={e => setCompanyName(e.target.value)} /></div>
            <div><label className={labelClass}>Type</label><input className={inputClass} readOnly value={noteType.label} /></div>
            <div><label className={labelClass}>Voucher No.</label><input className={inputClass} readOnly value={voucherNumber ?? '—'} /></div>
            <div><label className={labelClass}>Note No.</label><input className={inputClass} value={noteNumber} onChange={e => setNoteNumber(e.target.value)} /></div>
            <div><label className={labelClass}>Date</label><input className={inputClass} type="date" value={noteDate} onChange={e => setNoteDate(e.target.value)} /></div>
            <div>
              <label className={labelClass}>Party</label>
              {noteType.partyType === 'customer' ? (
                <select className={inputClass} value={customerId} onChange={e => {
                  setCustomerId(e.target.value);
                  const c = customers.find(x => x.id === e.target.value);
                  if (c) {
                    setPartyName(c.organizationName);
                    if (c.state) setPlaceOfSupply(c.state);
                  }
                }}>
                  <option value="">Select customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.organizationName}</option>)}
                </select>
              ) : (
                <select className={inputClass} value={supplierId} onChange={e => {
                  setSupplierId(e.target.value);
                  const s = suppliers.find(x => x.id === e.target.value);
                  if (s) setPartyName(s.name);
                }}>
                  <option value="">Select supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>
            <div><label className={labelClass}>Party name</label><input className={inputClass} value={partyName} onChange={e => setPartyName(e.target.value)} /></div>
            <div>
              <label className={labelClass}>Place of Supply</label>
              <select className={inputClass} value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)}>
                <option value="">Select state</option>
                {INDIAN_STATES.map(state => <option key={state} value={state}>{state}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>GST Type</label><input className={inputClass} readOnly value={gstType} /></div>
            <div><label className={labelClass}>Ref Bill No.</label><input className={inputClass} value={refBillNumber} onChange={e => setRefBillNumber(e.target.value)} /></div>
            <div><label className={labelClass}>Ref Bill Date</label><input className={inputClass} type="date" value={refBillDate} onChange={e => setRefBillDate(e.target.value)} /></div>
            <div><label className={labelClass}>Challan No.</label><input className={inputClass} value={challanNumber} onChange={e => setChallanNumber(e.target.value)} /></div>
            <div><label className={labelClass}>{noteType.noteSide === 'sales' ? 'Sale A/C' : 'Pur Type'}</label><input className={inputClass} value={noteType.noteSide === 'sales' ? saleAccount : purchaseType} onChange={e => noteType.noteSide === 'sales' ? setSaleAccount(e.target.value) : setPurchaseType(e.target.value)} /></div>
            <div><label className={labelClass}>Adjust Bill No.</label>
              <select className={inputClass} value={adjustBillNumber} onChange={e => setAdjustBillNumber(e.target.value)}>
                <option value="">Select bill</option>
                {pendingBills.map(b => <option key={b.billId} value={b.billNumber}>{b.billNumber}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-wide text-gray-900">Amount Details</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <div><label className={labelClass}>Pcs.</label><input className={inputClass} type="number" value={pieces} onChange={e => setPieces(e.target.value)} /></div>
            <div><label className={labelClass}>Mts. / Qty.</label><input className={inputClass} type="number" value={quantity} onChange={e => setQuantity(e.target.value)} /></div>
            <div><label className={labelClass}>Gross Amt.</label><input className={inputClass} type="number" value={grossAmount} onChange={e => setGrossAmount(e.target.value)} /></div>
            <div><label className={labelClass}>Disc. %</label><input className={inputClass} type="number" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} /></div>
            <div><label className={labelClass}>Disc. Amt.</label><input className={inputClass} type="number" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} /></div>
            <div><label className={labelClass}>Oth. Less</label><input className={inputClass} type="number" value={otherLess} onChange={e => setOtherLess(e.target.value)} /></div>
            <div><label className={labelClass}>Add</label><input className={inputClass} type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)} /></div>
            <div><label className={labelClass}>Ret. Goods</label><input className={inputClass} type="number" value={returnGoods} onChange={e => setReturnGoods(e.target.value)} /></div>
            <div><label className={labelClass}>HSN / SAC</label><input className={inputClass} value={hsnSac} onChange={e => setHsnSac(e.target.value)} /></div>
            <div><label className={labelClass}>Taxable</label><input className={inputClass} type="number" value={taxableAmount} onChange={e => setTaxableAmount(e.target.value)} /></div>
            <div><label className={labelClass}>GST %</label><input className={inputClass} type="number" value={gstRate} onChange={e => setGstRate(e.target.value)} /></div>
            <div><label className={labelClass}>CGST % / Amt</label><div className="grid grid-cols-2 gap-1"><input className={inputClass} readOnly value={cgstRate} /><input className={inputClass} readOnly value={cgstAmount} /></div></div>
            <div><label className={labelClass}>SGST % / Amt</label><div className="grid grid-cols-2 gap-1"><input className={inputClass} readOnly value={sgstRate} /><input className={inputClass} readOnly value={sgstAmount} /></div></div>
            <div><label className={labelClass}>IGST % / Amt</label><div className="grid grid-cols-2 gap-1"><input className={inputClass} readOnly value={igstRate} /><input className={inputClass} readOnly value={igstAmount} /></div></div>
            <div><label className={labelClass}>TCS % / Amt</label><div className="grid grid-cols-2 gap-1"><input className={inputClass} type="number" value={tcsRate} onChange={e => setTcsRate(e.target.value)} /><input className={inputClass} readOnly value={tcsAmount} /></div></div>
            <div><label className={labelClass}>Net Amt.</label><input className={inputClass} readOnly value={netAmount} /></div>
            <div><label className={labelClass}>Net Amt. After TDS</label><input className={inputClass} type="number" value={netAmountAfterTds} onChange={e => setNetAmountAfterTds(e.target.value)} /></div>
            <div><label className={labelClass}>Paid Amt.</label><input className={inputClass} type="number" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} /></div>
            <div className="flex items-end"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={isPaid} onChange={e => setIsPaid(e.target.checked)} /> Paid (Y/N)</label></div>
            <div className="flex items-end"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={isTally} onChange={e => setIsTally(e.target.checked)} /> Tally</label></div>
          </div>
          <div className="mt-4"><label className={labelClass}>Remark</label><textarea className={`${inputClass} min-h-[80px]`} value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
          <button type="button" onClick={saveNote} disabled={saving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save {noteType.label}
          </button>
        </section>
      </main>
    </div>
  );
};
