import React, { useEffect, useState } from 'react';
import { Edit3, Loader2, X } from 'lucide-react';
import { greyPurchasesApi } from '../services/api';
import { GreyPurchase } from '../types';

interface Props {
  entryId: string;
  onClose: () => void;
  onEdit?: (id: string) => void;
}

const money = (v: number) =>
  (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN') : '-';

export const GreyPurchaseDetailPanel: React.FC<Props> = ({ entryId, onClose, onEdit }) => {
  const [entry, setEntry] = useState<GreyPurchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { entry: fetched } = await greyPurchasesApi.getById(entryId);
        if (!cancelled) setEntry(fetched);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load entry.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [entryId]);

  const takaDetails = Array.isArray(entry?.takaDetails) ? entry!.takaDetails! : [];

  return (
    <div className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wide text-indigo-950">
            {loading ? 'Loading entry...' : `Grey Purchase #${entry?.srNo ?? '-'}`}
          </h3>
          {!loading && entry && (
            <p className="mt-1 text-xs font-semibold text-indigo-700">{entry.partyName}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {entry && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(entry.id)}
              className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-indigo-200 bg-white p-1.5 text-indigo-700 hover:bg-indigo-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center text-sm text-indigo-700">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Fetching complete details...
        </div>
      ) : error ? (
        <p className="mt-4 text-sm font-semibold text-red-700">{error}</p>
      ) : entry ? (
        <>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: 'Date', value: formatDate(entry.billDate) },
              { label: 'Bill No.', value: entry.billNo || '-' },
              { label: 'Quality', value: entry.quality || '-' },
              { label: 'Broker', value: entry.brokerName || '-' },
              { label: 'Rec. Taka', value: String(entry.recTaka) },
              { label: 'Rec. Mts', value: money(entry.recMts) },
              { label: 'Pur Rate', value: money(entry.purRate) },
              { label: 'Gross Amt', value: money(entry.grossAmount) },
              { label: 'Disc Amt', value: money(entry.discountAmount) },
              { label: 'Taxable', value: money(entry.taxableAmount) },
              { label: 'CGST', value: money(entry.cgstAmount) },
              { label: 'SGST', value: money(entry.sgstAmount) },
              { label: 'IGST', value: money(entry.igstAmount) },
              { label: 'Payable', value: money(entry.payableAmount) },
              { label: 'Net Amount', value: money(entry.netAmount) },
              { label: 'Despatch Mts', value: money(entry.despatchMts) },
              { label: 'Paid', value: entry.paid ? 'Y' : 'N' },
              { label: 'Remarks', value: entry.remarks || '-' }
            ].map(field => (
              <p key={field.label} className="rounded-xl bg-white/80 px-3 py-2">
                <span className="font-bold text-gray-700">{field.label}:</span>{' '}
                <span className="text-gray-900">{field.value}</span>
              </p>
            ))}
          </div>

          {takaDetails.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-indigo-100 bg-white">
              <p className="border-b px-3 py-2 text-[10px] font-black uppercase text-gray-500">Taka Details</p>
              <table className="min-w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Sr. No.</th>
                    <th className="px-3 py-2 text-right">Mtrs</th>
                  </tr>
                </thead>
                <tbody>
                  {takaDetails.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2">{row.srNo}</td>
                      <td className="px-3 py-2 text-right">{money(row.mts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};
