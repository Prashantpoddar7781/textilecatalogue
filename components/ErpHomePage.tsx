import React from 'react';
import { ArrowLeft, Banknote, Boxes, FileText, PackageCheck, ReceiptText, Truck } from 'lucide-react';

interface Props {
  onBack: () => void;
  user?: { name?: string; email?: string; firmName?: string } | null;
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
    description: 'Enter bank payments and receipts, then link them to bills.',
    icon: Banknote,
    href: '/erp/bank',
    status: 'Build today'
  },
  {
    title: 'Grey Dispatch',
    description: 'Track grey fabric sent out for processing.',
    icon: Truck,
    href: '#',
    status: 'Coming next'
  },
  {
    title: 'Grey Receipts',
    description: 'Track grey fabric received back from processing.',
    icon: PackageCheck,
    href: '#',
    status: 'Coming next'
  },
  {
    title: 'Misc Work Dispatch / Receipt',
    description: 'Job-work movement for dyeing, finishing, embroidery, and other processes.',
    icon: Boxes,
    href: '#',
    status: 'Coming next'
  }
];

export const ErpHomePage: React.FC<Props> = ({ onBack, user }) => {
  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            Catalogue
          </button>
          <h1 className="text-lg font-black text-gray-900">ThreadX ERP</h1>
          <button
            type="button"
            onClick={() => { window.location.href = '/'; }}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700"
          >
            Home
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <section className="rounded-[2rem] bg-gradient-to-br from-gray-950 to-indigo-950 p-6 text-white shadow-xl md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-200">Computer ERP Dashboard</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
            {user?.firmName || user?.name || 'Your business'} control room
          </h2>
          <p className="mt-3 max-w-2xl text-sm font-medium text-indigo-100 md:text-base">
            Use this on computer as an installable ERP while mobile stays linked for scanning, catalogue sharing, and order creation.
          </p>
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
                      : section.status.includes('ready') || section.status === 'Started'
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
