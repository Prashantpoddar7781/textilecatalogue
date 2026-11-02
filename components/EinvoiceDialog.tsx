import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, X } from 'lucide-react';
import { EinvoiceInfo, EinvoicePreview, einvoicesApi } from '../services/api';

interface Props {
  source: 'sales' | 'note';
  id: string;
  docNo: string;
  existing?: EinvoiceInfo | null;
  onClose: () => void;
  onChanged: (info: EinvoiceInfo | null) => void;
}

const MODE_LABELS: Record<string, string> = {
  mock: 'Dummy · not filed with the government',
  sandbox: 'WhiteBooks sandbox · not filed with NIC',
  production: 'Live · filed with the IRP'
};

const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';
const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-indigo-400';

const formatWhen = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

async function printSlip(info: EinvoiceInfo, docNo: string, partyName: string) {
  const qr = info.signedQr ? await QRCode.toDataURL(info.signedQr, { margin: 1, width: 220 }) : '';
  const mode = MODE_LABELS[info.mode || ''] || '';
  const html = `<!doctype html><html><head><title>E-Invoice ${docNo}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      p { margin: 4px 0; font-size: 13px; }
      .irn { font-family: Consolas, monospace; word-break: break-all; font-size: 12px; }
      img { margin-top: 12px; }
    </style></head><body>
    <h1>E-Invoice ${docNo}</h1>
    <p>${partyName || ''}</p>
    <p>${mode}</p>
    <p>IRN</p>
    <p class="irn">${info.irn || ''}</p>
    <p>Ack No: ${info.ackNo || ''}</p>
    <p>Ack date: ${formatWhen(info.ackDate)}</p>
    ${qr ? `<img alt="QR" src="${qr}" />` : ''}
    <script>window.onload = () => window.print()<\/script>
    </body></html>`;
  const page = window.open('', '_blank', 'noopener,width=720,height=800');
  if (!page) return;
  page.document.write(html);
  page.document.close();
}

export const EinvoiceDialog: React.FC<Props> = ({ source, id, docNo, existing, onClose, onChanged }) => {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [preview, setPreview] = useState<EinvoicePreview | null>(null);
  const [result, setResult] = useState<EinvoiceInfo | null>(existing || null);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reason, setReason] = useState('2');
  const [remark, setRemark] = useState('');

  const load = async () => {
    const next = source === 'note' ? await einvoicesApi.getNotePreview(id) : await einvoicesApi.getSalesPreview(id);
    setPreview(next);
    setResult(next.einvoice);
    setWarnings(next.warnings || []);
  };

  useEffect(() => {
    let cancelled = false;
    load().catch((err: any) => {
      if (!cancelled) setError(err.message || 'Could not read this document.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
    // The document id does not change while the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, source]);

  const generate = async (dummy: boolean) => {
    setWorking(true);
    setError('');
    try {
      const response = source === 'note'
        ? await einvoicesApi.generateNote(id, dummy)
        : await einvoicesApi.generateSales(id, dummy);
      setResult(response.einvoice);
      setWarnings(response.warnings || []);
      onChanged(response.einvoice);
      await load();
    } catch (err: any) {
      setError(err.message || 'E-invoice was not generated.');
    } finally {
      setWorking(false);
    }
  };

  const cancel = async () => {
    setWorking(true);
    setError('');
    try {
      const response = source === 'note'
        ? await einvoicesApi.cancelNote(id, reason, remark)
        : await einvoicesApi.cancelSales(id, reason, remark);
      setResult(response.einvoice);
      onChanged(response.einvoice);
      await load();
    } catch (err: any) {
      setError(err.message || 'This IRN was not cancelled.');
    } finally {
      setWorking(false);
    }
  };

  const active = result && result.status !== 'cancelled';
  const mode = result?.mode || preview?.mode || 'mock';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-indigo-600">E-Invoice</p>
            <h2 className="text-lg font-black text-slate-900">{docNo}</h2>
            <p className="text-xs font-semibold text-slate-500">{preview?.partyName} · {MODE_LABELS[mode] || mode}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border px-2 py-1"><X className="h-4 w-4" /></button>
        </div>

        {loading && <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Reading the bill…</p>}

        {!loading && preview && (
          <div className="mt-4 space-y-3 text-sm">
            <p className="font-semibold text-slate-700">
              {preview.gstDocumentType || 'GST document'} · Amount {Number(preview.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
            {active && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[10px] font-black uppercase text-emerald-800">IRN</p>
                <p className="mt-1 break-all font-mono text-xs font-bold text-emerald-950">{result?.irn}</p>
                <p className="mt-2 text-xs font-semibold text-emerald-900">Ack {result?.ackNo || '—'} · {formatWhen(result?.ackDate)}</p>
              </div>
            )}
            {result?.status === 'cancelled' && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                IRN {result.irn} was cancelled. A sandbox or live IRN stays on this voucher.
              </p>
            )}
            {(preview.blockers || []).length > 0 && !active && (
              <ul className="list-disc space-y-1 rounded-xl bg-rose-50 px-5 py-3 text-xs font-semibold text-rose-800">
                {preview.blockers.map(item => <li key={item}>{item}</li>)}
              </ul>
            )}
            {warnings.map(item => <p key={item} className="text-xs font-semibold text-amber-800">{item}</p>)}
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}

            {!active && (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={working} onClick={() => void generate(false)} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-50">
                  {working ? 'Working…' : 'Generate E-Invoice'}
                </button>
                <button type="button" disabled={working} onClick={() => void generate(true)} className="rounded-xl border border-indigo-200 px-4 py-2 text-xs font-black uppercase text-indigo-800 disabled:opacity-50">
                  Dummy test
                </button>
              </div>
            )}

            {active && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void printSlip(result!, docNo, preview.partyName)} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase text-white">
                  Print IRN / QR
                </button>
              </div>
            )}

            {preview.canCancel && active && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] font-black uppercase text-slate-500">Cancel within 24 hours</p>
                <label className="mt-2 block">
                  <span className={labelClass}>Reason</span>
                  <select className={inputClass} value={reason} onChange={e => setReason(e.target.value)}>
                    {preview.reasons.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="mt-2 block">
                  <span className={labelClass}>Remark</span>
                  <input className={inputClass} value={remark} onChange={e => setRemark(e.target.value)} />
                </label>
                <button type="button" disabled={working || !remark.trim()} onClick={() => void cancel()} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-xs font-black uppercase text-rose-700 disabled:opacity-40">
                  Cancel IRN
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
