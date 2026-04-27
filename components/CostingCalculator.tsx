import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CostingJob, CostingMaterial, CostingOtherCost, DesignCostingDetails } from '../types';

interface Props {
  enabled: boolean;
  value: DesignCostingDetails;
  materialNameOptions?: string[];
  supplierNameOptions?: string[];
  karigarNameOptions?: string[];
  onEnabledChange: (enabled: boolean) => void;
  onChange: (value: DesignCostingDetails) => void;
}

const MATERIAL_UNITS = [
  'Meter',
  'Pcs',
  'Line',
  'Frame',
  'Head',
  'Jutta',
  'Kg',
  'Dozen',
  'Yard',
  'Con',
  'Roll',
  'Num',
  'Packet',
  'Box',
  'Taka',
  'Than',
  'Gram',
  'cm',
  'Set',
  'Gross',
  'Drum',
  'Kali',
  'Can',
  'LTR',
  'Pair',
  'Square Meter',
  'Square feet'
];

const JOB_TYPE_SUGGESTIONS = [
  'Block Print',
  'Bandej & Dying',
  'Bleaching',
  'Charakh',
  'Chikan Work',
  'Colouring',
  'Cutting',
  'Dyeing',
  'Embroidery',
  'Finishing',
  'Handwork',
  'Ironing',
  'Knitting',
  'Lace work',
  'Maandi',
  'Manual Embroidery',
  'Packing',
  'Patch work',
  'Printing',
  'Stitching',
  'Washing',
  'Zari work'
];

const emptyMaterial = (): CostingMaterial => ({
  materialName: '',
  unit: 'Meter',
  rate: 0,
  avgPerPcs: 0,
  supplierName: ''
});

const emptyJob = (): CostingJob => ({
  jobType: JOB_TYPE_SUGGESTIONS[0],
  rate: 0,
  processDays: 0,
  karigarName: ''
});

const emptyOtherCost = (): CostingOtherCost => ({
  name: '',
  rate: 0
});

