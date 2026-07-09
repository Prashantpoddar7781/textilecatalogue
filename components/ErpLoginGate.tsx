import React, { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, Loader2, Lock } from 'lucide-react';
import { erpAuthApi } from '../services/api';
import {
  clearErpSession,
  getCurrentAccountingYear,
  getErpSession,
  listAccountingYearOptions,
  setErpSession
} from '../services/erpSession';
import { ErpSession } from '../types';

interface Props {
  ownerUserId: string;
  onReady: (session: ErpSession) => void;
  onBack: () => void;
}

export const ErpLoginGate: React.FC<Props> = ({ ownerUserId, onReady, onBack }) => {
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [accountingYears, setAccountingYears] = useState<string[]>(listAccountingYearOptions());
  const [accountingYear, setAccountingYear] = useState(getCurrentAccountingYear());
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setChecking(true);
      setError('');
      try {
        const existing = getErpSession();
        if (existing && existing.ownerUserId !== ownerUserId) {
          clearErpSession();
        }

        const status = await erpAuthApi.getStatus();
        if (cancelled) return;

        setAccountingYears(status.accountingYears?.length ? status.accountingYears : listAccountingYearOptions());
        setAccountingYear(status.currentAccountingYear || getCurrentAccountingYear());

        const freshExisting = getErpSession();
        if (freshExisting && freshExisting.ownerUserId === ownerUserId && !freshExisting.bypass) {
          onReady(freshExisting);
          return;
        }

        if (!status.requiresLogin) {
          const bypassSession: ErpSession = {
            erpUserId: null,
            name: 'Owner',
            accessLevel: 'complete_access',
            accountingYear: status.currentAccountingYear || getCurrentAccountingYear(),
            ownerUserId,
            bypass: true
          };
          setErpSession(bypassSession);
          onReady(bypassSession);
          return;
        }

        // Users exist — drop any old owner bypass and show login
        clearErpSession();
        setAccountingYear(status.currentAccountingYear || getCurrentAccountingYear());
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not open ERP login.');
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    void bootstrap();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerUserId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const { session } = await erpAuthApi.login({
        name: name.trim(),
        password,
        accountingYear: accountingYear.trim() || getCurrentAccountingYear()
      });
      setErpSession(session);
      onReady(session);
    } catch (err: any) {
      setError(err.message || 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7FB]">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening ERP...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            Catalogue
          </button>
          <h1 className="text-lg font-black text-gray-900">ERP Login</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-700">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900">Sign in to ERP</h2>
              <p className="text-sm text-gray-500">Enter accounting year, user ID, and password.</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-gray-500">Accounting Year</span>
              <input
                list="erp-accounting-years"
                className="w-full rounded-2xl border bg-gray-50 px-4 py-3 text-sm font-semibold"
                value={accountingYear}
                onChange={e => setAccountingYear(e.target.value)}
                placeholder={getCurrentAccountingYear()}
                required
              />
              <datalist id="erp-accounting-years">
                {accountingYears.map(year => (
                  <option key={year} value={year} />
                ))}
              </datalist>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-gray-500">User ID</span>
              <input
                className="w-full rounded-2xl border bg-gray-50 px-4 py-3 text-sm font-semibold"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter user name / ID"
                autoComplete="username"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-gray-500">Password</span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  className="w-full rounded-2xl border bg-gray-50 py-3 pl-10 pr-4 text-sm font-semibold"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? 'Signing in...' : 'Enter ERP'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};
