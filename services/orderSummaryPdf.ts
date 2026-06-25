import { jsPDF } from 'jspdf';
import { Order } from '../types';
import { downloadBlob, isNativeAndroid, shareFileNative } from './nativeApp';

export interface OrderSummaryLine {
  designCode?: string | null;
  designName?: string | null;
  fabric?: string | null;
  catalogueName?: string | null;
  image?: string | null;
  quantity: number;
  basePrice?: number | null;
  remarks?: string | null;
}

export interface OrderSummaryPdfInput {
  customerName: string;
  orderNumber?: string | null;
  createdAt?: string | null;
  orderDate?: string | null;
  expectedDate?: string | null;
  firmName?: string | null;
  agentName?: string | null;
  transportName?: string | null;
  haste?: string | null;
  station?: string | null;
  priceCategory?: string | null;
  discountRate?: number | null;
  shippingCharge?: number | null;
  remarks?: string | null;
  orderLines: OrderSummaryLine[];
}

const formatMoney = (value: number) =>
  `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatDateOnly = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN');
};

const safeFilePart = (value: string) =>
  value.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'order';

const getPdfFileName = (input: OrderSummaryPdfInput) =>
  `threadx-order-${safeFilePart(input.orderNumber || new Date().toISOString().slice(0, 10))}.pdf`;

function tryAddImage(doc: jsPDF, dataUrl: string | null | undefined, x: number, y: number, w: number, h: number) {
  if (!dataUrl?.startsWith('data:image')) return false;
  const format = dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
  try {
    doc.addImage(dataUrl, format, x, y, w, h, undefined, 'FAST');
    return true;
  } catch {
    return false;
  }
}

export function buildOrderSummaryPdf(input: OrderSummaryPdfInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 12;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  const addPageIfNeeded = (height = 10) => {
    if (y + height > 282) {
      doc.addPage();
      y = 14;
    }
  };

  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(0.6);
  doc.rect(margin, y, contentWidth, 42);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(79, 70, 229);
  doc.text('ThreadX', margin + 4, y + 10);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('ORDER FORM', pageWidth - margin - 4, y + 10, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('Sales Order', margin + 4, y + 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  if (input.firmName) {
    doc.text(`Firm: ${input.firmName}`, margin + 4, y + 28);
  }
  doc.text(`Customer: ${input.customerName}`, margin + 4, y + 34);
  doc.text(`Order no.: ${input.orderNumber || '—'}`, pageWidth - margin - 4, y + 28, { align: 'right' });
  doc.text(`Date: ${formatDateOnly(input.orderDate || input.createdAt)}`, pageWidth - margin - 4, y + 34, { align: 'right' });

  y += 48;

  const metaRows: Array<[string, string]> = [
    ['Agent / Aadhat', input.agentName || '—'],
    ['Transport', input.transportName || '—'],
    ['Station', input.station || '—'],
    ['Haste', input.haste || '—'],
    ['Expected date', formatDateOnly(input.expectedDate)],
    ['Price category', input.priceCategory || '—'],
    ['Discount', input.discountRate != null ? `${input.discountRate}%` : '—'],
    ['Shipping', input.shippingCharge != null ? formatMoney(input.shippingCharge) : '—']
  ];

  doc.setFontSize(9);
  for (let i = 0; i < metaRows.length; i += 2) {
    addPageIfNeeded(8);
    const left = metaRows[i];
    const right = metaRows[i + 1];
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(`${left[0]}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(left[1], margin + 30, y);
    if (right) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      doc.text(`${right[0]}:`, margin + contentWidth / 2, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(right[1], margin + contentWidth / 2 + 30, y);
    }
    y += 6;
  }

  if (input.remarks?.trim()) {
    addPageIfNeeded(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Remarks:', margin, y);
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(input.remarks.trim(), contentWidth - 20);
    doc.text(wrapped, margin + 20, y);
    y += wrapped.length * 4 + 2;
  }

  y += 4;
  addPageIfNeeded(12);
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Design', margin + 22, y);
  doc.text('Qty', margin + 108, y);
  doc.text('Rate', margin + 124, y);
  const amountRightX = pageWidth - margin - 6;
  doc.text('Amount', amountRightX, y, { align: 'right' });
  y += 4;
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  let grandTotal = 0;
  let totalQty = 0;
  const thumb = 16;

  for (const line of input.orderLines) {
    addPageIfNeeded(24);
    const label = line.designCode || line.designName || 'Design';
    const subtitle = [line.designName && line.designCode ? line.designName : null, line.catalogueName, line.fabric]
      .filter(Boolean)
      .join(' · ');
    const rate = Number(line.basePrice) || 0;
    const amount = rate * line.quantity;
    grandTotal += amount;
    totalQty += line.quantity;

    const imageAdded = tryAddImage(doc, line.image, margin, y - 1, thumb, thumb);
    const textX = imageAdded ? margin + thumb + 4 : margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(label, textX, y + 4);

    doc.setFont('helvetica', 'normal');
    doc.text(String(line.quantity), margin + 108, y + 4);
    doc.text(formatMoney(rate), margin + 124, y + 4);
    doc.text(formatMoney(amount), amountRightX, y + 4, { align: 'right' });
    y += 7;

    if (subtitle) {
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(subtitle, textX, y);
      y += 4;
    }

    if (line.remarks?.trim()) {
      doc.setFontSize(8);
      doc.text(`Remarks: ${line.remarks.trim()}`, textX, y);
      y += 4;
    }

    y += 3;
  }

  addPageIfNeeded(16);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Total quantity: ${totalQty}`, margin, y);
  doc.text('Grand total:', amountRightX - 42, y);
  doc.text(formatMoney(grandTotal), amountRightX, y, { align: 'right' });
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Computer-generated order form by ThreadX.', margin, y);

  return doc;
}

export function buildOrderSummaryPdfBlob(input: OrderSummaryPdfInput): Blob {
  return buildOrderSummaryPdf(input).output('blob');
}

export function downloadOrderSummaryPdf(input: OrderSummaryPdfInput) {
  buildOrderSummaryPdf(input).save(getPdfFileName(input));
}

export async function downloadOrderSummaryPdfBlob(input: OrderSummaryPdfInput) {
  const blob = buildOrderSummaryPdfBlob(input);
  await downloadBlob(blob, getPdfFileName(input));
}

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not prepare PDF for sharing'));
    reader.readAsDataURL(blob);
  });

export async function shareOrderSummaryPdf(input: OrderSummaryPdfInput) {
  const blob = buildOrderSummaryPdfBlob(input);
  const fileName = getPdfFileName(input);
  const file = new File([blob], fileName, { type: 'application/pdf' });

  if (isNativeAndroid()) {
    const dataUrl = await blobToDataUrl(blob);
    await shareFileNative(dataUrl, fileName, 'application/pdf');
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Order form', text: `Order form — ${input.customerName}` });
        return;
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
    }
  }

  await downloadBlob(blob, fileName);
}

export function orderToPdfInput(order: Order, firmName?: string | null): OrderSummaryPdfInput {
  const lines = (order.orderLines || []).map(line => ({
    designCode: line.designCode,
    designName: line.designName,
    fabric: line.fabric,
    catalogueName: null,
    image: line.image,
    quantity: Number(line.quantity) || 0,
    basePrice: line.basePrice || line.retailPrice || 0,
    remarks: line.remarks
  }));

  if (lines.length === 0 && order.design) {
    lines.push({
      designCode: null,
      designName: order.design.name,
      fabric: order.design.fabric,
      catalogueName: null,
      image: order.design.image,
      quantity: order.quantity,
      basePrice: order.design.basePrice || order.design.retailPrice || 0,
      remarks: order.remarks
    });
  }

  return {
    customerName: order.buyerName,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    orderDate: order.orderDate,
    expectedDate: order.expectedDate,
    firmName: firmName || null,
    agentName: order.agentName,
    transportName: order.transportName,
    haste: order.haste,
    station: order.station,
    priceCategory: order.priceCategory,
    discountRate: order.discountRate,
    shippingCharge: order.shippingCharge,
    remarks: order.remarks,
    orderLines: lines
  };
}
