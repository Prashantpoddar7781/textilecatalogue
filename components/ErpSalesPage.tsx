import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { EinvoiceInfo, EwayBillInfo, bankEntriesApi, invoicesApi, ordersApi, partiesApi, salesOrdersApi } from '../services/api';
import { AccountParty, Customer, ErpSession, Order, SalesItemMaster, SalesLineItem, SalesOrder } from '../types';
import {
  DEFAULT_SALES_TRANSACTION_TYPE,
  ERP_TRANSACTION_TYPES,
  getGstDefaultsForTransactionType
} from '../constants/erpTransactionTypes';
import {
  getGstDocumentType,
  getPostingRule,
  getPreviousLink,
  gstReturnSection,
  postingPartyAccountType,
  postingSummary,
  postingDiscountAccount
} from '../constants/erpTransactionPostingRules';
import { AccountsInformationDialog, AddPartyConfirmDialog } from './AccountsInformationDialog';
import { GstTypeSelect, useMissingGstPrompt } from './GstTypeField';
import { gstModeFromType, gstTypeFromGstin, isNonGstType } from '../utils/partyGst';
import { DeleteEntryButton } from './DeleteEntryButton';
import { ErpFormShell } from './ErpFormShell';
import { EwayBillDialog } from './EwayBillDialog';
import { EinvoiceDialog } from './EinvoiceDialog';
import { openSaleBillPrint } from '../utils/stationeryPrint';
import QRCode from 'qrcode';
import { ErpSaveButton } from './ErpSaveButton';
import { ErpPageBack } from './ErpPageBack';
import { PhotoEntryButton } from './PhotoEntryButton';
import { PhotoExtraction } from '../services/api';
import { PhotoPartyDetails, matchPhotoParty, photoPartyDetails, photoPartyState, rateBasisQty } from '../utils/photoEntry';
import { ErpTopMenu } from './ErpTopMenu';
import { gstTypeLabel, isInterStateSupply } from '../utils/gstState';
import { partyDhara, partyGraceDays } from '../utils/partyBillingTerms';
import { roundRupee } from '../utils/rupeeRound';
import { billedMetres, netMetres } from '../utils/lineMetres';
import { useVoucherJump } from '../hooks/useVoucherJump';
import { BillDiscountFields } from './BillDiscountFields';

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

/** Broker accounts use the commission series row: CREDITORS FOR BROKERAGE. */
const BROKER_ACCOUNT_TYPE = postingPartyAccountType('PURCHASE (COMM)') || 'CREDITORS FOR BROKERAGE';

/**
 * 30*24 → 30 pieces, cut 24, 720 metres.
 * 24.5+22+23.5 (no star) → 3 pieces, cut 0, metres are the sum.
 */
function parseBundleCut(value: string): { pcs: number; cut: number; mts: number } | null {
  const text = String(value || '').trim();
  const star = text.match(/^(\d+(?:\.\d+)?)\s*[*xX]\s*(\d+(?:\.\d+)?)$/);
  if (star) {
    const pcs = round2(Number(star[1]));
    const cut = round2(Number(star[2]));
    if (!(pcs > 0) || !(cut > 0)) return null;
    return { pcs, cut, mts: round2(pcs * cut) };
  }
  if (!text.includes('+') || /[+\s]$/.test(text)) return null;
  const parts = text.split('+').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2 || parts.some(part => !/^\d+(?:\.\d+)?$/.test(part))) return null;
  const metres = parts.map(part => round2(Number(part)));
  return { pcs: metres.length, cut: 0, mts: round2(metres.reduce((sum, part) => sum + part, 0)) };
}

const blankLine = (lineNo = 1, gstRate = 5, hsnCode = '5407', discountPercent = 0): SalesLineItem => ({
  lineNo,
  sourceLineNo: undefined,
  sourceSalesOrderId: null,
  sourceOrderNo: null,
  itemName: '',
  bundles: 0,
  mainScreen: '',
  screenName: '',
  packing: 'NAKED',
  unit: 'PCS',
  pcs: 0,
  cut: 0,
  lessFold: 0,
  mtsQty: 0,
  rate: 0,
  amount: 0,
  rd: 0,
  discountPercent,
  discountAmount: 0,
  manualAddLess: 0,
  gstRate,
  taxAmount: 0,
  taxableAmount: 0,
  totalAmount: 0,
  hsnCode
});

/** Bill discount stored as final amount minus taxable, when that gap is below the GST. */
function empireBillDiscount(bill: { shippingCharge?: number | null; orderLines?: unknown }): number {
  const lines = Array.isArray(bill.orderLines) ? bill.orderLines : [];
  const taxable = lines.reduce((sum, line) => sum + (Number(line?.amount) || 0), 0);
  const tax = lines.reduce((sum, line) => sum + (Number(line?.taxAmount) || 0), 0);
  const ship = Number(bill.shippingCharge) || 0;
  if (!(ship > 0.5) || ship + 0.5 >= tax) return 0;
  const invoice = lines.reduce((sum, line) => sum + (Number(line?.totalAmount) || 0), 0);
  const roundedInvoice = Math.round(invoice + Math.sign(invoice) * 1e-9);
  const finalAmt = Math.round((taxable + ship) * 100) / 100;
  const gap = Math.round((roundedInvoice - finalAmt) * 100) / 100;
  return gap > 0.5 ? gap : 0;
}

/** Percent that reproduces the bill discount on the taxable amount, within a rupee. */
function discountPercentOf(discount: number, taxable: number): number {
  if (!(discount > 0.5) || !(taxable > 0)) return 0;
  const raw = (discount / taxable) * 100;
  for (const digits of [0, 2, 4]) {
    const pct = Math.round(raw * (10 ** digits)) / (10 ** digits);
    if (pct > 0 && pct <= 35 && Math.abs((taxable * pct) / 100 - discount) <= 1) return pct;
  }
  return 0;
}

function plainBillNo(counter?: number | string | null) {
  if (counter == null || counter === '') return '';
  const numeric = Number(counter);
  return Number.isFinite(numeric) && numeric > 0 ? String(Math.trunc(numeric)) : String(counter);
}

let salesGstMode: 'auto' | 'local' | 'interstate' | 'none' = 'auto';

