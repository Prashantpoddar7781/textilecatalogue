import React, { useEffect, useState } from 'react';
import { ArrowLeft, Download, FileText, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { invoicesApi } from '../services/api';
import { downloadGstInvoicePdf, shareGstInvoicePdf } from '../services/gstInvoicePdf';
import { SalesInvoice } from '../types';

interface Props {
  onBack: () => void;
}

const formatMoney = (value: number) =>
  (Number(value) || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export const InvoicesPage: React.FC<Props> = ({ onBack }) => {
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadInvoices = async () => {
    setLoading(true);
    setError('');
    try {
      const { invoices: fetchedInvoices } = await invoicesApi.getAll();
      setInvoices(fetchedInvoices);
    } catch (err: any) {
      setError(err.message || 'Could not load invoices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInvoices();
  }, []);

  const totals = invoices.reduce(
    (acc, invoice) => ({
      amount: acc.amount + invoice.grandTotal,
      due: acc.due + invoice.amountDue
    }),
    { amount: 0, due: 0 }
  );

  return (
    <div className="min-h-screen bg-[#FDFDFF]">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-lg font-black text-gray-900">GST Invoices</h1>
          <button
            type="button"
            onClick={() => void loadInvoices()}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">Invoices</p>
            <p className="mt-1 text-2xl font-black text-gray-900">{invoices.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">Total Billed</p>
            <p className="mt-1 text-2xl font-black text-gray-900">{formatMoney(totals.amount)}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">Amount Due</p>
            <p className="mt-1 text-2xl font-black text-red-700">{formatMoney(totals.due)}</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6">
          {loading && invoices.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm font-semibold text-gray-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading invoices...
            </div>
          ) : invoices.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-white py-16 text-center">
              <FileText className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm font-bold text-gray-600">No GST invoices yet.</p>
              <p className="mt-1 text-xs text-gray-400">Generate one from an approved or completed order.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {invoices.map(invoice => (
                <div key={invoice.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-gray-900">{invoice.invoiceNumber}</p>
                      <p className="text-xs text-gray-500">{formatDate(invoice.invoiceDate)}</p>
                    </div>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase text-amber-700">
                      {invoice.status}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-gray-600">
                    <p><span className="font-semibold">Customer:</span> {invoice.buyerSnapshot.name || invoice.customer?.organizationName || 'Customer'}</p>
                    {invoice.buyerSnapshot.gstNumber && (
                      <p><span className="font-semibold">GSTIN:</span> {invoice.buyerSnapshot.gstNumber}</p>
                    )}
                    <p><span className="font-semibold">Taxable:</span> {formatMoney(invoice.taxableAmount)}</p>
                    <p><span className="font-semibold">GST:</span> {formatMoney(invoice.totalTaxAmount)}</p>
                    <p className="text-base font-black text-gray-900">Total: {formatMoney(invoice.grandTotal)}</p>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void downloadGstInvoicePdf(invoice)}
                      className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-gray-800 hover:bg-gray-50"
                    >
                      <Download className="h-4 w-4" />
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => void shareGstInvoicePdf(invoice)}
                      className="flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-xs font-black text-green-800 hover:bg-green-100"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Share
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
