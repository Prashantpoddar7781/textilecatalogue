import React, { useEffect, useState } from 'react';
import { Download, Loader2, MessageCircle, X } from 'lucide-react';
import { invoicesApi } from '../services/api';
import { downloadGstInvoicePdf, shareGstInvoicePdf } from '../services/gstInvoicePdf';
import { BusinessProfile, Order, SalesInvoice } from '../types';

interface Props {
  order: Order;
  onClose: () => void;
  onCreated?: (invoice: SalesInvoice) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export const GenerateInvoiceDialog: React.FC<Props> = ({ order, onClose, onCreated }) => {
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [invoice, setInvoice] = useState<SalesInvoice | null>(null);
  const [profile, setProfile] = useState<Partial<BusinessProfile>>({
    invoicePrefix: 'TX',
    defaultGstRate: 5
  });
  const [form, setForm] = useState({
    invoiceDate: today(),
    placeOfSupply: order.customer?.state || '',
    notes: '',
    defaultHsnCode: '',
    defaultGstRate: '5'
  });

  useEffect(() => {
    let active = true;
    invoicesApi.getProfile()
      .then(({ profile: fetchedProfile }) => {
        if (!active) return;
        setProfile(fetchedProfile);
        setForm(prev => ({
          ...prev,
          defaultHsnCode: fetchedProfile.defaultHsnCode || '',
          defaultGstRate: String(fetchedProfile.defaultGstRate ?? 5),
          placeOfSupply: prev.placeOfSupply || order.customer?.state || ''
        }));
      })
      .catch((err: any) => {
        if (active) setError(err.message || 'Could not load billing profile.');
      })
      .finally(() => {
        if (active) setLoadingProfile(false);
      });
    return () => {
      active = false;
    };
  }, [order.customer?.state]);

  const updateProfileField = (key: keyof BusinessProfile, value: string) => {
    setProfile(prev => ({ ...prev, [key]: value }));
  };

  const generateInvoice = async () => {
    setSaving(true);
    setError('');
    try {
      const defaultGstRate = Number(form.defaultGstRate || profile.defaultGstRate || 5);
      await invoicesApi.updateProfile({
        ...profile,
        defaultHsnCode: form.defaultHsnCode.trim() || profile.defaultHsnCode || null,
        defaultGstRate
      });
      const { invoice: createdInvoice } = await invoicesApi.createFromOrder(order.id, {
        invoiceDate: form.invoiceDate,
        defaultHsnCode: form.defaultHsnCode.trim() || undefined,
        defaultGstRate,
        placeOfSupply: form.placeOfSupply.trim() || undefined,
        notes: form.notes.trim() || undefined
      });
      setInvoice(createdInvoice);
      onCreated?.(createdInvoice);
    } catch (err: any) {
      setError(err.message || 'Could not generate invoice.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-gray-900">Generate GST Invoice</h2>
            <p className="text-xs text-gray-500">Order for {order.buyerName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {invoice ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-black text-green-900">Invoice generated: {invoice.invoiceNumber}</p>
              <p className="mt-1 text-xs text-green-700">
                Total {invoice.grandTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => void downloadGstInvoicePdf(invoice)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-gray-800 shadow-sm"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => void shareGstInvoicePdf(invoice)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white"
                >
                  <MessageCircle className="h-4 w-4" />
                  Share PDF
                </button>
              </div>
            </div>
          ) : loadingProfile ? (
            <div className="flex items-center justify-center py-12 text-sm font-semibold text-gray-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading GST profile...
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <h3 className="text-sm font-black text-gray-900">Seller GST Profile</h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Legal firm name" value={profile.legalName || ''} onChange={e => updateProfileField('legalName', e.target.value)} />
                  <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Trade name" value={profile.tradeName || ''} onChange={e => updateProfileField('tradeName', e.target.value)} />
                  <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Seller GSTIN" value={profile.gstNumber || ''} onChange={e => updateProfileField('gstNumber', e.target.value)} />
                  <input className="rounded-xl border px-3 py-2 text-sm" placeholder="PAN" value={profile.panNumber || ''} onChange={e => updateProfileField('panNumber', e.target.value)} />
                  <input className="rounded-xl border px-3 py-2 text-sm sm:col-span-2" placeholder="Address line 1" value={profile.addressLine1 || ''} onChange={e => updateProfileField('addressLine1', e.target.value)} />
                  <input className="rounded-xl border px-3 py-2 text-sm" placeholder="City" value={profile.city || ''} onChange={e => updateProfileField('city', e.target.value)} />
                  <input className="rounded-xl border px-3 py-2 text-sm" placeholder="State" value={profile.state || ''} onChange={e => updateProfileField('state', e.target.value)} />
                  <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Pincode" value={profile.pincode || ''} onChange={e => updateProfileField('pincode', e.target.value)} />
                  <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Invoice prefix e.g. TX" value={profile.invoicePrefix || 'TX'} onChange={e => updateProfileField('invoicePrefix', e.target.value)} />
                </div>
              </section>

              <section className="rounded-2xl border border-gray-100 bg-white p-4">
                <h3 className="text-sm font-black text-gray-900">Invoice Defaults</h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input className="rounded-xl border px-3 py-2 text-sm" type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} />
                  <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Place of supply / buyer state" value={form.placeOfSupply} onChange={e => setForm(f => ({ ...f, placeOfSupply: e.target.value }))} />
                  <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Default HSN code" value={form.defaultHsnCode} onChange={e => setForm(f => ({ ...f, defaultHsnCode: e.target.value }))} />
                  <input className="rounded-xl border px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="GST rate %" value={form.defaultGstRate} onChange={e => setForm(f => ({ ...f, defaultGstRate: e.target.value }))} />
                  <textarea className="rounded-xl border px-3 py-2 text-sm sm:col-span-2" rows={3} placeholder="Invoice notes / terms" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </section>

              <button
                type="button"
                onClick={generateInvoice}
                disabled={saving}
                className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? 'Generating Invoice...' : 'Generate GST Invoice'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
