import React, { useEffect, useState } from 'react';
import { salesOrdersApi } from '../services/api';

export type ItemFieldOptions = {
  packing: string[];
  greyQuality: string[];
  type: string[];
  itemType: string[];
  screenSeries: string[];
  category: string[];
  unit: string[];
};

const EMPTY_OPTIONS: ItemFieldOptions = {
  packing: [],
  greyQuality: [],
  type: ['FINISH', 'GREY'],
  itemType: [],
  screenSeries: [],
  category: [],
  unit: []
};

const DROPDOWN_KEY: Record<string, keyof ItemFieldOptions> = {
  packing: 'packing',
  greyQuality: 'greyQuality',
  finishType: 'type',
  itemType: 'itemType',
  screenSeries: 'screenSeries',
  category: 'category',
  unit: 'unit'
};

const NUMBER_FIELDS = new Set(['cut', 'sellingRate', 'rate2', 'rate3', 'workCut', 'gstRate']);

let cached: ItemFieldOptions | null = null;
let pending: Promise<ItemFieldOptions> | null = null;

export function useItemFieldOptions() {
  const [options, setOptions] = useState<ItemFieldOptions>(cached || EMPTY_OPTIONS);
  useEffect(() => {
    if (cached) {
      setOptions(cached);
      return;
    }
    pending = pending || salesOrdersApi.getItemOptions()
      .then(result => {
        cached = { ...EMPTY_OPTIONS, ...result.options };
        return cached;
      })
      .catch(() => EMPTY_OPTIONS);
    void pending.then(setOptions);
  }, []);
  return options;
}

export const QualityFieldControl: React.FC<{
  field: string;
  value: string | number;
  options: ItemFieldOptions;
  className: string;
  onChange: (value: string | number) => void;
}> = ({ field, value, options, className, onChange }) => {
  const optionKey = DROPDOWN_KEY[field];
  if (!optionKey) {
    const numeric = NUMBER_FIELDS.has(field);
    return (
      <input
        className={className}
        type={numeric ? 'number' : 'text'}
        value={value}
        onChange={e => onChange(numeric ? (Number(e.target.value) || 0) : e.target.value)}
      />
    );
  }
  const current = String(value || '');
  const choices = options[optionKey] || [];
  const list = current && !choices.some(name => name.toLowerCase() === current.toLowerCase())
    ? [current, ...choices]
    : choices;
  return (
    <select className={className} value={current} onChange={e => onChange(e.target.value)}>
      <option value=""></option>
      {list.map(name => <option key={name} value={name}>{name}</option>)}
    </select>
  );
};
