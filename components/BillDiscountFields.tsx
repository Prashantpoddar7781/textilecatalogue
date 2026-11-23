import React, { useEffect, useMemo, useRef, useState } from 'react';

type DiscLine = {
  discountPercent?: number | null;
  amount?: number | null;
  pcs?: number | null;
};

/** The percent shared by every filled line. Null when the lines differ. */
export function sharedDiscountPercent(lines: DiscLine[]): number | null {
  const rows = lines.filter(line => (Number(line.amount) || 0) > 0.0001 || (Number(line.pcs) || 0) > 0.0001);
  if (!rows.length) return 0;
  const first = Number(rows[0].discountPercent) || 0;
  return rows.every(line => Math.abs((Number(line.discountPercent) || 0) - first) < 0.001) ? first : null;
}

const toNum = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * One Disc % under the lines. Typing 5 puts 5% on every item,
 * so the bill total is reduced once instead of on each row.
 */
export const BillDiscountFields: React.FC<{
  lines: DiscLine[];
  discountAmount: number;
  labelClass: string;
  inputClass: string;
  readonlyClass: string;
  onPercent: (percent: number) => void;
}> = ({ lines, discountAmount, labelClass, inputClass, readonlyClass, onPercent }) => {
  const shared = useMemo(() => sharedDiscountPercent(lines), [lines]);
  const focused = useRef(false);
  const [text, setText] = useState('');

  useEffect(() => {
    if (focused.current) return;
    setText(shared == null ? '' : (shared ? String(shared) : ''));
  }, [shared]);

  return (
    <>
      <label>
        <span className={labelClass}>Disc %</span>
        <input
          className={inputClass}
          type="number"
          step="0.01"
          value={text}
          placeholder={shared == null ? 'Mixed — type one % for every item' : 'One % for the whole bill'}
          onFocus={() => { focused.current = true; }}
          onChange={e => {
            const next = e.target.value;
            setText(next);
            onPercent(toNum(next));
          }}
          onBlur={() => {
            focused.current = false;
            const pct = toNum(text);
            setText(pct ? String(pct) : '');
          }}
        />
      </label>
      <label>
        <span className={labelClass}>Discount</span>
        <input className={readonlyClass} value={discountAmount.toFixed(2)} readOnly />
      </label>
    </>
  );
};
