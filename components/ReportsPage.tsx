import React from 'react';
import { ArrowLeft, LineChart, Sparkles, CalendarDays, TrendingUp, Package } from 'lucide-react';

interface Props {
  onBack: () => void;
}

const LAUNCH_DATE = new Date('2026-06-10T00:00:00');
const LAUNCH_LABEL = LAUNCH_DATE.toLocaleDateString('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});

export const ReportsPage: React.FC<Props> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-[#FDFDFF] pb-12">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b px-4 py-3 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </button>
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2 rounded-xl">
              <LineChart className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900">Reports</h1>
              <p className="text-sm text-gray-500">Business insights for your catalogue</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="relative overflow-hidden rounded-3xl border-2 border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-8 sm:p-10 text-center shadow-sm">
          <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-indigo-200/40 blur-2xl" aria-hidden />
          <div className="absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-violet-200/40 blur-2xl" aria-hidden />

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-600 text-white px-4 py-1.5 text-xs font-black uppercase tracking-widest mb-5">
              <Sparkles className="w-4 h-4" />
              Coming soon
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-3">
              Your business dashboard is on the way
            </h2>
            <p className="text-gray-600 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
              ThreadX Reports will turn your designs, orders, and share links into clear insights —
              so you can spot bestsellers, track demand, and grow with confidence.
            </p>
            <p className="text-gray-500 text-sm max-w-lg mx-auto mt-3 leading-relaxed">
              Sales trends, catalogue performance, stock movement, and customer activity — all in one place, built for the textile trade.
            </p>

            <div className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-white/90 px-5 py-3 text-sm font-bold text-indigo-800 shadow-sm">
              <CalendarDays className="w-5 h-5 shrink-0" />
              Launching {LAUNCH_LABEL}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-8">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <TrendingUp className="w-5 h-5 text-emerald-500 mb-3" />
            <h3 className="font-black text-gray-900 text-sm">Sales &amp; revenue</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">See which designs and price points drive the most business.</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <LineChart className="w-5 h-5 text-indigo-500 mb-3" />
            <h3 className="font-black text-gray-900 text-sm">Share link analytics</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">Understand views, opens, and engagement from every catalogue link.</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <Package className="w-5 h-5 text-amber-500 mb-3" />
            <h3 className="font-black text-gray-900 text-sm">Inventory insights</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">Track stock levels and movement so you never miss a reorder moment.</p>
          </div>
        </div>
      </main>
    </div>
  );
};
