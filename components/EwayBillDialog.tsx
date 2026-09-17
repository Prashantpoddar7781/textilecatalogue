import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2, X } from 'lucide-react';
import { EwayBillInfo, EwayBillTransportInput, ewayBillsApi } from '../services/api';

interface Props {
  billId: string;
  docNo: string;
  existing?: EwayBillInfo | null;
  onClose: () => void;
  onGenerated: (info: EwayBillInfo) => void;
}

const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';
const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-indigo-400';

const TRANSPORT_MODES = [
  { value: '1', label: 'Road' },
  { value: '2', label: 'Rail' },
  { value: '3', label: 'Air' },
  { value: '4', label: 'Ship' }
];

const MODE_LABELS: Record<string, string> = {
  mock: 'Test mode · not filed with NIC',
  sandbox: 'GSP sandbox · not filed with NIC',
  production: 'Live · filed with NIC'
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

export const EwayBillDialog: React.FC<Props> = ({ billId, docNo, existing, onClose, onGenerated }) => {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [blockers, setBlockers] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [mode, setMode] = useState<string>('mock');
  const [partyName, setPartyName] = useState('');
  const [netAmount, setNetAmount] = useState(0);
  const [result, setResult] = useState<EwayBillInfo | null>(existing || null);
  const [alert, setAlert] = useState('');
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState<EwayBillTransportInput>({
    distance: '',
    transMode: '1',
    vehicleNo: '',
    vehicleType: 'R',
    transporterId: '',
    transporterName: '',
    transDocNo: ''
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const preview = await ewayBillsApi.getSalesPreview(billId);
        if (cancelled) return;
        setMode(preview.mode);
        setPartyName(preview.partyName);
        setNetAmount(preview.totals?.netAmount || 0);
        setBlockers(preview.blockers || []);
        setWarnings(preview.warnings || []);
        if (preview.ewayBill) setResult(preview.ewayBill);
        setForm({
          distance: preview.prefill?.distance ? String(preview.prefill.distance) : '',
          transMode: preview.prefill?.transMode || '1',
          vehicleNo: preview.prefill?.vehicleNo || '',
          vehicleType: preview.prefill?.vehicleType || 'R',
          transporterId: preview.prefill?.transporterId || '',
          transporterName: preview.prefill?.transporterName || '',
          transDocNo: preview.prefill?.transDocNo || ''
        });
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not read this bill for e-way bill.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [billId]);

  const canGenerate = useMemo(
    () => !loading && !generating && !result && blockers.length === 0,
    [loading, generating, result, blockers.length]
  );

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const response = await ewayBillsApi.generateForSales(billId, {
        ...form,
        distance: Number(form.distance) || 0
      });
      setResult(response.ewayBill);
      setAlert(response.alert || '');
      setWarnings(response.warnings || []);
      onGenerated(response.ewayBill);
    } catch (err: any) {
      setError(err.message || 'Could not generate the e-way bill.');
    } finally {
      setGenerating(false);
    }
  };

  const copyNumber = async () => {
    if (!result?.ewayBillNo) return;
    try {
      await navigator.clipboard.writeText(result.ewayBillNo);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy. Note the number manually.');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wide">E-Way Bill · {docNo}</h3>
            <p className="text-[11px] font-semibold text-gray-500">
              {partyName || 'Party'}{netAmount ? ` · ₹${netAmount.toFixed(2)}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border p-1.5 text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-700" />
            </div>
          ) : (
            <>
              <div className={`mb-3 rounded-xl border px-3 py-2 text-[11px] font-black uppercase tracking-wide ${
                mode === 'production'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}>
                {MODE_LABELS[mode] || mode}
              </div>

              {error && (
                <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {error}
                </div>
              )}

              {blockers.length > 0 && !result && (
                <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-black text-rose-800">
                    <AlertTriangle className="h-4 w-4" /> Party / company master is incomplete
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold text-rose-700">
                    {blockers.map(item => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              )}

              {result ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">E-Way Bill Number</p>
                  <p className="mt-2 text-3xl font-black tracking-wider text-emerald-900">{result.ewayBillNo}</p>
                  <button
                    type="button"
                    onClick={copyNumber}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-black uppercase text-emerald-800"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy number'}
                  </button>
                  <div className="mt-4 grid gap-3 text-left sm:grid-cols-2">
                    <div>
                      <p className={labelClass}>Generated on</p>
                      <p className="text-sm font-bold text-gray-900">{formatDateTime(result.ewayBillDate)}</p>
                    </div>
                    <div>
                      <p className={labelClass}>Valid upto</p>
                      <p className="text-sm font-bold text-gray-900">{formatDateTime(result.validUpto)}</p>
                    </div>
                  </div>
                  {alert && <p className="mt-3 text-xs font-semibold text-emerald-800">{alert}</p>}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className={labelClass}>Distance (km) *</span>
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      value={form.distance as string}
                      onChange={e => setForm(prev => ({ ...prev, distance: e.target.value }))}
                      placeholder="Approx. km to the party"
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Transport mode</span>
                    <select
                      className={inputClass}
                      value={form.transMode}
                      onChange={e => setForm(prev => ({ ...prev, transMode: e.target.value }))}
                    >
                      {TRANSPORT_MODES.map(item => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className={labelClass}>Vehicle no.</span>
                    <input
                      className={inputClass}
                      value={form.vehicleNo}
                      onChange={e => setForm(prev => ({ ...prev, vehicleNo: e.target.value.toUpperCase() }))}
                      placeholder="UP78AB1234"
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Vehicle type</span>
                    <select
                      className={inputClass}
                      value={form.vehicleType}
                      onChange={e => setForm(prev => ({ ...prev, vehicleType: e.target.value }))}
                    >
                      <option value="R">Regular</option>
                      <option value="O">Over dimensional cargo</option>
                    </select>
                  </label>
                  <label>
                    <span className={labelClass}>Transporter ID (GSTIN)</span>
                    <input
                      className={inputClass}
                      value={form.transporterId}
                      onChange={e => setForm(prev => ({ ...prev, transporterId: e.target.value.toUpperCase() }))}
                      placeholder="Use when the transporter fills Part-B"
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Transporter name</span>
                    <input
                      className={inputClass}
                      value={form.transporterName}
                      onChange={e => setForm(prev => ({ ...prev, transporterName: e.target.value }))}
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className={labelClass}>LR / Transport document no.</span>
                    <input
                      className={inputClass}
                      value={form.transDocNo}
                      onChange={e => setForm(prev => ({ ...prev, transDocNo: e.target.value }))}
                    />
                  </label>
                  <p className="sm:col-span-2 text-[11px] font-semibold text-gray-500">
                    Give either a vehicle number or a transporter ID. Validity is one day per 200 km.
                  </p>
                </div>
              )}

              {warnings.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs font-semibold text-amber-700">
                  {warnings.map(item => <li key={item}>{item}</li>)}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t bg-gray-50 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-xl border bg-white px-4 py-2 text-xs font-black uppercase text-gray-700">
            {result ? 'Done' : 'Cancel'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={!canGenerate}
              className="flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-40"
            >
              {generating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {generating ? 'Generating…' : 'Generate E-Way Bill'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
