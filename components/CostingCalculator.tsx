import React, { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CostingJob, CostingMaterial, CostingOtherCost, DesignCostingDetails } from '../types';

interface Props {
  enabled: boolean;
  value: DesignCostingDetails;
  onEnabledChange: (enabled: boolean) => void;
  onChange: (value: DesignCostingDetails) => void;
}

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
  jobType: '',
  rate: 0,
  processDays: 0,
  karigarName: ''
});

const emptyOtherCost = (): CostingOtherCost => ({
  name: '',
  rate: 0
});

export const CostingCalculator: React.FC<Props> = ({ enabled, value, onEnabledChange, onChange }) => {
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
                <input className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Material name" value={m.materialName} onChange={e => updateMaterials(value.materials.map((x, i) => i === idx ? { ...x, materialName: e.target.value } : x))} />
                <input className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Unit (e.g. Meter)" value={m.unit} onChange={e => updateMaterials(value.materials.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))} />
                <input type="number" step="0.01" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Rate" value={m.rate || ''} onChange={e => updateMaterials(value.materials.map((x, i) => i === idx ? { ...x, rate: Number(e.target.value) || 0 } : x))} />
                <input type="number" step="0.01" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Avg. per pcs" value={m.avgPerPcs || ''} onChange={e => updateMaterials(value.materials.map((x, i) => i === idx ? { ...x, avgPerPcs: Number(e.target.value) || 0 } : x))} />
                <input className="col-span-2 px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Supplier name (optional)" value={m.supplierName || ''} onChange={e => updateMaterials(value.materials.map((x, i) => i === idx ? { ...x, supplierName: e.target.value } : x))} />
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
                  <input
                    list="job-type-options"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                    placeholder="Job type"
                    value={j.jobType}
                    onChange={e => updateJobs(value.jobs.map((x, i) => i === idx ? { ...x, jobType: e.target.value } : x))}
                  />
                </div>
                <input type="number" step="0.01" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Rate" value={j.rate || ''} onChange={e => updateJobs(value.jobs.map((x, i) => i === idx ? { ...x, rate: Number(e.target.value) || 0 } : x))} />
                <input type="number" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Process days" value={j.processDays || ''} onChange={e => updateJobs(value.jobs.map((x, i) => i === idx ? { ...x, processDays: Number(e.target.value) || 0 } : x))} />
                <input className="col-span-2 px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Karigar name (optional)" value={j.karigarName || ''} onChange={e => updateJobs(value.jobs.map((x, i) => i === idx ? { ...x, karigarName: e.target.value } : x))} />
                <div className="col-span-2 flex justify-end">
                  <button type="button" className="text-red-600 inline-flex items-center gap-1 text-xs" onClick={() => updateJobs(value.jobs.filter((_, i) => i !== idx))}><Trash2 className="w-3 h-3" /> Remove</button>
                </div>
              </div>
            ))}
            <datalist id="job-type-options">
              {JOB_TYPE_SUGGESTIONS.map(type => <option key={type} value={type} />)}
            </datalist>
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

