import React, { useEffect, useRef } from 'react';

interface Props {
  onScan: (value: string) => void;
  disabled?: boolean;
}

/** Captures USB / wireless barcode scanners that act as a keyboard (type value + Enter). */
export const HardwareScannerInput: React.FC<Props> = ({ onScan, disabled = false }) => {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);

  useEffect(() => {
    if (disabled) return;

    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      return element.isContentEditable
        || element.tagName === 'INPUT'
        || element.tagName === 'TEXTAREA'
        || element.tagName === 'SELECT';
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const now = Date.now();
      if (now - lastKeyTimeRef.current > 150) {
        bufferRef.current = '';
      }
      lastKeyTimeRef.current = now;

      if (event.key === 'Enter' || event.key === 'Tab') {
        const value = bufferRef.current.trim();
        bufferRef.current = '';
        if (value) {
          event.preventDefault();
          onScan(value);
        }
        return;
      }

      if (event.key.length === 1) {
        bufferRef.current += event.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [disabled, onScan]);

  return null;
};