const normalizeOptions = (options: string[]) => {
  const seen = new Set<string>();
  return options
    .map(name => name.trim())
    .filter(name => {
      if (!name || seen.has(name.toLowerCase())) return false;
      seen.add(name.toLowerCase());
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
};

export const CostingCalculator: React.FC<Props> = ({
  enabled,
  value,
  materialNameOptions = [],
  supplierNameOptions = [],
  karigarNameOptions = [],
  onEnabledChange,
  onChange
}) => {
  const [customMaterialRows, setCustomMaterialRows] = useState<Set<number>>(new Set());
  const [customSupplierRows, setCustomSupplierRows] = useState<Set<number>>(new Set());
  const [customKarigarRows, setCustomKarigarRows] = useState<Set<number>>(new Set());

  const normalizedMaterialOptions = useMemo(() => normalizeOptions(materialNameOptions), [materialNameOptions]);
  const normalizedSupplierOptions = useMemo(() => normalizeOptions(supplierNameOptions), [supplierNameOptions]);
  const normalizedKarigarOptions = useMemo(() => normalizeOptions(karigarNameOptions), [karigarNameOptions]);

  const materialTotal = useMemo(
    () => value.materials.reduce((sum, m) => sum + (Number(m.rate) || 0) * (Number(m.avgPerPcs) || 0), 0),
    [value.materials]
  );
  const jobTotal = useMemo(
    () => value.jobs.reduce((sum, j) => sum + (Number(j.rate) || 0), 0),
    [value.jobs]
  );
  const otherTotal = useMemo(
    () => value.otherCosts.reduce((sum, c) => sum + (Number(c.rate) || 0), 0),
    [value.otherCosts]
  );
  const grandTotal = materialTotal + jobTotal + otherTotal;

  const updateMaterials = (materials: CostingMaterial[]) => onChange({ ...value, materials });
  const updateJobs = (jobs: CostingJob[]) => onChange({ ...value, jobs });
  const updateOtherCosts = (otherCosts: CostingOtherCost[]) => onChange({ ...value, otherCosts });

  const setMaterialRowCustom = (idx: number, isCustom: boolean) => {
    setCustomMaterialRows(prev => {
      const next = new Set(prev);
      if (isCustom) next.add(idx);
      else next.delete(idx);
      return next;
    });
  };

  const setSupplierRowCustom = (idx: number, isCustom: boolean) => {
    setCustomSupplierRows(prev => {
      const next = new Set(prev);
      if (isCustom) next.add(idx);
      else next.delete(idx);
      return next;
    });
  };

  const setKarigarRowCustom = (idx: number, isCustom: boolean) => {
    setCustomKarigarRows(prev => {
      const next = new Set(prev);
      if (isCustom) next.add(idx);
      else next.delete(idx);
      return next;
    });
  };

  return (
    <div className="space-y-3 border border-gray-200 rounded-2xl p-4 bg-white">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Costing Calculator (Optional)</h3>
          <p className="text-xs text-gray-500">Calculate material, job work and other cost per design.</p>
        </div>
        <button
          type="button"
          onClick={() => onEnabledChange(!enabled)}
          className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            enabled ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
          }`}
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {!enabled ? null : (
        <div className="space-y-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Material Information</h4>
              <button type="button" onClick={() => updateMaterials([...value.materials, emptyMaterial()])} className="text-xs text-indigo-600 font-semibold inline-flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Material
              </button>
            </div>
            {value.materials.map((m, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 p-3 rounded-xl border border-gray-100 bg-gray-50">
                <div className="col-span-2 sm:col-span-1 space-y-1">
                  {customMaterialRows.has(idx) || normalizedMaterialOptions.length === 0 || (!!m.materialName && !normalizedMaterialOptions.includes(m.materialName)) ? (
                    <div className="space-y-1">
                      <input
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                        placeholder="New material name"
                        value={m.materialName}
                        onChange={e => updateMaterials(value.materials.map((x, i) => i === idx ? { ...x, materialName: e.target.value } : x))}
                      />
                      {normalizedMaterialOptions.length > 0 && (
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-indigo-600"
                          onClick={() => setMaterialRowCustom(idx, false)}
                        >
                          Choose from previous materials
                        </button>
                      )}
                    </div>
                  ) : (
                    <select
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                      value={normalizedMaterialOptions.includes(m.materialName) ? m.materialName : ''}
                      onChange={e => {
                        if (e.target.value === '__new__') {
                          updateMaterials(value.materials.map((x, i) => i === idx ? { ...x, materialName: '' } : x));
                          setMaterialRowCustom(idx, true);
                          return;
                        }
                        updateMaterials(value.materials.map((x, i) => i === idx ? { ...x, materialName: e.target.value } : x));
                      }}
                    >
                      <option value="" disabled>Select material</option>
                      {normalizedMaterialOptions.map(name => <option key={name} value={name}>{name}</option>)}
                      <option value="__new__">+ Add new material</option>
                    </select>
                  )}
                  <p className="text-[10px] text-gray-500">
                    Select a previous material or type a new one.
                  </p>
                </div>
                <select
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                  value={m.unit || 'Meter'}
                  onChange={e => updateMaterials(value.materials.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))}
                >
                  {MATERIAL_UNITS.includes(m.unit) || !m.unit ? null : <option value={m.unit}>{m.unit}</option>}
                  {MATERIAL_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                </select>
                <input type="number" step="0.01" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Rate" value={m.rate || ''} onChange={e => updateMaterials(value.materials.map((x, i) => i === idx ? { ...x, rate: Number(e.target.value) || 0 } : x))} />
                <input type="number" step="0.01" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Avg. per pcs" value={m.avgPerPcs || ''} onChange={e => updateMaterials(value.materials.map((x, i) => i === idx ? { ...x, avgPerPcs: Number(e.target.value) || 0 } : x))} />
                <div className="col-span-2 space-y-1">
                  {customSupplierRows.has(idx) || normalizedSupplierOptions.length === 0 || (!!m.supplierName && !normalizedSupplierOptions.includes(m.supplierName)) ? (
                    <div className="space-y-1">
                      <input
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                        placeholder="Supplier name (optional)"
                        value={m.supplierName || ''}
                        onChange={e => updateMaterials(value.materials.map((x, i) => i === idx ? { ...x, supplierName: e.target.value } : x))}
                      />
                      {normalizedSupplierOptions.length > 0 && (
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-indigo-600"
                          onClick={() => setSupplierRowCustom(idx, false)}
                        >
                          Choose from previous suppliers
                        </button>
                      )}
                    </div>
                  ) : (
                    <select
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                      value={normalizedSupplierOptions.includes(m.supplierName || '') ? m.supplierName : ''}
                      onChange={e => {
                        if (e.target.value === '__new__') {
                          updateMaterials(value.materials.map((x, i) => i === idx ? { ...x, supplierName: '' } : x));
                          setSupplierRowCustom(idx, true);
                          return;
                        }
                        updateMaterials(value.materials.map((x, i) => i === idx ? { ...x, supplierName: e.target.value } : x));
                      }}
                    >
                      <option value="">Select supplier (optional)</option>
                      {normalizedSupplierOptions.map(name => <option key={name} value={name}>{name}</option>)}
                      <option value="__new__">+ Add new supplier</option>
                    </select>
                  )}
                </div>
                <div className="col-span-2 flex justify-between items-center text-xs">
                  <span className="font-semibold text-gray-500">Line total: {(m.rate * m.avgPerPcs).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  <button type="button" className="text-red-600 inline-flex items-center gap-1" onClick={() => updateMaterials(value.materials.filter((_, i) => i !== idx))}><Trash2 className="w-3 h-3" /> Remove</button>
                </div>
              </div>
            ))}
            <p className="text-xs font-semibold text-gray-700">Material Total: ₹{materialTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Job Information</h4>
              <button type="button" onClick={() => updateJobs([...value.jobs, emptyJob()])} className="text-xs text-indigo-600 font-semibold inline-flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Job
              </button>
            </div>
            {value.jobs.map((j, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 p-3 rounded-xl border border-gray-100 bg-gray-50">
                <div className="col-span-2">
                  <select
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                    value={j.jobType || ''}
                    onChange={e => updateJobs(value.jobs.map((x, i) => i === idx ? { ...x, jobType: e.target.value } : x))}
                  >
                    <option value="" disabled>Select job type</option>
                    {JOB_TYPE_SUGGESTIONS.includes(j.jobType) || !j.jobType ? null : <option value={j.jobType}>{j.jobType}</option>}
                    {JOB_TYPE_SUGGESTIONS.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <input type="number" step="0.01" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Rate" value={j.rate || ''} onChange={e => updateJobs(value.jobs.map((x, i) => i === idx ? { ...x, rate: Number(e.target.value) || 0 } : x))} />
                <input type="number" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Process days" value={j.processDays || ''} onChange={e => updateJobs(value.jobs.map((x, i) => i === idx ? { ...x, processDays: Number(e.target.value) || 0 } : x))} />
                <div className="col-span-2 space-y-2">
                  {customKarigarRows.has(idx) || (!!j.karigarName && !normalizedKarigarOptions.includes(j.karigarName)) ? (
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-indigo-100 bg-white p-3">
                      <div className="col-span-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Add Karigar</p>
                        {normalizedKarigarOptions.length > 0 && (
                          <button
                            type="button"
                            className="text-[10px] font-semibold text-indigo-600"
                            onClick={() => setKarigarRowCustom(idx, false)}
                          >
                            Choose existing
                          </button>
                        )}
                      </div>
                      <input
                        required={customKarigarRows.has(idx)}
                        className="col-span-2 px-3 py-2 rounded-lg border border-gray-200 text-sm"
                        placeholder="Full name *"
                        value={j.karigarName || ''}
                        onChange={e => updateJobs(value.jobs.map((x, i) => i === idx ? { ...x, karigarName: e.target.value } : x))}
                      />
                      <input
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                        placeholder="GST number (optional)"
                        value={j.karigarGstNumber || ''}
                        onChange={e => updateJobs(value.jobs.map((x, i) => i === idx ? { ...x, karigarGstNumber: e.target.value } : x))}
                      />
                      <input
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                        placeholder="Mobile number (optional)"
                        value={j.karigarMobileNumber || ''}
                        onChange={e => updateJobs(value.jobs.map((x, i) => i === idx ? { ...x, karigarMobileNumber: e.target.value } : x))}
                      />
                      <input
                        className="col-span-2 px-3 py-2 rounded-lg border border-gray-200 text-sm"
                        placeholder="Karigar's firm name (optional)"
                        value={j.karigarFirmName || ''}
                        onChange={e => updateJobs(value.jobs.map((x, i) => i === idx ? { ...x, karigarFirmName: e.target.value } : x))}
                      />
                      <input
                        className="col-span-2 px-3 py-2 rounded-lg border border-gray-200 text-sm"
                        placeholder="Agent name (optional)"
                        value={j.karigarAgentName || ''}
                        onChange={e => updateJobs(value.jobs.map((x, i) => i === idx ? { ...x, karigarAgentName: e.target.value } : x))}
                      />
                    </div>
                  ) : (
                    <select
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                      value={normalizedKarigarOptions.includes(j.karigarName || '') ? j.karigarName : ''}
                      onChange={e => {
                        if (e.target.value === '__new__') {
                          updateJobs(value.jobs.map((x, i) => i === idx ? {
                            ...x,
                            karigarName: '',
                            karigarGstNumber: '',
                            karigarFirmName: '',
                            karigarMobileNumber: '',
                            karigarAgentName: ''
                          } : x));
                          setKarigarRowCustom(idx, true);
                          return;
                        }
                        updateJobs(value.jobs.map((x, i) => i === idx ? { ...x, karigarName: e.target.value } : x));
                      }}
                    >
                      <option value="">Select karigar (optional)</option>
                      {normalizedKarigarOptions.map(name => <option key={name} value={name}>{name}</option>)}
                      <option value="__new__">+ Add new karigar</option>
                    </select>
                  )}
                </div>
                <div className="col-span-2 flex justify-end">
                  <button type="button" className="text-red-600 inline-flex items-center gap-1 text-xs" onClick={() => updateJobs(value.jobs.filter((_, i) => i !== idx))}><Trash2 className="w-3 h-3" /> Remove</button>
                </div>
              </div>
            ))}
            <p className="text-xs font-semibold text-gray-700">Job Total: ₹{jobTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Other Cost Information</h4>
              <button type="button" onClick={() => updateOtherCosts([...value.otherCosts, emptyOtherCost()])} className="text-xs text-indigo-600 font-semibold inline-flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Other Cost
              </button>
            </div>
            {value.otherCosts.map((c, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 p-3 rounded-xl border border-gray-100 bg-gray-50">
                <input className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Other cost name" value={c.name} onChange={e => updateOtherCosts(value.otherCosts.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} />
                <input type="number" step="0.01" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Rate" value={c.rate || ''} onChange={e => updateOtherCosts(value.otherCosts.map((x, i) => i === idx ? { ...x, rate: Number(e.target.value) || 0 } : x))} />
                <div className="col-span-2 flex justify-end">
                  <button type="button" className="text-red-600 inline-flex items-center gap-1 text-xs" onClick={() => updateOtherCosts(value.otherCosts.filter((_, i) => i !== idx))}><Trash2 className="w-3 h-3" /> Remove</button>
                </div>
              </div>
            ))}
            <p className="text-xs font-semibold text-gray-700">Other Total: ₹{otherTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
          </section>

          <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3">
            <p className="text-xs text-indigo-700 font-semibold">Total Costing</p>
            <p className="text-xl font-black text-indigo-900 mt-0.5">
              ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

