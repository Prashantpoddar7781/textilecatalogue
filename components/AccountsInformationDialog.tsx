import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  DEFAULT_CREDITOR_ACCOUNT_TYPE,
  ERP_ACCOUNT_TYPES,
  getAccountType,
  partyRoleForAccountType,
  suggestedAccountTypeForContext
} from '../constants/accountTypes';
import { INDIAN_STATES } from '../constants/creditDebitNoteTypes';
import { partiesApi } from '../services/api';
import { AccountParty } from '../types';

export type PartyEntryContext = 'purchase' | 'expenses' | 'grey' | 'mill' | 'work' | 'sales' | 'other';

interface Props {
  open: boolean;
  initialName?: string;
  context?: PartyEntryContext;
  suggestedAccountType?: string;
  editParty?: AccountParty | null;
  onClose: () => void;
  onSaved: (party: AccountParty) => void;
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-indigo-400';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';

export const AccountsInformationDialog: React.FC<Props> = ({
  open,
  initialName = '',
  context = 'purchase',
  suggestedAccountType,
  editParty = null,
  onClose,
  onSaved
}) => {
  const defaultType = suggestedAccountType
    || editParty?.accountType
    || suggestedAccountTypeForContext(context);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState(initialName);
  const [accountType, setAccountType] = useState(defaultType);
  const [accountGroup, setAccountGroup] = useState('');
  const [graceDays, setGraceDays] = useState('0');
  const [address, setAddress] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [state, setState] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [contactPersonName, setContactPersonName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [remark, setRemark] = useState('');
  const [msmeType, setMsmeType] = useState('');
  const [udyamNumber, setUdyamNumber] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setName(editParty?.name || initialName || '');
    setAccountType(editParty?.accountType || suggestedAccountType || suggestedAccountTypeForContext(context));
    setAccountGroup(editParty?.accountGroup || '');
    setGraceDays(String(editParty?.graceDays ?? 0));
    setAddress(editParty?.address || '');
    setAddressLine2(editParty?.addressLine2 || '');
    setCity(editParty?.city || '');
    setPincode(editParty?.pincode || '');
    setState(editParty?.state || '');
    setBrokerName(editParty?.brokerName || editParty?.agentName || '');
    setContactPersonName(editParty?.contactPersonName || '');
    setMobileNumber(editParty?.mobileNumber || '');
    setPanNumber(editParty?.panNumber || '');
    setGstNumber(editParty?.gstNumber || '');
    setRemark(editParty?.remark || '');
    setMsmeType(editParty?.msmeType || '');
    setUdyamNumber(editParty?.udyamNumber || '');
  }, [open, initialName, context, suggestedAccountType, editParty]);

  const effectOn = useMemo(() => getAccountType(accountType)?.effectOn || 'BALANCE SHEET', [accountType]);
  const role = partyRoleForAccountType(accountType);

  if (!open) return null;

