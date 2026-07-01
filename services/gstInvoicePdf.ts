import { jsPDF } from 'jspdf';
import { SalesInvoice } from '../types';
import { downloadBlob, isNativeAndroid, shareFileNative } from './nativeApp';

const formatMoney = (value: number) =>
  `Rs. ${(Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatDateOnly = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN');
};

const safeFilePart = (value: string) =>
  value.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'invoice';

const getPdfFileName = (invoice: SalesInvoice) =>
  `threadx-gst-invoice-${safeFilePart(invoice.invoiceNumber)}.pdf`;

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not prepare PDF for sharing'));
    reader.readAsDataURL(blob);
  });

function addressLines(snapshot: any): string[] {
  return [
    snapshot?.addressLine1,
    snapshot?.addressLine2,
    [snapshot?.city, snapshot?.state, snapshot?.pincode].filter(Boolean).join(', '),
    snapshot?.gstNumber ? `GSTIN: ${snapshot.gstNumber}` : null,
    snapshot?.panNumber ? `PAN: ${snapshot.panNumber}` : null,
    snapshot?.mobileNumber ? `Mobile: ${snapshot.mobileNumber}` : null,
    snapshot?.phone ? `Phone: ${snapshot.phone}` : null,
    snapshot?.email ? `Email: ${snapshot.email}` : null
  ].filter(Boolean);
}

export function buildGstInvoicePdf(invoice: SalesInvoice): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 10;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = 12;

  const addPageIfNeeded = (height = 10) => {
    if (y + height > pageHeight - 16) {
      doc.addPage();
      y = 12;
    }
  };

  const line = () => {
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('TAX INVOICE', pageWidth / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(16);
  doc.setTextColor(79, 70, 229);
  doc.text(invoice.sellerSnapshot.tradeName || invoice.sellerSnapshot.legalName || 'ThreadX Seller', margin, y);
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`Invoice No: ${invoice.invoiceNumber}`, pageWidth - margin, y, { align: 'right' });
  y += 5;
  doc.text(`Invoice Date: ${formatDateOnly(invoice.invoiceDate)}`, pageWidth - margin, y, { align: 'right' });
  y += 5;
  doc.text(`Place of Supply: ${invoice.placeOfSupply || '-'}`, pageWidth - margin, y, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const sellerLines = addressLines(invoice.sellerSnapshot);
  let sellerY = 25;
  for (const text of sellerLines) {
    doc.text(String(text), margin, sellerY);
    sellerY += 4;
  }
  y = Math.max(y + 4, sellerY + 2);
  line();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Bill To', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(invoice.buyerSnapshot.name || 'Customer', margin, y);
  y += 4;
  for (const text of addressLines(invoice.buyerSnapshot)) {
    if (String(text) === invoice.buyerSnapshot.name) continue;
    addPageIfNeeded(4);
    doc.text(String(text), margin, y);
    y += 4;
  }
  y += 2;
  line();

  addPageIfNeeded(12);
  const col = {
    no: margin,
    item: margin + 8,
    hsn: margin + 62,
    qty: margin + 82,
    rate: margin + 98,
    taxable: margin + 120,
    tax: margin + 146,
    total: pageWidth - margin
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('#', col.no, y);
  doc.text('Item', col.item, y);
  doc.text('HSN', col.hsn, y);
  doc.text('Qty', col.qty, y);
  doc.text('Rate', col.rate, y);
  doc.text('Taxable', col.taxable, y);
  doc.text('GST', col.tax, y);
  doc.text('Total', col.total, y, { align: 'right' });
  y += 3;
  line();

  doc.setFont('helvetica', 'normal');
  for (const [index, item] of invoice.lineItems.entries()) {
    addPageIfNeeded(12);
    const description = item.description || item.designCode || item.designName || 'Item';
    const wrappedDescription = doc.splitTextToSize(description, 48);
    const rowHeight = Math.max(8, wrappedDescription.length * 4 + 2);

    doc.setFontSize(8);
    doc.text(String(index + 1), col.no, y);
    doc.text(wrappedDescription, col.item, y);
    doc.text(item.hsnCode || '-', col.hsn, y);
    doc.text(String(item.quantity), col.qty, y);
    doc.text(formatMoney(item.rate), col.rate, y);
    doc.text(formatMoney(item.taxableAmount), col.taxable, y);
    doc.text(`${item.gstRate || 0}%`, col.tax, y);
    doc.text(formatMoney(item.totalAmount), col.total, y, { align: 'right' });
    y += rowHeight;
  }

  line();
  const totalsX = pageWidth - margin - 68;
  const totalValueX = pageWidth - margin;
  const totalRows: Array<[string, number]> = [
    ['Taxable Amount', invoice.taxableAmount],
    ['Discount', invoice.discountAmount],
    ['CGST', invoice.cgstAmount],
    ['SGST', invoice.sgstAmount],
    ['IGST', invoice.igstAmount],
    ['Shipping / Freight', invoice.shippingCharge],
    ['Grand Total', invoice.grandTotal]
  ];

  for (const [label, value] of totalRows) {
    addPageIfNeeded(6);
    doc.setFont('helvetica', label === 'Grand Total' ? 'bold' : 'normal');
    doc.setFontSize(label === 'Grand Total' ? 10 : 8.5);
    doc.text(`${label}:`, totalsX, y);
    doc.text(formatMoney(value), totalValueX, y, { align: 'right' });
    y += 5;
  }

  y += 4;
  if (invoice.sellerSnapshot.bankName || invoice.sellerSnapshot.bankAccount || invoice.sellerSnapshot.bankIfsc) {
    addPageIfNeeded(18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Bank Details', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (invoice.sellerSnapshot.bankName) doc.text(`Bank: ${invoice.sellerSnapshot.bankName}`, margin, y), y += 4;
    if (invoice.sellerSnapshot.bankAccount) doc.text(`A/c: ${invoice.sellerSnapshot.bankAccount}`, margin, y), y += 4;
    if (invoice.sellerSnapshot.bankIfsc) doc.text(`IFSC: ${invoice.sellerSnapshot.bankIfsc}`, margin, y), y += 4;
  }

  if (invoice.sellerSnapshot.terms || invoice.notes) {
    addPageIfNeeded(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Notes / Terms', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const text = [invoice.notes, invoice.sellerSnapshot.terms].filter(Boolean).join('\n');
    const wrapped = doc.splitTextToSize(text, contentWidth);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 4;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Computer-generated GST invoice by ThreadX.', margin, pageHeight - 8);

  return doc;
}

export function buildGstInvoicePdfBlob(invoice: SalesInvoice): Blob {
  return buildGstInvoicePdf(invoice).output('blob');
}

export async function downloadGstInvoicePdf(invoice: SalesInvoice) {
  const blob = buildGstInvoicePdfBlob(invoice);
  await downloadBlob(blob, getPdfFileName(invoice));
}

export async function shareGstInvoicePdf(invoice: SalesInvoice) {
  const blob = buildGstInvoicePdfBlob(invoice);
  const fileName = getPdfFileName(invoice);
  const file = new File([blob], fileName, { type: 'application/pdf' });

  if (isNativeAndroid()) {
    const dataUrl = await blobToDataUrl(blob);
    await shareFileNative(dataUrl, fileName, 'application/pdf');
    return;
  }

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: `GST Invoice ${invoice.invoiceNumber}`,
      text: `GST Invoice ${invoice.invoiceNumber}`,
      files: [file]
    });
    return;
  }

  await downloadBlob(blob, fileName);
}
