import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Building2, ChevronDown, FileBarChart, LogOut, Package, PackageCheck, RotateCcw } from 'lucide-react';
import { clearErpSession, hasCompleteErpAccess } from '../services/erpSession';
import { ErpSession } from '../types';

interface Props {
  title: string;
  onBackToCatalogue?: () => void;
  erpSession?: ErpSession | null;
  showSessionActions?: boolean;
  children?: React.ReactNode;
}

type MenuKey = 'masters' | 'reports' | 'greySales' | 'accounts' | 'utilities' | null;

export const ErpTopMenu: React.FC<Props> = ({
  title,
  onBackToCatalogue,
  erpSession,
  showSessionActions = false,
  children
}) => {
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const canOpenUtilities = hasCompleteErpAccess(erpSession || null);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const toggle = (key: MenuKey) => {
    setOpenMenu(prev => (prev === key ? null : key));
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-white/95 shadow-sm backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {onBackToCatalogue && (
              <button
                type="button"
                onClick={onBackToCatalogue}
                className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Catalogue
              </button>
            )}
            <h1 className="truncate text-base font-black text-gray-900 md:text-lg">{title}</h1>
          </div>

          <div className="flex items-center gap-2">
            {showSessionActions && erpSession && !erpSession.bypass && (
              <button
                type="button"
                onClick={() => {
                  clearErpSession();
                  window.location.href = '/erp';
                }}
                className="hidden items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 sm:flex"
              >
                <LogOut className="h-3.5 w-3.5" />
                Switch User
              </button>
            )}
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700"
            >
              Home
            </button>
          </div>
        </div>

        <div ref={menuRef} className="mt-2 flex flex-wrap items-center gap-1 border-t border-gray-100 pt-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => toggle('masters')}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide ${
                openMenu === 'masters' ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Masters
              <ChevronDown className={`h-3.5 w-3.5 transition ${openMenu === 'masters' ? 'rotate-180' : ''}`} />
            </button>
            {openMenu === 'masters' && (
              <div className="absolute left-0 z-50 mt-1 min-w-[200px] rounded-xl border border-gray-100 bg-white p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => { window.location.href = '/erp/masters/company'; }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <Building2 className="h-4 w-4" />
                  Company
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => toggle('accounts')}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide ${
                openMenu === 'accounts' ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Accounts
              <ChevronDown className={`h-3.5 w-3.5 transition ${openMenu === 'accounts' ? 'rotate-180' : ''}`} />
            </button>
            {openMenu === 'accounts' && (
              <div className="absolute left-0 z-50 mt-1 min-w-[220px] rounded-xl border border-gray-100 bg-white p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => { window.location.href = '/erp/ledger'; }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <BookOpen className="h-4 w-4" />
                  Account Ledger
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => toggle('reports')}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide ${
                openMenu === 'reports' ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Reports
              <ChevronDown className={`h-3.5 w-3.5 transition ${openMenu === 'reports' ? 'rotate-180' : ''}`} />
            </button>
            {openMenu === 'reports' && (
              <div className="absolute left-0 z-50 mt-1 min-w-[240px] rounded-xl border border-gray-100 bg-white p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => { window.location.href = '/erp/reports/godown-inventory'; }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <Package className="h-4 w-4" />
                  Godown Inventory
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = '/erp/reports/mill-dispatch'; }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <FileBarChart className="h-4 w-4" />
                  Mill Dispatch Report
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = '/erp/reports/mill-receipt'; }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <Package className="h-4 w-4" />
                  Mill Receipt Report
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = '/erp/reports/work-despatch'; }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <FileBarChart className="h-4 w-4" />
                  Work Desp Report
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = '/erp/reports/work-receipt'; }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <FileBarChart className="h-4 w-4" />
                  Work Recpt Report
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = '/erp/reports/sales-order'; }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <FileBarChart className="h-4 w-4" />
                  Sales Order Report
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = '/erp/reports/finish-sales'; }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <FileBarChart className="h-4 w-4" />
                  Finish Sales / Goods Return
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = '/erp/reports/outstanding'; }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <FileBarChart className="h-4 w-4" />
                  Outstanding / Payment
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => toggle('greySales')}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide ${
                openMenu === 'greySales' ? 'bg-rose-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Grey Sales
              <ChevronDown className={`h-3.5 w-3.5 transition ${openMenu === 'greySales' ? 'rotate-180' : ''}`} />
            </button>
            {openMenu === 'greySales' && (
              <div className="absolute left-0 z-50 mt-1 min-w-[260px] rounded-xl border border-gray-100 bg-white p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => { window.location.href = '/erp/grey-purchase-return'; }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-rose-50 hover:text-rose-700"
                >
                  <RotateCcw className="h-4 w-4" />
                  Grey Purchase Return
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = '/erp/mill-receipt'; }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-rose-50 hover:text-rose-700"
                >
                  <PackageCheck className="h-4 w-4" />
                  Mill / Grey Receipt
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = '/erp/work-despatch'; }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-rose-50 hover:text-rose-700"
                >
                  <Package className="h-4 w-4" />
                  Work Despatch
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = '/erp/work-receipt'; }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-rose-50 hover:text-rose-700"
                >
                  <PackageCheck className="h-4 w-4" />
                  Work Receipt
                </button>
                <button
                  type="button"
                  disabled
                  className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-300"
                >
                  <Package className="h-4 w-4" />
                  Grey Sales (coming next)
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (!canOpenUtilities) return;
                toggle('utilities');
              }}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide ${
                !canOpenUtilities
                  ? 'cursor-not-allowed text-gray-300'
                  : openMenu === 'utilities'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={!canOpenUtilities ? 'Complete Access required' : undefined}
            >
              Utilities
              <ChevronDown className={`h-3.5 w-3.5 transition ${openMenu === 'utilities' ? 'rotate-180' : ''}`} />
            </button>
            {openMenu === 'utilities' && canOpenUtilities && (
              <div className="absolute left-0 z-50 mt-1 min-w-[220px] rounded-xl border border-gray-100 bg-white p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => { window.location.href = '/erp/utilities/users'; }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  User Management
                </button>
              </div>
            )}
          </div>

          {children}
        </div>
      </div>
    </header>
  );
};
