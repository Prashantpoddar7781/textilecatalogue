import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle, IndianRupee, Loader2, Plus, ScanLine, Trash2, X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { customersApi, designsApi, ordersApi } from '../services/api';
import { Customer, TextileDesign } from '../types';

interface ScannedOrderLine {
  design: TextileDesign;
  quantity: string;
  remarks: string;
}

interface Props {
  initialDesignId?: string;
  onClose?: () => void;
  onCreated?: () => void;
}

const toDesign = (response: any): TextileDesign => ({
  id: response.id,
  name: response.name || 'Untitled Design',
  image: response.image,
  designCode: response.designCode || undefined,
  basePrice: response.basePrice || response.retailPrice || 0,
  wholesalePrice: response.wholesalePrice || response.basePrice || 0,
  retailPrice: response.retailPrice || response.basePrice || 0,
  fabric: response.fabric || 'N/A',
  description: response.description || '',
  createdAt: Date.now()
});

const extractDesignIdFromScan = (value: string) => {
  const trimmed = value.trim();
  const match = trimmed.match(/\/barcode\/([^/?#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return trimmed;
};

function BarcodeScanner({
  onScan,
  onError
}: {
  onScan: (value: string) => void;
  onError: (message: string) => void;
}) {
  const elementId = useMemo(() => `qr-reader-${Math.random().toString(36).slice(2)}`, []);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    let started = false;
    let disposed = false;

    try {
      const scanner = new Html5Qrcode(elementId);
      scannerRef.current = scanner;
      handledRef.current = false;

      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        decodedText => {
          if (handledRef.current) return;
          handledRef.current = true;
          onScan(decodedText);
        },
        () => undefined
      ).then(() => {
        started = true;
        if (disposed) {
          scanner.stop()
            .catch(() => undefined)
            .finally(() => {
              try {
                scanner.clear();
              } catch {
                // Scanner may already be cleared by the library.
              }
            });
        }
      }).catch(err => {
        onError(err?.message || 'Could not start camera. Please allow camera permission.');
        try {
          scanner.clear();
        } catch {
          // Ignore cleanup errors so scanner UI never crashes the page.
        }
      });
    } catch (err: any) {
      onError(err?.message || 'Scanner is not available on this device/browser.');
    }

    return () => {
      disposed = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (!scanner) return;

      const clearScanner = () => {
        try {
          scanner.clear();
        } catch {
          // Ignore cleanup errors so React cleanup cannot blank the screen.
        }
      };

      if (started) {
        scanner.stop().catch(() => undefined).finally(clearScanner);
      } else {
        clearScanner();
      }
    };
  }, [elementId, onError, onScan]);

  return <div id={elementId} className="min-h-[320px] overflow-hidden rounded-2xl border border-gray-200 bg-black" />;
}

