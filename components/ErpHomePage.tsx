import React, { useState } from 'react';
import { Banknote, BookOpen, Boxes, ChevronDown, FileText, Package, PackageCheck, ReceiptText, Truck } from 'lucide-react';
import { ADDITIONAL_ERP_FEATURES } from '../constants/creditDebitNoteTypes';
import { accessLevelLabel } from '../services/erpSession';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  user?: { name?: string; email?: string; firmName?: string } | null;
  erpSession?: ErpSession | null;
}

const sections = [
  {
    title: 'Sales',
    description: 'Sales entries with type heads, customer billing, and outstanding.',
    icon: ReceiptText,
    href: '/erp/sales',
    status: 'Demo ready'
  },
  {
    title: 'Purchase',
    description: 'Purchase entries with type heads, supplier bills, and ledger.',
    icon: FileText,
    href: '/erp/purchase',
    status: 'Demo ready'
  },
  {
    title: 'Bank Payment / Receipts',
    description: 'Enter bank payments and receipts, then link them to bills and notes.',
    icon: Banknote,
    href: '/erp/bank',
    status: 'Build today'
  },
  {
    title: 'Account Ledgers',
    description: 'Customer and supplier ledgers synced from sales, purchases, bank, and notes.',
    icon: BookOpen,
    href: '/erp/ledger',
    status: 'Demo ready'
  },
  {
    title: 'Grey Purchase',
    description: 'Grey purchase entry with party GST, disc, taxable, CGST/SGST or IGST, and net amount.',
    icon: Package,
    href: '/erp/grey-purchase',
    status: 'Ready'
  },
  {
    title: 'Grey Dispatch',
    description: 'Dispatch grey fabric to mill for processing with pur sr and taka selection.',
    icon: Truck,
    href: '/erp/grey-dispatch',
    status: 'Ready'
  },
  {
    title: 'Mill / Grey Receipt',
    description: 'Receive processed fabric from mill — lot no, despatch pick, taka details, job work bill.',
    icon: PackageCheck,
    href: '/erp/mill-receipt',
    status: 'Ready'
  },
  {
    title: 'Misc Work Dispatch / Receipt',
    description: 'Job-work movement for dyeing, finishing, embroidery, and other processes.',
    icon: Boxes,
    href: '#',
    status: 'Coming next'
  }
];

export const ErpHomePage: React.FC<Props> = ({ onBack, user, erpSession }) => {
  const [featuresOpen, setFeaturesOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu
        title="ThreadX ERP"
        erpSession={erpSession}
        showSessionActions
        onBackToCatalogue={onBack}
      />

      <main className="mx-auto max-w-7xl px-4 py-8">
        <section className="rounded-[2rem] bg-gradient-to-br from-gray-950 to-indigo-950 p-6 text-white shadow-xl md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-200">Computer ERP Dashboard</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
            {user?.firmName || user?.name || 'Your business'} control room
          </h2>
          <p className="mt-3 max-w-2xl text-sm font-medium text-indigo-100 md:text-base">
            Use this on computer as an installable ERP while mobile stays linked for scanning, catalogue sharing, and order creation.
          </p>
          {erpSession && (
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-white/10 px-3 py-1.5">
                User: {erpSession.bypass ? 'Owner (direct access)' : erpSession.name}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1.5">
                Access: {accessLevelLabel(erpSession.accessLevel)}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1.5">
                FY: {erpSession.accountingYear}
              </span>
            </div>
          )}
        </section>

        <section className="relative mt-6">
          <button
            type="button"
            onClick={() => setFeaturesOpen(open => !open)}
            className="flex w-full items-center justify-between rounded-2xl border border-indigo-200 bg-white px-5 py-4 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
          >
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Additional Features</p>
              <p className="mt-1 text-sm font-bold text-gray-900">Credit / Debit Notes and more</p>
            </div>
            <ChevronDown className={`h-5 w-5 text-indigo-600 transition ${featuresOpen ? 'rotate-180' : ''}`} />
          </button>
          {featuresOpen && (
            <div className="absolute z-20 mt-2 w-full rounded-2xl border border-gray-100 bg-white p-2 shadow-xl">
              {ADDITIONAL_ERP_FEATURES.map(feature => (
                <button
                  key={feature.href}
                  type="button"
                  onClick={() => { window.location.href = feature.href; }}
                  className="block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-gray-800 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {feature.title}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map(section => {
            const Icon = section.icon;
            const disabled = section.href === '#';
            return (
              <button
                key={section.title}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (!disabled) window.location.href = section.href;
                }}
                className={`group min-h-[190px] rounded-3xl border bg-white p-5 text-left shadow-sm transition ${
                  disabled
                    ? 'cursor-not-allowed border-gray-100 opacity-70'
                    : 'border-gray-100 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-700">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                    section.status === 'Build today'
                      ? 'bg-green-50 text-green-700'
                      : section.status.includes('ready') || section.status === 'Started' || section.status === 'Ready'
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'bg-gray-100 text-gray-500'
                  }`}>
                    {section.status}
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-black text-gray-950">{section.title}</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-gray-500">{section.description}</p>
                {!disabled && (
                  <p className="mt-5 text-xs font-black uppercase tracking-wide text-indigo-600 group-hover:text-indigo-800">
                    Open module
                  </p>
                )}
              </button>
            );
          })}
        </section>
      </main>
    </div>
  );
};
