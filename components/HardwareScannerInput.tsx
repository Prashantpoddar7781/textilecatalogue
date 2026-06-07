import React, { useEffect, useRef } from 'react';

interface Props {
  onScan: (value: string) => void;
  disabled?: boolean;
}

/** Captures USB / wireless barcode scanners that act as a keyboard (type value + Enter). */
export const HardwareScannerInput: React.FC<Props> = ({ onScan, disabled = false }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (disabled) return;
    inputRef.current?.focus();
  }, [disabled]);

  const refocus = () => {
    if (!disabled) {
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      disabled={disabled}
      aria-label="Barcode scanner input"
      className="absolute opacity-0 pointer-events-none h-0 w-0"
      onKeyDown={event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const value = event.currentTarget.value.trim();
        event.currentTarget.value = '';
        if (value) onScan(value);
        refocus();
      }}
      onBlur={refocus}
    />
  );
};
