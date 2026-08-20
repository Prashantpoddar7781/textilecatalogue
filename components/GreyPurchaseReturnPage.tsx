import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ListOrdered, Loader2 } from 'lucide-react';
import { greyDispatchesApi, greyPurchaseReturnsApi } from '../services/api';
import { getGstDefaultsForTransactionType } from '../constants/erpTransactionTypes';
import { ErpSession, GreyReceiptSummary, GreyTakaDetailRow } from '../types';
import { DispatchTakaSelectModal } from './DispatchTakaSelectModal';
import { ErpFormShell } from './ErpFormShell';
import { ErpSaveButton } from './ErpSaveButton';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const toNum = (v: string | number) => Number(v) || 0;
const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-indigo-400';
const readonlyClass = 'w-full rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-2 text-sm font-semibold';
const calcInputClass = 'w-full rounded-lg border border-rose-200 bg-white px-2.5 py-2 text-sm font-bold outline-none focus:border-rose-400';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';

const formatDateInput = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : '';

export const GreyPurchaseReturnPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [companyName, setCompanyName] = useState('');
  const [entryType, setEntryType] = useState('GREY PURCHASE');
  const [greyType, setGreyType] = useState('GREY');
  const [voucherNo, setVoucherNo] = useState('1');
  const [saleAccount, setSaleAccount] = useState('GREY PURCHASE RETURN');
  const [purSr, setPurSr] = useState('');
  const [greyPurchaseId, setGreyPurchaseId] = useState('');
  const [quality, setQuality] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [partyName, setPartyName] = useState('');
  const [partyGstin, setPartyGstin] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [gstTypeLabel, setGstTypeLabel] = useState('');
  const [billNo, setBillNo] = useState('');
  const [returnDate, setReturnDate] = useState(today());
  const [refBillNo, setRefBillNo] = useState('');
  const [refBillDate, setRefBillDate] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [challanNo, setChallanNo] = useState('');
  const [station, setStation] = useState('');
  const [transport, setTransport] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [ewayBillNo, setEwayBillNo] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [checkerName, setCheckerName] = useState('');
  const [pcs, setPcs] = useState('');
  const [mts, setMts] = useState('');
  const [rate, setRate] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [otherLess, setOtherLess] = useState('');
  const [otherAdd, setOtherAdd] = useState('');
  const [gstRate, setGstRate] = useState('5');
  const [cgstRate, setCgstRate] = useState('0');
  const [cgstAmount, setCgstAmount] = useState('0');
  const [sgstRate, setSgstRate] = useState('0');
  const [sgstAmount, setSgstAmount] = useState('0');
  const [igstRate, setIgstRate] = useState('0');
  const [igstAmount, setIgstAmount] = useState('0');
  const [grossAmount, setGrossAmount] = useState(0);
  const [netAmount, setNetAmount] = useState(0);
  const [paidAmount, setPaidAmount] = useState('');
  const [paid, setPaid] = useState(false);
  const [adjustBillNo, setAdjustBillNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [greyReceipts, setGreyReceipts] = useState<GreyReceiptSummary[]>([]);
  const [availableTakas, setAvailableTakas] = useState<GreyTakaDetailRow[]>([]);
  const [selectedTakaDetails, setSelectedTakaDetails] = useState<GreyTakaDetailRow[]>([]);
  const [purPickerOpen, setPurPickerOpen] = useState(false);
  const [takaModalOpen, setTakaModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const stockMts = useMemo(() => {
    const receipt = greyReceipts.find(r => r.id === greyPurchaseId);
    return receipt?.stockMts ?? 0;
  }, [greyPurchaseId, greyReceipts]);

  useEffect(() => {
    setGrossAmount(round2(toNum(mts) * toNum(rate)));
  }, [mts, rate]);

  const recalcGst = useCallback(async () => {
    if (!toNum(mts) || !toNum(rate)) return;
    try {
      const { totals } = await greyPurchaseReturnsApi.calculate({
        mts: toNum(mts),
        rate: toNum(rate),
        grossAmount,
        discountPercent: discountPercent || undefined,
        discountAmount: discountAmount || undefined,
        otherLess: toNum(otherLess),
        otherAdd: toNum(otherAdd),
        gstRate: toNum(gstRate),
        partyGstin,
        placeOfSupply,
        stateCode
      });
      setDiscountAmount(Number(totals.discountAmount) || 0);
      setGstTypeLabel(String(totals.gstType || ''));
      setCgstRate(String(totals.cgstRate ?? 0));
      setCgstAmount(String(totals.cgstAmount ?? 0));
      setSgstRate(String(totals.sgstRate ?? 0));
      setSgstAmount(String(totals.sgstAmount ?? 0));
      setIgstRate(String(totals.igstRate ?? 0));
      setIgstAmount(String(totals.igstAmount ?? 0));
      setNetAmount(Number(totals.netAmount) || 0);
      if (totals.placeOfSupply) setPlaceOfSupply(String(totals.placeOfSupply));
      if (totals.stateCode) setStateCode(String(totals.stateCode));
    } catch {
      // keep local values
    }
  }, [grossAmount, mts, rate, discountPercent, discountAmount, otherLess, otherAdd, gstRate, partyGstin, placeOfSupply, stateCode]);

  useEffect(() => {
    const timer = setTimeout(() => { void recalcGst(); }, 300);
    return () => clearTimeout(timer);
  }, [recalcGst]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const meta = await greyPurchaseReturnsApi.getMeta();
        if (cancelled) return;
        setCompanyName(meta.companyName || '');
        setVoucherNo(String(meta.nextVoucherNo || 1));
        setChallanNo(String(meta.nextChallanNo || 1));
        const d = getGstDefaultsForTransactionType(
          'GREY PURCHASE RETURN',
          meta.defaultGstRate ?? 5,
          meta.defaultHsnCode || '5407'
        );
        setHsnCode(d.hsnCode);
        setGstRate(String(d.gstRate));
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load grey purchase return.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const loadGreyReceipts = async (filterSr?: string) => {
    setReceiptsLoading(true);
    try {
      const { entries } = await greyDispatchesApi.getGreyReceipts(filterSr?.trim() || undefined, {
        transactionType: greyType === 'REPROCESS' ? 'REPROCESS' : 'PROCESS'
      });
      setGreyReceipts(entries || []);
      setPurPickerOpen(true);
    } catch (err: any) {
      setError(err.message || 'Could not load purchase vouchers.');
    } finally {
      setReceiptsLoading(false);
    }
  };

  const applyGreyReceipt = async (receipt: GreyReceiptSummary) => {
    setGreyPurchaseId(receipt.id);
    setPurSr(String(receipt.srNo ?? ''));
    setPartyName(receipt.partyName || '');
    setBrokerName(receipt.brokerName || '');
    setQuality(receipt.quality || '');
    setRefBillNo(receipt.billNo || '');
    setRefBillDate(formatDateInput(receipt.billDate));
    setRate(String(receipt.purRate || ''));
    setCheckerName(receipt.checkerName || '');
    if (receipt.companyName) setCompanyName(receipt.companyName);
    setPcs('');
    setMts('');
    setSelectedTakaDetails([]);
    setPurPickerOpen(false);

    try {
      const { availableRows } = await greyDispatchesApi.getAvailableTakas(receipt.id, {
        transactionType: greyType === 'REPROCESS' ? 'REPROCESS' : 'PROCESS'
      });
      setAvailableTakas(availableRows || []);
    } catch {
      setAvailableTakas([]);
    }
  };

  const handlePurSrFocus = () => { void loadGreyReceipts(purSr); };

  const handlePurSrKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && purSr.trim()) {
      event.stopPropagation();
      void (async () => {
        const { entries } = await greyDispatchesApi.getGreyReceipts(purSr.trim(), {
          transactionType: greyType === 'REPROCESS' ? 'REPROCESS' : 'PROCESS'
        });
        const match = entries?.[0];
        if (match) await applyGreyReceipt(match);
        else {
          setError(
            greyType === 'REPROCESS'
              ? `No mill-returned purchase found for Pur Vno ${purSr.trim()}.`
              : `No purchase voucher found for Pur Vno ${purSr.trim()}.`
          );
        }
      })();
    }
  };

  const openTakaSelector = async () => {
    if (!greyPurchaseId) {
      setError('Select Pur Vno first.');
      return;
    }
    setError('');
    try {
      const { availableRows } = await greyDispatchesApi.getAvailableTakas(greyPurchaseId, {
        transactionType: greyType === 'REPROCESS' ? 'REPROCESS' : 'PROCESS'
      });
      setAvailableTakas(availableRows || []);
      if (!availableRows?.length) {
        setError(
          greyType === 'REPROCESS'
            ? 'No returned taka left in godown for this purchase.'
            : 'No taka left in godown for this purchase.'
        );
        return;
      }
      setTakaModalOpen(true);
    } catch (err: any) {
      setError(err.message || 'Could not load taka details.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!greyPurchaseId) {
        setError('Select Pur Vno.');
        setSaving(false);
        return;
      }
      if (!toNum(mts)) {
        setError('Select taka to return or enter Mts.');
        setSaving(false);
        return;
      }

      await greyPurchaseReturnsApi.create({
        greyPurchaseId,
        companyName,
        entryType,
        greyType,
        voucherNo: toNum(voucherNo),
        saleAccount,
        purSr: toNum(purSr),
        quality,
        hsnCode,
        partyName,
        partyGstin,
        placeOfSupply,
        stateCode,
        billNo,
        returnDate,
        refBillNo,
        refBillDate: refBillDate || undefined,
        brokerName,
        challanNo,
        station,
        transport,
        vehicleNo,
        ewayBillNo,
        lrNo,
        checkerName,
        pcs: toNum(pcs),
        mts: toNum(mts),
        rate: toNum(rate),
        grossAmount,
        discountPercent: toNum(discountPercent),
        discountAmount,
        otherLess: toNum(otherLess),
        otherAdd: toNum(otherAdd),
        gstRate: toNum(gstRate),
        paidAmount: toNum(paidAmount),
        paid,
        adjustBillNo,
        remarks,
        takaDetails: selectedTakaDetails
      });

      setSuccess('Grey purchase return saved. Stock updated and return posted to purchase view.');
      setPurSr('');
      setGreyPurchaseId('');
      setPcs('');
      setMts('');
      setSelectedTakaDetails([]);
      const meta = await greyPurchaseReturnsApi.getMeta();
      setVoucherNo(String(meta.nextVoucherNo || 1));
      setChallanNo(String(meta.nextChallanNo || 1));
    } catch (err: any) {
      setError(err.message || 'Could not save grey purchase return.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu
        title="Grey Sales / Return Entry"
        erpSession={erpSession}
        onBackToCatalogue={() => { window.location.href = '/'; }}
      />

      <main className="mx-auto max-w-[1400px] px-4 py-5">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            ERP
          </button>
          <p className="text-xs font-black uppercase tracking-wide text-rose-700">Grey Purchase Return</p>
        </div>

        {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
        {success && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : (
          <ErpFormShell onSave={handleSave} saving={saving} className="space-y-4">
            <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm">
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-rose-700">Grey Sales / Return · Header</p>
              <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
                <label><span className={labelClass}>Company</span><input className={inputClass} value={companyName} onChange={e => setCompanyName(e.target.value)} /></label>
                <label><span className={labelClass}>Type</span><input className={readonlyClass} value={entryType} readOnly /></label>
                <label><span className={labelClass}>Voucher No.</span><input className={readonlyClass} value={voucherNo} readOnly /></label>
                <label>
                  <span className={labelClass}>Grey Type</span>
                  <select
                    className={`${inputClass} ${greyType === 'REPROCESS' ? 'border-amber-400 bg-amber-50 font-black text-amber-900' : ''}`}
                    value={greyType}
                    onChange={e => {
                      const next = e.target.value === 'REPROCESS' ? 'REPROCESS' : 'GREY';
                      setGreyType(next);
                      setGreyPurchaseId('');
                      setPurSr('');
                      setPcs('');
                      setMts('');
                      setSelectedTakaDetails([]);
                      setGreyReceipts([]);
                      setPurPickerOpen(false);
                    }}
                  >
                    <option value="GREY">GREY</option>
                    <option value="REPROCESS">REPROCESS</option>
                  </select>
                </label>
                <label className="relative">
                  <span className={labelClass}>Pur Vno</span>
                  <input
                    className={`${inputClass} border-rose-300`}
                    value={purSr}
                    onChange={e => { setPurSr(e.target.value); setGreyPurchaseId(''); }}
                    onFocus={handlePurSrFocus}
                    onKeyDown={handlePurSrKeyDown}
                    placeholder="Select purchase sr"
                  />
                  {purPickerOpen && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-rose-200 bg-white shadow-lg">
                      {receiptsLoading ? (
                        <p className="px-3 py-4 text-xs text-gray-500">Loading purchases with godown stock...</p>
                      ) : greyReceipts.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-gray-500">
                          {greyType === 'REPROCESS'
                            ? 'No mill-returned bills with godown stock.'
                            : 'No purchase with godown stock.'}
                        </p>
                      ) : greyReceipts.map(receipt => (
                        <button
                          key={receipt.id}
                          type="button"
                          className="block w-full border-b px-3 py-2 text-left text-xs hover:bg-rose-50"
                          onClick={() => void applyGreyReceipt(receipt)}
                        >
                          <span className="font-bold">Sr. {receipt.srNo}</span> · {receipt.partyName} · {receipt.quality} · Stock {receipt.stockMts} mts
                          {receipt.returnedLotNo && (
                            <span className="mt-0.5 block text-[10px] font-bold uppercase text-amber-800">
                              Returned lot {receipt.returnedLotNo}
                              {receipt.returnedFromMill ? ` · ${receipt.returnedFromMill}` : ''}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </label>
                <label><span className={labelClass}>Quality</span><input className={inputClass} value={quality} onChange={e => setQuality(e.target.value)} /></label>
                <label><span className={labelClass}>HSN Code</span><input className={inputClass} value={hsnCode} onChange={e => setHsnCode(e.target.value)} /></label>
                <label><span className={labelClass}>Sale A/C</span><input className={readonlyClass} value={saleAccount} readOnly /></label>
                <label><span className={labelClass}>Challan No.</span><input className={readonlyClass} value={challanNo} readOnly /></label>
                <label><span className={labelClass}>Date</span><input type="date" className={inputClass} value={returnDate} onChange={e => setReturnDate(e.target.value)} /></label>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-700">Party & Logistics</p>
              <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
                <label><span className={labelClass}>Party</span><input className={inputClass} value={partyName} onChange={e => setPartyName(e.target.value)} /></label>
                <label><span className={labelClass}>Place of Supply</span><input className={inputClass} value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)} /></label>
                <label><span className={labelClass}>State Code</span><input className={inputClass} value={stateCode} onChange={e => setStateCode(e.target.value)} /></label>
                <label><span className={labelClass}>GST Type</span><input className={readonlyClass} value={gstTypeLabel || '-'} readOnly /></label>
                <label><span className={labelClass}>Bill No.</span><input className={inputClass} value={billNo} onChange={e => setBillNo(e.target.value)} /></label>
                <label><span className={labelClass}>Ref Bill No</span><input className={inputClass} value={refBillNo} onChange={e => setRefBillNo(e.target.value)} /></label>
                <label><span className={labelClass}>Ref Bill Date</span><input type="date" className={inputClass} value={refBillDate} onChange={e => setRefBillDate(e.target.value)} /></label>
                <label><span className={labelClass}>Broker</span><input className={inputClass} value={brokerName} onChange={e => setBrokerName(e.target.value)} /></label>
                <label><span className={labelClass}>Station</span><input className={inputClass} value={station} onChange={e => setStation(e.target.value)} /></label>
                <label><span className={labelClass}>Transport</span><input className={inputClass} value={transport} onChange={e => setTransport(e.target.value)} /></label>
                <label><span className={labelClass}>Vehicle No.</span><input className={inputClass} value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} /></label>
                <label><span className={labelClass}>E-Way Bill</span><input className={inputClass} value={ewayBillNo} onChange={e => setEwayBillNo(e.target.value)} /></label>
                <label><span className={labelClass}>Checker</span><input className={inputClass} value={checkerName} onChange={e => setCheckerName(e.target.value)} /></label>
              </div>
            </section>

            <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 shadow-sm">
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-rose-700">Quantity & Amount</p>
              <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
                <label>
                  <span className={labelClass}>Pcs.</span>
                  <div className="flex gap-1">
                    <input className={inputClass} value={pcs} onChange={e => setPcs(e.target.value)} />
                    <button type="button" onClick={() => void openTakaSelector()} className="shrink-0 rounded-lg border border-rose-300 bg-white px-2 text-[10px] font-black uppercase text-rose-700 hover:bg-rose-100" title="Select taka">
                      <ListOrdered className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </label>
                <label><span className={labelClass}>Mts. / Qty.</span><input className={inputClass} value={mts} onChange={e => setMts(e.target.value)} /></label>
                <label><span className={labelClass}>Rate</span><input className={inputClass} value={rate} onChange={e => setRate(e.target.value)} /></label>
                <label><span className={labelClass}>Gross Amt.</span><input className={readonlyClass} value={grossAmount.toFixed(2)} readOnly /></label>
                <label><span className={labelClass}>Godown Stock</span><input className={readonlyClass} value={stockMts.toFixed(2)} readOnly /></label>
                <label><span className={labelClass}>Disc %</span><input className={calcInputClass} value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} /></label>
                <label><span className={labelClass}>Disc Amt</span><input className={readonlyClass} value={discountAmount.toFixed(2)} readOnly /></label>
                <label><span className={labelClass}>Oth. Less</span><input className={calcInputClass} value={otherLess} onChange={e => setOtherLess(e.target.value)} /></label>
                <label><span className={labelClass}>Add</span><input className={calcInputClass} value={otherAdd} onChange={e => setOtherAdd(e.target.value)} /></label>
                <label><span className={labelClass}>CGST % / Amt</span><div className="grid grid-cols-2 gap-1"><input className={readonlyClass} value={cgstRate} readOnly /><input className={readonlyClass} value={cgstAmount} readOnly /></div></label>
                <label><span className={labelClass}>SGST % / Amt</span><div className="grid grid-cols-2 gap-1"><input className={readonlyClass} value={sgstRate} readOnly /><input className={readonlyClass} value={sgstAmount} readOnly /></div></label>
                <label><span className={labelClass}>IGST % / Amt</span><div className="grid grid-cols-2 gap-1"><input className={readonlyClass} value={igstRate} readOnly /><input className={readonlyClass} value={igstAmount} readOnly /></div></label>
                <label><span className={labelClass}>Net Amt.</span><input className={`${calcInputClass} text-base`} value={netAmount.toFixed(2)} readOnly /></label>
                <label><span className={labelClass}>Paid Amt</span><input className={inputClass} value={paidAmount} onChange={e => setPaidAmount(e.target.value)} /></label>
                <label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} /><span className="text-xs font-bold">Paid</span></label>
                <label><span className={labelClass}>Adjust Bill No.</span><input className={inputClass} value={adjustBillNo} onChange={e => setAdjustBillNo(e.target.value)} /></label>
                <label className="md:col-span-2"><span className={labelClass}>Remark</span><input className={inputClass} value={remarks} onChange={e => setRemarks(e.target.value)} /></label>
              </div>
            </section>

            <ErpSaveButton label="Save Return" saving={saving} className="ml-auto flex items-center gap-2 rounded-2xl bg-rose-600 px-6 py-3 text-sm font-black text-white disabled:opacity-60" />
          </ErpFormShell>
        )}

        {takaModalOpen && (
          <DispatchTakaSelectModal
            open={takaModalOpen}
            rows={availableTakas}
            onClose={() => setTakaModalOpen(false)}
            onApply={rows => {
              setSelectedTakaDetails(rows);
              setPcs(String(rows.length));
              setMts(String(round2(rows.reduce((s, r) => s + r.mts, 0))));
              setTakaModalOpen(false);
            }}
          />
        )}
      </main>
    </div>
  );
};