function calcLine(input: SalesLineItem, businessState: string, partyState: string): SalesLineItem {
  const pcs = toNum(input.pcs);
  const cut = toNum(input.cut);
  const mtsQty = input.mtsQty != null && String(input.mtsQty) !== ''
    ? toNum(input.mtsQty)
    : round2(pcs * cut);
  const rate = toNum(input.rate);
  const metre = /^(MTS|MTR|METRE|METER|METERS)$/i.test(String(input.unit || '').trim());
  const computed = round2((metre ? billedMetres(mtsQty || pcs, input.lessFold) : pcs) * rate);
  const stored = round2(toNum(input.amount));
  const amount = computed !== 0 ? computed : stored;
  const discountAmount = round2(amount * toNum(input.discountPercent) / 100);
  const taxableAmount = round2(amount - discountAmount + toNum(input.manualAddLess));
  const gstRate = salesGstMode === 'none' ? 0 : toNum(input.gstRate);
  const taxAmount = round2(taxableAmount * gstRate / 100);
  const interState = salesGstMode === 'interstate'
    ? true
    : salesGstMode === 'local'
      ? false
      : isInterStateSupply(partyState, businessState);
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
    gstRate,
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

const itemKey = (value?: string | null) => String(value || '').trim().toLowerCase();

function findSalesItem(
  items: SalesItemMaster[],
  query: string,
  current?: { name?: string | null; mainScreen?: string | null }
): SalesItemMaster | null {
  const q = itemKey(query);
  if (!q) return null;
  const currentName = itemKey(current?.name);
  const currentMain = itemKey(current?.mainScreen);
  const byName = items.filter(item => itemKey(item.name) === q);
  if (byName.length) {
    return byName.find(item => currentMain && itemKey(item.mainScreen) === currentMain) || byName[0];
  }
  const byMain = items.filter(item => itemKey(item.mainScreen) === q);
  if (byMain.length) {
    return byMain.find(item => currentName && itemKey(item.name) === currentName) || byMain[0];
  }
  return null;
}

function mergeBillLines(lines: SalesLineItem[]): SalesLineItem[] {
  const groups = new Map<string, SalesLineItem[]>();
  const order: string[] = [];
  lines.forEach((line, index) => {
    const name = itemKey(line.itemName || line.screenName);
    // One sales-order line stays one bill line. Order 7 is 20×24 and a
    // separate 10-piece list, not one line whose cut is metres ÷ pieces.
    const key = name
      ? [
        name,
        itemKey(line.unit),
        String(toNum(line.cut)),
        String(toNum(line.rate)),
        String(toNum(line.lessFold)),
        itemKey(line.bundleEntry),
        String(line.sourceSalesOrderId || ''),
        String(line.sourceLineNo ?? index)
      ].join('|')
      : `__row_${index}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(line);
  });
  return order.map((key, index) => {
    const rows = groups.get(key) || [];
    const first = rows[0];
    const allocations = rows
      .filter(row => row.sourceSalesOrderId)
      .map(row => ({
        sourceSalesOrderId: String(row.sourceSalesOrderId),
        sourceOrderNo: row.sourceOrderNo || null,
        sourceLineNo: row.sourceLineNo ?? null,
        pcs: toNum(row.pcs),
        mtsQty: toNum(row.mtsQty)
      }));
    if (rows.length === 1) {
      return {
        ...first,
        lineNo: index + 1,
        sourceAllocations: allocations.length ? allocations : first.sourceAllocations
      };
    }
    const pcs = round2(rows.reduce((sum, row) => sum + toNum(row.pcs), 0));
    const mtsQty = round2(rows.reduce((sum, row) => sum + toNum(row.mtsQty), 0));
    const bundles = round2(rows.reduce((sum, row) => sum + toNum(row.bundles), 0));
    const orderNos = Array.from(new Set(rows.map(row => row.sourceOrderNo).filter(Boolean)));
    return {
      ...first,
      lineNo: index + 1,
      pcs,
      mtsQty,
      bundles,
      cut: toNum(first.cut),
      sourceSalesOrderId: first.sourceSalesOrderId,
      sourceOrderNo: orderNos.join(', '),
      sourceLineNo: first.sourceLineNo,
      sourceAllocations: allocations
    };
  });
}

const einvoiceFromBill = (bill: Order): EinvoiceInfo | null => (bill.einvoiceIrn
  ? {
    irn: bill.einvoiceIrn,
    ackNo: bill.einvoiceAckNo,
    ackDate: bill.einvoiceAckDate,
    signedQr: bill.einvoiceSignedQr,
    status: bill.einvoiceStatus,
    mode: bill.einvoiceMode,
    cancelReason: bill.einvoiceCancelReason
  }
  : null);

const ewayFromBill = (bill: Order): EwayBillInfo | null => (bill.ewayBillNo
  ? {
    ewayBillNo: bill.ewayBillNo,
    ewayBillDate: bill.ewayBillDate,
    validUpto: bill.ewayBillValidUpto,
    status: bill.ewayBillStatus,
    mode: bill.ewayBillMode,
    distance: bill.ewayBillDistance,
    transporterId: bill.ewayBillTransporterId
  }
  : null);

/** New Quality Information rows start on the series' GST/HSN, same as the bill line. */
const itemDefaults = (mainScreen = '', gst?: { gstRate: number; hsnCode: string }) => ({
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
  hsnSac: gst?.hsnCode ?? getGstDefaultsForTransactionType(DEFAULT_SALES_TRANSACTION_TYPE).hsnCode,
  gstRate: gst?.gstRate ?? getGstDefaultsForTransactionType(DEFAULT_SALES_TRANSACTION_TYPE).gstRate,
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
  const picksChallan = getPreviousLink(transactionType) === 'SALES CHALLAN';
  const isFinishSales = transactionType.startsWith('FINISH SALES');
  const isGoodsReturn = transactionType === 'SALES GOODS RETURN';
  const isBillEntry = !isSalesOrder;
  const isEditMode = Boolean(editId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [businessState, setBusinessState] = useState('');
  const [gstChoice, setGstChoice] = useState('');
  const [gstTouched, setGstTouched] = useState(false);
  const { askIfMissing, dialog: missingGstDialog } = useMissingGstPrompt();
  const [companyHsnCode, setCompanyHsnCode] = useState('5407');
  const [companyGstRate, setCompanyGstRate] = useState(5);
  const [defaultHsnCode, setDefaultHsnCode] = useState(
    () => getGstDefaultsForTransactionType(
      typeFromUrl || (editKind === 'order' ? 'SALES ORDERS' : DEFAULT_SALES_TRANSACTION_TYPE)
    ).hsnCode
  );
  const [defaultGstRate, setDefaultGstRate] = useState(
    () => getGstDefaultsForTransactionType(
      typeFromUrl || (editKind === 'order' ? 'SALES ORDERS' : DEFAULT_SALES_TRANSACTION_TYPE)
    ).gstRate
  );
  const [nextOrderNo, setNextOrderNo] = useState(1);
  const [typeBillNumber, setTypeBillNumber] = useState<number | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<SalesItemMaster[]>([]);
  const [pendingOrders, setPendingOrders] = useState<SalesOrder[]>([]);
  const [challanHits, setChallanHits] = useState<SalesOrder[]>([]);
  const [challanQuery, setChallanQuery] = useState('');
  const [challanLoading, setChallanLoading] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [selectedSources, setSelectedSources] = useState<SalesOrder[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [partyGstin, setPartyGstin] = useState('');
  const [state, setState] = useState('');
  const [station, setStation] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [transportName, setTransportName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [lrDate, setLrDate] = useState('');
  const [haste, setHaste] = useState('');
  const [hasteGstin, setHasteGstin] = useState('');
  const [dhara, setDhara] = useState('0');
  const [billDiscount, setBillDiscount] = useState(0);
  const [grace, setGrace] = useState('0');
  const [screenSeries, setScreenSeries] = useState('');
  const [orderNo, setOrderNo] = useState('');
  const [sourceSalesOrderId, setSourceSalesOrderId] = useState('');
  const [sourceOrderFormId, setSourceOrderFormId] = useState('');
  const [openForms, setOpenForms] = useState<Awaited<ReturnType<typeof ordersApi.getOpenForms>>['forms']>([]);
  const [dismissedForms, setDismissedForms] = useState<string[]>([]);
  const [formPickId, setFormPickId] = useState('');
  const [copyingForm, setCopyingForm] = useState(false);
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [hsnCode, setHsnCode] = useState(
    () => getGstDefaultsForTransactionType(
      typeFromUrl || (editKind === 'order' ? 'SALES ORDERS' : DEFAULT_SALES_TRANSACTION_TYPE)
    ).hsnCode
  );
  const [lineItems, setLineItems] = useState<SalesLineItem[]>(() => {
    const d = getGstDefaultsForTransactionType(
      typeFromUrl || (editKind === 'order' ? 'SALES ORDERS' : DEFAULT_SALES_TRANSACTION_TYPE)
    );
    return [blankLine(1, d.gstRate, d.hsnCode)];
  });
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemModalRow, setItemModalRow] = useState<number | null>(null);
  const [itemSaving, setItemSaving] = useState(false);
  const [itemForm, setItemForm] = useState(itemDefaults());
  const [pendingNewParty, setPendingNewParty] = useState('');
  const [showAddConfirm, setShowAddConfirm] = useState(false);
  const [showAccountsDialog, setShowAccountsDialog] = useState(false);
  const [newPartyDetails, setNewPartyDetails] = useState<PhotoPartyDetails | null>(null);
  const [accountParties, setAccountParties] = useState<AccountParty[]>([]);
  const [pendingBroker, setPendingBroker] = useState('');
  const [showBrokerConfirm, setShowBrokerConfirm] = useState(false);
  const [showBrokerDialog, setShowBrokerDialog] = useState(false);
  const brokerPromptName = useRef('');
  const [savedBillId, setSavedBillId] = useState(editKind === 'bill' ? (editId || '') : '');
  const [savedBillLabel, setSavedBillLabel] = useState('');
  const [ewayBill, setEwayBill] = useState<EwayBillInfo | null>(null);
  const [ewayOpen, setEwayOpen] = useState(false);
  const [einvoice, setEinvoice] = useState<EinvoiceInfo | null>(null);
  const [einvoiceOpen, setEinvoiceOpen] = useState(false);
  const [voucherInput, setVoucherInput] = useState('');

  const applyTypeGstDefaults = (type: string) => {
    const d = getGstDefaultsForTransactionType(type, companyGstRate, companyHsnCode);
    setDefaultGstRate(d.gstRate);
    setDefaultHsnCode(d.hsnCode);
    setHsnCode(d.hsnCode);
    return d;
  };

  const autoGstType = gstTypeFromGstin(partyGstin, businessState);
  const gstType = gstTouched ? gstChoice : (autoGstType || gstTypeLabel(state, businessState));
  salesGstMode = gstModeFromType(gstTouched ? gstChoice : autoGstType);
  const gstDocumentType = getGstDocumentType(transactionType);
  // E-way applies to GST documents that move goods, per the Transaction Types master.
  const canGenerateEway = isBillEntry && Boolean(gstDocumentType);
  const invoiceLocked = Boolean(einvoice?.irn) && einvoice?.status !== 'cancelled';
  const voucherJump = useVoucherJump({
    module: isSalesOrder ? 'sales-order' : 'sales',
    transactionType: isSalesOrder ? undefined : transactionType,
    currentId: isEditMode ? editId : null,
    shownNumber: isSalesOrder ? (orderNo || nextOrderNo) : typeBillNumber,
    onError: setError
  });

  useEffect(() => {
    setVoucherInput(
      isSalesOrder
        ? String(orderNo || nextOrderNo)
        : plainBillNo(typeBillNumber)
    );
  }, [isSalesOrder, orderNo, nextOrderNo, transactionType, typeBillNumber]);
  const gstReturn = gstReturnSection(transactionType);
  const discountAccount = postingDiscountAccount(transactionType);

  const totals = useMemo(() => lineItems.reduce((acc, line) => ({
    pcs: round2(acc.pcs + toNum(line.pcs)),
    mts: round2(acc.mts + toNum(line.mtsQty)),
    netMts: round2(acc.netMts + netMetres(line.mtsQty, line.lessFold)),
    amount: round2(acc.amount + toNum(line.amount)),
    taxable: round2(acc.taxable + toNum(line.taxableAmount)),
    tax: round2(acc.tax + toNum(line.taxAmount)),
    net: round2(acc.net + toNum(line.totalAmount)),
    cgst: round2(acc.cgst + toNum(line.cgstAmount)),
    sgst: round2(acc.sgst + toNum(line.sgstAmount)),
    igst: round2(acc.igst + toNum(line.igstAmount))
  }), { pcs: 0, mts: 0, netMts: 0, amount: 0, taxable: 0, tax: 0, net: 0, cgst: 0, sgst: 0, igst: 0 }), [lineItems]);
  const billNet = isSalesOrder ? totals.net : roundRupee(totals.net);
  const roundOff = round2(billNet - totals.net);
  const lineDiscount = round2(lineItems.reduce((sum, line) => sum + toNum(line.discountAmount), 0));
  const shownDiscount = !isSalesOrder && lineDiscount > 0.5 ? lineDiscount : (!isSalesOrder ? billDiscount : 0);
  const impliedDiscPct = !isSalesOrder && lineDiscount <= 0.5 ? discountPercentOf(billDiscount, totals.amount) : 0;
  const netAfterDiscount = lineDiscount > 0.5 ? billNet : round2(billNet - shownDiscount);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const meta = await salesOrdersApi.getMeta();
        if (cancelled) return;
        setCompanyName(meta.companyName || '');
        setBusinessState(meta.businessState || '');
        const companyGst = meta.defaultGstRate || 5;
        const companyHsn = meta.defaultHsnCode || '5407';
        setCompanyGstRate(companyGst);
        setCompanyHsnCode(companyHsn);
        setNextOrderNo(meta.nextOrderNo || 1);
        setCustomers(meta.customers || []);
        partiesApi.list().then(result => {
          if (!cancelled) setAccountParties(result.parties || []);
        }).catch(() => undefined);
        setItems(meta.items || []);
        if (!editId) {
          const d = getGstDefaultsForTransactionType(transactionType, companyGst, companyHsn);
          setDefaultGstRate(d.gstRate);
          setDefaultHsnCode(d.hsnCode);
          setHsnCode(d.hsnCode);
          setOrderNo(String(meta.nextOrderNo || 1));
          setLineItems([blankLine(1, d.gstRate, d.hsnCode)]);
          setBillDiscount(0);
        }

        if (editId && (editKind === 'order' || transactionType === 'SALES ORDERS')) {
          const { order } = await salesOrdersApi.getById(editId);
          if (cancelled) return;
          setTransactionType('SALES ORDERS');
          applyOrderDoc(order, meta.businessState || '', companyGst, companyHsn);
        } else if (editId && editKind === 'bill') {
          const { bill, sources } = await salesOrdersApi.getBill(editId);
          if (cancelled) return;
          applyBillDoc(bill, meta.businessState || '', companyGst, companyHsn, sources || []);
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
    if (isSalesOrder || isEditMode) {
      if (isSalesOrder) setTypeBillNumber(null);
      return;
    }
    void bankEntriesApi.getNextTypeBillNumber({ transactionType, source: 'order' })
      .then(result => setTypeBillNumber(result.typeBillNumber))
      .catch(() => setTypeBillNumber(null));
  }, [transactionType, isSalesOrder, isEditMode]);

  useEffect(() => {
    // Sales Goods Return does not consume Sales Order pending — skip Ord/Ref SO list.
    if (isSalesOrder || isGoodsReturn || !partyName.trim()) {
      setPendingOrders([]);
      setPendingLoading(false);
      return;
    }
    setPendingLoading(true);
    const timer = window.setTimeout(() => {
      void salesOrdersApi.getPending({
        customerId: customerId || undefined,
        partyName: partyName.trim(),
        excludeId: editKind === 'bill' ? (editId || undefined) : undefined,
        transactionType
      })
        .then(({ entries }) => setPendingOrders(entries || []))
        .catch(() => setPendingOrders([]))
        .finally(() => setPendingLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [customerId, partyName, isSalesOrder, isGoodsReturn, editId, editKind, transactionType]);

  useEffect(() => {
    if (isSalesOrder || isGoodsReturn || isEditMode) return;
    void ordersApi.getOpenForms()
      .then(({ forms }) => setOpenForms(forms || []))
      .catch(() => setOpenForms([]));
  }, [isSalesOrder, isGoodsReturn, isEditMode]);

  const promptForms = useMemo(() => {
    const waiting = openForms.filter(form => form.id !== sourceOrderFormId && !dismissedForms.includes(form.id));
    const wanted = partyName.trim().toLowerCase();
    if (!wanted) return waiting;
    return waiting.filter(form =>
      (customerId && form.customerId === customerId)
      || form.buyerName.trim().toLowerCase() === wanted
    );
  }, [openForms, sourceOrderFormId, dismissedForms, partyName, customerId]);

  useEffect(() => {
    if (!promptForms.some(form => form.id === formPickId)) {
      setFormPickId(promptForms[0]?.id || '');
    }
  }, [promptForms, formPickId]);

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

  const applyBillDoc = (bill: Order, companyState: string, gstRate: number, hsn: string, sources: SalesOrder[] = []) => {
    setTransactionType(bill.transactionType || 'FINISH SALES');
    setTypeBillNumber(bill.typeBillNumber || null);
    setSavedBillId(bill.id);
    setSavedBillLabel(plainBillNo(bill.typeBillNumber) || String(bill.invoiceNumber || ''));
    setEwayBill(ewayFromBill(bill));
    setEinvoice(einvoiceFromBill(bill));
    setCustomerId(bill.customerId || '');
    setPartyName(bill.buyerName || '');
    setPartyGstin(bill.customer?.gstNumber || '');
    setState(bill.customer?.state || bill.station || '');
    setStation(bill.station || '');
    setBrokerName(bill.agentName || '');
    setTransportName(bill.transportName || '');
    setVehicleNo(bill.vehicleNo || '');
    setLrNo(bill.lrNo || '');
    setLrDate(bill.lrDate ? String(bill.lrDate).slice(0, 10) : '');
    setHaste(bill.haste || '');
    setHasteGstin(bill.hasteGstin || '');
    setDhara(String(bill.dhara ?? 0));
    setBillDiscount(empireBillDiscount(bill));
    setGrace(String(bill.grace ?? 0));
    setScreenSeries(bill.screenSeries || '');
    setSelectedSources(sources);
    setSourceSalesOrderId(bill.sourceSalesOrderId || sources[0]?.id || '');
    setSourceOrderFormId(bill.sourceOrderFormId || '');
    setOrderNo(
      sources.length
        ? sources.map(row => row.orderNo).join(', ')
        : (bill.orderNumber || '')
    );
    setOrderDate((bill.orderDate || bill.createdAt).slice(0, 10));
    setExpectedDate(bill.expectedDate?.slice(0, 10) || '');
    setRemarks(bill.remarks || '');
    const raw = Array.isArray(bill.orderLines) ? bill.orderLines : [];
    const grossAmount = raw.reduce((sum, line) => sum + (Number(line?.amount) || 0), 0);
    const billDiscPct = discountPercentOf(empireBillDiscount(bill), grossAmount);
    setLineItems(raw.length ? raw.map((line: any, index: number) => calcLine({
      ...blankLine(index + 1, gstRate, hsn),
      ...line,
      discountPercent: Number(line.discountPercent) > 0 ? Number(line.discountPercent) : billDiscPct,
      lineNo: line.lineNo || index + 1,
      sourceSalesOrderId: line.sourceSalesOrderId || bill.sourceSalesOrderId || null,
      sourceOrderNo: line.sourceOrderNo || (sources.length === 1 ? String(sources[0].orderNo) : null),
      sourceLineNo: line.sourceLineNo || line.lineNo || index + 1,
      sourceAllocations: Array.isArray(line.sourceAllocations) ? line.sourceAllocations : undefined,
      itemName: line.itemName || line.description || line.designName || '',
      mainScreen: line.mainScreen || line.designNo || '',
      pcs: toNum(line.pcs ?? line.quantity)
    }, companyState, bill.customer?.state || '')) : [blankLine(1, gstRate, hsn)]);
  };

  const clearLinkedOrder = () => {
    setSourceSalesOrderId('');
    setSourceOrderFormId('');
    setSelectedSources([]);
    setChecked({});
    setOrderNo('');
    if (!isSalesOrder) {
      setLineItems([blankLine(1, defaultGstRate, defaultHsnCode)]);
    }
  };

  const pickerRows = useMemo(() => {
    const byId = new Map(pendingOrders.map(order => [order.id, order]));
    for (const hit of challanHits) {
      if (!byId.has(hit.id)) byId.set(hit.id, hit);
    }
    for (const source of selectedSources) {
      if (!byId.has(source.id)) byId.set(source.id, source);
    }
    return Array.from(byId.values());
  }, [pendingOrders, challanHits, selectedSources]);

  const checkedCount = useMemo(() => Object.values(checked).filter(Boolean).length, [checked]);

  const openOrderPicker = () => {
    if (!partyName.trim() && !challanHits.length) {
      setError('Type a challan / SO number, or select the party.');
      return;
    }
    setChecked(Object.fromEntries(selectedSources.map(source => [source.id, true])));
    setPickerOpen(true);
    if (!pendingLoading && !pickerRows.length && partyName.trim()) {
      setError(picksChallan
        ? `No pending Sales Challans for ${partyName.trim()}. You can still add bill lines.`
        : `No pending Sales Orders for ${partyName.trim()}. You can still add bill lines.`);
    }
  };

  const loadByChallan = async () => {
    const no = challanQuery.trim();
    if (!no || isSalesOrder || isGoodsReturn) return;
    setChallanLoading(true);
    setError('');
    try {
      const { entries } = await salesOrdersApi.getByChallan(
        no,
        transactionType,
        editKind === 'bill' ? (editId || undefined) : undefined
      );
      const hits = entries || [];
      if (!hits.length) {
        setError(picksChallan ? `No Sales Challan ${no}.` : `No Sales Order for challan ${no}.`);
        return;
      }
      const open = hits.filter(order => toNum(order.pendingPcs) > 0.001 || toNum(order.pendingMts) > 0.001);
      if (picksChallan && !open.length) {
        setError(`Sales Challan ${no} is already billed.`);
        return;
      }
      const usable = open.length ? open : hits;
      setChallanHits(usable);
      if (usable.length === 1) {
        applyOrders(usable);
        setPickerOpen(false);
        return;
      }
      setChecked(Object.fromEntries(usable.map(order => [order.id, true])));
      setPickerOpen(true);
    } catch (err: any) {
      setError(err.message || 'Could not find that challan.');
    } finally {
      setChallanLoading(false);
    }
  };

  const toggleChecked = (id: string) => {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const applyOrders = (orders: SalesOrder[]) => {
    if (!orders.length) return;
    const primary = orders[0];
    setSelectedSources(orders);
    setSourceSalesOrderId(primary.id);
    setError('');
    setCustomerId(primary.customerId || customerId);
    setPartyName(primary.partyName);
    setPartyGstin(primary.partyGstin || partyGstin);
    setState(primary.state || state);
    setStation(primary.station || station);
    setBrokerName(primary.brokerName || brokerName);
    setTransportName(primary.transportName || transportName);
    setVehicleNo(primary.vehicleNo || vehicleNo);
    setHaste(primary.haste || haste);
    setHasteGstin(primary.hasteGstin || hasteGstin);
    setDhara(String(primary.dhara ?? dhara));
    setGrace(String(primary.grace ?? grace));
    setScreenSeries(primary.screenSeries || screenSeries);
    setOrderNo(orders.map(order => order.orderNo).join(', '));
    setRemarks(primary.remarks || remarks);
    setHsnCode(primary.hsnCode || hsnCode);
    const filled: SalesLineItem[] = [];
    for (const order of orders) {
      for (const line of order.pendingLines || []) {
        if (toNum(line.pendingPcs) <= 0 && toNum(line.pendingMts) <= 0) continue;
        filled.push(calcLine({
          ...blankLine(filled.length + 1, defaultGstRate, defaultHsnCode),
          ...line,
          lineNo: filled.length + 1,
          sourceSalesOrderId: picksChallan ? null : order.id,
          sourceChallanId: picksChallan ? order.id : null,
          sourceOrderNo: String(order.orderNo),
          sourceLineNo: line.lineNo || line.sourceLineNo,
          pcs: toNum(line.pendingPcs),
          mtsQty: toNum(line.pendingMts),
          cut: toNum(line.cut),
          lessFold: toNum(line.lessFold),
          bundleEntry: line.bundleEntry,
          rate: toNum(line.rate),
          bundles: toNum(line.bundles),
          packing: line.packing || 'NAKED',
          unit: line.unit || 'PCS',
          itemName: line.itemName || line.screenName || '',
          screenName: line.screenName || line.itemName || '',
          mainScreen: line.mainScreen || '',
          gstRate: toNum(line.gstRate) || defaultGstRate,
          hsnCode: line.hsnCode || defaultHsnCode
        }, businessState, order.state || state));
      }
    }
    const merged = mergeBillLines(filled).map(line => calcLine(line, businessState, primary.state || state));
    setLineItems(merged.length ? merged : [blankLine(1, defaultGstRate, defaultHsnCode)]);
    setSuccess(
      orders.length === 1
        ? `${picksChallan ? 'Sales Challan' : 'Sales Order'} #${primary.orderNo} loaded. All items are editable.`
        : `${orders.length} ${picksChallan ? 'Sales Challans' : 'Sales Orders'} loaded. Each line stays on its own row.`
    );
    setPickerOpen(false);
  };

  const applySelectedOrders = () => {
    const ids = Object.entries(checked).filter(([, on]) => on).map(([id]) => id);
    if (!ids.length) {
      clearLinkedOrder();
      setPickerOpen(false);
      return;
    }
    const orders = ids
      .map(id => pickerRows.find(row => row.id === id))
      .filter((row): row is SalesOrder => Boolean(row));
    applyOrders(orders);
  };

  const copyOrderForm = async (formId: string) => {
    setCopyingForm(true);
    setError('');
    try {
      const result = await ordersApi.prepareSaleFromForm(formId);
      const form = result.form;
      const customer = customers.find(row => row.id === form.customerId)
        || customers.find(row => row.organizationName.toLowerCase() === form.buyerName.trim().toLowerCase());
      const partyState = customer?.state || form.state || '';
      if (customer) {
        setCustomerId(customer.id);
        setPartyName(customer.organizationName);
        setPartyGstin(customer.gstNumber || form.gstNumber || '');
        setState(customer.state || partyState);
        setStation(customer.city || form.station || '');
        setBrokerName(customer.agentName || form.agentName || brokerName);
        const pct = partyDhara(customer);
        setDhara(String(pct));
        setGrace(String(partyGraceDays(customer)));
      } else if (form.buyerName) {
        setCustomerId(form.customerId || '');
        setPartyName(form.buyerName);
        setPartyGstin(form.gstNumber || '');
        setState(form.state || '');
        setStation(form.station || '');
        setBrokerName(form.agentName || '');
      }
      if (form.transportName) setTransportName(form.transportName);
      if (form.haste) setHaste(form.haste);
      if (form.remarks) setRemarks(form.remarks);
      setSourceOrderFormId(form.id);
      setSelectedSources([]);
      setSourceSalesOrderId('');
      setChecked({});
      setItems(prev => {
        const byId = new Map(prev.map(item => [item.id, item]));
        for (const item of result.items) byId.set(item.id, item);
        return Array.from(byId.values()).sort((a, b) => a.mainScreen.localeCompare(b.mainScreen) || a.name.localeCompare(b.name));
      });
      const pct = customer ? partyDhara(customer) : toNum(dhara);
      setLineItems(result.lines.map((line, index) => calcLine({
        ...blankLine(index + 1, line.gstRate || defaultGstRate, line.hsnCode || defaultHsnCode, pct),
        itemMasterId: line.itemMasterId,
        itemName: line.itemName,
        mainScreen: line.mainScreen,
        screenName: line.screenName,
        packing: line.packing,
        unit: line.unit,
        pcs: line.pcs,
        cut: line.cut,
        rate: line.rate,
        gstRate: line.gstRate || defaultGstRate,
        hsnCode: line.hsnCode || defaultHsnCode,
        sourceOrderNo: line.sourceOrderNo,
        sourceKind: 'order_form'
      }, businessState, partyState)));
      const added = result.createdNames.length
        ? ` ${result.createdNames.length} new design(s) added to item master: ${result.createdNames.join(', ')}. The next sale bill that picks these names fills cut, rate, HSN and GST from the master.`
        : ' These designs were already in item master, so cut, rate, HSN and GST came from there.';
      setSuccess(`Order form #${form.number || '—'} copied into this sale bill.${added}`);
    } catch (err: any) {
      setError(err.message || 'Could not copy the order form.');
    } finally {
      setCopyingForm(false);
    }
  };

  const chooseCustomer = (id: string) => {
    const customer = customers.find(row => row.id === id);
    if (!customer) return;
    const partyChanged = customer.organizationName.trim().toLowerCase() !== partyName.trim().toLowerCase();
    const auto = gstTypeFromGstin(customer.gstNumber, businessState);
    salesGstMode = gstModeFromType(auto);
    setGstTouched(false);
    setGstChoice(auto);
    setCustomerId(id);
    setPartyName(customer.organizationName);
    setPartyGstin(customer.gstNumber || '');
    setState(customer.state || '');
    setStation(customer.city || '');
    setBrokerName(customer.agentName || '');
    if (!isEditMode) {
      const pct = partyDhara(customer);
      const graceDays = partyGraceDays(customer);
      setDhara(String(pct));
      setGrace(String(graceDays));
      setLineItems(prev => prev.map(line => calcLine({ ...line, discountPercent: pct }, businessState, customer.state || '')));
    } else {
      setLineItems(prev => prev.map(line => calcLine(line, businessState, customer.state || '')));
    }
    if (partyChanged && !isSalesOrder) clearLinkedOrder();
  };

  const applyPartyByName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setCustomerId('');
      return;
    }
    const customer = customers.find(row => row.organizationName.toLowerCase() === trimmed.toLowerCase());
    if (customer) {
      if (!String(customer.gstNumber || '').trim()) {
        askIfMissing(
          { name: customer.organizationName, gstNumber: customer.gstNumber },
          () => chooseCustomer(customer.id),
          () => {
            setPartyName('');
            setCustomerId('');
          }
        );
        return;
      }
      chooseCustomer(customer.id);
      return;
    }
    if (!isSalesOrder && trimmed.toLowerCase() !== partyName.trim().toLowerCase()) {
      setCustomerId('');
      clearLinkedOrder();
    } else {
      setCustomerId('');
    }
    setPendingNewParty(trimmed);
    setShowAddConfirm(true);
  };

  const brokerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const party of accountParties) {
      if (/broker|brok/i.test(party.accountType || '')) names.add(party.name);
      if (party.accountGroup) names.add(party.accountGroup);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [accountParties]);

  const applyBrokerByName = (name: string) => {
    const trimmed = name.trim();
    setBrokerName(trimmed);
    if (!trimmed) return;
    const known = accountParties.some(party => party.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (known) {
      brokerPromptName.current = '';
      return;
    }
    if (brokerPromptName.current === trimmed.toLowerCase()) return;
    brokerPromptName.current = trimmed.toLowerCase();
    setPendingBroker(trimmed);
    setShowBrokerConfirm(true);
  };

  const onBrokerSaved = (party: AccountParty) => {
    setAccountParties(prev => (prev.some(row => row.id === party.id) ? prev : [...prev, party]));
    setBrokerName(party.name);
    brokerPromptName.current = '';
    setShowBrokerDialog(false);
  };

  const onPartySaved = (party: AccountParty) => {
    setCustomers(prev => {
      if (prev.some(row => row.id === party.id)) return prev;
      return [...prev, {
        id: party.id,
        organizationName: party.name,
        gstNumber: party.gstNumber,
        panNumber: party.panNumber,
        contactPersonName: party.contactPersonName,
        mobileNumber: party.mobileNumber,
        agentName: party.brokerName || party.agentName,
        accountType: party.accountType,
        state: party.state,
        city: party.city,
        pincode: party.pincode,
        dhara: party.dhara,
        discountRate: party.discountRate ?? party.dhara,
        graceDays: party.graceDays,
        interestRate: party.interestRate
      }];
    });
    setCustomerId(party.id);
    setPartyName(party.name);
    setPartyGstin(party.gstNumber || '');
    setState(party.state || '');
    setStation(party.city || '');
    setBrokerName(party.brokerName || party.agentName || '');
    if (!isEditMode) {
      const pct = partyDhara(party);
      const graceDays = partyGraceDays(party);
      setDhara(String(pct));
      setGrace(String(graceDays));
      setLineItems(prev => prev.map(line => calcLine({ ...line, discountPercent: pct }, businessState, party.state || '')));
    } else {
      setLineItems(prev => prev.map(line => calcLine(line, businessState, party.state || '')));
    }
  };

  const applyPhoto = (x: PhotoExtraction) => {
    const notes: string[] = [`Filled into ${transactionType}. Saving keeps this type.`];
    const pool: Array<Customer & { name: string }> = customers.map(c => ({ ...c, name: c.organizationName }));
    const match = matchPhotoParty(pool, x);
    const partyState = match?.state || photoPartyState(x);
    const pct = x.discountPercent || (match ? partyDhara(match) : toNum(dhara));
    if (match) {
      chooseCustomer(match.id);
    } else if (x.party.name) {
      setCustomerId('');
      setPartyName(x.party.name);
      setPartyGstin(x.party.gstin);
      setState(partyState);
      setStation(x.party.city);
      setPendingNewParty(x.party.name);
      setNewPartyDetails(photoPartyDetails(x));
      setShowAddConfirm(true);
      notes.push(`"${x.party.name}" is not in your party master — add it with the details from the photo.`);
    }
    if (x.broker) setBrokerName(x.broker);
    if (x.transport.name) setTransportName(x.transport.name);
    if (x.transport.lrNo) setLrNo(x.transport.lrNo);
    if (x.transport.vehicleNo) setVehicleNo(x.transport.vehicleNo);
    const ref = [x.orderNo && `Order ${x.orderNo}`, x.docNo && `Ref ${x.docNo}`].filter(Boolean).join(' · ');
    if (x.remarks || ref) setRemarks([ref, x.remarks].filter(Boolean).join(' — '));
    if (x.hsn) setHsnCode(x.hsn);
    if (x.lines.length) {
      setLineItems(x.lines.map((line, index) => {
        const basis = rateBasisQty(line);
        return calcLine({
          ...blankLine(index + 1, line.gstRate || x.gstRate || defaultGstRate, line.hsn || x.hsn || defaultHsnCode, pct),
          itemName: line.description,
          mainScreen: line.description,
          screenName: line.description,
          unit: basis.perMetre || line.mts || line.lessFold ? 'MTR' : 'PCS',
          pcs: line.pcs || (basis.perMetre ? 0 : basis.qty),
          cut: line.cut,
          mtsQty: line.mts || (basis.perMetre ? basis.qty : 0),
          lessFold: line.lessFold || 0,
          rate: line.rate
        }, businessState, partyState);
      }));
    } else {
      notes.push('No item lines were read — add the items by hand.');
    }
    notes.push('Bill no. and date follow your own sales series — they were not taken from the photo.');
    return notes;
  };

  const updateLine = (index: number, key: keyof SalesLineItem, value: string | number) => {
    if (einvoice?.irn && einvoice.status !== 'cancelled') return;
    const current = lineItems[index];
    if ((key === 'rate' || key === 'cut') && toNum(value) > 0 && current) {
      const name = String(current.itemName || '').trim().toLowerCase();
      setItems(prev => prev.map(item => {
        const match = (current.itemMasterId && item.id === current.itemMasterId)
          || (name && item.name.trim().toLowerCase() === name);
        if (!match) return item;
        return key === 'rate' ? { ...item, sellingRate: toNum(value) } : { ...item, cut: toNum(value) };
      }));
    }
    setLineItems(prev => prev.map((line, row) => {
      if (row !== index) return line;
      const next = { ...line, [key]: value };
      if (key === 'pcs' || key === 'cut' || key === 'mtsQty') delete next.bundleEntry;
      if (key === 'pcs' || key === 'cut') next.mtsQty = round2(toNum(next.pcs) * toNum(next.cut));
      if (key === 'mainScreen' && !next.itemName) next.itemName = String(value);
      if (key === 'itemName' && !next.screenName) next.screenName = String(value);
      return calcLine(next, businessState, state);
    }));
  };

  const updateBundle = (index: number, raw: string) => {
    if (einvoice?.irn && einvoice.status !== 'cancelled') return;
    const text = raw.replace(/[^0-9.*xX+\s]/g, '');
    const parsed = parseBundleCut(text);
    if (parsed) {
      const current = lineItems[index];
      if (current && parsed.cut > 0) {
        const name = String(current.itemName || '').trim().toLowerCase();
        setItems(prev => prev.map(item => {
          const match = (current.itemMasterId && item.id === current.itemMasterId)
            || (name && item.name.trim().toLowerCase() === name);
          return match ? { ...item, cut: parsed.cut } : item;
        }));
      }
      setLineItems(prev => prev.map((line, row) => row === index ? calcLine({
        ...line,
        bundleEntry: text,
        bundles: parsed.pcs,
        pcs: parsed.pcs,
        cut: parsed.cut,
        mtsQty: parsed.mts,
        unit: 'MTR'
      }, businessState, state) : line));
      return;
    }
    setLineItems(prev => prev.map((line, row) => {
      if (row !== index) return line;
      const next = { ...line, bundleEntry: text, bundles: toNum(text) };
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
      hsnCode: String(item.hsnSac || '').trim() || defaultHsnCode
    }, businessState, state) : line));
    const masterHsn = String(item.hsnSac || '').trim();
    if (masterHsn) setHsnCode(masterHsn);
  };

  const applyMasterIfKnown = (index: number, query: string) => {
    const line = lineItems[index];
    const found = findSalesItem(items, query, { name: line?.itemName, mainScreen: line?.mainScreen });
    if (found) applyItem(index, found);
    return found;
  };

  const checkUnknownMainScreen = (index: number, typed?: string) => {
    const line = lineItems[index];
    const value = (typed ?? line?.mainScreen ?? '').trim();
    if (!value) return;
    const found = findSalesItem(items, value, { name: line?.itemName, mainScreen: value });
    if (found) {
      applyItem(index, found);
      return;
    }
    if (window.confirm(`"${value}" is not in Quality Information. Add a new item now?`)) {
      setItemModalRow(index);
      setItemForm({
        ...itemDefaults(value, { gstRate: defaultGstRate, hsnCode: defaultHsnCode }),
        name: line?.itemName?.trim() || value,
        mainScreen: value
      });
      setItemModalOpen(true);
    }
  };

  const saveItemMaster = async () => {
    if (!itemForm.name.trim() || !itemForm.mainScreen.trim()) {
      setError('Item name and Main Screen are required.');
      return;
    }
    setItemSaving(true);
    try {
      const { item } = await salesOrdersApi.createItem(itemForm);
      setItems(prev => {
        const next = prev.some(row => row.id === item.id)
          ? prev.map(row => row.id === item.id ? item : row)
          : [...prev, item];
        return next.sort((a, b) => a.mainScreen.localeCompare(b.mainScreen) || a.name.localeCompare(b.name));
      });
      if (itemModalRow != null) applyItem(itemModalRow, item);
      setItemModalOpen(false);
      setSuccess(`Quality Information saved for ${item.name}. Rate ${toNum(item.sellingRate)} will fill when you pick this name again.`);
    } catch (err: any) {
      if (String(err.message || '').toLowerCase().includes('already exists')) {
        try {
          const { items: latest } = await salesOrdersApi.getItems();
          setItems(latest || []);
          const existing = findSalesItem(latest || [], itemForm.name, { name: itemForm.name, mainScreen: itemForm.mainScreen })
            || (latest || []).find(row => itemKey(row.name) === itemKey(itemForm.name) && itemKey(row.mainScreen) === itemKey(itemForm.mainScreen));
          if (existing && itemModalRow != null) {
            const { item } = await salesOrdersApi.updateItem(existing.id, itemForm);
            setItems(prev => prev.map(row => row.id === item.id ? item : row));
            applyItem(itemModalRow, item);
            setItemModalOpen(false);
            setSuccess(`Quality Information updated for ${item.name}.`);
            return;
          }
        } catch {
          // fall through to the original error
        }
      }
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
    lrDate: lrDate || undefined,
    haste,
    hasteGstin,
    dhara: toNum(dhara),
    grace: toNum(grace),
    screenSeries,
    orderDate,
    expectedDate: expectedDate || undefined,
    remarks,
    hsnCode: String(hsnCode || '').trim() && String(hsnCode || '').trim() !== defaultHsnCode
      ? hsnCode
      : (lineItems.map(line => String(line.hsnCode || '').trim()).find(code => code && code !== defaultHsnCode) || hsnCode),
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
          setLineItems([blankLine(1, defaultGstRate, defaultHsnCode, toNum(dhara))]);
          setRemarks('');
        }
      } else {
        const body = {
          ...payload,
          sourceSalesOrderId: isGoodsReturn ? undefined : (sourceSalesOrderId || undefined),
          sourceSalesOrderIds: isGoodsReturn ? undefined : selectedSources.map(source => source.id),
          sourceOrderFormId: isGoodsReturn ? undefined : (sourceOrderFormId || undefined),
          orderNumber: orderNo || undefined
        };
        const result = editId && editKind === 'bill'
          ? await salesOrdersApi.updateBill(editId, body)
          : await salesOrdersApi.createBill(body);
        setSavedBillId(result.bill.id);
        setTypeBillNumber(result.bill.typeBillNumber ?? null);
        const no = plainBillNo(result.bill.typeBillNumber) || result.bill.invoiceNumber || '-';
        setSavedBillLabel(String(no));
        setEwayBill(ewayFromBill(result.bill));
        setEinvoice(einvoiceFromBill(result.bill));
        setSuccess(
          isGoodsReturn
            ? `Sales Goods Return #${no} ${isEditMode ? 'updated' : 'saved'}. Credited to party ledger.`
            : transactionType === 'SALES CHALLAN'
              ? `Sales Challan #${no} ${isEditMode ? 'updated' : 'saved'}.`
              : `${transactionType} bill #${no} ${isEditMode ? 'updated' : 'saved'}. Posted to ledger.`
        );
        if (!isEditMode) {
          setLineItems([blankLine(1, defaultGstRate, defaultHsnCode, toNum(dhara))]);
          setSourceSalesOrderId('');
          setSourceOrderFormId('');
          setOpenForms(prev => prev.filter(form => form.id !== sourceOrderFormId));
          setSelectedSources([]);
          setChecked({});
          setOrderNo('');
          setRemarks('');
          setLrNo('');
          setLrDate('');
          setEinvoice(null);
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

  const printCurrentBill = async () => {
    const profile = await invoicesApi.getProfile().then(result => result.profile).catch(() => null);
    const customer = customers.find(row => row.id === customerId);
    const qrDataUrl = einvoice?.signedQr && einvoice.status !== 'cancelled'
      ? await QRCode.toDataURL(einvoice.signedQr, { margin: 0, width: 160 }).catch(() => '')
      : '';
    const plainNo = savedBillLabel || plainBillNo(typeBillNumber);
    const suffix = getPostingRule(transactionType)?.billSuffix;
    const printedNo = suffix ? `${plainNo}/${suffix}` : plainNo;
    const printable = lineItems.filter(line => (line.itemName || line.mainScreen || '').trim() && (toNum(line.pcs) > 0 || toNum(line.amount) > 0));
    const opened = openSaleBillPrint({
      companyName: profile?.tradeName || profile?.legalName || companyName,
      companyAddress: [profile?.addressLine1, profile?.addressLine2, profile?.city, profile?.pincode].filter(Boolean).join(', '),
      companyPhone: [profile?.phone, profile?.mobileNumber].filter(Boolean).join(', '),
      companyGstin: profile?.gstNumber || '',
      companyPan: profile?.panNumber || '',
      companyUdyam: profile?.udyamNumber || '',
      billNo: printedNo,
      billDate: orderDate,
      partyName,
      partyGstin: partyGstin || customer?.gstNumber || '',
      address1: customer?.address || '',
      address2: customer?.addressLine2 || '',
      city: customer?.city || station,
      state: customer?.state || state,
      pincode: customer?.pincode || '',
      phone: customer?.mobileNumber || '',
      broker: brokerName,
      haste,
      station,
      transport: transportName,
      lrNo,
      lrDate,
      orderNo,
      hsn: hsnCode || printable.find(line => line.hsnCode)?.hsnCode || '',
      dueDays: Number(grace) || 0,
      remarks,
      terms: profile?.terms || '',
      lines: printable.map(line => ({
        itemName: line.itemName || line.mainScreen,
        category: line.mainScreen || '',
        pack: line.packing || '',
        cloth: line.screenName && line.screenName !== line.itemName ? line.screenName : '',
        pcs: toNum(line.pcs),
        cut: toNum(line.cut),
        lessFold: toNum(line.lessFold),
        mts: toNum(line.mtsQty),
        rate: toNum(line.rate),
        unit: line.unit || 'PCS',
        amount: toNum(line.amount),
        gstRate: toNum(line.gstRate)
      })),
      totalPcs: totals.pcs,
      totalMts: totals.mts,
      grossAmount: totals.amount,
      taxable: totals.taxable,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      netAmount: isSalesOrder ? totals.net : billNet,
      discount: shownDiscount,
      bankName: profile?.bankName || '',
      bankAccount: profile?.bankAccount || '',
      bankIfsc: profile?.bankIfsc || '',
      irn: einvoice?.status === 'cancelled' ? '' : (einvoice?.irn || ''),
      ackNo: einvoice?.status === 'cancelled' ? '' : (einvoice?.ackNo || ''),
      ewayBillNo: ewayBill?.ewayBillNo || '',
      transporterId: ewayBill?.transporterId || '',
      qrDataUrl
    });
    if (!opened) setError('Allow pop-ups for this site, then print the bill again.');
  };

  const deleteDocument = async () => {
    if (!editId) return;
    try {
      if (isSalesOrder || editKind === 'order') await salesOrdersApi.delete(editId);
      else await salesOrdersApi.deleteBill(editId);
      window.location.href = '/erp/sales';
    } catch (err: any) {
      setError(err.message || 'Could not delete this entry.');
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
          <ErpPageBack onBack={onBack} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { window.location.href = '/erp/reports/sales-order'; }} className="rounded-xl border bg-white px-3 py-2 text-xs font-black uppercase text-indigo-800">
              Sales Order Report
            </button>
            <button type="button" onClick={() => { window.location.href = '/erp/reports/finish-sales'; }} className="rounded-xl border bg-white px-3 py-2 text-xs font-black uppercase text-fuchsia-800">
              Sales Register / Return
            </button>
            <PhotoEntryButton kind="sales" series={transactionType} onApply={applyPhoto} disabled={loading} />
          </div>
        </div>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        {success && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</div>}
        {isBillEntry && !isGoodsReturn && !isEditMode && promptForms.length > 0 && (() => {
          const picked = promptForms.find(form => form.id === formPickId) || promptForms[0];
          return (
            <div className="mb-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
              <p className="text-sm font-black text-indigo-950">
                Copy this sale bill from order form #{picked.number || '—'}?
              </p>
              <p className="mt-1 text-xs font-semibold text-indigo-800">
                {picked.buyerName || 'No party'} · {picked.designCount} design{picked.designCount === 1 ? '' : 's'}
                {picked.station ? ` · ${picked.station}` : ''}
                . Yes adds any new designs to item master, then fills this bill. Later bills that pick the same item get cut, rate, HSN and GST from the master.
              </p>
              {promptForms.length > 1 && (
                <label className="mt-2 block text-[10px] font-black uppercase text-indigo-700">
                  Other waiting order forms
                  <select
                    className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-sm font-semibold text-indigo-950"
                    value={picked.id}
                    onChange={e => setFormPickId(e.target.value)}
                  >
                    {promptForms.map(form => (
                      <option key={form.id} value={form.id}>
                        #{form.number || '—'} · {form.buyerName} · {form.designCount} design{form.designCount === 1 ? '' : 's'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={copyingForm}
                  onClick={() => void copyOrderForm(picked.id)}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-50"
                >
                  {copyingForm ? 'Copying…' : 'Yes, copy'}
                </button>
                <button
                  type="button"
                  disabled={copyingForm}
                  onClick={() => setDismissedForms(prev => prev.includes(picked.id) ? prev : [...prev, picked.id])}
                  className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-black uppercase text-indigo-800"
                >
                  Not now
                </button>
              </div>
            </div>
          );
        })()}

        <ErpFormShell onSave={() => void handleSave()} saving={saving}>
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h1 className="text-lg font-black uppercase tracking-wide text-gray-900">
                {isSalesOrder ? 'Sales Orders' : isGoodsReturn ? 'Sales Goods Return' : isFinishSales ? 'Finish Sales' : transactionType}
                {isEditMode ? ' · Edit' : ' · Add Mode'}
              </h1>
              <div className="flex items-center gap-2">
                {isEditMode && <DeleteEntryButton onDelete={deleteDocument} disabled={saving} />}
                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                  isSalesOrder
                    ? 'bg-indigo-100 text-indigo-800'
                    : isGoodsReturn
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-fuchsia-100 text-fuchsia-800'
                }`}>
                  {isSalesOrder ? 'Order form · No ledger' : isGoodsReturn ? 'Return · Credits ledger' : 'Bill · Posts to ledger'}
                </span>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
              <label><span className={labelClass}>Company</span><input className={readonlyClass} value={companyName} readOnly /></label>
              <label>
                <span className={labelClass}>Type</span>
                <select
                  className={inputClass}
                  value={transactionType}
                  onChange={e => {
                    const next = e.target.value;
                    if (next === transactionType) return;
                    if (isEditMode) {
                      window.location.href = `/erp/sales?type=${encodeURIComponent(next)}`;
                      return;
                    }
                    setTransactionType(next);
                    setSourceSalesOrderId('');
                    setSelectedSources([]);
                    setChecked({});
                    setOrderNo('');
                    setPendingOrders([]);
                    const d = applyTypeGstDefaults(next);
                    setLineItems([blankLine(1, d.gstRate, d.hsnCode)]);
                  }}
                >
                  {ERP_TRANSACTION_TYPES.filter(type => type.category === 'sales').map(type => (
                    <option key={type.value} value={type.value}>{type.value}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className={labelClass}>{isSalesOrder ? 'Order No.' : 'Bill / Voucher No.'}</span>
                <input
                  className={inputClass}
                  value={voucherInput}
                  onChange={e => setVoucherInput(e.target.value)}
                  {...voucherJump.voucherFieldProps}
                />
              </label>
              <label><span className={labelClass}>Date</span><input type="date" className={inputClass} value={orderDate} readOnly={invoiceLocked} onChange={e => setOrderDate(e.target.value)} /></label>
              <label>
                <span className={labelClass}>GST Type</span>
                <GstTypeSelect
                  className={inputClass}
                  value={gstType}
                  onChange={value => {
                    setGstTouched(true);
                    setGstChoice(value);
                    salesGstMode = gstModeFromType(value);
                    const seriesRate = getGstDefaultsForTransactionType(transactionType, companyGstRate, companyHsnCode).gstRate;
                    setLineItems(prev => prev.map(line => calcLine({
                      ...line,
                      gstRate: isNonGstType(value) ? 0 : (toNum(line.gstRate) || seriesRate)
                    }, businessState, state)));
                  }}
                />
              </label>
              <label className="md:col-span-2">
                <span className={labelClass}>GST Document{gstReturn !== 'NONE' ? ` · ${gstReturn}` : ''}</span>
                <input className={readonlyClass} value={gstDocumentType || '—'} readOnly />
              </label>
              <label className="md:col-span-2">
                <span className={labelClass}>Posts To</span>
                <input className={readonlyClass} value={postingSummary(transactionType)} readOnly />
              </label>
              {discountAccount && (
                <label>
                  <span className={labelClass}>Disc A/C</span>
                  <input className={readonlyClass} value={discountAccount} readOnly />
                </label>
              )}
              <label className="md:col-span-2">
                <span className={labelClass}>{(isFinishSales || isGoodsReturn) ? '1. Party (required first)' : 'Party'}</span>
                <input
                  className={`${inputClass} ${(isFinishSales || isGoodsReturn) ? 'border-amber-400 bg-amber-50' : ''}`}
                  list="erp-sales-parties"
                  readOnly={invoiceLocked}
                  value={partyName}
                  placeholder={(isFinishSales || isGoodsReturn) ? 'Select or type party name first' : ''}
                  onChange={e => {
                    const next = e.target.value;
                    const changed = next.trim().toLowerCase() !== partyName.trim().toLowerCase();
                    setPartyName(next);
                    if (!isSalesOrder && changed) {
                      // Drop old customerId so Ord/Ref queries by the typed party name.
                      setCustomerId('');
                      clearLinkedOrder();
                    }
                    if (!next.trim()) setCustomerId('');
                  }}
                  onBlur={e => applyPartyByName(e.target.value)}
                />
                <datalist id="erp-sales-parties">
                  {customers.map(customer => <option key={customer.id} value={customer.organizationName} />)}
                </datalist>
              </label>
              {isGoodsReturn && (
                <label className="md:col-span-2">
                  <span className={labelClass}>2. Ref / Original Bill (optional)</span>
                  <input
                    className={`${inputClass} border-amber-300 bg-amber-50`}
                    value={orderNo}
                    onChange={e => {
                      setOrderNo(e.target.value);
                      setSourceSalesOrderId('');
                    }}
                    placeholder="Original bill / challan reference"
                  />
                </label>
              )}
              {isBillEntry && !isGoodsReturn && (
                <label className="md:col-span-2">
                  <span className={labelClass}>
                    {picksChallan
                      ? '2. Challan no. — loads the sales challan and the party'
                      : '2. Challan / SO no. — loads the order and the party'}
                    {selectedSources.length > 1 ? ` · ${selectedSources.length}` : ''}
                  </span>
                  <div className="flex gap-2">
                    <input
                      className={inputClass}
                      value={challanQuery}
                      placeholder={picksChallan ? 'Sales challan number' : 'Challan or SO number'}
                      onChange={e => setChallanQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        void loadByChallan();
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void loadByChallan()}
                      disabled={challanLoading || !challanQuery.trim()}
                      className="shrink-0 rounded-lg bg-indigo-700 px-3 text-xs font-black uppercase text-white disabled:bg-gray-300"
                    >
                      {challanLoading ? '…' : 'Load'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={openOrderPicker}
                    disabled={(!partyName.trim() && !challanHits.length) || pendingLoading}
                    className={`${inputClass} mt-2 truncate text-left text-indigo-800 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400`}
                  >
                    {pendingLoading
                      ? 'Loading party orders…'
                      : orderNo
                        ? `${picksChallan ? 'Challan' : 'SO'} ${orderNo}`
                        : partyName.trim()
                          ? (picksChallan ? 'Or pick from this party’s pending challans' : 'Or pick from this party’s pending orders')
                          : 'Or pick after the challan is found'}
                  </button>
                </label>
              )}
              <label><span className={labelClass}>State</span><input className={inputClass} value={state} onChange={e => setState(e.target.value)} /></label>
              <label><span className={labelClass}>Haste</span><input className={inputClass} value={haste} onChange={e => setHaste(e.target.value)} /></label>
              <label>
                <span className={labelClass}>Broker</span>
                <input
                  className={inputClass}
                  list="erp-sales-brokers"
                  value={brokerName}
                  onChange={e => setBrokerName(e.target.value)}
                  onBlur={e => applyBrokerByName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    applyBrokerByName((e.target as HTMLInputElement).value);
                  }}
                />
                <datalist id="erp-sales-brokers">
                  {brokerOptions.map(name => <option key={name} value={name} />)}
                </datalist>
              </label>
              <label><span className={labelClass}>Haste GSTIN</span><input className={inputClass} value={hasteGstin} onChange={e => setHasteGstin(e.target.value)} /></label>
              <label>
                <span className={labelClass}>Dhara</span>
                <input
                  className={inputClass}
                  type="number"
                  value={dhara}
                  onChange={e => {
                    const next = e.target.value;
                    setDhara(next);
                    const pct = toNum(next);
                    setLineItems(prev => prev.map(line => calcLine({ ...line, discountPercent: pct }, businessState, state)));
                  }}
                />
              </label>
              <label><span className={labelClass}>Grace</span><input className={inputClass} type="number" value={grace} onChange={e => setGrace(e.target.value)} /></label>
              <label><span className={labelClass}>Station</span><input className={inputClass} value={station} onChange={e => setStation(e.target.value)} /></label>
              <label><span className={labelClass}>Transport</span><input className={inputClass} value={transportName} onChange={e => setTransportName(e.target.value)} /></label>
              <label><span className={labelClass}>Vehicle No.</span><input className={inputClass} value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} /></label>
              {!isSalesOrder && <label><span className={labelClass}>LR No. / AWB</span><input className={inputClass} value={lrNo} onChange={e => setLrNo(e.target.value)} /></label>}
              {!isSalesOrder && <label><span className={labelClass}>LR Date</span><input type="date" className={inputClass} value={lrDate} onChange={e => setLrDate(e.target.value)} /></label>}
              <label><span className={labelClass}>Screen Series</span><input className={inputClass} value={screenSeries} onChange={e => setScreenSeries(e.target.value)} /></label>
              <label><span className={labelClass}>Party GSTIN</span><input className={inputClass} value={partyGstin} onChange={e => setPartyGstin(e.target.value)} /></label>
              {isSalesOrder && <label><span className={labelClass}>Delivery Due Date</span><input type="date" className={inputClass} value={expectedDate} onChange={e => setExpectedDate(e.target.value)} /></label>}
              <label><span className={labelClass}>HSN Code</span><input className={inputClass} value={hsnCode} onChange={e => setHsnCode(e.target.value)} /></label>
              <label className="md:col-span-2"><span className={labelClass}>Remark</span><input className={inputClass} value={remarks} onChange={e => setRemarks(e.target.value)} /></label>
            </div>
            {selectedSources.length > 1 && (
              <div className="mt-3 rounded-xl border border-indigo-200 bg-white p-3">
                <p className={labelClass}>This bill covers {selectedSources.length} {picksChallan ? 'Sales Challans' : 'Sales Orders'}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedSources.map(source => {
                    const billed = lineItems
                      .filter(line => line.sourceSalesOrderId === source.id || line.sourceChallanId === source.id)
                      .reduce((sum, line) => sum + toNum(line.pcs), 0);
                    return (
                      <span
                        key={source.id}
                        className="rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-900"
                        title={`${source.pendingPcs} pcs pending on this order`}
                      >
                        {picksChallan ? 'Ch' : 'SO'} {source.orderNo} · {round2(billed)} pcs
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section data-erp-line-grid className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b bg-indigo-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-800">
                {isSalesOrder
                  ? 'Particulars · Main Screen · Screen Name · Amount = PCS × Rate'
                  : isGoodsReturn
                    ? 'Return items · editable lines · amount credits party ledger'
                    : partyName.trim()
                      ? (selectedSources.length
                        ? `Items from ${picksChallan ? 'Sales Challan' : 'Sales Order'} #${orderNo || ''} — all fields editable`
                        : (picksChallan
                          ? 'Add lines here, or pick a sales challan above'
                          : 'Add lines here, or pick Ord / Ref above to load Sales Orders'))
                      : (picksChallan
                        ? 'Select Party first. You can bill without a Sales Challan.'
                        : 'Select Party first. You can bill without a Sales Order.')}
              </p>
              <button
                type="button"
                data-erp-add-line
                disabled={invoiceLocked}
                onClick={() => setLineItems(prev => [...prev, blankLine(Math.max(0, ...prev.map(line => toNum(line.lineNo))) + 1, defaultGstRate, defaultHsnCode, toNum(dhara))])}
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
                      ? ['#', 'Main Screen', 'HSN', 'Bundles', 'Screen Name', 'Packing', 'Unit', 'PCS', 'Cut', 'MTS/Qty', 'Net Mtrs', 'Rate', 'Amount', 'Less Fold', 'R.D.', 'Disc %', 'Manual Add/Ls', 'IGST %', 'SGST %', 'CGST/IGST Amt', '']
                      : ['#', 'Ref', 'Item Name', 'HSN', 'Bundles', 'Design No', 'Packing', 'Unit', 'PCS', 'Cut', 'MTS/Qty', 'Net Mtrs', 'Rate', 'Amount', 'Less Fold', 'Disc %', 'Add/Less', 'GST %', 'Tax', 'Net', '']
                    ).map(head => <th key={head} className="px-2 py-2 font-black">{head}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((line, index) => (
                    <tr key={index} data-erp-line className="border-b odd:bg-white even:bg-slate-50">
                      <td className="px-2 py-1.5 font-black">{index + 1}</td>
                      {!isSalesOrder && (
                        <td className="px-2 py-1.5 text-right font-semibold text-amber-800">
                          {line.sourceKind === 'order_form'
                            ? `OF ${line.sourceOrderNo || ''}`
                            : line.sourceChallanId
                              ? `Ch ${line.sourceOrderNo || ''}`
                              : line.sourceOrderNo ? `SO ${line.sourceOrderNo}` : (line.sourceLineNo || '-')}
                        </td>
                      )}
                      {isSalesOrder ? (
                        <>
                          <td className="min-w-[150px] px-1 py-1.5">
                            <input className={inputClass} list="main-screen-names" value={line.mainScreen} onChange={e => updateLine(index, 'mainScreen', e.target.value)} onBlur={e => checkUnknownMainScreen(index, e.target.value)} />
                          </td>
                          <td className="px-1 py-1.5"><input data-erp-line-default className={`${inputClass} min-w-[5.5rem]`} value={line.hsnCode || ''} onChange={e => updateLine(index, 'hsnCode', e.target.value)} /></td>
                          <td className="px-1 py-1.5"><input className={`${inputClass} min-w-[4.5rem]`} value={line.bundleEntry ?? (line.bundles ? String(line.bundles) : '')} onChange={e => updateBundle(index, e.target.value)} /></td>
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
                                applyMasterIfKnown(index, value);
                              }}
                              onBlur={e => applyMasterIfKnown(index, e.target.value)}
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
                              onChange={e => {
                                updateLine(index, 'itemName', e.target.value);
                                applyMasterIfKnown(index, e.target.value);
                              }}
                              onBlur={e => applyMasterIfKnown(index, e.target.value)}
                            />
                          </td>
                          <td className="px-1 py-1.5"><input data-erp-line-default className={`${inputClass} min-w-[5.5rem]`} value={line.hsnCode || ''} onChange={e => updateLine(index, 'hsnCode', e.target.value)} /></td>
                          <td className="px-1 py-1.5"><input className={`${inputClass} min-w-[4.5rem]`} value={line.bundleEntry ?? (line.bundles ? String(line.bundles) : '')} onChange={e => updateBundle(index, e.target.value)} /></td>
                          <td className="min-w-[140px] px-1 py-1.5">
                            <input className={inputClass} list="main-screen-names" value={line.mainScreen} onChange={e => updateLine(index, 'mainScreen', e.target.value)} onBlur={e => checkUnknownMainScreen(index, e.target.value)} />
                          </td>
                        </>
                      )}
                      <td className="px-1 py-1.5"><input data-erp-line-default className={inputClass} value={line.packing} onChange={e => updateLine(index, 'packing', e.target.value)} /></td>
                      <td className="px-1 py-1.5"><input data-erp-line-default className={inputClass} value={line.unit} onChange={e => updateLine(index, 'unit', e.target.value)} /></td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.pcs || ''} onChange={e => updateLine(index, 'pcs', toNum(e.target.value))} /></td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.cut || ''} onChange={e => updateLine(index, 'cut', toNum(e.target.value))} /></td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.mtsQty || ''} onChange={e => updateLine(index, 'mtsQty', toNum(e.target.value))} /></td>
                      <td className="px-2 py-1.5 text-right font-semibold">{netMetres(line.mtsQty, line.lessFold).toFixed(2)}</td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.rate || ''} onChange={e => updateLine(index, 'rate', toNum(e.target.value))} /></td>
                      <td className="px-2 py-1.5 text-right font-bold">{round2(toNum(line.amount)).toFixed(2)}</td>
                      <td className="px-1 py-1.5"><input className={inputClass} type="number" value={toNum(line.lessFold) || ''} onChange={e => updateLine(index, 'lessFold', toNum(e.target.value))} /></td>
                      {isSalesOrder ? (
                        <>
                          <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.rd || ''} onChange={e => updateLine(index, 'rd', toNum(e.target.value))} /></td>
                          <td className="px-1 py-1.5"><input data-erp-line-default className={inputClass} type="number" value={toNum(line.discountPercent) > 0 ? line.discountPercent : (impliedDiscPct || '')} onChange={e => updateLine(index, 'discountPercent', toNum(e.target.value))} /></td>
                          <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.manualAddLess || ''} onChange={e => updateLine(index, 'manualAddLess', toNum(e.target.value))} /></td>
                          <td className="px-2 py-1.5 text-right font-bold">{round2(toNum(line.igstRate)).toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right font-bold">{round2(toNum(line.sgstRate)).toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right font-bold">{round2(toNum(line.taxAmount)).toFixed(2)}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-1 py-1.5"><input data-erp-line-default className={inputClass} type="number" value={toNum(line.discountPercent) > 0 ? line.discountPercent : (impliedDiscPct || '')} onChange={e => updateLine(index, 'discountPercent', toNum(e.target.value))} /></td>
                          <td className="px-1 py-1.5"><input className={inputClass} type="number" value={line.manualAddLess || ''} onChange={e => updateLine(index, 'manualAddLess', toNum(e.target.value))} /></td>
                          <td className="px-1 py-1.5"><input data-erp-line-default className={inputClass} type="number" value={line.gstRate || ''} onChange={e => updateLine(index, 'gstRate', toNum(e.target.value))} /></td>
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
                    <td colSpan={isSalesOrder ? 7 : 8} className="px-2 py-2 text-right uppercase">Grand Totals</td>
                    <td className="px-2 py-2 text-right">{totals.pcs.toFixed(2)}</td>
                    <td />
                    <td className="px-2 py-2 text-right">{totals.mts.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right">{totals.netMts.toFixed(2)}</td>
                    <td />
                    <td className="px-2 py-2 text-right">{totals.amount.toFixed(2)}</td>
                    {isSalesOrder && <td />}
                    <td colSpan={isSalesOrder ? 5 : 4} className="px-2 py-2 text-right">Taxable {totals.taxable.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right text-indigo-800">{(isSalesOrder ? totals.tax : billNet).toFixed(2)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              <datalist id="sales-item-names">
                {items.map(item => (
                  <option key={`name-${item.id}`} value={item.name}>
                    {item.mainScreen}{toNum(item.sellingRate) ? ` · ${item.sellingRate}` : ''}
                  </option>
                ))}
              </datalist>
              <datalist id="main-screen-names">
                {Array.from(new Set(items.map(item => item.mainScreen).filter(Boolean))).map(name => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
          </section>

          <section className="mt-4 grid gap-4 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
            <label><span className={labelClass}>Taxable Value</span><input className={readonlyClass} value={totals.taxable.toFixed(2)} readOnly /></label>
            <label><span className={labelClass}>CGST Amt</span><input className={readonlyClass} value={totals.cgst.toFixed(2)} readOnly /></label>
            <label><span className={labelClass}>SGST Amt</span><input className={readonlyClass} value={totals.sgst.toFixed(2)} readOnly /></label>
            <label><span className={labelClass}>IGST Amt</span><input className={readonlyClass} value={totals.igst.toFixed(2)} readOnly /></label>
            {!isSalesOrder && Math.abs(roundOff) >= 0.005 && (
              <label><span className={labelClass}>Round Off</span><input className={readonlyClass} value={roundOff.toFixed(2)} readOnly /></label>
            )}
            <BillDiscountFields
              lines={lineItems}
              discountAmount={lineDiscount > 0.5 ? lineDiscount : shownDiscount}
              labelClass={labelClass}
              inputClass={inputClass}
              readonlyClass={readonlyClass}
              onPercent={pct => {
                setDhara(pct ? String(pct) : '0');
                setLineItems(prev => prev.map(line => calcLine({ ...line, discountPercent: pct }, businessState, state)));
              }}
            />
            <label><span className={labelClass}>Bill Amt</span><input className={readonlyClass} value={(isSalesOrder ? totals.net : billNet).toFixed(2)} readOnly /></label>
            <label><span className={labelClass}>Net Amt</span><input className={`${readonlyClass} font-black text-indigo-800`} value={(isSalesOrder ? totals.net : netAfterDiscount).toFixed(2)} readOnly /></label>
            {ewayBill && (
              <label className="md:col-span-2">
                <span className={labelClass}>E-Way Bill No.</span>
                <input
                  className={`${readonlyClass} font-black tracking-wider text-emerald-800`}
                  value={ewayBill.ewayBillNo}
                  readOnly
                />
              </label>
            )}
          </section>

          {invoiceLocked && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              IRN {einvoice?.irn} is on this bill. Party, date, HSN and amounts stay locked. LR number, transport and remarks can still be saved.
            </p>
          )}

          {canGenerateEway && (
            <section className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xs font-black uppercase tracking-wide text-indigo-950">E-Invoice</h2>
                  <p className="mt-0.5 text-[11px] font-semibold text-indigo-900">
                    {einvoice && einvoice.status !== 'cancelled'
                      ? `IRN filed for ${savedBillLabel || 'this bill'}. Ack ${einvoice.ackNo || '—'}.`
                      : savedBillId
                        ? `Generate the e-invoice for ${savedBillLabel || 'this bill'}${gstDocumentType ? ` · ${gstDocumentType}` : ''}.`
                        : 'Save the bill first, then generate its e-invoice.'}
                  </p>
                  {einvoice?.irn && (
                    <p className="mt-1 break-all font-mono text-[10px] font-bold text-indigo-950">{einvoice.irn}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEinvoiceOpen(true)}
                  disabled={!savedBillId}
                  className="rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-black uppercase text-white disabled:opacity-40"
                >
                  {einvoice && einvoice.status !== 'cancelled' ? 'View E-Invoice' : 'Generate E-Invoice'}
                </button>
              </div>
            </section>
          )}

          {canGenerateEway && (
            <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xs font-black uppercase tracking-wide text-emerald-900">Auto E-Way Bill</h2>
                  <p className="mt-0.5 text-[11px] font-semibold text-emerald-800">
                    {ewayBill
                      ? `E-way bill ${ewayBill.ewayBillNo} generated for ${savedBillLabel || 'this bill'}${
                        ewayBill.validUpto ? ` · valid upto ${new Date(ewayBill.validUpto).toLocaleDateString('en-IN')}` : ''
                      }.`
                      : savedBillId
                        ? `Generate the e-way bill for ${savedBillLabel || 'this bill'} on ${gstDocumentType || 'this GST document'}.`
                        : 'Save the bill first, then generate its e-way bill.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEwayOpen(true)}
                  disabled={!savedBillId}
                  className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black uppercase text-white disabled:opacity-40"
                >
                  {ewayBill ? 'View E-Way Bill' : 'Generate E-Way Bill for this invoice'}
                </button>
              </div>
            </section>
          )}

          {!isSalesOrder && (
            <button
              type="button"
              onClick={() => void printCurrentBill()}
              disabled={!partyName.trim() && lineItems.every(line => !toNum(line.amount) && !toNum(line.pcs))}
              className="mt-4 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800 disabled:opacity-40"
            >
              Print bill
            </button>
          )}
          <ErpSaveButton
            saving={saving}
            label={isEditMode
              ? (isSalesOrder ? 'Update Sales Order' : isGoodsReturn ? 'Update Sales Goods Return' : 'Update Finish Sales')
              : (isSalesOrder ? 'Save Sales Order' : isGoodsReturn ? 'Save Sales Goods Return' : 'Save Finish Sales')}
            savingLabel="Saving..."
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
          />
        </ErpFormShell>
      </main>

      {einvoiceOpen && savedBillId && (
        <EinvoiceDialog
          source="sales"
          id={savedBillId}
          docNo={savedBillLabel || plainBillNo(typeBillNumber) || 'Sales bill'}
          existing={einvoice}
          onClose={() => setEinvoiceOpen(false)}
          onChanged={setEinvoice}
        />
      )}

      {ewayOpen && savedBillId && (
        <EwayBillDialog
          billId={savedBillId}
          docNo={savedBillLabel || plainBillNo(typeBillNumber) || 'Sales bill'}
          existing={ewayBill}
          onClose={() => setEwayOpen(false)}
          onGenerated={setEwayBill}
        />
      )}

      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase">{picksChallan ? 'Sales Challans' : 'Sales Orders'} · {partyName || 'All'}</h3>
                <p className="text-[11px] font-semibold text-gray-500">
                  {picksChallan
                    ? 'Tick every challan this bill covers — one bill can cover several Sales Challans.'
                    : 'Tick every order this bill covers — one bill can cover several Sales Orders.'}
                </p>
              </div>
              <button type="button" onClick={() => setPickerOpen(false)} className="rounded-lg border px-3 py-1 text-xs font-bold">Close</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {pendingLoading ? (
                <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b text-[10px] uppercase text-gray-500">
                    <tr>
                      <th className="p-2">
                        <input
                          type="checkbox"
                          checked={pickerRows.length > 0 && checkedCount === pickerRows.length}
                          onChange={e => setChecked(
                            e.target.checked
                              ? Object.fromEntries(pickerRows.map(row => [row.id, true]))
                              : {}
                          )}
                        />
                      </th>
                      <th className="p-2">{picksChallan ? 'Challan' : 'Order'}</th>
                      <th className="p-2">Date</th>
                      <th className="p-2">Status</th>
                      <th className="p-2 text-right">Pend Pcs</th>
                      <th className="p-2 text-right">Pend Mts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickerRows.map(row => (
                      <tr
                        key={row.id}
                        className={`cursor-pointer border-b hover:bg-indigo-50 ${checked[row.id] ? 'bg-indigo-50' : ''}`}
                        onClick={() => toggleChecked(row.id)}
                      >
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={Boolean(checked[row.id])}
                            onChange={() => toggleChecked(row.id)}
                            onClick={e => e.stopPropagation()}
                          />
                        </td>
                        <td className="p-2 font-bold">{picksChallan ? 'Ch' : 'SO'} {row.orderNo}</td>
                        <td className="p-2 text-xs">{row.orderDate ? String(row.orderDate).slice(0, 10) : '-'}</td>
                        <td className="p-2 text-xs">{row.status || 'open'}</td>
                        <td className="p-2 text-right font-bold text-indigo-800">{row.pendingPcs}</td>
                        <td className="p-2 text-right font-bold text-indigo-800">{toNum(row.pendingMts).toFixed(2)}</td>
                      </tr>
                    ))}
                    {!pickerRows.length && (
                      <tr><td colSpan={6} className="p-8 text-center text-gray-500">{picksChallan ? 'No pending Sales Challans for this party.' : 'No pending Sales Orders for this party.'}</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex items-center justify-between border-t bg-gray-50 px-4 py-3">
              <span className="text-xs font-bold text-gray-600">
                {checkedCount} {picksChallan ? 'challan' : 'order'}{checkedCount === 1 ? '' : 's'} ticked ·{' '}
                {round2(pickerRows.filter(row => checked[row.id]).reduce((sum, row) => sum + toNum(row.pendingPcs), 0))} pcs pending
              </span>
              <button
                type="button"
                disabled={pendingLoading}
                onClick={applySelectedOrders}
                className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-40"
              >
                {checkedCount ? 'Add to bill' : 'Clear pick'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {missingGstDialog}
      <AddPartyConfirmDialog
        open={showAddConfirm}
        partyName={pendingNewParty}
        onNo={() => setShowAddConfirm(false)}
        onYes={() => {
          setShowAddConfirm(false);
          setShowAccountsDialog(true);
        }}
      />
      <AccountsInformationDialog
        open={showAccountsDialog}
        initialName={pendingNewParty}
        initialDetails={newPartyDetails}
        context="sales"
        suggestedAccountType={postingPartyAccountType(transactionType) || undefined}
        onClose={() => setShowAccountsDialog(false)}
        onSaved={onPartySaved}
      />
      <AddPartyConfirmDialog
        open={showBrokerConfirm}
        partyName={pendingBroker}
        onNo={() => {
          setShowBrokerConfirm(false);
          brokerPromptName.current = '';
        }}
        onYes={() => {
          setShowBrokerConfirm(false);
          setShowBrokerDialog(true);
        }}
      />
      <AccountsInformationDialog
        open={showBrokerDialog}
        initialName={pendingBroker}
        initialAccountGroup={pendingBroker}
        suggestedAccountType={BROKER_ACCOUNT_TYPE}
        onClose={() => {
          setShowBrokerDialog(false);
          brokerPromptName.current = '';
        }}
        onSaved={onBrokerSaved}
      />
    </div>
  );
};
