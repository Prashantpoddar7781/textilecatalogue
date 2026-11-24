import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Search } from 'lucide-react';
import { salesOrdersApi } from '../services/api';
import { ErpSession, SalesItemMaster } from '../types';
import { ErpTopMenu } from './ErpTopMenu';
import { QualityInformationDialog } from './QualityInformationDialog';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

export const QualityInformationManagerPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<SalesItemMaster[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<SalesItemMaster | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await salesOrdersApi.getItems();
      setItems(result.items || []);
    } catch (err: any) {
      setError(err.message || 'Could not load items.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(item =>
      item.name.toLowerCase().includes(needle)
      || (item.mainScreen || '').toLowerCase().includes(needle)
      || (item.hsnSac || '').toLowerCase().includes(needle)
      || (item.category || '').toLowerCase().includes(needle)
    );
  }, [items, q]);

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Quality Information" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1100px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <button
            type="button"
            onClick={() => { setEditItem(null); setDialogOpen(true); }}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-black uppercase text-white"
          >
            <Plus className="h-4 w-4" /> Add New Item
          </button>
        </div>

        <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Item Master</p>
          <p className="mt-1 text-xs text-gray-500">
            Quality Information for sale and purchase lines. Name, main screen, cut, HSN and GST. Parties stay in Accounts Information.
          </p>
          <div className="relative mt-3 min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm font-semibold"
              placeholder="Search name / main screen / HSN"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
        </section>

        <section className="mb-4 overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="w-full min-w-[880px] border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-800">
                <th className="border px-2 py-2 text-left">Name</th>
                <th className="border px-2 py-2 text-left">Main Screen</th>
                <th className="border px-2 py-2 text-left">Type</th>
                <th className="border px-2 py-2 text-right">Cut</th>
                <th className="border px-2 py-2 text-right">Rate</th>
                <th className="border px-2 py-2 text-left">HSN</th>
                <th className="border px-2 py-2 text-right">GST %</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="p-10 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-700" />
                  </td>
                </tr>
              )}
              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center font-bold text-gray-400">No items yet.</td>
                </tr>
              )}
              {!loading && shown.map(item => (
                <tr
                  key={item.id}
                  className="cursor-pointer hover:bg-indigo-50"
                  onClick={() => { setEditItem(item); setDialogOpen(true); }}
                >
                  <td className="border px-2 py-1.5 font-bold">{item.name}</td>
                  <td className="border px-2 py-1.5">{item.mainScreen || '-'}</td>
                  <td className="border px-2 py-1.5">{item.finishType || '-'}</td>
                  <td className="border px-2 py-1.5 text-right tabular-nums">{Number(item.cut) || 0}</td>
                  <td className="border px-2 py-1.5 text-right tabular-nums">{Number(item.sellingRate) || 0}</td>
                  <td className="border px-2 py-1.5">{item.hsnSac || '-'}</td>
                  <td className="border px-2 py-1.5 text-right tabular-nums">{Number(item.gstRate) || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
      </main>

      <QualityInformationDialog
        open={dialogOpen}
        editItem={editItem}
        initialName={editItem?.name || ''}
        onClose={() => setDialogOpen(false)}
        onSaved={() => { setDialogOpen(false); void load(); }}
      />
    </div>
  );
};
