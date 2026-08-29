import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { gstApi } from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

type TaxTotals = {
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  tax: number;
  entries: number;
};

type GstrRow = {
  id: string;
  source: string;
  date: string;
  transactionType: string;
  voucherNo: string;
  billNo: string;
  partyName: string;
  bucket: string;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  tax: number;
  editPath: string;
};

const BUCKET_FILTERS = [
  { value: 'ALL', label: 'All (3B view)' },
  { value: 'Outward', label: 'Outward (GSTR-1)' },
  { value: 'Input Goods', label: 'ITC · Input Goods' },
  { value: 'Input Services', label: 'ITC · Input Services' },
  { value: 'Capital Goods', label: 'ITC · Capital Goods' }
];

const money = (v: number) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '-');
const inputClass = 'w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-semibold';
const labelText = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';
const thClass = 'border border-indigo-200 bg-indigo-50 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide text-indigo-950';
const tdClass = 'border border-slate-200 px-2 py-1.5 align-middle';
const tdNum = `${tdClass} text-right tabular-nums`;
const tdCenter = `${tdClass} text-center`;

const emptyTax = (): TaxTotals => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, tax: 0, entries: 0 });

export const Gstr3bReportPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bucket, setBucket] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [outward, setOutward] = useState<TaxTotals>(emptyTax());
  const [itc, setItc] = useState<{ [key: string]: TaxTotals }>({});
  const [netPayable, setNetPayable] = useState({ igst: 0, cgst: 0, sgst: 0, tax: 0 });
  const [rows, setRows] = useState<GstrRow[]>([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await gstApi.getGstr3b({
        bucket,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined
      });
      setOutward(result.outward || emptyTax());
      setItc(result.itc || {});
      setNetPayable(result.netPayable || { igst: 0, cgst: 0, sgst: 0, tax: 0 });
      setRows(result.rows || []);
    } catch (err: any) {
      setError(err.message || 'Could not load GSTR-3B.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [bucket]);

  const summaryRows = [
    { label: '3.1 Outward supplies (GSTR-1)', ...outward },
    { label: '4(A) ITC — Input Goods', ...(itc['Input Goods'] || emptyTax()) },
    { label: '4(A) ITC — Input Services', ...(itc['Input Services'] || emptyTax()) },
    { label: '4(A) ITC — Capital Goods', ...(itc['Capital Goods'] || emptyTax()) },
    { label: '4 Eligible ITC total', ...(itc.total || emptyTax()) }
  ];

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="GSTR-3B · ITC Split" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
        </div>

        <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">GST eligibility from Transaction Types</p>
          <p className="mt-1 text-xs text-gray-500">
            Inward GST splits into Input Goods / Input Services / Capital Goods using the Excel ITC column. Click any row to edit.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className={labelText}>View</span>
              <select className={inputClass} value={bucket} onChange={e => setBucket(e.target.value)}>
                {BUCKET_FILTERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelText}>From</span>
              <input type="date" className={inputClass} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelText}>To</span>
              <input type="date" className={inputClass} value={toDate} onChange={e => setToDate(e.target.value)} />
            </label>
            <div className="flex items-end">
              <button type="button" onClick={() => void load()} className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black uppercase text-white">
                Show Report
              </button>
            </div>
          </div>
        </section>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

        <section className="mb-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b bg-indigo-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-indigo-800">
            GSTR-3B summary
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-xs">
              <thead>
                <tr>
                  {['Particulars', 'Taxable', 'IGST', 'CGST', 'SGST', 'Tax', 'Entries'].map(head => (
                    <th key={head} className={thClass}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className={`${tdClass} p-10 text-center`}>
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
                    </td>
                  </tr>
                )}
                {!loading && summaryRows.map(row => (
                  <tr key={row.label}>
                    <td className={`${tdClass} font-black`}>{row.label}</td>
                    <td className={tdNum}>{money(row.taxable)}</td>
                    <td className={tdNum}>{money(row.igst)}</td>
                    <td className={tdNum}>{money(row.cgst)}</td>
                    <td className={tdNum}>{money(row.sgst)}</td>
                    <td className={`${tdNum} font-black`}>{money(row.tax)}</td>
                    <td className={tdCenter}>{row.entries}</td>
                  </tr>
                ))}
              </tbody>
              {!loading && (
                <tfoot>
                  <tr className="bg-indigo-900 text-white">
                    <td className={`${tdClass} border-indigo-800 font-black`}>Net GST payable (outward − ITC)</td>
                    <td className={`${tdNum} border-indigo-800`} />
                    <td className={`${tdNum} border-indigo-800 font-black`}>{money(netPayable.igst)}</td>
                    <td className={`${tdNum} border-indigo-800 font-black`}>{money(netPayable.cgst)}</td>
                    <td className={`${tdNum} border-indigo-800 font-black`}>{money(netPayable.sgst)}</td>
                    <td className={`${tdNum} border-indigo-800 font-black`}>{money(netPayable.tax)}</td>
                    <td className={`${tdCenter} border-indigo-800`} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b bg-indigo-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-indigo-800">
            Document register · click any row to edit
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-xs">
              <thead>
                <tr>
                  {['Date', 'Bucket', 'Series', 'Voucher', 'Party', 'Taxable', 'IGST', 'CGST', 'SGST', 'Tax'].map(head => (
                    <th key={head} className={thClass}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={10} className={`${tdClass} p-10 text-center`}>
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className={`${tdClass} p-10 text-center font-bold text-gray-400`}>No GST documents in this period.</td>
                  </tr>
                )}
                {!loading && rows.map(row => (
                  <tr
                    key={`${row.source}-${row.id}`}
                    onClick={() => { window.location.href = row.editPath; }}
                    className="cursor-pointer hover:bg-indigo-50"
                  >
                    <td className={tdCenter}>{formatDate(row.date)}</td>
                    <td className={`${tdCenter} font-black`}>{row.bucket}</td>
                    <td className={tdClass}>{row.transactionType}</td>
                    <td className={`${tdNum} font-bold`}>{row.voucherNo || row.billNo || '-'}</td>
                    <td className={`${tdClass} font-bold`}>{row.partyName || '-'}</td>
                    <td className={tdNum}>{money(row.taxable)}</td>
                    <td className={tdNum}>{money(row.igst)}</td>
                    <td className={tdNum}>{money(row.cgst)}</td>
                    <td className={tdNum}>{money(row.sgst)}</td>
                    <td className={`${tdNum} font-black`}>{money(row.tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};
