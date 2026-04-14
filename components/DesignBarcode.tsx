import React, { useEffect, useMemo, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { Download } from 'lucide-react';
import { TextileDesign } from '../types';

interface Props {
  design: TextileDesign;
}

export const DesignBarcode: React.FC<Props> = ({ design }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const barcodeValue = useMemo(
    () => `${window.location.origin}/barcode/${design.id}`,
    [design.id]
  );

  useEffect(() => {
    if (!svgRef.current) return;

    JsBarcode(svgRef.current, barcodeValue, {
      format: 'CODE128',
      displayValue: false,
      height: 32,
      margin: 0,
      width: 1.25
    });
  }, [barcodeValue]);

  const handleDownload = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const svgText = serializer.serializeToString(svgRef.current);
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (design.name || design.id).replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    link.href = url;
    link.download = `${safeName || 'design'}-barcode.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Barcode</p>
      <div className="bg-white border border-gray-200 rounded-lg p-2">
        <svg ref={svgRef} className="w-full h-10" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] text-gray-400 truncate">{design.name || design.id}</p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDownload();
          }}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-700"
          title="Download barcode"
        >
          <Download className="w-3 h-3" />
          Download
        </button>
      </div>
    </div>
  );
};