export const BarcodeOrderBuilder: React.FC<Props> = ({ initialDesignId, onClose, onCreated }) => {
  const [lines, setLines] = useState<ScannedOrderLine[]>([]);
  const [currentDesign, setCurrentDesign] = useState<TextileDesign | null>(null);
  const [currentQuantity, setCurrentQuantity] = useState('1');
  const [currentRemarks, setCurrentRemarks] = useState('');
  const [scannerOpen, setScannerOpen] = useState(!initialDesignId);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [loadingDesign, setLoadingDesign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadCustomers = useCallback(async () => {
    try {
      const response = await customersApi.getAll();
      setCustomers(response.customers || []);
    } catch {
      setCustomers([]);
    }
  }, []);

  const loadDesign = useCallback(async (designId: string) => {
    try {
      setLoadingDesign(true);
      setError(null);
      const response = await designsApi.getPublicById(designId);
      setCurrentDesign(toDesign(response));
      setCurrentQuantity('1');
      setCurrentRemarks('');
      setScannerOpen(false);
      setCheckoutOpen(false);
    } catch (err: any) {
      setError(err.message || 'Design not found for this barcode.');
      setScannerOpen(true);
    } finally {
      setLoadingDesign(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (initialDesignId) {
      void loadDesign(initialDesignId);
    }
  }, [initialDesignId, loadDesign]);

  const addCurrentLine = () => {
    if (!currentDesign) return false;
    const quantity = parseInt(currentQuantity, 10);
    if (!Number.isFinite(quantity) || quantity < 1) {
      alert('Please enter a valid quantity.');
      return false;
    }
    setLines(prev => [
      ...prev,
      {
        design: currentDesign,
        quantity: String(quantity),
        remarks: currentRemarks.trim()
      }
    ]);
    setCurrentDesign(null);
    setCurrentQuantity('1');
    setCurrentRemarks('');
    return true;
  };

  const saveAndScanMore = () => {
    if (!addCurrentLine()) return;
    setScannerOpen(true);
  };

  const goToCheckout = () => {
    if (currentDesign && !addCurrentLine()) return;
    setCheckoutOpen(true);
    setScannerOpen(false);
  };

  const submitOrder = async () => {
    if (lines.length === 0) {
      alert('Scan at least one design first.');
      return;
    }
    if (!selectedCustomerId && !customerName.trim()) {
      alert('Please enter customer name or select a customer.');
      return;
    }

    setSubmitting(true);
    try {
      await ordersApi.createManual({
        kind: 'design',
        ...(selectedCustomerId
          ? { customerId: selectedCustomerId }
          : { customer: { organizationName: customerName.trim() } }),
        orderNumber: orderNumber.trim() || undefined,
        lines: lines.map(line => ({
          designId: line.design.id,
          quantity: parseInt(line.quantity, 10),
          remarks: line.remarks || undefined
        }))
      });
      onCreated?.();
      if (onClose) onClose();
      else window.location.href = '/orders';
    } catch (err: any) {
      alert(err.message || 'Could not create scanned order.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleScanValue = useCallback((value: string) => {
    void loadDesign(extractDesignIdFromScan(value));
  }, [loadDesign]);

  const handleScannerError = useCallback((message: string) => {
    setError(message);
  }, []);

  const wrapperClass = onClose
    ? 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4'
    : 'min-h-screen bg-gray-100 p-4 flex items-center justify-center';

  return (
    <div className={wrapperClass}>
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[min(94vh,760px)] overflow-hidden flex flex-col">
        <div className="shrink-0 px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-gray-900">Scan order</h2>
            <p className="text-xs text-gray-500">{lines.length} design{lines.length === 1 ? '' : 's'} added</p>
          </div>
          {onClose ? (
            <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
              <X className="w-5 h-5" />
            </button>
          ) : (
            <button type="button" onClick={() => { window.location.href = '/orders'; }} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          {loadingDesign ? (
            <div className="py-12 text-center text-gray-500">
              <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-indigo-600" />
              Loading design...
            </div>
          ) : checkoutOpen ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 space-y-2">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Designs in this order</p>
                {lines.map((line, idx) => (
                  <div key={`${line.design.id}-${idx}`} className="flex items-center gap-3 rounded-xl bg-white p-2 border border-gray-100">
                    <img src={line.design.image} alt={line.design.name} className="w-12 h-12 object-cover rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 truncate">{line.design.designCode || line.design.name}</p>
                      <p className="text-xs text-gray-500">Qty: {line.quantity}{line.remarks ? ` • ${line.remarks}` : ''}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-xl"
                      aria-label="Remove design"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Customer name *</label>
                <select
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={selectedCustomerId}
                  onChange={e => {
                    setSelectedCustomerId(e.target.value);
                    if (e.target.value) setCustomerName('');
                  }}
                >
                  <option value="">Add new customer / enter name below</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>{customer.organizationName}</option>
                  ))}
                </select>
                {!selectedCustomerId && (
                  <input
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Customer name"
                  />
                )}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Manual order number</label>
                <input
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={orderNumber}
                  onChange={e => setOrderNumber(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
          ) : currentDesign ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white shadow-sm">
                <img src={currentDesign.image} alt={currentDesign.name} className="w-full aspect-[3/4] object-cover bg-gray-100" />
                <div className="p-4 space-y-3">
                  <div>
                    <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Scanned design</p>
                    <h3 className="text-xl font-black text-gray-900">{currentDesign.name}</h3>
                    <p className="text-sm text-gray-500">Design No: <span className="font-semibold text-gray-700">{currentDesign.designCode || currentDesign.id}</span></p>
                  </div>
                  <div className="flex items-center gap-1 text-xl font-black text-gray-900">
                    <IndianRupee className="w-5 h-5" />
                    {(currentDesign.basePrice || currentDesign.retailPrice || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-gray-600">Quantity *</label>
                      <input
                        type="number"
                        min={1}
                        className="mt-1 w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                        value={currentQuantity}
                        onChange={e => setCurrentQuantity(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-600">Remarks</label>
                      <input
                        className="mt-1 w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        value={currentRemarks}
                        onChange={e => setCurrentRemarks(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : scannerOpen ? (
            <div className="space-y-3">
              <BarcodeScanner
                onScan={handleScanValue}
                onError={handleScannerError}
              />
              <p className="text-xs text-gray-500 text-center">Point the camera at a ThreadX design barcode.</p>
            </div>
          ) : (
            <div className="py-8 text-center">
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white"
              >
                <ScanLine className="w-5 h-5" />
                Start scanner
              </button>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t bg-gray-50 p-4 flex flex-col sm:flex-row gap-2">
          {checkoutOpen ? (
            <>
              <button type="button" onClick={() => { setCheckoutOpen(false); setScannerOpen(true); }} className="flex-1 rounded-xl border border-gray-200 bg-white py-3 font-bold text-gray-700">
                Scan more
              </button>
              <button type="button" onClick={submitOrder} disabled={submitting} className="flex-1 rounded-xl bg-green-600 py-3 font-bold text-white disabled:opacity-50">
                {submitting ? 'Saving...' : 'Save & complete order'}
              </button>
            </>
          ) : currentDesign ? (
            <>
              <button type="button" onClick={saveAndScanMore} className="flex-1 rounded-xl border border-indigo-200 bg-white py-3 font-bold text-indigo-700">
                Save design & scan more
              </button>
              <button type="button" onClick={goToCheckout} className="flex-1 rounded-xl bg-green-600 py-3 font-bold text-white">
                Save & complete order
              </button>
            </>
          ) : (
            <>
              {lines.length > 0 && (
                <button type="button" onClick={() => setCheckoutOpen(true)} className="flex-1 rounded-xl bg-green-600 py-3 font-bold text-white">
                  Continue to order details
                </button>
              )}
              <button type="button" onClick={() => setScannerOpen(true)} className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold text-white inline-flex items-center justify-center gap-2">
                <Camera className="w-4 h-4" />
                Scan barcode
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