  const save = async () => {
    if (!name.trim()) {
      setError('Party name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        role,
        name: name.trim(),
        accountType,
        accountGroup: accountGroup.trim() || null,
        graceDays: Number(graceDays) || 0,
        address: address.trim() || null,
        addressLine2: addressLine2.trim() || null,
        city: city.trim() || null,
        pincode: pincode.trim() || null,
        state: state.trim() || null,
        brokerName: brokerName.trim() || null,
        agentName: brokerName.trim() || null,
        contactPersonName: contactPersonName.trim() || null,
        mobileNumber: mobileNumber.trim() || null,
        panNumber: panNumber.trim() || null,
        gstNumber: gstNumber.trim() || null,
        remark: remark.trim() || null,
        msmeType: msmeType.trim() || null,
        udyamNumber: udyamNumber.trim() || null
      };
      const result = editParty
        ? await partiesApi.update(editParty.id, { ...payload, role: editParty.role })
        : await partiesApi.create(payload);
      onSaved(result.party);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not save party.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-4xl rounded-2xl border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b bg-slate-900 px-4 py-3 text-white">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Masters</p>
            <h2 className="text-sm font-black uppercase tracking-wide">Accounts Information Manager</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {error}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="xl:col-span-2">
              <span className={labelClass}>Name</span>
              <input className={inputClass} value={name} onChange={e => setName(e.target.value)} autoFocus />
            </label>
            <label className="xl:col-span-2">
              <span className={labelClass}>A/C Type</span>
              <select className={inputClass} value={accountType} onChange={e => setAccountType(e.target.value)}>
                {ERP_ACCOUNT_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label} — {type.effectOn}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelClass}>Effect On</span>
              <input className={`${inputClass} bg-slate-50`} value={effectOn} readOnly />
            </label>
            <label>
              <span className={labelClass}>A/C Group</span>
              <input className={inputClass} value={accountGroup} onChange={e => setAccountGroup(e.target.value)} />
            </label>
            <label>
              <span className={labelClass}>Grace Days</span>
              <input className={inputClass} type="number" value={graceDays} onChange={e => setGraceDays(e.target.value)} />
            </label>
            <label>
              <span className={labelClass}>Broker</span>
              <input className={inputClass} value={brokerName} onChange={e => setBrokerName(e.target.value)} />
            </label>
            <label className="md:col-span-2">
              <span className={labelClass}>Address</span>
              <input className={inputClass} value={address} onChange={e => setAddress(e.target.value)} />
            </label>
            <label className="md:col-span-2">
              <span className={labelClass}>Addr. Line 2</span>
              <input className={inputClass} value={addressLine2} onChange={e => setAddressLine2(e.target.value)} />
            </label>
            <label>
              <span className={labelClass}>City</span>
              <input className={inputClass} value={city} onChange={e => setCity(e.target.value)} />
            </label>
            <label>
              <span className={labelClass}>PIN</span>
              <input className={inputClass} value={pincode} onChange={e => setPincode(e.target.value)} />
            </label>
            <label>
              <span className={labelClass}>State</span>
              <select className={inputClass} value={state} onChange={e => setState(e.target.value)}>
                <option value="">Select</option>
                {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              <span className={labelClass}>Contact Person</span>
              <input className={inputClass} value={contactPersonName} onChange={e => setContactPersonName(e.target.value)} />
            </label>
            <label>
              <span className={labelClass}>Mobile</span>
              <input className={inputClass} value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} />
            </label>
            <label>
              <span className={labelClass}>PAN No.</span>
              <input className={inputClass} value={panNumber} onChange={e => setPanNumber(e.target.value)} />
            </label>
            <label>
              <span className={labelClass}>GSTIN</span>
              <input className={inputClass} value={gstNumber} onChange={e => setGstNumber(e.target.value)} />
            </label>
            <label>
              <span className={labelClass}>MSME Type</span>
              <input className={inputClass} value={msmeType} onChange={e => setMsmeType(e.target.value)} />
            </label>
            <label>
              <span className={labelClass}>Udyam Aadhar No.</span>
              <input className={inputClass} value={udyamNumber} onChange={e => setUdyamNumber(e.target.value)} />
            </label>
            <label className="md:col-span-2 xl:col-span-4">
              <span className={labelClass}>Remark</span>
              <input className={inputClass} value={remark} onChange={e => setRemark(e.target.value)} />
            </label>
          </div>

          <p className="text-xs text-gray-500">
            Saves as <span className="font-bold text-slate-800">{role === 'customer' ? 'Customer (Debtor)' : 'Supplier (Creditor)'}</span>
            {' '}· Default type when blank: {DEFAULT_CREDITOR_ACCOUNT_TYPE} / DEBTORS FOR GOODS
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-slate-50 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-xl border bg-white px-4 py-2 text-xs font-black uppercase text-slate-700">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Party
          </button>
        </div>
      </div>
    </div>
  );
};

/** Confirm + open Accounts Information Manager when a new party name is typed. */
interface PromptProps {
  open: boolean;
  partyName: string;
  onYes: () => void;
  onNo: () => void;
}

export const AddPartyConfirmDialog: React.FC<PromptProps> = ({ open, partyName, onYes, onNo }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-5 shadow-2xl">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">New party</p>
        <h3 className="mt-1 text-base font-black text-slate-900">
          Do you want to add this party name?
        </h3>
        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-indigo-800">
          {partyName}
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Yes opens Accounts Information Manager (A/C Type, address, GSTIN, etc.).
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onNo} className="rounded-xl border bg-white px-4 py-2 text-xs font-black uppercase text-slate-700">
            No
          </button>
          <button type="button" onClick={onYes} className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-black uppercase text-white">
            Yes
          </button>
        </div>
      </div>
    </div>
  );
};
