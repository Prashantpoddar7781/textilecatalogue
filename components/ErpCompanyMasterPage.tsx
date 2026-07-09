import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Building2, Loader2, Save } from 'lucide-react';
import { invoicesApi } from '../services/api';
import { getCompanyTaxSaveError, isWrongGstNumber, isWrongPanNumber, normalizeGstNumber, normalizePanNumber } from '../services/gstValidation';
import { BusinessProfile } from '../types';
import { ErpTopMenu } from './ErpTopMenu';
import { ErpSession } from '../types';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const COMPANY_TYPES = ['PROPRIETORS', 'PARTNERSHIP', 'PRIVATE LIMITED', 'PUBLIC LIMITED', 'LLP', 'HUF', 'OTHER'];
const MSME_TYPES = ['', 'Micro', 'Small', 'Medium'];

type FormState = {
  companyCode: string;
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  companyType: string;
  companyGroup: string;
  city: string;
  pincode: string;
  email: string;
  mobileNumber: string;
  fax: string;
  phone: string;
  bankAccount: string;
  rtgsAccount: string;
  bankName: string;
  bankIfsc: string;
  businessDescription: string;
  proprietor: string;
  panNumber: string;
  udyamNumber: string;
  tdsAccountNumber: string;
  msmeType: string;
  gstNumber: string;
  state: string;
  tradeName: string;
};

const emptyForm = (): FormState => ({
  companyCode: '',
  legalName: '',
  addressLine1: '',
  addressLine2: '',
  companyType: 'PROPRIETORS',
  companyGroup: '',
  city: '',
  pincode: '',
  email: '',
  mobileNumber: '',
  fax: '',
  phone: '',
  bankAccount: '',
  rtgsAccount: '',
  bankName: '',
  bankIfsc: '',
  businessDescription: '',
  proprietor: '',
  panNumber: '',
  udyamNumber: '',
  tdsAccountNumber: '',
  msmeType: '',
  gstNumber: '',
  state: '',
  tradeName: ''
});

function profileToForm(profile: BusinessProfile): FormState {
  return {
    companyCode: profile.companyCode || '',
    legalName: profile.legalName || '',
    addressLine1: profile.addressLine1 || '',
    addressLine2: profile.addressLine2 || '',
    companyType: profile.companyType || 'PROPRIETORS',
    companyGroup: profile.companyGroup || '',
    city: profile.city || '',
    pincode: profile.pincode || '',
    email: profile.email || '',
    mobileNumber: profile.mobileNumber || '',
    fax: profile.fax || '',
    phone: profile.phone || '',
    bankAccount: profile.bankAccount || '',
    rtgsAccount: profile.rtgsAccount || '',
    bankName: profile.bankName || '',
    bankIfsc: profile.bankIfsc || '',
    businessDescription: profile.businessDescription || '',
    proprietor: profile.proprietor || '',
    panNumber: profile.panNumber || '',
    udyamNumber: profile.udyamNumber || '',
    tdsAccountNumber: profile.tdsAccountNumber || '',
    msmeType: profile.msmeType || '',
    gstNumber: profile.gstNumber || '',
    state: profile.state || '',
    tradeName: profile.tradeName || ''
  };
}

const fieldClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 focus:border-indigo-400 focus:outline-none';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';

