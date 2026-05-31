import React, { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import QRCode from 'qrcode';
import { TextileDesign } from '../types';
import { getBarcodeUrl } from '../services/appUrl';
import { buildBarcodeDownloadImage } from '../services/barcodeImage';
import { downloadDataUrl } from '../services/nativeApp';

interface Props {
  design: TextileDesign;
}

export const DesignBarcode: React.FC<Props> = ({ design }) => {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  const designNumberLabel = design.designCode?.trim() || design.name || design.id;
  const barcodeValue = useMemo(
    () => getBarcodeUrl(design.id),
    [design.id]
  );

  useEffect(() => {
    let isMounted = true;
    QRCode.toDataURL(barcodeValue, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M'
    }).then((dataUrl) => {
      if (isMounted) setQrDataUrl(dataUrl);
    }).catch(() => {
      if (isMounted) setQrDataUrl('');
    });
    return () => {
      isMounted = false;
    };
  }, [barcodeValue]);

  const handleDownload = async () => {
    if (!qrDataUrl || downloading) return;
    const safeName = (design.name || design.id).replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    setDownloading(true);
    try {
      const labelledImage = await buildBarcodeDownloadImage(
        qrDataUrl,
        designNumberLabel,
        design.catalogueName
      );
      await downloadDataUrl(labelledImage, `${safeName || 'design'}-barcode.png`);
    } catch (error) {
      console.error(error);
      alert('Could not download barcode. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Barcode</p>
      <div className="bg-white border border-gray-200 rounded-lg p-2 flex justify-center">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt={`Barcode for ${design.name || 'design'}`} className="w-20 h-20 object-contain" />
        ) : (
          <div className="w-20 h-20 bg-gray-100 rounded animate-pulse" />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] text-gray-500 truncate">
          Design No: <span className="font-semibold text-gray-700">{designNumberLabel}</span>
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void handleDownload();
          }}
          disabled={!qrDataUrl || downloading}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
          title="Download barcode"
        >
          <Download className="w-3 h-3" />
          {downloading ? 'Saving...' : 'Download'}
        </button>
      </div>
    </div>
  );
};
