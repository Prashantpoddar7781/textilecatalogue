import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { bankEntriesApi, salesOrdersApi } from '../services/api';
import { Customer, Order, SalesItemMaster, SalesLineItem, SalesOrder } from '../types';
import { ERP_TRANSACTION_TYPES } from '../constants/erpTransactionTypes';
import { ErpFormShell } from './ErpFormShell';
import { ErpSaveButton } from './ErpSaveButton';

interface Props {
  onBack: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const num = (value: string | number | undefined | null) => Number(value || 0) || 0;

const blankLine = (lineNo = 1): SalesLineItem => ({
  lineNo,
  sourceLineNo: lineNo,
  itemName: '',
  bundles: 0,
  mainScreen: '',
  packing: 'NAKED',
  unit: 'PCS',
  pcs: 0,
  cut: 0,
  mtsQty: 0,
  rate: 0,
  amount: 0,
  discountPercent: 0,
  discountAmount: 0,
  manualAddLess: 0,
  gstRate: 5,
  taxAmount: 0,
  taxableAmount: 0,
  totalAmount: 0,
  hsnCode: '5407'
});

function calculateLine(input: SalesLineItem, businessState: string, partyState: string): SalesLineItem {
  const pcs = num(input.pcs);
  const cut = num(input.cut);
  const mtsQty = num(input.mtsQty);
  const rate = num(input.rate);
  const amount = money(pcs * rate);
  const discountAmount = money(amount * num(input.discountPercent) / 100);
  const taxableAmount = money(amount - discountAmount + num(input.manualAddLess));
  const gstRate = num(input.gstRate);
  const taxAmount = money(taxableAmount * gstRate / 100);
  const interState = Boolean(
    businessState.trim() && partyState.trim()
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
    cgstAmount: interState ? 0 : money(taxAmount / 2),
    sgstAmount: interState ? 0 : money(taxAmount / 2),
    igstAmount: interState ? taxAmount : 0,
    totalAmount: money(taxableAmount + taxAmount)
  };
}

const itemFormDefaults = (mainScreen = '') => ({
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

export const ErpSalesPage: React.FC<Props> = ({ onBack }) => {
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  const editKind = params.get('kind') === 'order' ? 'order' : 'bill';
  const [transactionType, setTransactionType] = useState('FINISH SALES');
  const [typeBillNumber, setTypeBillNumber] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [businessState, setBusinessState] = useState('');
  const [defaultHsnCode, setDefaultHsnCode] = useState('5407');
  const [defaultGstRate, setDefaultGstRate] = useState(5);
  const [nextOrderNo, setNextOrderNo] = useState(1);
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
  const [orderNo, setOrderNo] = useState('');
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState('');
  const [haste, setHaste] = useState('');
  const [remarks, setRemarks] = useState('');
  const [sourceSalesOrderId, setSourceSalesOrderId] = useState('');
  const [lineItems, setLineItems] = useState<SalesLineItem[]>([blankLine()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemModalRow, setItemModalRow] = useState<number | null>(null);
  const [itemSaving, setItemSaving] = useState(false);
  const [itemForm, setItemForm] = useState(itemFormDefaults());

  const isSalesOrder = transactionType === 'SALES ORDERS';
  const isEditMode = Boolean(editId);

  const totals = useMemo(() => lineItems.reduce((acc, line) => ({
    bundles: money(acc.bundles + num(line.bundles)),
    pcs: money(acc.pcs + num(line.pcs)),
    mts: money(acc.mts + num(line.mtsQty)),
    gross: money(acc.gross + num(line.amount)),
    discount: money(acc.discount + num(line.discountAmount)),
    taxable: money(acc.taxable + num(line.taxableAmount)),
    tax: money(acc.tax + num(line.taxAmount)),
    net: money(acc.net + num(line.totalAmount))
  }), { bundles: 0, pcs: 0, mts: 0, gross: 0, discount: 0, taxable: 0, tax: 0, net: 0 }), [lineItems]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const meta = await salesOrdersApi.getMeta();
        if (!active) return;
        setCompanyName(meta.companyName || '');
        setBusinessState(meta.businessState || '');
        setDefaultHsnCode(meta.defaultHsnCode || '5407');
        setDefaultGstRate(meta.defaultGstRate || 0);
        setLineItems(current => current.length === 1 && !current[0].itemName
          ? [{ ...current[0], gstRate: meta.defaultGstRate || 0, hsnCode: meta.defaultHsnCode || '5407' }]
          : current);
        setNextOrderNo(meta.nextOrderNo || 1);
        setCustomers(meta.customers || []);
        setItems(meta.items || []);
        if (!editId) return;

        if (editKind === 'order') {
          const { order } = await salesOrdersApi.getById(editId);
          if (!active) return;
          setTransactionType('SALES ORDERS');
          setCompanyName(order.companyName || meta.companyName || '');
          setCustomerId(order.customerId || '');
          setPartyName(order.partyName);
          setPartyGstin(order.partyGstin || '');
          setState(order.state || '');
          setStation(order.station || '');
          setBrokerName(order.brokerName || '');
          setTransportName(order.transportName || '');
          setVehicleNo(order.vehicleNo || '');
          setLrNo(order.lrNo || '');
          setOrderNo(String(order.orderNo));
          setOrderDate(order.orderDate.slice(0, 10));
          setExpectedDate(order.expectedDate?.slice(0, 10) || '');
          setHaste(order.haste || '');
          setRemarks(order.remarks || '');
          setLineItems((order.lineItems || []).map(line => calculateLine(line, meta.businessState, order.state || '')));
        } else {
          const { bill } = await salesOrdersApi.getBill(editId);
          if (!active) return;
          loadBill(bill, meta.businessState);
        }
      } catch (err: any) {
        if (active) setError(err.message || 'Could not load sales entry.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
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

  const loadBill = (bill: Order, companyState: string) => {
    setTransactionType(bill.transactionType || 'FINISH SALES');
    setTypeBillNumber(bill.typeBillNumber || null);
    setCustomerId(bill.customerId || '');
    setPartyName(bill.buyerName || '');
    setPartyGstin(bill.customer?.gstNumber || '');
    setState(bill.customer?.state || bill.station || '');
    setStation(bill.station || '');
    setBrokerName(bill.agentName || '');
    setTransportName(bill.transportName || '');
    setOrderNo(bill.orderNumber || '');
    setOrderDate((bill.orderDate || bill.createdAt).slice(0, 10));
    setExpectedDate(bill.expectedDate?.slice(0, 10) || '');
    setHaste(bill.haste || '');
    setRemarks(bill.remarks || '');
    setSourceSalesOrderId(bill.sourceSalesOrderId || '');
    const raw = Array.isArray(bill.orderLines) ? bill.orderLines : [];
    setLineItems(raw.length ? raw.map((line: any, index) => calculateLine({
      ...blankLine(index + 1),
      ...line,
      lineNo: line.lineNo || index + 1,
      sourceLineNo: line.sourceLineNo || line.lineNo || index + 1,
      itemName: line.itemName || line.description || line.designName || '',
      pcs: num(line.pcs ?? line.quantity)
    }, companyState, bill.customer?.state || '')) : [blankLine()]);
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

  const updateLine = (index: number, key: keyof SalesLineItem, value: string | number) => {
    setLineItems(prev => prev.map((line, row) => {
      if (row !== index) return line;
      const next = { ...line, [key]: value };
      if (key === 'pcs' || key === 'cut') {
        next.mtsQty = money(num(next.pcs) * num(next.cut));
      }
      return calculateLine(next, businessState, state);
    }));
  };

  const chooseMasterItem = (index: number, id: string) => {
    const item = items.find(row => row.id === id);
    if (!item) return;
    setLineItems(prev => prev.map((line, row) => row === index ? calculateLine({
      ...line,
      itemMasterId: item.id,
      itemName: item.name,
      mainScreen: item.mainScreen,
      packing: item.packing || 'NAKED',
      unit: item.unit || 'PCS',
      cut: num(item.cut),
      rate: num(item.sellingRate),
      gstRate: num(item.gstRate),
      hsnCode: item.hsnSac || defaultHsnCode
    }, businessState, state) : line));
  };

  const checkUnknownMainScreen = (index: number) => {
    const value = lineItems[index]?.mainScreen.trim();
    if (!value) return;
    const exists = items.some(item => item.mainScreen.trim().toLowerCase() === value.toLowerCase());
    if (exists) return;
    if (window.confirm(`"${value}" is not in Quality Information. Add a new item now?`)) {
      setItemModalRow(index);
      setItemForm(itemFormDefaults(value));
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
    setLrNo(order.lrNo || '');
    setOrderNo(String(order.orderNo));
    setHaste(order.haste || '');
    setRemarks(order.remarks || '');
    const pending = order.pendingLines || [];
    setLineItems(pending
      .filter(line => num(line.pendingPcs) > 0 || num(line.pendingMts) > 0)
      .map((line, index) => calculateLine({
        ...line,
        lineNo: index + 1,
        sourceLineNo: line.lineNo || index + 1,
        pcs: num(line.pendingPcs),
        mtsQty: num(line.pendingMts)
      }, businessState, order.state || state))
    );
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
      if (itemModalRow != null) chooseMasterItemFromValue(itemModalRow, item);
      setItemModalOpen(false);
      setSuccess(`Quality Information saved for ${item.name}.`);
    } catch (err: any) {
      setError(err.message || 'Could not save Quality Information.');
    } finally {
      setItemSaving(false);
    }
  };

  const chooseMasterItemFromValue = (index: number, item: SalesItemMaster) => {
    setLineItems(prev => prev.map((line, row) => row === index ? calculateLine({
      ...line,
      itemMasterId: item.id,
      itemName: item.name,
      mainScreen: item.mainScreen,
      packing: item.packing || 'NAKED',
      unit: item.unit || 'PCS',
      cut: num(item.cut),
      rate: num(item.sellingRate),
      gstRate: num(item.gstRate),
      hsnCode: item.hsnSac || defaultHsnCode
    }, businessState, state) : line));
  };

  const resetAfterSave = () => {
    setLineItems([{ ...blankLine(), gstRate: defaultGstRate, hsnCode: defaultHsnCode }]);
    setRemarks('');
    setOrderNo('');
    setSourceSalesOrderId('');
    setLrNo('');
    setVehicleNo('');
    setNextOrderNo(value => value + 1);
  };

  const saveEntry = async () => {
    if (!partyName.trim()) {
      setError('Customer name is required.');
      return;
    }
    const validLines = lineItems.filter(line => line.itemName.trim() && (num(line.pcs) > 0 || num(line.amount) > 0));
    if (!validLines.length) {
      setError('Add at least one item with quantity.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    const payload = {
      transactionType,
      companyName,
      customerId: customerId || undefined,
      partyName: partyName.trim(),
      partyGstin,
      state,
      station,
      brokerName,
      transportName,
      vehicleNo,
      lrNo,
      orderNo: isSalesOrder ? num(orderNo || nextOrderNo) : undefined,
      orderNumber: orderNo || undefined,
      orderDate,
      expectedDate: expectedDate || undefined,
      haste,
      remarks,
      hsnCode: defaultHsnCode,
      sourceSalesOrderId: !isSalesOrder ? sourceSalesOrderId || undefined : undefined,
      lineItems: validLines
    };
    try {
      if (isSalesOrder) {
        const result = editId && editKind === 'order'
          ? await salesOrdersApi.update(editId, payload)
          : await salesOrdersApi.create(payload);
        setSuccess(`${isEditMode ? 'Updated' : 'Saved'} Sales Order #${result.order.orderNo}. It has no ledger effect.`);
      } else {
        const result = editId && editKind === 'bill'
          ? await salesOrdersApi.updateBill(editId, payload)
          : await salesOrdersApi.createBill(payload);
        const no = result.bill.typeBillNumber || result.bill.invoiceNumber || '-';
        setSuccess(`${isEditMode ? 'Updated' : 'Saved'} ${transactionType} bill #${no}.`);
      }
      if (!isEditMode) resetAfterSave();
    } catch (err: any) {
      setError(err.message || 'Could not save sales entry.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-gray-50"><Loader2 className="h-7 w-7 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#eef2f7]">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> ERP
          </button>
          <h1 className="text-lg font-black text-gray-900">{isSalesOrder ? 'Sales Order' : 'Finish Sales'} Entry</h1>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase text-indigo-700">
            {isEditMode ? 'Edit mode' : 'Add mode'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 py-5">
        <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-lg">
          <div className="bg-gradient-to-r from-indigo-950 to-slate-800 px-5 py-3 text-white">
            <p className="text-xs font-black uppercase tracking-[0.25em]">{companyName || 'Company'} · Sales</p>
          </div>
          {error && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
          {success && <div className="m-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{success}</div>}

          <ErpFormShell onSave={saveEntry} saving={saving}>
            <div className="grid gap-3 border-b bg-slate-50 p-4 md:grid-cols-3 xl:grid-cols-6">
              <Field label="Type">
                <select className="entry-input" value={transactionType} disabled={isEditMode} onChange={e => setTransactionType(e.target.value)}>
                  {ERP_TRANSACTION_TYPES.filter(type => type.category === 'sales').map(type => (
                    <option key={type.value} value={type.value}>{type.value}</option>
                  ))}
                </select>
              </Field>
              <Field label={isSalesOrder ? 'Order No.' : 'Voucher / Bill No.'}>
                <input className="entry-input bg-slate-100 font-black" readOnly value={isSalesOrder ? (orderNo || nextOrderNo) : (typeBillNumber ?? '—')} />
              </Field>
              <Field label="Date"><input className="entry-input" type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} /></Field>
              <Field label="Expected Date"><input className="entry-input" type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} /></Field>
              <Field label="Haste"><input className="entry-input" value={haste} onChange={e => setHaste(e.target.value)} /></Field>
              <Field label="Company"><input className="entry-input bg-slate-100" readOnly value={companyName} /></Field>
              <Field label="Customer">
                <select className="entry-input" value={customerId} onChange={e => chooseCustomer(e.target.value)}>
                  <option value="">Type customer below</option>
                  {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.organizationName}</option>)}
                </select>
              </Field>
              <Field label="Party Name"><input className="entry-input" value={partyName} onChange={e => setPartyName(e.target.value)} /></Field>
              <Field label="GSTIN"><input className="entry-input" value={partyGstin} onChange={e => setPartyGstin(e.target.value)} /></Field>
              <Field label="State"><input className="entry-input" value={state} onChange={e => setState(e.target.value)} /></Field>
              <Field label="Station"><input className="entry-input" value={station} onChange={e => setStation(e.target.value)} /></Field>
              <Field label="Broker"><input className="entry-input" value={brokerName} onChange={e => setBrokerName(e.target.value)} /></Field>
              <Field label="Transport"><input className="entry-input" value={transportName} onChange={e => setTransportName(e.target.value)} /></Field>
              <Field label="Vehicle No."><input className="entry-input" value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} /></Field>
              <Field label="LR No."><input className="entry-input" value={lrNo} onChange={e => setLrNo(e.target.value)} /></Field>
              {!isSalesOrder && (
                <Field label="Order / Ref">
                  <select className="entry-input border-amber-300 bg-amber-50" value={sourceSalesOrderId} onChange={e => applyPendingOrder(e.target.value)}>
                    <option value="">Direct bill / select order</option>
                    {sourceSalesOrderId && !pendingOrders.some(order => order.id === sourceSalesOrderId) && (
                      <option value={sourceSalesOrderId}>SO {orderNo || 'current'} · linked order</option>
                    )}
                    {pendingOrders.map(order => (
                      <option key={order.id} value={order.id}>SO {order.orderNo} · {order.pendingPcs} pcs · {new Date(order.orderDate).toLocaleDateString('en-IN')}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1650px] w-full border-collapse text-xs">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    {['#', 'Item Name', 'Bundles', 'Main Screen', 'Packing', 'Unit', 'PCS', 'Cut', 'MTS', 'Rate', 'Amount', 'Disc %', 'Add/Less', 'GST %', 'Tax', 'Net', ''].map(label => (
                      <th key={label} className="border border-slate-600 px-2 py-2 text-left font-black uppercase">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((line, index) => (
                    <tr key={index} className="odd:bg-white even:bg-slate-50">
                      <td className="grid-cell text-center font-black">{index + 1}</td>
                      <td className="grid-cell min-w-[180px]">
                        <input
                          className="grid-input"
                          list="sales-item-names"
                          value={line.itemName}
                          onChange={e => updateLine(index, 'itemName', e.target.value)}
                          onBlur={e => {
                            const found = items.find(item => item.name.toLowerCase() === e.target.value.trim().toLowerCase());
                            if (found) chooseMasterItem(index, found.id);
                          }}
                        />
                      </td>
                      <td className="grid-cell"><NumberInput value={line.bundles} onChange={value => updateLine(index, 'bundles', value)} /></td>
                      <td className="grid-cell min-w-[170px]">
                        <input className="grid-input" list="main-screen-names" value={line.mainScreen} onChange={e => updateLine(index, 'mainScreen', e.target.value)} onBlur={() => checkUnknownMainScreen(index)} />
                      </td>
                      <td className="grid-cell"><input className="grid-input" value={line.packing} onChange={e => updateLine(index, 'packing', e.target.value)} /></td>
                      <td className="grid-cell"><input className="grid-input" value={line.unit} onChange={e => updateLine(index, 'unit', e.target.value)} /></td>
                      <td className="grid-cell"><NumberInput value={line.pcs} onChange={value => updateLine(index, 'pcs', value)} /></td>
                      <td className="grid-cell"><NumberInput value={line.cut} onChange={value => updateLine(index, 'cut', value)} /></td>
                      <td className="grid-cell"><NumberInput value={line.mtsQty} onChange={value => updateLine(index, 'mtsQty', value)} /></td>
                      <td className="grid-cell"><NumberInput value={line.rate} onChange={value => updateLine(index, 'rate', value)} /></td>
                      <td className="grid-cell bg-slate-100 text-right font-bold">{money(num(line.amount)).toFixed(2)}</td>
                      <td className="grid-cell"><NumberInput value={line.discountPercent} onChange={value => updateLine(index, 'discountPercent', value)} /></td>
                      <td className="grid-cell"><NumberInput value={line.manualAddLess} onChange={value => updateLine(index, 'manualAddLess', value)} /></td>
                      <td className="grid-cell"><NumberInput value={line.gstRate} onChange={value => updateLine(index, 'gstRate', value)} /></td>
                      <td className="grid-cell bg-slate-100 text-right font-bold">{money(num(line.taxAmount)).toFixed(2)}</td>
                      <td className="grid-cell bg-indigo-50 text-right font-black">{money(num(line.totalAmount)).toFixed(2)}</td>
                      <td className="grid-cell">
                        <button type="button" onClick={() => setLineItems(prev => prev.length === 1 ? [{ ...blankLine(), gstRate: defaultGstRate, hsnCode: defaultHsnCode }] : prev.filter((_, row) => row !== index))} className="rounded bg-red-50 p-1.5 text-red-700"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 font-black">
                  <tr>
                    <td colSpan={2} className="grid-cell text-right">TOTAL</td>
                    <td className="grid-cell text-right">{totals.bundles}</td>
                    <td colSpan={3} className="grid-cell" />
                    <td className="grid-cell text-right">{totals.pcs}</td>
                    <td className="grid-cell" />
                    <td className="grid-cell text-right">{totals.mts}</td>
                    <td className="grid-cell" />
                    <td className="grid-cell text-right">{totals.gross.toFixed(2)}</td>
                    <td colSpan={3} className="grid-cell text-right">Taxable {totals.taxable.toFixed(2)}</td>
                    <td className="grid-cell text-right">{totals.tax.toFixed(2)}</td>
                    <td className="grid-cell text-right text-indigo-800">{totals.net.toFixed(2)}</td>
                    <td className="grid-cell" />
                  </tr>
                </tfoot>
              </table>
              <datalist id="sales-item-names">{items.map(item => <option key={item.id} value={item.name}>{item.mainScreen}</option>)}</datalist>
              <datalist id="main-screen-names">{Array.from(new Set(items.map(item => item.mainScreen))).map(name => <option key={name} value={name} />)}</datalist>
            </div>

            <div className="flex flex-col gap-4 border-t bg-white p-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-1 flex-wrap gap-2">
                <button type="button" onClick={() => setLineItems(prev => [...prev, { ...blankLine(Math.max(0, ...prev.map(line => num(line.lineNo))) + 1), gstRate: defaultGstRate, hsnCode: defaultHsnCode }])} className="flex items-center gap-1 rounded-lg bg-indigo-50 px-4 py-2 text-xs font-black text-indigo-700">
                  <Plus className="h-4 w-4" /> Add line
                </button>
                <textarea className="min-h-[42px] flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="Remarks" value={remarks} onChange={e => setRemarks(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl bg-slate-900 px-5 py-3 text-xs text-white">
                <span>Gross</span><strong className="text-right">{totals.gross.toFixed(2)}</strong>
                <span>Discount</span><strong className="text-right">{totals.discount.toFixed(2)}</strong>
                <span>Taxable</span><strong className="text-right">{totals.taxable.toFixed(2)}</strong>
                <span>GST</span><strong className="text-right">{totals.tax.toFixed(2)}</strong>
                <span className="text-sm font-black">NET</span><strong className="text-right text-base text-amber-300">{totals.net.toFixed(2)}</strong>
              </div>
              <ErpSaveButton
                saving={saving}
                label={isEditMode ? 'Update Entry' : isSalesOrder ? 'Save Sales Order' : 'Save Finish Sales'}
                savingLabel="Saving..."
                className="flex min-w-[200px] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
              />
            </div>
          </ErpFormShell>
        </section>
      </main>

      {itemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-slate-900 px-5 py-4 text-white">
              <div><h2 className="text-lg font-black">Quality Information</h2><p className="text-xs text-slate-300">Create item and return it to the active sales row</p></div>
              <button type="button" onClick={() => setItemModalOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Item / Quality Name', 'name'], ['Main Screen', 'mainScreen'], ['Packing', 'packing'],
                ['Cut', 'cut'], ['Grey Quality', 'greyQuality'], ['Type', 'finishType'],
                ['Item Type', 'itemType'], ['Screen Series', 'screenSeries'], ['Category', 'category'],
                ['Unit', 'unit'], ['Selling Rate', 'sellingRate'], ['Rate 2', 'rate2'], ['Rate 3', 'rate3'],
                ['Work Cut', 'workCut'], ['HSN / SAC', 'hsnSac'], ['GST %', 'gstRate'], ['Remark', 'remark']
              ].map(([label, key]) => (
                <Field key={key} label={label}>
                  <input
                    className="entry-input"
                    type={['cut', 'sellingRate', 'rate2', 'rate3', 'workCut', 'gstRate'].includes(key) ? 'number' : 'text'}
                    value={(itemForm as any)[key]}
                    onChange={e => setItemForm(prev => ({ ...prev, [key]: e.target.type === 'number' ? num(e.target.value) : e.target.value }))}
                  />
                </Field>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t p-4">
              <button type="button" onClick={() => setItemModalOpen(false)} className="rounded-xl border px-5 py-2.5 text-sm font-bold">Cancel</button>
              <button type="button" disabled={itemSaving} onClick={saveItemMaster} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-60">
                {itemSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />} Save Quality
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .entry-input { width: 100%; border-radius: 0.5rem; border: 1px solid #cbd5e1; padding: 0.55rem 0.7rem; font-size: 0.8rem; font-weight: 600; }
        .grid-cell { border: 1px solid #cbd5e1; padding: 0.25rem; }
        .grid-input { width: 100%; min-width: 70px; border: 0; background: transparent; padding: 0.35rem; font-size: 0.75rem; outline: none; }
      `}</style>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
    {children}
  </label>
);

const NumberInput: React.FC<{ value?: number; onChange: (value: number) => void }> = ({ value, onChange }) => (
  <input className="grid-input text-right" type="number" step="any" value={value || ''} onChange={e => onChange(num(e.target.value))} />
);
