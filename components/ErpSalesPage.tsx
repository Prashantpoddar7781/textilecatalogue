import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Trash2, X } from 'lucide-react';
import { bankEntriesApi, salesOrdersApi } from '../services/api';
import { Customer, ErpSession, Order, SalesItemMaster, SalesLineItem, SalesOrder } from '../types';
import { DEFAULT_SALES_TRANSACTION_TYPE, ERP_TRANSACTION_TYPES } from '../constants/erpTransactionTypes';
import { ErpFormShell } from './ErpFormShell';
import { ErpSaveButton } from './ErpSaveButton';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const toNum = (v: string | number | undefined | null) => Number(v) || 0;
const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-semibold outline-none focus:border-indigo-400';
const readonlyClass = 'w-full rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-2 text-sm font-semibold';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500';

const blankLine = (lineNo = 1, gstRate = 5, hsnCode = '5407'): SalesLineItem => ({
  lineNo,
  sourceLineNo: lineNo,
  itemName: '',
  bundles: 0,
  mainScreen: '',
  screenName: '',
  packing: 'NAKED',
  unit: 'PCS',
  pcs: 0,
  cut: 0,
  mtsQty: 0,
  rate: 0,
  amount: 0,
  rd: 0,
  discountPercent: 0,
  discountAmount: 0,
  manualAddLess: 0,
  gstRate,
  taxAmount: 0,
  taxableAmount: 0,
  totalAmount: 0,
  hsnCode
});

function calcLine(input: SalesLineItem, businessState: string, partyState: string): SalesLineItem {
  const pcs = toNum(input.pcs);
  const cut = toNum(input.cut);
  const mtsQty = input.mtsQty != null && String(input.mtsQty) !== ''
    ? toNum(input.mtsQty)
    : round2(pcs * cut);
  const rate = toNum(input.rate);
  const amount = round2(pcs * rate);
  const discountAmount = round2(amount * toNum(input.discountPercent) / 100);
  const taxableAmount = round2(amount - discountAmount + toNum(input.manualAddLess));
  const gstRate = toNum(input.gstRate);
  const taxAmount = round2(taxableAmount * gstRate / 100);
  const interState = Boolean(
    businessState.trim()
    && partyState.trim()
    && businessState.trim().toLowerCase() !== partyState.trim().toLowerCase()
  );
  return {
    ...input,
    pcs,
    cut,
    mtsQty,
    rate,
    amount,
    discountAmount,
    taxableAmount,
    taxAmount,
    cgstRate: interState ? 0 : gstRate / 2,
    sgstRate: interState ? 0 : gstRate / 2,
    igstRate: interState ? gstRate : 0,
    cgstAmount: interState ? 0 : round2(taxAmount / 2),
    sgstAmount: interState ? 0 : round2(taxAmount / 2),
    igstAmount: interState ? taxAmount : 0,
    totalAmount: round2(taxableAmount + taxAmount),
    screenName: input.screenName || input.itemName || input.mainScreen || ''
  };
}

const itemDefaults = (mainScreen = '') => ({
  name: mainScreen,
  mainScreen,
  packing: 'NAKED',
  cut: 0,
  greyQuality: '',
  finishType: 'FINISH',
  itemType: 'SAREE',
  screenSeries: '',
  category: '',
  unit: 'PCS',
  sellingRate: 0,
  rate2: 0,
  rate3: 0,
  workCut: 0,
  hsnSac: '5407',
  gstRate: 5,
  remark: ''
});

