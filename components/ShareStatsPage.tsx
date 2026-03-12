import React, { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, Eye, Link2, TrendingUp } from 'lucide-react';
import { shareLinksApi } from '../services/api';

interface Props {
  onBack: () => void;
}

export const ShareStatsPage: React.FC<Props> = ({ onBack }) => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    totalOpens: number;
    mostViewedDesigns: { designId: string; viewCount: number; design: { id: string; name: string | null; image: string; fabric: string } | null }[];
    linksWithOpens: { id: string; token: string; openCount: number }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await shareLinksApi.getStats();
        setStats(data);
      } catch (e: any) {
        setError(e.message || 'Failed to load share statistics');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFDFF] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading share statistics...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen bg-[#FDFDFF] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <p className="text-red-600 font-medium mb-4">{error || 'Something went wrong'}</p>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      </div>
    );
  }

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
              <BarChart3 className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900">Share link analytics</h1>
              <p className="text-sm text-gray-500">See how your shared links and designs perform</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {/* Total opens */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3">
            <Eye className="w-6 h-6 text-indigo-600" />
            <h2 className="text-lg font-bold text-gray-900">Total link opens</h2>
          </div>
          <div className="p-6">
            <p className="text-4xl font-black text-gray-900">{stats.totalOpens}</p>
            <p className="text-sm text-gray-500 mt-1">People have opened your shared links</p>
          </div>
        </section>

        {/* Most viewed designs */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-indigo-600" />
            <h2 className="text-lg font-bold text-gray-900">Most viewed designs</h2>
          </div>
          <div className="p-6">
            {stats.mostViewedDesigns.length === 0 ? (
              <p className="text-gray-500">No design views yet. Views are recorded when someone opens a shared link and scrolls to a design.</p>
            ) : (
              <ul className="space-y-4">
                {stats.mostViewedDesigns.map((item, i) => (
                  <li key={item.designId} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50">
                    <span className="text-lg font-black text-indigo-600 w-8">{i + 1}</span>
                    {item.design?.image && (
                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-200 shrink-0">
                        <img src={item.design.image} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{item.design?.name || 'Untitled design'}</p>
                      {item.design?.fabric && (
                        <p className="text-xs text-gray-500">{item.design.fabric}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-black text-gray-900">{item.viewCount}</p>
                      <p className="text-xs text-gray-500">views</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Opens per link */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3">
            <Link2 className="w-6 h-6 text-indigo-600" />
            <h2 className="text-lg font-bold text-gray-900">Opens per share link</h2>
          </div>
          <div className="p-6">
            {stats.linksWithOpens.length === 0 ? (
              <p className="text-gray-500">No share links yet, or no opens recorded.</p>
            ) : (
              <ul className="space-y-3">
                {stats.linksWithOpens
                  .sort((a, b) => b.openCount - a.openCount)
                  .map((link) => (
                    <li key={link.id} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-gray-50">
                      <code className="text-xs text-gray-600 truncate flex-1 font-mono">
                        …/share/{link.token.slice(0, 12)}…
                      </code>
                      <span className="font-bold text-gray-900 shrink-0">{link.openCount} opens</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