export const ErpCompanyMasterPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const gstInvalid = isWrongGstNumber(form.gstNumber, form.panNumber);
  const panInvalid = isWrongPanNumber(form.panNumber);
  const saveBlocked = Boolean(getCompanyTaxSaveError(form.gstNumber, form.panNumber));

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { profile } = await invoicesApi.getProfile();
        if (!cancelled) setForm(profileToForm(profile));
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load company details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const update = (key: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const gstNumber = normalizeGstNumber(form.gstNumber);
      const panNumber = normalizePanNumber(form.panNumber);
      const taxError = getCompanyTaxSaveError(gstNumber, panNumber);
      if (taxError) {
        setError(taxError);
        setSaving(false);
        return;
      }
      await invoicesApi.updateProfile({
        companyCode: form.companyCode.trim() || null,
        legalName: form.legalName.trim() || null,
        tradeName: form.tradeName.trim() || form.legalName.trim() || null,
        addressLine1: form.addressLine1.trim() || null,
        addressLine2: form.addressLine2.trim() || null,
        companyType: form.companyType.trim() || null,
        companyGroup: form.companyGroup.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        pincode: form.pincode.trim() || null,
        email: form.email.trim() || null,
        mobileNumber: form.mobileNumber.trim() || null,
        fax: form.fax.trim() || null,
        phone: form.phone.trim() || null,
        bankAccount: form.bankAccount.trim() || null,
        rtgsAccount: form.rtgsAccount.trim() || null,
        bankName: form.bankName.trim() || null,
        bankIfsc: form.bankIfsc.trim() || null,
        businessDescription: form.businessDescription.trim() || null,
        proprietor: form.proprietor.trim() || null,
        panNumber: panNumber || null,
        udyamNumber: form.udyamNumber.trim() || null,
        tdsAccountNumber: form.tdsAccountNumber.trim() || null,
        msmeType: form.msmeType.trim() || null,
        gstNumber: gstNumber || null
      });
      setForm(prev => ({ ...prev, gstNumber, panNumber }));
      setSaved(true);
    } catch (err: any) {
      setError(err.message || 'Could not save company details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu
        title="Company Information"
        erpSession={erpSession}
        onBackToCatalogue={() => { window.location.href = '/'; }}
      />

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            ERP
          </button>
          <div className="flex items-center gap-2 text-indigo-700">
            <Building2 className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-wide">Masters · Company</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}
        {saved && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            Company details saved.
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading company details...
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-xs font-black uppercase tracking-wide text-gray-900">General Information</h2>
              <div className="grid gap-3 md:grid-cols-6">
                <label className="md:col-span-1">
                  <span className={labelClass}>Code</span>
                  <input className={fieldClass} value={form.companyCode} onChange={e => update('companyCode', e.target.value)} />
                </label>
                <label className="md:col-span-5">
                  <span className={labelClass}>Name</span>
                  <input className={fieldClass} value={form.legalName} onChange={e => update('legalName', e.target.value)} required />
                </label>
                <label className="md:col-span-6">
                  <span className={labelClass}>Address</span>
                  <input className={fieldClass} value={form.addressLine1} onChange={e => update('addressLine1', e.target.value)} />
                </label>
                <label className="md:col-span-6">
                  <span className={labelClass}>Address (Cont.)</span>
                  <input className={fieldClass} value={form.addressLine2} onChange={e => update('addressLine2', e.target.value)} />
                </label>
                <label className="md:col-span-2">
                  <span className={labelClass}>Company Type</span>
                  <select className={fieldClass} value={form.companyType} onChange={e => update('companyType', e.target.value)}>
                    {COMPANY_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label className="md:col-span-2">
                  <span className={labelClass}>Company Group</span>
                  <input className={fieldClass} value={form.companyGroup} onChange={e => update('companyGroup', e.target.value)} />
                </label>
                <label className="md:col-span-2">
                  <span className={labelClass}>State</span>
                  <input className={fieldClass} value={form.state} onChange={e => update('state', e.target.value)} />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-xs font-black uppercase tracking-wide text-gray-900">Contact & Banking</h2>
              <div className="grid gap-3 md:grid-cols-3">
                <label>
                  <span className={labelClass}>City</span>
                  <input className={fieldClass} value={form.city} onChange={e => update('city', e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Pin No.</span>
                  <input className={fieldClass} value={form.pincode} onChange={e => update('pincode', e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Email</span>
                  <input type="email" className={fieldClass} value={form.email} onChange={e => update('email', e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Mobile No.</span>
                  <input className={fieldClass} value={form.mobileNumber} onChange={e => update('mobileNumber', e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Fax</span>
                  <input className={fieldClass} value={form.fax} onChange={e => update('fax', e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Phone Nos.</span>
                  <input className={fieldClass} value={form.phone} onChange={e => update('phone', e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Bank A/C</span>
                  <input className={fieldClass} value={form.bankAccount} onChange={e => update('bankAccount', e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>RTGS A/C</span>
                  <input className={fieldClass} value={form.rtgsAccount} onChange={e => update('rtgsAccount', e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Bank Name / IFSC</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={fieldClass} placeholder="Bank" value={form.bankName} onChange={e => update('bankName', e.target.value)} />
                    <input className={fieldClass} placeholder="IFSC" value={form.bankIfsc} onChange={e => update('bankIfsc', e.target.value)} />
                  </div>
                </label>
                <label className="md:col-span-2">
                  <span className={labelClass}>Business Description</span>
                  <input className={fieldClass} value={form.businessDescription} onChange={e => update('businessDescription', e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>Proprietor</span>
                  <input className={fieldClass} value={form.proprietor} onChange={e => update('proprietor', e.target.value)} />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-xs font-black uppercase tracking-wide text-gray-900">Tax & Registration</h2>
              <div className="grid gap-3 md:grid-cols-3">
                <label>
                  <span className={labelClass}>PAN</span>
                  <input
                    className={`${fieldClass} ${panInvalid ? 'border-amber-400 bg-amber-50' : ''}`}
                    value={form.panNumber}
                    onChange={e => update('panNumber', e.target.value.toUpperCase())}
                    maxLength={10}
                  />
                  {panInvalid && (
                    <span className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-amber-700">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      Wrong PAN number
                    </span>
                  )}
                </label>
                <label>
                  <span className={labelClass}>Udhyam</span>
                  <input className={fieldClass} value={form.udyamNumber} onChange={e => update('udyamNumber', e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>TDS A/C</span>
                  <input className={fieldClass} value={form.tdsAccountNumber} onChange={e => update('tdsAccountNumber', e.target.value)} />
                </label>
                <label>
                  <span className={labelClass}>MSME Type</span>
                  <select className={fieldClass} value={form.msmeType} onChange={e => update('msmeType', e.target.value)}>
                    {MSME_TYPES.map(type => (
                      <option key={type || 'blank'} value={type}>{type || 'Select'}</option>
                    ))}
                  </select>
                </label>
                <label className="md:col-span-2">
                  <span className={labelClass}>GST Number</span>
                  <input
                    className={`${fieldClass} ${gstInvalid ? 'border-amber-400 bg-amber-50' : ''}`}
                    value={form.gstNumber}
                    onChange={e => update('gstNumber', e.target.value.toUpperCase())}
                    maxLength={15}
                    placeholder="15-character GSTIN"
                  />
                  {gstInvalid && (
                    <span className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-amber-700">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      Wrong GST number
                    </span>
                  )}
                </label>
              </div>
            </section>

            <button
              type="submit"
              disabled={saving || saveBlocked}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60 md:w-auto md:px-8"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving...' : 'Save Company Details'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
};
