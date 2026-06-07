import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle, IndianRupee, Loader2, Monitor, ScanLine, Trash2, X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { customersApi, designsApi, ordersApi } from '../services/api';
import { extractDesignIdFromScan, prefersHardwareScanner } from '../services/barcodeScan';
import { playScanBeep, playScanErrorBeep } from '../services/scanBeep';
import { downloadOrderSummaryPdf } from '../services/orderSummaryPdf';
import { Customer, TextileDesign } from '../types';
import { HardwareScannerInput } from './HardwareScannerInput';

interface ScannedOrderLine {
  design: TextileDesign;
  quantity: string;
  remarks: string;
}

interface Props {
  initialDesignId?: string;
  stationMode?: boolean;
  firmName?: string;
  onClose?: () => void;
  onCreated?: () => void;
}

const toDesign = (response: any): TextileDesign => ({
  id: response.id,
  name: response.name || 'Untitled Design',
  image: response.image,
  designCode: response.designCode || undefined,
  catalogueName: response.catalogueName || response.catalogue?.name || undefined,
  basePrice: response.basePrice || response.retailPrice || 0,
  wholesalePrice: response.wholesalePrice || response.basePrice || 0,
  retailPrice: response.retailPrice || response.basePrice || 0,
  fabric: response.fabric || 'N/A',
  description: response.description || '',
  createdAt: Date.now()
});

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

