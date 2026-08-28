import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ListOrdered, Loader2 } from 'lucide-react';
import { greyDispatchesApi } from '../services/api';
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
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';

const formatDateInput = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : '';

export const GreyDispatchPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const editId = useMemo(() => new URLSearchParams(window.location.search).get('edit'), []);
  const isEditMode = Boolean(editId);
  const [companyName, setCompanyName] = useState('');
  const [transactionType, setTransactionType] = useState('PROCESS');
  const [challanNo, setChallanNo] = useState('');
  const [dispatchDate, setDispatchDate] = useState(today());
  const [millLotNo, setMillLotNo] = useState('');
  const [purSr, setPurSr] = useState('');
  const [greyPurchaseId, setGreyPurchaseId] = useState('');
  const [millName, setMillName] = useState('');
  const [ourMarka, setOurMarka] = useState('');
  const [purBillNo, setPurBillNo] = useState('');
  const [purDate, setPurDate] = useState('');
  const [weaverName, setWeaverName] = useState('');
  const [quality, setQuality] = useState('');
  const [cut, setCut] = useState('0');
  const [weight, setWeight] = useState('0');
  const [rate, setRate] = useState('');
  const [despTaka, setDespTaka] = useState('');
  const [despMts, setDespMts] = useState('');
  const [remark, setRemark] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [orderNo, setOrderNo] = useState('');
  const [checkerName, setCheckerName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [ewayBillNo, setEwayBillNo] = useState('');
  const [srNo, setSrNo] = useState('1');
  const [mills, setMills] = useState<string[]>([]);
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
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const meta = await greyDispatchesApi.getMeta();
        if (cancelled) return;
        setCompanyName(meta.companyName || '');
        setSrNo(String(meta.nextSrNo || 1));
        setChallanNo(String(meta.nextChallanNo || 1));
        setMills(meta.mills || []);
        if (meta.transactionTypes?.[0] && !isEditMode) setTransactionType(meta.transactionTypes[0]);
        if (isEditMode && editId) {
          const { entry } = await greyDispatchesApi.getById(editId);
          if (cancelled) return;
          setCompanyName(entry.companyName || meta.companyName || '');
          setTransactionType(entry.transactionType === 'REPROCESS' ? 'REPROCESS' : 'PROCESS');
          setChallanNo(entry.challanNo || '');
          setDispatchDate(formatDateInput(entry.dispatchDate) || today());
          setMillLotNo(entry.millLotNo || '');
          setPurSr(String(entry.purSr ?? ''));
          setGreyPurchaseId(entry.greyPurchaseId || '');
          setMillName(entry.millName || '');
          setOurMarka(entry.ourMarka || '');
          setPurBillNo(entry.purBillNo || '');
          setPurDate(formatDateInput(entry.purDate));
          setWeaverName(entry.weaverName || '');
          setQuality(entry.quality || '');
          setCut(String(entry.cut ?? 0));
          setWeight(String(entry.weight ?? 0));
          setRate(String(entry.rate ?? ''));
          setDespTaka(String(entry.despTaka ?? ''));
          setDespMts(String(entry.despMts ?? ''));
          setRemark(entry.remark || '');
          setBrokerName(entry.brokerName || '');
          setOrderNo(entry.orderNo || '');
          setCheckerName(entry.checkerName || '');
          setVehicleNo(entry.vehicleNo || '');
          setEwayBillNo(entry.ewayBillNo || '');
          setSrNo(String(entry.srNo ?? meta.nextSrNo ?? 1));
          const takaRows = Array.isArray(entry.takaDetails) ? entry.takaDetails : [];
          setSelectedTakaDetails(takaRows);
          if (entry.greyPurchaseId) {
            try {
              const { availableRows } = await greyDispatchesApi.getAvailableTakas(entry.greyPurchaseId, {
                transactionType: entry.transactionType === 'REPROCESS' ? 'REPROCESS' : 'PROCESS',
                excludeDispatchId: editId
              });
              setAvailableTakas([...(takaRows || []), ...(availableRows || [])]);
            } catch {
              setAvailableTakas(takaRows);
            }
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load grey dispatch.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [editId, isEditMode]);

  const loadGreyReceipts = async (filterSr?: string) => {
    setReceiptsLoading(true);
    try {
      const { entries } = await greyDispatchesApi.getGreyReceipts(filterSr?.trim() || undefined, {
        transactionType
      });
      setGreyReceipts(entries || []);
      setPurPickerOpen(true);
    } catch (err: any) {
      setError(err.message || 'Could not load grey receipts.');
    } finally {
      setReceiptsLoading(false);
    }
  };

  const applyGreyReceipt = async (receipt: GreyReceiptSummary) => {
    setGreyPurchaseId(receipt.id);
    setPurSr(String(receipt.srNo ?? ''));
    setWeaverName(receipt.partyName || '');
    setBrokerName(receipt.brokerName || '');
    setQuality(receipt.quality || '');
    setPurBillNo(receipt.billNo || '');
    setPurDate(formatDateInput(receipt.billDate));
    setRate(String(receipt.purRate || ''));
    setOrderNo(receipt.orderNo || '0');
    setRemark(receipt.remarks || '');
    setCheckerName(receipt.checkerName || '');
    if (receipt.companyName) setCompanyName(receipt.companyName);
    setDespTaka('');
    setDespMts('');
    setSelectedTakaDetails([]);
    setPurPickerOpen(false);

    try {
      const { availableRows } = await greyDispatchesApi.getAvailableTakas(receipt.id, {
        transactionType,
        excludeDispatchId: editId || undefined
      });
      setAvailableTakas(availableRows || []);
    } catch {
      setAvailableTakas([]);
    }
  };

  const handlePurSrFocus = () => {
    void loadGreyReceipts(purSr);
  };

  const handlePurSrChange = (value: string) => {
    setPurSr(value);
    setGreyPurchaseId('');
    setDespTaka('');
    setDespMts('');
    setSelectedTakaDetails([]);
  };

  const handlePurSrKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && purSr.trim()) {
      event.stopPropagation();
      void (async () => {
        const { entries } = await greyDispatchesApi.getGreyReceipts(purSr.trim(), { transactionType });
        const match = entries?.[0];
        if (match) await applyGreyReceipt(match);
        else {
          setError(
            transactionType === 'REPROCESS'
              ? `No mill-returned bill found for Pur Sr. ${purSr.trim()}.`
              : `No grey receipt found for Pur Sr. ${purSr.trim()}.`
          );
        }
      })();
    }
  };

  const openTakaSelector = async () => {
    if (!greyPurchaseId) {
      setError('Select a Pur Sr. grey receipt first.');
      return;
    }
    setError('');
    try {
      const { availableRows } = await greyDispatchesApi.getAvailableTakas(greyPurchaseId, {
        transactionType,
        excludeDispatchId: editId || undefined
      });
      setAvailableTakas(availableRows || []);
      if (!availableRows?.length) {
        setError(
          transactionType === 'REPROCESS'
            ? 'No returned taka left to reprocess for this receipt.'
            : 'No taka left to dispatch for this receipt.'
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
        setError('Select a Pur Sr. grey receipt.');
        setSaving(false);
        return;
      }
      if (!millName.trim()) {
        setError('Mill is required.');
        setSaving(false);
        return;
      }
      if (!toNum(despMts)) {
        setError('Select taka to dispatch or enter Desp. Mts.');
        setSaving(false);
        return;
      }

      const payload = {
        greyPurchaseId,
        companyName,
        transactionType,
        challanNo,
        dispatchDate,
        millLotNo,
        purSr: toNum(purSr),
        millName: millName.trim(),
        ourMarka,
        purBillNo,
        purDate: purDate || undefined,
        weaverName,
        quality,
        cut: toNum(cut),
        weight: toNum(weight),
        rate: toNum(rate),
        despTaka: toNum(despTaka),
        despMts: toNum(despMts),
        takaDetails: selectedTakaDetails,
        remark,
        brokerName,
        orderNo,
        checkerName,
        vehicleNo,
        ewayBillNo,
        srNo: toNum(srNo)
      };
      if (isEditMode && editId) {
        await greyDispatchesApi.update(editId, payload);
        setSuccess('Grey dispatch updated.');
      } else {
        await greyDispatchesApi.create(payload);
        setSuccess(
          transactionType === 'REPROCESS'
            ? 'REPROCESS dispatch saved — grey re-sent to mill from returned stock.'
            : 'Grey dispatch saved and stock updated in godown.'
        );
        setMillLotNo('');
        setPurSr('');
        setGreyPurchaseId('');
        setMillName('');
        setOurMarka('');
        setPurBillNo('');
        setPurDate('');
        setWeaverName('');
        setQuality('');
        setCut('0');
        setWeight('0');
        setRate('');
        setDespTaka('');
        setDespMts('');
        setRemark('');
        setBrokerName('');
        setOrderNo('0');
        setCheckerName('');
        setVehicleNo('');
        setEwayBillNo('');
        setSelectedTakaDetails([]);
        setAvailableTakas([]);
        const meta = await greyDispatchesApi.getMeta();
        setSrNo(String(meta.nextSrNo || 1));
        setChallanNo(String(meta.nextChallanNo || 1));
      }
    } catch (err: any) {
      setError(err.message || 'Could not save grey dispatch.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu
        title={isEditMode ? 'Edit Mill Dispatch' : 'Mill Dispatch Entry'}
        erpSession={erpSession}
        onBackToCatalogue={() => { window.location.href = '/'; }}
      />

      <main className="mx-auto max-w-[1400px] px-4 py-5">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            ERP
          </button>
          <p className="text-xs font-black uppercase tracking-wide text-orange-700">{isEditMode ? 'Edit Grey Dispatch' : 'Grey Dispatch'}</p>
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
            <section className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4 shadow-sm">
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-orange-700">Mill Dispatch · Header</p>
              <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
                <label>
                  <span className={labelClass}>Company</span>
                  <input className={inputClass} value={companyName} onChange={e => setCompanyName(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Type</span>
                  <select
                    className={`${inputClass} ${transactionType === 'REPROCESS' ? 'border-amber-400 bg-amber-50 font-black text-amber-900' : ''}`}
                    value={transactionType}
                    onChange={e => {
                      const next = e.target.value === 'REPROCESS' ? 'REPROCESS' : 'PROCESS';
                      setTransactionType(next);
                      setGreyPurchaseId('');
                      setPurSr('');
                      setDespTaka('');
                      setDespMts('');
                      setSelectedTakaDetails([]);
                      setGreyReceipts([]);
                      setPurPickerOpen(false);
                      setError('');
                    }}
                  >
                    <option value="PROCESS">PROCESS</option>
                    <option value="REPROCESS">REPROCESS</option>
                  </select>
                </label>
                <label>
                  <span className={labelClass}>Chal No.</span>
                  <input className={readonlyClass} value={challanNo} readOnly title="Auto allotted" />
                </label>
                <label>
                  <span className={labelClass}>Desp Date</span>
                  <input type="date" className={inputClass} value={dispatchDate} onChange={e => setDispatchDate(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Mill Lot No.</span>
                  <input className={inputClass} value={millLotNo} onChange={e => setMillLotNo(e.target.value)} />
                </label>
                <label className="relative">
                  <span className={labelClass}>Pur Sr.</span>
                  <input
                    className={`${inputClass} border-orange-300`}
                    value={purSr}
                    onChange={e => handlePurSrChange(e.target.value)}
                    onFocus={handlePurSrFocus}
                    onKeyDown={handlePurSrKeyDown}
                    placeholder="Select or type pur sr"
                  />
                  {purPickerOpen && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-orange-200 bg-white shadow-lg">
                      {receiptsLoading ? (
                        <p className="px-3 py-4 text-xs text-gray-500">Loading grey receipts...</p>
                      ) : greyReceipts.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-gray-500">
                          {transactionType === 'REPROCESS'
                            ? 'No mill-returned bills with godown stock. First enter Mill Receipt as RETURN.'
                            : 'No grey receipts with stock.'}
                        </p>
                      ) : greyReceipts.map(receipt => (
                        <button
                          key={receipt.id}
                          type="button"
                          className="block w-full border-b px-3 py-2 text-left text-xs hover:bg-orange-50"
                          onClick={() => void applyGreyReceipt(receipt)}
                        >
                          <span className="font-black text-gray-900">Pur {receipt.srNo}</span>
                          <span className="mx-2 text-gray-400">·</span>
                          <span className="font-semibold">{receipt.partyName}</span>
                          <span className="mx-2 text-gray-400">·</span>
                          <span>{receipt.quality || '-'}</span>
                          <span className="ml-2 text-orange-700">{receipt.stockMts} mtrs left</span>
                          {receipt.returnedLotNo && (
                            <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide text-amber-800">
                              Returned lot {receipt.returnedLotNo}
                              {receipt.returnedFromMill ? ` · ${receipt.returnedFromMill}` : ''}
                              {receipt.returnedMts != null ? ` · ${receipt.returnedMts} mtrs` : ''}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </label>
                <label>
                  <span className={labelClass}>Sr. No.</span>
                  <input className={readonlyClass} readOnly value={srNo} />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-600">Mill & Purchase Details</p>
              <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
                <label className="xl:col-span-2">
                  <span className={labelClass}>Mill</span>
                  <input
                    list="mill-list"
                    className={inputClass}
                    value={millName}
                    onChange={e => setMillName(e.target.value)}
                    placeholder="Select or type mill"
                  />
                  <datalist id="mill-list">
                    {mills.map(name => <option key={name} value={name} />)}
                  </datalist>
                </label>
                <label>
                  <span className={labelClass}>Our Marka</span>
                  <input className={inputClass} value={ourMarka} onChange={e => setOurMarka(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Pur Bill No.</span>
                  <input className={readonlyClass} readOnly value={purBillNo} />
                </label>
                <label>
                  <span className={labelClass}>Pur Date</span>
                  <input className={readonlyClass} readOnly value={purDate} />
                </label>
                <label className="xl:col-span-2">
                  <span className={labelClass}>Weaver</span>
                  <input className={readonlyClass} readOnly value={weaverName} />
                </label>
                <label>
                  <span className={labelClass}>Quality</span>
                  <input className={readonlyClass} readOnly value={quality} />
                </label>
                <label>
                  <span className={labelClass}>Cut</span>
                  <input className={inputClass} type="number" step="0.01" value={cut} onChange={e => setCut(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Wt.</span>
                  <input className={inputClass} type="number" step="0.001" value={weight} onChange={e => setWeight(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Rate</span>
                  <input className={readonlyClass} readOnly value={rate} />
                </label>
                <label>
                  <span className={labelClass}>Desp Taka</span>
                  <div className="flex gap-1">
                    <input
                      className={`${inputClass} border-orange-300`}
                      type="number"
                      step="1"
                      value={despTaka}
                      readOnly
                      onFocus={() => void openTakaSelector()}
                    />
                    <button
                      type="button"
                      onClick={() => void openTakaSelector()}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-orange-300 bg-white px-2 text-[10px] font-black uppercase text-orange-700 hover:bg-orange-100"
                    >
                      <ListOrdered className="h-3.5 w-3.5" />
                      Taka
                    </button>
                  </div>
                </label>
                <label>
                  <span className={labelClass}>Desp Mts.</span>
                  <input className={readonlyClass} readOnly value={despMts} />
                </label>
                {greyPurchaseId && (
                  <label className="xl:col-span-2">
                    <span className={labelClass}>Stock Left (this receipt)</span>
                    <input className={readonlyClass} readOnly value={round2(stockMts).toLocaleString('en-IN', { minimumFractionDigits: 2 })} />
                  </label>
                )}
                <label className="xl:col-span-2">
                  <span className={labelClass}>Remark</span>
                  <input className={inputClass} value={remark} onChange={e => setRemark(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Broker</span>
                  <input className={readonlyClass} readOnly value={brokerName} />
                </label>
                <label>
                  <span className={labelClass}>Order No.</span>
                  <input className={readonlyClass} readOnly value={orderNo} />
                </label>
                <label>
                  <span className={labelClass}>Checker</span>
                  <input className={inputClass} value={checkerName} onChange={e => setCheckerName(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Vehicle No.</span>
                  <input className={inputClass} value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>E-Way Bill No</span>
                  <input className={inputClass} value={ewayBillNo} onChange={e => setEwayBillNo(e.target.value)} />
                </label>
              </div>
            </section>

            <div className="flex justify-end">
              <ErpSaveButton
                saving={saving}
                label={isEditMode ? 'Update Dispatch' : 'Save Dispatch'}
                className="flex items-center gap-2 rounded-2xl bg-orange-600 px-6 py-3 text-sm font-black text-white disabled:opacity-60"
              />
            </div>
          </ErpFormShell>
        )}
      </main>

      <DispatchTakaSelectModal
        open={takaModalOpen}
        rows={availableTakas}
        onClose={() => setTakaModalOpen(false)}
        onApply={(rows) => {
          setSelectedTakaDetails(rows);
          setDespTaka(String(rows.length));
          setDespMts(String(round2(rows.reduce((sum, row) => sum + (Number(row.mts) || 0), 0))));
        }}
      />
    </div>
  );
};
