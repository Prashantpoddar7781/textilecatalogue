import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Search } from 'lucide-react';
import { ERP_ACCOUNT_TYPES } from '../constants/accountTypes';
import { partiesApi } from '../services/api';
import { AccountParty, ErpSession } from '../types';
import { AccountsInformationDialog } from './AccountsInformationDialog';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

export const AccountsInformationManagerPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [parties, setParties] = useState<AccountParty[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editParty, setEditParty] = useState<AccountParty | null>(null);

  const load = async (search = q) => {
    setLoading(true);
    setError('');
    try {
      const result = await partiesApi.list({ role: 'all', q: search || undefined });
      setParties(result.parties || []);
    } catch (err: any) {
      setError(err.message || 'Could not load parties.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(''); }, []);

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Accounts Information Manager" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1100px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <button
            type="button"
            onClick={() => { setEditParty(null); setDialogOpen(true); }}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-black uppercase text-white"
          >
            <Plus className="h-4 w-4" /> Add New Party
          </button>
        </div>

        <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Accounts Information Manager</p>
          <p className="mt-1 text-xs text-gray-500">
            Set A/C Type (Creditors for Goods, Debtor types, Fixed Assets, etc.). Effect shows which statement the party belongs to.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm font-semibold"
                placeholder="Search name / GST / A/C type"
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void load(q); }}
              />
            </div>
            <button type="button" onClick={() => void load(q)} className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-black uppercase text-white">
              Search
            </button>
          </div>
        </section>

        <section className="mb-4 overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-800">
                <th className="border px-2 py-2 text-left">Name</th>
                <th className="border px-2 py-2 text-left">A/C Type</th>
                <th className="border px-2 py-2 text-left">Effect On</th>
                <th className="border px-2 py-2 text-left">Role</th>
                <th className="border px-2 py-2 text-left">City / State</th>
                <th className="border px-2 py-2 text-left">GSTIN</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="p-10 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-700" />
                  </td>
                </tr>
              )}
              {!loading && parties.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center font-bold text-gray-400">No parties yet.</td>
                </tr>
              )}
              {!loading && parties.map(party => {
                const effect = ERP_ACCOUNT_TYPES.find(t => t.value === party.accountType)?.effectOn || 'BALANCE SHEET';
                return (
                  <tr
                    key={`${party.role}-${party.id}`}
                    className="cursor-pointer hover:bg-indigo-50"
                    onClick={() => { setEditParty(party); setDialogOpen(true); }}
                  >
                    <td className="border px-2 py-1.5 font-bold">{party.name}</td>
                    <td className="border px-2 py-1.5">{party.accountType || '-'}</td>
                    <td className="border px-2 py-1.5">{effect}</td>
                    <td className="border px-2 py-1.5 uppercase">{party.role}</td>
                    <td className="border px-2 py-1.5">{[party.city, party.state].filter(Boolean).join(', ') || '-'}</td>
                    <td className="border px-2 py-1.5">{party.gstNumber || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
      </main>

      <AccountsInformationDialog
        open={dialogOpen}
        editParty={editParty}
        initialName={editParty?.name || ''}
        context="other"
        onClose={() => setDialogOpen(false)}
        onSaved={() => { void load(q); }}
      />
    </div>
  );
};