export const ErpSalesPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const editId = params.get('edit');
  const editKind = params.get('kind') === 'order' ? 'order' : params.get('kind') === 'bill' ? 'bill' : null;
  const typeFromUrl = params.get('type');

  const [transactionType, setTransactionType] = useState(
    typeFromUrl || (editKind === 'order' ? 'SALES ORDERS' : DEFAULT_SALES_TRANSACTION_TYPE)
  );
  const isSalesOrder = transactionType === 'SALES ORDERS';
  const isFinishSales = transactionType.startsWith('FINISH SALES');
  const isEditMode = Boolean(editId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [businessState, setBusinessState] = useState('');
  const [defaultHsnCode, setDefaultHsnCode] = useState('5407');
  const [defaultGstRate, setDefaultGstRate] = useState(5);
  const [nextOrderNo, setNextOrderNo] = useState(1);
  const [typeBillNumber, setTypeBillNumber] = useState<number | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<SalesItemMaster[]>([]);
  const [pendingOrders, setPendingOrders] = useState<SalesOrder[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [partyGstin, setPartyGstin] = useState('');
  const [state, setState] = useState('');
  const [station, setStation] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [transportName, setTransportName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [haste, setHaste] = useState('');
  const [hasteGstin, setHasteGstin] = useState('');
  const [dhara, setDhara] = useState('0');
  const [grace, setGrace] = useState('0');
  const [screenSeries, setScreenSeries] = useState('');
  const [orderNo, setOrderNo] = useState('');
  const [sourceSalesOrderId, setSourceSalesOrderId] = useState('');
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [hsnCode, setHsnCode] = useState('5407');
  const [lineItems, setLineItems] = useState<SalesLineItem[]>([blankLine()]);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemModalRow, setItemModalRow] = useState<number | null>(null);
  const [itemSaving, setItemSaving] = useState(false);
  const [itemForm, setItemForm] = useState(itemDefaults());

  const gstType = businessState.trim() && state.trim() && businessState.trim().toLowerCase() !== state.trim().toLowerCase()
    ? 'Inter-State Tax Inv.'
    : 'Local Tax Inv.';

  const totals = useMemo(() => lineItems.reduce((acc, line) => ({
    pcs: round2(acc.pcs + toNum(line.pcs)),
    mts: round2(acc.mts + toNum(line.mtsQty)),
    amount: round2(acc.amount + toNum(line.amount)),
    taxable: round2(acc.taxable + toNum(line.taxableAmount)),
    tax: round2(acc.tax + toNum(line.taxAmount)),
    net: round2(acc.net + toNum(line.totalAmount)),
    cgst: round2(acc.cgst + toNum(line.cgstAmount)),
    sgst: round2(acc.sgst + toNum(line.sgstAmount)),
    igst: round2(acc.igst + toNum(line.igstAmount))
  }), { pcs: 0, mts: 0, amount: 0, taxable: 0, tax: 0, net: 0, cgst: 0, sgst: 0, igst: 0 }), [lineItems]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const meta = await salesOrdersApi.getMeta();
        if (cancelled) return;
        setCompanyName(meta.companyName || '');
        setBusinessState(meta.businessState || '');
        setDefaultHsnCode(meta.defaultHsnCode || '5407');
        setDefaultGstRate(meta.defaultGstRate || 5);
        setHsnCode(meta.defaultHsnCode || '5407');
        setNextOrderNo(meta.nextOrderNo || 1);
        setCustomers(meta.customers || []);
        setItems(meta.items || []);
        if (!editId) {
          setOrderNo(String(meta.nextOrderNo || 1));
          setLineItems([blankLine(1, meta.defaultGstRate || 5, meta.defaultHsnCode || '5407')]);
        }

        if (editId && (editKind === 'order' || transactionType === 'SALES ORDERS')) {
          const { order } = await salesOrdersApi.getById(editId);
          if (cancelled) return;
          setTransactionType('SALES ORDERS');
          applyOrderDoc(order, meta.businessState || '', meta.defaultGstRate || 5, meta.defaultHsnCode || '5407');
        } else if (editId && editKind === 'bill') {
          const { bill } = await salesOrdersApi.getBill(editId);
          if (cancelled) return;
          applyBillDoc(bill, meta.businessState || '', meta.defaultGstRate || 5, meta.defaultHsnCode || '5407');
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load sales entry.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, editKind]);

  useEffect(() => {
    if (isSalesOrder) {
      setTypeBillNumber(null);
      return;
    }
    void bankEntriesApi.getNextTypeBillNumber({ transactionType, source: 'order' })
      .then(result => setTypeBillNumber(result.typeBillNumber))
      .catch(() => setTypeBillNumber(null));
  }, [transactionType, isSalesOrder]);

  useEffect(() => {
    if (isSalesOrder || (!customerId && !partyName.trim())) {
      setPendingOrders([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void salesOrdersApi.getPending({ customerId: customerId || undefined, partyName: partyName || undefined })
        .then(({ entries }) => setPendingOrders(entries || []))
        .catch(() => setPendingOrders([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [customerId, partyName, isSalesOrder]);

  const applyOrderDoc = (order: SalesOrder, companyState: string, gstRate: number, hsn: string) => {
    setCustomerId(order.customerId || '');
    setPartyName(order.partyName || '');
    setPartyGstin(order.partyGstin || '');
    setState(order.state || '');
    setStation(order.station || '');
    setBrokerName(order.brokerName || '');
    setTransportName(order.transportName || '');
    setVehicleNo(order.vehicleNo || '');
    setHaste(order.haste || '');
    setHasteGstin(order.hasteGstin || '');
    setDhara(String(order.dhara ?? 0));
    setGrace(String(order.grace ?? 0));
    setScreenSeries(order.screenSeries || '');
    setOrderNo(String(order.orderNo));
    setOrderDate(order.orderDate ? order.orderDate.slice(0, 10) : today());
    setExpectedDate(order.expectedDate ? order.expectedDate.slice(0, 10) : '');
    setRemarks(order.remarks || '');
    setHsnCode(order.hsnCode || hsn);
    setCompanyName(order.companyName || companyName);
    setLineItems((order.lineItems || []).map((line, index) => calcLine({
      ...blankLine(index + 1, gstRate, hsn),
      ...line,
      lineNo: line.lineNo || index + 1
    }, companyState, order.state || '')));
  };

  const applyBillDoc = (bill: Order, companyState: string, gstRate: number, hsn: string) => {
    setTransactionType(bill.transactionType || 'FINISH SALES');
    setTypeBillNumber(bill.typeBillNumber || null);
    setCustomerId(bill.customerId || '');
    setPartyName(bill.buyerName || '');
    setPartyGstin(bill.customer?.gstNumber || '');
    setState(bill.customer?.state || bill.station || '');
    setStation(bill.station || '');
    setBrokerName(bill.agentName || '');
    setTransportName(bill.transportName || '');
    setVehicleNo(bill.vehicleNo || '');
    setLrNo(bill.lrNo || '');
    setHaste(bill.haste || '');
    setHasteGstin(bill.hasteGstin || '');
    setDhara(String(bill.dhara ?? 0));
    setGrace(String(bill.grace ?? 0));
    setScreenSeries(bill.screenSeries || '');
    setOrderNo(bill.orderNumber || '');
    setSourceSalesOrderId(bill.sourceSalesOrderId || '');
    setOrderDate((bill.orderDate || bill.createdAt).slice(0, 10));
    setExpectedDate(bill.expectedDate?.slice(0, 10) || '');
    setRemarks(bill.remarks || '');
    const raw = Array.isArray(bill.orderLines) ? bill.orderLines : [];
    setLineItems(raw.length ? raw.map((line: any, index: number) => calcLine({
      ...blankLine(index + 1, gstRate, hsn),
      ...line,
      lineNo: line.lineNo || index + 1,
      sourceLineNo: line.sourceLineNo || line.lineNo || index + 1,
      itemName: line.itemName || line.description || line.designName || '',
      mainScreen: line.mainScreen || line.designNo || '',
      pcs: toNum(line.pcs ?? line.quantity)
    }, companyState, bill.customer?.state || '')) : [blankLine(1, gstRate, hsn)]);
  };

  const chooseCustomer = (id: string) => {
    setCustomerId(id);
    const customer = customers.find(row => row.id === id);
    if (!customer) return;
    setPartyName(customer.organizationName);
    setPartyGstin(customer.gstNumber || '');
    setState(customer.state || '');
    setStation(customer.city || '');
    setBrokerName(customer.agentName || '');
  };

  const applyPartyByName = (name: string) => {
    const customer = customers.find(row => row.organizationName.toLowerCase() === name.trim().toLowerCase());
    if (customer) chooseCustomer(customer.id);
  };

  const updateLine = (index: number, key: keyof SalesLineItem, value: string | number) => {
    setLineItems(prev => prev.map((line, row) => {
      if (row !== index) return line;
      const next = { ...line, [key]: value };
      if (key === 'pcs' || key === 'cut') next.mtsQty = round2(toNum(next.pcs) * toNum(next.cut));
      if (key === 'mainScreen' && !next.itemName) next.itemName = String(value);
      if (key === 'itemName' && !next.screenName) next.screenName = String(value);
      return calcLine(next, businessState, state);
    }));
  };

  const applyItem = (index: number, item: SalesItemMaster) => {
    setLineItems(prev => prev.map((line, row) => row === index ? calcLine({
      ...line,
      itemMasterId: item.id,
      itemName: item.name,
      mainScreen: item.mainScreen,
      screenName: item.name,
      packing: item.packing || 'NAKED',
      unit: item.unit || 'PCS',
      cut: toNum(item.cut),
      rate: toNum(item.sellingRate),
      gstRate: toNum(item.gstRate) || defaultGstRate,
      hsnCode: item.hsnSac || defaultHsnCode
    }, businessState, state) : line));
  };

  const checkUnknownMainScreen = (index: number) => {
    const value = lineItems[index]?.mainScreen?.trim();
    if (!value) return;
    const exists = items.some(item => item.mainScreen.trim().toLowerCase() === value.toLowerCase());
    if (exists) return;
    if (window.confirm(`"${value}" is not in Quality Information. Add a new item now?`)) {
      setItemModalRow(index);
      setItemForm(itemDefaults(value));
      setItemModalOpen(true);
    }
  };

  const applyPendingOrder = (id: string) => {
    setSourceSalesOrderId(id);
    const order = pendingOrders.find(row => row.id === id);
    if (!order) return;
    setCustomerId(order.customerId || customerId);
    setPartyName(order.partyName);
    setPartyGstin(order.partyGstin || '');
    setState(order.state || '');
    setStation(order.station || '');
    setBrokerName(order.brokerName || '');
    setTransportName(order.transportName || '');
    setVehicleNo(order.vehicleNo || '');
    setHaste(order.haste || '');
    setHasteGstin(order.hasteGstin || '');
    setDhara(String(order.dhara ?? 0));
    setGrace(String(order.grace ?? 0));
    setScreenSeries(order.screenSeries || '');
    setOrderNo(String(order.orderNo));
    setRemarks(order.remarks || '');
    setLineItems((order.pendingLines || [])
      .filter(line => toNum(line.pendingPcs) > 0 || toNum(line.pendingMts) > 0)
      .map((line, index) => calcLine({
        ...line,
        lineNo: index + 1,
        sourceLineNo: line.lineNo || index + 1,
        pcs: toNum(line.pendingPcs),
        mtsQty: toNum(line.pendingMts),
        itemName: line.itemName || line.screenName || '',
        mainScreen: line.mainScreen || ''
      }, businessState, order.state || state)));
  };

  const saveItemMaster = async () => {
    if (!itemForm.name.trim() || !itemForm.mainScreen.trim()) {
      setError('Item name and Main Screen are required.');
      return;
    }
    setItemSaving(true);
    try {
      const { item } = await salesOrdersApi.createItem(itemForm);
      setItems(prev => [...prev, item].sort((a, b) => a.mainScreen.localeCompare(b.mainScreen)));
      if (itemModalRow != null) applyItem(itemModalRow, item);
      setItemModalOpen(false);
      setSuccess(`Quality Information saved for ${item.name}.`);
    } catch (err: any) {
      setError(err.message || 'Could not save Quality Information.');
    } finally {
      setItemSaving(false);
    }
  };

  const sharedPayload = () => ({
    transactionType,
    companyName,
    customerId: customerId || undefined,
    partyName: partyName.trim(),
    partyGstin,
    state,
    station,
    brokerName,
    agentName: brokerName,
    transportName,
    vehicleNo,
    lrNo,
    haste,
    hasteGstin,
    dhara: toNum(dhara),
    grace: toNum(grace),
    screenSeries,
    orderDate,
    expectedDate: expectedDate || undefined,
    remarks,
    hsnCode,
    gstType,
    lineItems: lineItems
      .filter(line => (line.mainScreen || line.itemName).trim() && (toNum(line.pcs) > 0 || toNum(line.amount) > 0))
      .map(line => ({
        ...line,
        itemName: line.itemName || line.mainScreen,
        screenName: line.screenName || line.itemName || line.mainScreen
      }))
  });

  const handleSave = async () => {
    if (!partyName.trim()) {
      setError('Party is required.');
      return;
    }
    const payload = sharedPayload();
    if (!payload.lineItems.length) {
      setError('Add at least one line.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (isSalesOrder) {
        const body = { ...payload, orderNo: toNum(orderNo || nextOrderNo) };
        const result = editId && (editKind === 'order' || !editKind)
          ? await salesOrdersApi.update(editId, body)
          : await salesOrdersApi.create(body);
        setSuccess(`Sales Order #${result.order.orderNo} ${isEditMode ? 'updated' : 'saved'}. No ledger effect.`);
        if (!isEditMode) {
          setOrderNo(String((result.order.orderNo || nextOrderNo) + 1));
          setNextOrderNo(prev => prev + 1);
          setLineItems([blankLine(1, defaultGstRate, defaultHsnCode)]);
          setRemarks('');
        }
      } else {
        const body = {
          ...payload,
          sourceSalesOrderId: sourceSalesOrderId || undefined,
          orderNumber: orderNo || undefined
        };
        const result = editId && editKind === 'bill'
          ? await salesOrdersApi.updateBill(editId, body)
          : await salesOrdersApi.createBill(body);
        const no = result.bill.typeBillNumber || result.bill.invoiceNumber || '-';
        setSuccess(`${transactionType} bill #${no} ${isEditMode ? 'updated' : 'saved'}. Posted to ledger.`);
        if (!isEditMode) {
          setLineItems([blankLine(1, defaultGstRate, defaultHsnCode)]);
          setSourceSalesOrderId('');
          setOrderNo('');
          setRemarks('');
          setLrNo('');
          void bankEntriesApi.getNextTypeBillNumber({ transactionType, source: 'order' })
            .then(resultBill => setTypeBillNumber(resultBill.typeBillNumber));
        }
      }
    } catch (err: any) {
      setError(err.message || 'Could not save sales entry.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7FB]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="Sales Entry" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { window.location.href = '/erp/reports/sales-order'; }} className="rounded-xl border bg-white px-3 py-2 text-xs font-black uppercase text-indigo-800">
              Sales Order Report
            </button>
            <button type="button" onClick={() => { window.location.href = '/erp/reports/finish-sales'; }} className="rounded-xl border bg-white px-3 py-2 text-xs font-black uppercase text-fuchsia-800">
              Finish Sales Report
            </button>
          </div>
        </div>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        {success && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</div>}

        <ErpFormShell onSave={() => void handleSave()} saving={saving}>
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h1 className="text-lg font-black uppercase tracking-wide text-gray-900">
                {isSalesOrder ? 'Sales Orders' : isFinishSales ? 'Finish Sales' : transactionType}
                {isEditMode ? ' · Edit' : ' · Add Mode'}
              </h1>
              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                isSalesOrder ? 'bg-indigo-100 text-indigo-800' : 'bg-fuchsia-100 text-fuchsia-800'
              }`}>
                {isSalesOrder ? 'Order form · No ledger' : 'Bill · Posts to ledger'}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
              <label><span className={labelClass}>Company</span><input className={readonlyClass} value={companyName} readOnly /></label>
              <label>
                <span className={labelClass}>Type</span>
                <select
                  className={inputClass}
                  value={transactionType}
                  disabled={isEditMode}
                  onChange={e => {
                    setTransactionType(e.target.value);
                    setSourceSalesOrderId('');
                    setLineItems([blankLine(1, defaultGstRate, defaultHsnCode)]);
                  }}
                >
                  {ERP_TRANSACTION_TYPES.filter(type => type.category === 'sales').map(type => (
                    <option key={type.value} value={type.value}>{type.value}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className={labelClass}>{isSalesOrder ? 'Order No.' : 'Bill / Voucher No.'}</span>
                <input className={readonlyClass} value={isSalesOrder ? (orderNo || nextOrderNo) : (typeBillNumber ?? '—')} readOnly />
              </label>
              {!isSalesOrder && (
                <label>
                  <span className={labelClass}>Ord / Ref</span>
                  <select className={`${inputClass} border-amber-300 bg-amber-50`} value={sourceSalesOrderId} onChange={e => applyPendingOrder(e.target.value)}>
                    <option value="">Direct bill / select Sales Order</option>
                    {sourceSalesOrderId && !pendingOrders.some(order => order.id === sourceSalesOrderId) && (
                      <option value={sourceSalesOrderId}>SO {orderNo || 'linked'}</option>
                    )}
                    {pendingOrders.map(order => (
                      <option key={order.id} value={order.id}>SO {order.orderNo} · {order.pendingPcs} PCS pending</option>
                    ))}
                  </select>
                </label>
              )}
              <label><span className={labelClass}>Date</span><input type="date" className={inputClass} value={orderDate} onChange={e => setOrderDate(e.target.value)} /></label>
              <label><span className={labelClass}>GST Type</span><input className={readonlyClass} value={gstType} readOnly /></label>
              <label className="md:col-span-2">
                <span className={labelClass}>Party</span>
                <input
                  className={inputClass}
                  list="erp-sales-parties"
                  value={partyName}
                  onChange={e => setPartyName(e.target.value)}
                  onBlur={e => applyPartyByName(e.target.value)}
                />
                <datalist id="erp-sales-parties">
                  {customers.map(customer => <option key={customer.id} value={customer.organizationName} />)}
                </datalist>
              </label>
              <label><span className={labelClass}>State</span><input className={inputClass} value={state} onChange={e => setState(e.target.value)} /></label>
              <label><span className={labelClass}>Haste</span><input className={inputClass} value={haste} onChange={e => setHaste(e.target.value)} /></label>
              <label><span className={labelClass}>Broker</span><input className={inputClass} value={brokerName} onChange={e => setBrokerName(e.target.value)} /></label>
              <label><span className={labelClass}>Haste GSTIN</span><input className={inputClass} value={hasteGstin} onChange={e => setHasteGstin(e.target.value)} /></label>
              <label><span className={labelClass}>Dhara</span><input className={inputClass} type="number" value={dhara} onChange={e => setDhara(e.target.value)} /></label>
              <label><span className={labelClass}>Grace</span><input className={inputClass} type="number" value={grace} onChange={e => setGrace(e.target.value)} /></label>
              <label><span className={labelClass}>Station</span><input className={inputClass} value={station} onChange={e => setStation(e.target.value)} /></label>
              <label><span className={labelClass}>Transport</span><input className={inputClass} value={transportName} onChange={e => setTransportName(e.target.value)} /></label>
              <label><span className={labelClass}>Vehicle No.</span><input className={inputClass} value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} /></label>
              {!isSalesOrder && <label><span className={labelClass}>LR No. / AWB</span><input className={inputClass} value={lrNo} onChange={e => setLrNo(e.target.value)} /></label>}
              <label><span className={labelClass}>Screen Series</span><input className={inputClass} value={screenSeries} onChange={e => setScreenSeries(e.target.value)} /></label>
              <label><span className={labelClass}>Party GSTIN</span><input className={inputClass} value={partyGstin} onChange={e => setPartyGstin(e.target.value)} /></label>
              {isSalesOrder && <label><span className={labelClass}>Delivery Due Date</span><input type="date" className={inputClass} value={expectedDate} onChange={e => setExpectedDate(e.target.value)} /></label>}
              <label><span className={labelClass}>HSN Code</span><input className={inputClass} value={hsnCode} onChange={e => setHsnCode(e.target.value)} /></label>
              <label className="md:col-span-2"><span className={labelClass}>Remark</span><input className={inputClass} value={remarks} onChange={e => setRemarks(e.target.value)} /></label>
            </div>
          </section>

          <section className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b bg-indigo-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-800">
                {isSalesOrder
                  ? 'Particulars · Main Screen · Screen Name · Amount = PCS × Rate'
                  : 'Particulars · Item · Design No · Prefill from Ord/Ref · Amount = PCS × Rate'}
              </p>
              <button
                type="button"
                onClick={() => setLineItems(prev => [...prev, blankLine(Math.max(0, ...prev.map(line => toNum(line.lineNo))) + 1, defaultGstRate, defaultHsnCode)])}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-black uppercase text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Add Line
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1500px] w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
                  <tr>
                    {(isSalesOrder
                      ? ['#', 'Main Screen', 'Bundles', 'Screen Name', 'Packing', 'Unit', 'PCS', 'Cut', 'MTS/Qty', 'Rate', 'Amount', 'R.D.', 'Disc %', 'Manual Add/Ls', 'IGST %', 'SGST %', 'CGST/IGST Amt', '']
                      : ['#', 'Ref', 'Item Name', 'Bundles', 'Design No', 'Packing', 'Unit', 'PCS', 'Cut', 'MTS/Qty', 'Rate', 'Amount', 'Disc %', 'Add/Less', 'GST %', 'Tax', 'Net', '']
                    ).map(head => <th key={head} className="px-2 py-2 font-black">{head}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((line, index) => (
                    <tr key={index} className="border-b odd:bg-white even:bg-slate-50">
                      <td className="px-2 py-1.5 font-black">{index + 1}</td>
                      {!isSalesOrder && (
                        <td className="px-2 py-1.5 text-right font-semibold text-amber-800">{line.sourceLineNo || orderNo || '-'}</td>
                      )}
                      {isSalesOrder ? (
                        <>
                          <td className="min-w-[150px] px-1 py-1.5">
                            <input className={inputClass} list="main-screen-names" value={line.mainScreen} onChange={e => updateLine(index, 'mainScreen', e.target.value)} onBlur={() => checkUnknownMainScreen(index)} />
                          </td>
                          <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.bundles || ''} onChange={e => updateLine(index, 'bundles', toNum(e.target.value))} /></td>
                          <td className="min-w-[140px] px-1 py-1.5">
                            <input
                              className={inputClass}
                              list="sales-item-names"
                              value={line.screenName || line.itemName}
                              onChange={e => {
                                const value = e.target.value;
                                setLineItems(prev => prev.map((row, i) => i === index
                                  ? calcLine({ ...row, screenName: value, itemName: value }, businessState, state)
                                  : row));
                              }}
                              onBlur={e => {
                                const found = items.find(item => item.name.toLowerCase() === e.target.value.trim().toLowerCase());
                                if (found) applyItem(index, found);
                              }}
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="min-w-[140px] px-1 py-1.5">
                            <input
                              className={inputClass}
                              list="sales-item-names"
                              value={line.itemName}
                              onChange={e => updateLine(index, 'itemName', e.target.value)}
                              onBlur={e => {
                                const found = items.find(item => item.name.toLowerCase() === e.target.value.trim().toLowerCase());
                                if (found) applyItem(index, found);
                              }}
                            />
                          </td>
                          <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.bundles || ''} onChange={e => updateLine(index, 'bundles', toNum(e.target.value))} /></td>
                          <td className="min-w-[140px] px-1 py-1.5">
                            <input className={inputClass} list="main-screen-names" value={line.mainScreen} onChange={e => updateLine(index, 'mainScreen', e.target.value)} onBlur={() => checkUnknownMainScreen(index)} />
                          </td>
                        </>
                      )}
                      <td className="px-1 py-1.5"><input className={inputClass} value={line.packing} onChange={e => updateLine(index, 'packing', e.target.value)} /></td>
                      <td className="px-1 py-1.5"><input className={inputClass} value={line.unit} onChange={e => updateLine(index, 'unit', e.target.value)} /></td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.pcs || ''} onChange={e => updateLine(index, 'pcs', toNum(e.target.value))} /></td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.cut || ''} onChange={e => updateLine(index, 'cut', toNum(e.target.value))} /></td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.mtsQty || ''} onChange={e => updateLine(index, 'mtsQty', toNum(e.target.value))} /></td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.rate || ''} onChange={e => updateLine(index, 'rate', toNum(e.target.value))} /></td>
                      <td className="px-2 py-1.5 text-right font-bold">{round2(toNum(line.amount)).toFixed(2)}</td>
                      {isSalesOrder ? (
                        <>
                          <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.rd || ''} onChange={e => updateLine(index, 'rd', toNum(e.target.value))} /></td>
                          <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.discountPercent || ''} onChange={e => updateLine(index, 'discountPercent', toNum(e.target.value))} /></td>
                          <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.manualAddLess || ''} onChange={e => updateLine(index, 'manualAddLess', toNum(e.target.value))} /></td>
                          <td className="px-2 py-1.5 text-right font-bold">{round2(toNum(line.igstRate)).toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right font-bold">{round2(toNum(line.sgstRate)).toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right font-bold">{round2(toNum(line.taxAmount)).toFixed(2)}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.discountPercent || ''} onChange={e => updateLine(index, 'discountPercent', toNum(e.target.value))} /></td>
                          <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.manualAddLess || ''} onChange={e => updateLine(index, 'manualAddLess', toNum(e.target.value))} /></td>
                          <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.gstRate || ''} onChange={e => updateLine(index, 'gstRate', toNum(e.target.value))} /></td>
                          <td className="px-2 py-1.5 text-right font-bold">{round2(toNum(line.taxAmount)).toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right font-black text-indigo-800">{round2(toNum(line.totalAmount)).toFixed(2)}</td>
                        </>
                      )}
                      <td className="px-1 py-1.5">
                        <button
                          type="button"
                          onClick={() => setLineItems(prev => prev.length === 1
                            ? [blankLine(1, defaultGstRate, defaultHsnCode)]
                            : prev.filter((_, row) => row !== index))}
                          className="rounded-lg bg-rose-50 p-1.5 text-rose-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-black">
                  <tr>
                    <td colSpan={isSalesOrder ? 6 : 7} className="px-2 py-2 text-right uppercase">Grand Totals</td>
                    <td className="px-2 py-2 text-right">{totals.pcs.toFixed(2)}</td>
                    <td />
                    <td className="px-2 py-2 text-right">{totals.mts.toFixed(2)}</td>
                    <td />
                    <td className="px-2 py-2 text-right">{totals.amount.toFixed(2)}</td>
                    <td colSpan={isSalesOrder ? 5 : 4} className="px-2 py-2 text-right">Taxable {totals.taxable.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right text-indigo-800">{(isSalesOrder ? totals.tax : totals.net).toFixed(2)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              <datalist id="sales-item-names">{items.map(item => <option key={item.id} value={item.name}>{item.mainScreen}</option>)}</datalist>
              <datalist id="main-screen-names">{Array.from(new Set(items.map(item => item.mainScreen))).map(name => <option key={name} value={name} />)}</datalist>
            </div>
          </section>

          <section className="mt-4 grid gap-4 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
            <label><span className={labelClass}>Taxable Value</span><input className={readonlyClass} value={totals.taxable.toFixed(2)} readOnly /></label>
            <label><span className={labelClass}>CGST Amt</span><input className={readonlyClass} value={totals.cgst.toFixed(2)} readOnly /></label>
            <label><span className={labelClass}>SGST Amt</span><input className={readonlyClass} value={totals.sgst.toFixed(2)} readOnly /></label>
            <label><span className={labelClass}>IGST Amt</span><input className={readonlyClass} value={totals.igst.toFixed(2)} readOnly /></label>
            <label><span className={labelClass}>Bill Amt</span><input className={readonlyClass} value={totals.net.toFixed(2)} readOnly /></label>
            <label><span className={labelClass}>Net Amt</span><input className={`${readonlyClass} font-black text-indigo-800`} value={totals.net.toFixed(2)} readOnly /></label>
          </section>

          <ErpSaveButton
            saving={saving}
            label={isEditMode
              ? (isSalesOrder ? 'Update Sales Order' : 'Update Finish Sales')
              : (isSalesOrder ? 'Save Sales Order' : 'Save Finish Sales')}
            savingLabel="Saving..."
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
          />
        </ErpFormShell>
      </main>

      {itemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b bg-indigo-50 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-gray-900">Quality Information</h2>
                <p className="text-xs font-semibold text-indigo-700">Add item and return it to the active sales line</p>
              </div>
              <button type="button" onClick={() => setItemModalOpen(false)} className="rounded-lg p-1 hover:bg-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Name', 'name'], ['Main Screen', 'mainScreen'], ['Packing', 'packing'],
                ['Cut', 'cut'], ['Grey Quality', 'greyQuality'], ['Type', 'finishType'],
                ['Item Type', 'itemType'], ['Screen Series', 'screenSeries'], ['Category', 'category'],
                ['Unit', 'unit'], ['Selling Rate', 'sellingRate'], ['Rate 2', 'rate2'],
                ['Rate 3', 'rate3'], ['Work Cut', 'workCut'], ['HSN / SAC', 'hsnSac'],
                ['GST %', 'gstRate'], ['Remark', 'remark']
              ].map(([label, key]) => (
                <label key={key}>
                  <span className={labelClass}>{label}</span>
                  <input
                    className={inputClass}
                    type={['cut', 'sellingRate', 'rate2', 'rate3', 'workCut', 'gstRate'].includes(key) ? 'number' : 'text'}
                    value={(itemForm as any)[key]}
                    onChange={e => setItemForm(prev => ({
                      ...prev,
                      [key]: e.target.type === 'number' ? toNum(e.target.value) : e.target.value
                    }))}
                  />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button type="button" onClick={() => setItemModalOpen(false)} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button>
              <button type="button" disabled={itemSaving} onClick={() => void saveItemMaster()} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60">
                {itemSaving ? 'Saving...' : 'Save Quality'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