export const BarcodeOrderBuilder: React.FC<Props> = ({
  initialDesignId,
  stationMode = false,
  firmName,
  onClose,
  onCreated
}) => {
  const useStationFlow = stationMode || prefersHardwareScanner();
  const [lines, setLines] = useState<ScannedOrderLine[]>([]);
  const [currentDesign, setCurrentDesign] = useState<TextileDesign | null>(null);
  const [currentQuantity, setCurrentQuantity] = useState('1');
  const [currentRemarks, setCurrentRemarks] = useState('');
  const [scanMethod, setScanMethod] = useState<'hardware' | 'camera'>(useStationFlow ? 'hardware' : 'camera');
  const [scannerOpen, setScannerOpen] = useState(!initialDesignId && scanMethod === 'camera');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [loadingDesign, setLoadingDesign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScannedLabel, setLastScannedLabel] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savedOrderSuccess, setSavedOrderSuccess] = useState<{
    customerName: string;
    orderNumber?: string | null;
    designCount: number;
  } | null>(null);

  const resetOrderForm = useCallback(() => {
    setLines([]);
    setCurrentDesign(null);
    setCurrentQuantity('1');
    setCurrentRemarks('');
    setCheckoutOpen(false);
    setScannerOpen(scanMethod === 'camera');
    setSelectedCustomerId('');
    setCustomerName('');
    setOrderNumber('');
    setLastScannedLabel(null);
    setError(null);
  }, [scanMethod]);

  const loadCustomers = useCallback(async () => {
    try {
      const response = await customersApi.getAll();
      setCustomers(response.customers || []);
    } catch {
      setCustomers([]);
    }
  }, []);

  const addDesignToLines = useCallback((design: TextileDesign, incrementIfExists = false) => {
    setLines(prev => {
      const idx = prev.findIndex(line => line.design.id === design.id);
      if (idx >= 0 && incrementIfExists) {
        const next = [...prev];
        const qty = parseInt(next[idx].quantity, 10) + 1;
        next[idx] = { ...next[idx], quantity: String(qty) };
        return next;
      }
      if (idx >= 0) return prev;
      return [...prev, { design, quantity: '1', remarks: '' }];
    });
    setLastScannedLabel(design.designCode || design.name || design.id);
    setError(null);
  }, []);

  const loadDesign = useCallback(async (designId: string, options?: { quickAdd?: boolean }) => {
    try {
      setLoadingDesign(true);
      setError(null);
      const response = await designsApi.getPublicById(designId);
      const design = toDesign(response);

      if (options?.quickAdd || useStationFlow) {
        addDesignToLines(design, true);
        setCurrentDesign(null);
        setScannerOpen(false);
        setCheckoutOpen(false);
        playScanBeep();
        return design;
      }

      playScanBeep();
      setCurrentDesign(design);
      setCurrentQuantity('1');
      setCurrentRemarks('');
      setScannerOpen(false);
      setCheckoutOpen(false);
      return design;
    } catch (err: any) {
      playScanErrorBeep();
      setError(err.message || 'Design not found for this barcode.');
      if (scanMethod === 'camera') setScannerOpen(true);
      return null;
    } finally {
      setLoadingDesign(false);
    }
  }, [addDesignToLines, scanMethod, useStationFlow]);

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
    setScannerOpen(scanMethod === 'camera');
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
      const response = await ordersApi.createManual({
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

      const savedOrder = response.order;
      const customerLabel = savedOrder?.buyerName
        || customers.find(customer => customer.id === selectedCustomerId)?.organizationName
        || customerName.trim();

      downloadOrderSummaryPdf({
        customerName: customerLabel,
        orderNumber: savedOrder?.orderNumber || orderNumber.trim() || null,
        createdAt: savedOrder?.createdAt || new Date().toISOString(),
        firmName: firmName || null,
        orderLines: (savedOrder?.orderLines || lines.map(line => ({
          designCode: line.design.designCode || null,
          designName: line.design.name || null,
          fabric: line.design.fabric || null,
          catalogueName: line.design.catalogueName || null,
          quantity: parseInt(line.quantity, 10),
          basePrice: line.design.basePrice || line.design.retailPrice || 0,
          remarks: line.remarks || null
        }))).map((line: any) => ({
          designCode: line.designCode,
          designName: line.designName,
          fabric: line.fabric,
          catalogueName: line.catalogueName || null,
          quantity: Number(line.quantity) || 0,
          basePrice: line.basePrice || line.retailPrice || 0,
          remarks: line.remarks || null
        }))
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('threadx-orders-updated'));
      }

      if (stationMode) {
        setSavedOrderSuccess({
          customerName: customerLabel,
          orderNumber: savedOrder?.orderNumber || orderNumber.trim() || null,
          designCount: lines.length
        });
        resetOrderForm();
        onCreated?.();
        return;
      }

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
    const designId = extractDesignIdFromScan(value);
    void loadDesign(designId, { quickAdd: useStationFlow || scanMethod === 'hardware' });
  }, [loadDesign, scanMethod, useStationFlow]);

  const handleScannerError = useCallback((message: string) => {
    setError(message);
  }, []);

  const updateLineQuantity = (index: number, quantity: string) => {
    setLines(prev => prev.map((line, i) => (i === index ? { ...line, quantity } : line)));
  };

  const updateLineRemarks = (index: number, remarks: string) => {
    setLines(prev => prev.map((line, i) => (i === index ? { ...line, remarks } : line)));
  };

  const wrapperClass = stationMode
    ? 'min-h-screen bg-[#F0F4FF] p-4 md:p-8'
    : onClose
      ? 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4'
      : 'min-h-screen bg-gray-100 p-4 flex items-center justify-center';

  const panelClass = stationMode
    ? 'bg-white w-full max-w-6xl mx-auto rounded-3xl shadow-2xl overflow-hidden flex flex-col min-h-[min(92vh,900px)]'
    : 'bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[min(94vh,760px)] overflow-hidden flex flex-col';

  const orderLinesTable = lines.length > 0 ? (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Scanned designs</p>
        <p className="text-xs text-gray-500">Edit quantities below, then complete the order</p>
      </div>
      <div className="space-y-2 max-h-[min(42vh,360px)] overflow-y-auto pr-1">
        {lines.map((line, idx) => (
          <div key={`${line.design.id}-${idx}`} className="grid grid-cols-[56px_1fr_auto_auto_auto] sm:grid-cols-[56px_1.4fr_1fr_88px_1fr_auto] gap-2 items-center rounded-xl bg-white p-2 border border-gray-100">
            <img src={line.design.image} alt={line.design.name} className="w-14 h-14 object-cover rounded-lg" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{line.design.designCode || line.design.name}</p>
              <p className="text-[11px] text-gray-500 truncate">{line.design.catalogueName || line.design.fabric}</p>
            </div>
            <div className="hidden sm:block text-xs font-semibold text-gray-700 truncate">{line.design.name}</div>
            <input
              type="number"
              min={1}
              value={line.quantity}
              onChange={e => updateLineQuantity(idx, e.target.value)}
              className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label={`Quantity for ${line.design.name}`}
            />
            <input
              value={line.remarks}
              onChange={e => updateLineRemarks(idx, e.target.value)}
              placeholder="Remarks"
              className="hidden sm:block w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
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
    </div>
  ) : null;

  return (
    <div className={wrapperClass}>
      <div className={panelClass}>
        <div className="shrink-0 px-5 py-4 border-b flex items-center justify-between bg-white">
          <div>
            <h2 className="text-lg font-black text-gray-900">
              {stationMode ? 'Sales office scan station' : 'Scan order'}
            </h2>
            <p className="text-xs text-gray-500">
              {lines.length} design{lines.length === 1 ? '' : 's'} in order
              {stationMode ? ' · USB scanner ready' : ''}
            </p>
          </div>
          {onClose ? (
            <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
              {stationMode ? <ArrowLeft className="w-5 h-5" /> : <X className="w-5 h-5" />}
            </button>
          ) : (
            <button type="button" onClick={() => { window.location.href = '/orders'; }} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          {savedOrderSuccess && stationMode && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-black text-emerald-900">
                Order saved for {savedOrderSuccess.customerName}
              </p>
              <p className="text-sm text-emerald-800 mt-1">
                PDF receipt downloaded. This station is ready for the next client — keep scanning or open another tab for a parallel order.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSavedOrderSuccess(null)}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
                >
                  Start next order here
                </button>
                <a
                  href="/orders"
                  className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-800"
                >
                  View all orders
                </a>
              </div>
            </div>
          )}

          {stationMode && (
            <div className="rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/70 p-4 relative">
              <HardwareScannerInput onScan={handleScanValue} disabled={checkoutOpen || submitting} />
              <div className="flex items-start gap-3">
                <div className="bg-white p-3 rounded-2xl shadow-sm">
                  <Monitor className="w-6 h-6 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="font-black text-gray-900">USB / wireless scanner ready</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Peak season: run 3–4 orders at once — open this page on multiple PCs/phones (or extra browser tabs). Each saved order appears in Orders for your account.
                  </p>
                  <a
                    href="/orders/scan"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs font-bold text-indigo-700 hover:text-indigo-800"
                  >
                    Open another scan station tab
                  </a>
                  {loadingDesign ? (
                    <p className="text-sm text-indigo-700 font-semibold mt-2 inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Reading barcode...
                    </p>
                  ) : lastScannedLabel ? (
                    <p className="text-sm text-emerald-700 font-semibold mt-2 inline-flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Last scanned: {lastScannedLabel}
                    </p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setScanMethod('camera');
                  setScannerOpen(true);
                }}
                className="mt-3 text-xs font-bold text-indigo-700 hover:text-indigo-800"
              >
                Use phone camera instead
              </button>
            </div>
          )}

          {orderLinesTable}

          {loadingDesign && !stationMode ? (
            <div className="py-12 text-center text-gray-500">
              <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-indigo-600" />
              Loading design...
            </div>
          ) : checkoutOpen ? (
            <div className="space-y-4">
              {!stationMode && orderLinesTable}

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
          ) : currentDesign && !useStationFlow ? (
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
          ) : scanMethod === 'hardware' && !stationMode ? (
            <div className="space-y-3 relative rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
              <HardwareScannerInput onScan={handleScanValue} disabled={checkoutOpen || submitting} />
              <p className="text-sm font-bold text-gray-900">USB scanner ready</p>
              <p className="text-xs text-gray-600">Scan a ThreadX barcode. Each scan adds the design to the order list below.</p>
              {lastScannedLabel && (
                <p className="text-xs font-semibold text-emerald-700">Last scanned: {lastScannedLabel}</p>
              )}
              <button
                type="button"
                onClick={() => {
                  setScanMethod('camera');
                  setScannerOpen(true);
                }}
                className="text-xs font-bold text-indigo-700"
              >
                Switch to camera
              </button>
            </div>
          ) : scannerOpen ? (
            <div className="space-y-3">
              <BarcodeScanner onScan={handleScanValue} onError={handleScannerError} />
              <p className="text-xs text-gray-500 text-center">Point the camera at a ThreadX design barcode.</p>
              {useStationFlow && (
                <button
                  type="button"
                  onClick={() => {
                    setScanMethod('hardware');
                    setScannerOpen(false);
                  }}
                  className="w-full text-xs font-bold text-indigo-700"
                >
                  Switch to USB scanner
                </button>
              )}
            </div>
          ) : !stationMode ? (
            <div className="py-8 text-center space-y-3">
              <button
                type="button"
                onClick={() => {
                  if (scanMethod === 'hardware') return;
                  setScannerOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white"
              >
                <ScanLine className="w-5 h-5" />
                {scanMethod === 'hardware' ? 'Scanner ready' : 'Start scanner'}
              </button>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t bg-gray-50 p-4 flex flex-col sm:flex-row gap-2">
          {checkoutOpen ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setCheckoutOpen(false);
                  setScannerOpen(scanMethod === 'camera');
                }}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-3 font-bold text-gray-700"
              >
                Scan more
              </button>
              <button type="button" onClick={submitOrder} disabled={submitting} className="flex-1 rounded-xl bg-green-600 py-3 font-bold text-white disabled:opacity-50">
                {submitting ? 'Saving...' : 'Save & complete order'}
              </button>
            </>
          ) : stationMode ? (
            <>
              <button
                type="button"
                onClick={() => setLines([])}
                disabled={lines.length === 0}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-3 font-bold text-gray-700 disabled:opacity-40"
              >
                Clear list
              </button>
              <button
                type="button"
                onClick={goToCheckout}
                disabled={lines.length === 0}
                className="flex-1 rounded-xl bg-green-600 py-3 font-bold text-white disabled:opacity-40"
              >
                Complete order ({lines.length})
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
              {scanMethod === 'camera' ? (
                <button type="button" onClick={() => setScannerOpen(true)} className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold text-white inline-flex items-center justify-center gap-2">
                  <Camera className="w-4 h-4" />
                  Scan barcode
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setScanMethod('camera')}
                  className="flex-1 rounded-xl border border-indigo-200 bg-white py-3 font-bold text-indigo-700 inline-flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Use camera
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
