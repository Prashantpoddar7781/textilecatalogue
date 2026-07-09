import React from 'react';
import { ArrowLeft, Users, Wrench } from 'lucide-react';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  canManageUsers?: boolean;
  erpSession?: ErpSession | null;
}

const utilities = [
  {
    title: 'User Management',
    description: 'Create ERP user IDs with name, access level, and password.',
    icon: Users,
    href: '/erp/utilities/users',
    requiresCompleteAccess: true
  }
];

export const ErpUtilitiesPage: React.FC<Props> = ({ onBack, canManageUsers = true, erpSession }) => {
  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu
        title="Utilities"
        erpSession={erpSession}
        onBackToCatalogue={() => { window.location.href = '/'; }}
      />

      <main className="mx-auto max-w-5xl px-4 py-8">
        <button type="button" onClick={onBack} className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          ERP
        </button>

        <section className="mb-6 rounded-[2rem] bg-gradient-to-br from-gray-950 to-slate-800 p-6 text-white shadow-xl">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/10 p-3">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-300">ERP Utilities</p>
              <h2 className="mt-1 text-2xl font-black">Company setup tools</h2>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {utilities.map(item => {
            const Icon = item.icon;
            const locked = item.requiresCompleteAccess && !canManageUsers;
            return (
              <button
                key={item.title}
                type="button"
                disabled={locked}
                onClick={() => {
                  if (!locked) window.location.href = item.href;
                }}
                className={`rounded-3xl border bg-white p-5 text-left shadow-sm transition ${
                  locked
                    ? 'cursor-not-allowed border-gray-100 opacity-60'
                    : 'border-gray-100 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg'
                }`}
              >
                <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-700 w-fit">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-xl font-black text-gray-950">{item.title}</h3>
                <p className="mt-2 text-sm font-medium text-gray-500">{item.description}</p>
                {locked && (
                  <p className="mt-3 text-xs font-bold text-amber-700">Complete Access required</p>
                )}
              </button>
            );
          })}
        </section>
      </main>
    </div>
  );
};
