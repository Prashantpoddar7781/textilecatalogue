import { PrismaClient } from '@prisma/client';
import { PRICING_PLANS } from '../middleware/subscription.js';

const prisma = new PrismaClient();

const getPlanDetails = (planId) => PRICING_PLANS.find(plan => plan.id === planId) || null;

const formatCurrency = (amount, currency = 'INR') => {
  if (currency === 'INR') {
    return `₹${Number(amount).toLocaleString('en-IN')}`;
  }
  return `${currency} ${Number(amount).toLocaleString()}`;
};

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

export const generateInvoiceNumber = async () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `TX-${datePart}`;
  const count = await prisma.subscriptionInvoice.count({
    where: { invoiceNumber: { startsWith: prefix } }
  });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
};

export const renderInvoiceHtml = (invoice) => {
  const amountLabel = formatCurrency(invoice.amount, invoice.currency);
  const periodLabel = invoice.billingPeriodStart || invoice.billingPeriodEnd
    ? `${formatDate(invoice.billingPeriodStart)} – ${formatDate(invoice.billingPeriodEnd)}`
    : '—';
  const paymentSourceLabel = invoice.paymentSource === 'google_play'
    ? 'Google Play'
    : invoice.paymentSource === 'razorpay'
      ? 'Razorpay'
      : invoice.paymentSource;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoiceNumber} — ThreadX</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a; margin: 0; padding: 32px; background: #f8fafc; }
    .page { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; }
    .header { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
    .brand { font-size: 1.5rem; font-weight: 800; color: #4f46e5; }
    .meta { text-align: right; font-size: 0.9rem; color: #64748b; }
    .meta strong { display: block; color: #0f172a; font-size: 1rem; }
    h1 { margin: 0 0 6px; font-size: 1.35rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; }
    .box h2 { margin: 0 0 8px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: #6366f1; }
    .box p { margin: 0; font-size: 0.95rem; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 0.95rem; }
    th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
    .total-row td { font-weight: 800; font-size: 1.05rem; border-bottom: none; padding-top: 16px; }
    .footer { margin-top: 28px; font-size: 0.85rem; color: #64748b; line-height: 1.6; }
    @media print {
      body { background: #fff; padding: 0; }
      .page { border: none; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="brand">ThreadX</div>
        <p style="margin:8px 0 0;color:#64748b;font-size:0.9rem;">Smart textile catalogue management</p>
      </div>
      <div class="meta">
        <strong>Tax Invoice / Receipt</strong>
        <div>Invoice No: ${invoice.invoiceNumber}</div>
        <div>Date: ${formatDate(invoice.paidAt || invoice.createdAt)}</div>
      </div>
    </div>

    <div class="grid">
      <div class="box">
        <h2>Bill To</h2>
        <p>
          <strong>${invoice.firmName || invoice.customerName || 'Customer'}</strong><br>
          ${invoice.customerName && invoice.firmName ? `${invoice.customerName}<br>` : ''}
          ${invoice.customerEmail}
        </p>
      </div>
      <div class="box">
        <h2>Payment Details</h2>
        <p>
          Method: ${paymentSourceLabel}<br>
          Billing period: ${periodLabel}<br>
          Status: Paid
        </p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Plan</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>ThreadX Pro subscription</td>
          <td>${invoice.planName}</td>
          <td>${amountLabel}</td>
        </tr>
        <tr class="total-row">
          <td colspan="2">Total paid</td>
          <td>${amountLabel}</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      Thank you for subscribing to ThreadX. This invoice is generated electronically and is valid without a signature.
      For billing support, visit the Contact Us page in the app or email prashantpoddar29@gmail.com.
    </div>
  </div>
</body>
</html>`;
};

export const createSubscriptionInvoice = async ({
  user,
  plan,
  paymentSource,
  externalReference,
  amount,
  currency = 'INR',
  billingPeriodStart = null,
  billingPeriodEnd = null,
  paidAt = new Date()
}) => {
  if (!user?.id || !plan || !paymentSource || !externalReference) {
    return null;
  }

  const existing = await prisma.subscriptionInvoice.findUnique({
    where: {
      userId_externalReference: {
        userId: user.id,
        externalReference
      }
    }
  });
  if (existing) {
    return existing;
  }

  const planDetails = getPlanDetails(plan);
  const invoiceNumber = await generateInvoiceNumber();

  return prisma.subscriptionInvoice.create({
    data: {
      userId: user.id,
      invoiceNumber,
      firmName: user.firmName || null,
      customerName: user.name || null,
      customerEmail: user.email,
      plan,
      planName: planDetails?.name ? `${planDetails.name} plan` : `${plan} plan`,
      amount: amount ?? planDetails?.price ?? 0,
      currency: currency || planDetails?.currency || 'INR',
      billingPeriodStart: billingPeriodStart ? new Date(billingPeriodStart) : null,
      billingPeriodEnd: billingPeriodEnd ? new Date(billingPeriodEnd) : null,
      paymentSource,
      externalReference,
      paidAt: paidAt ? new Date(paidAt) : new Date()
    }
  });
};

export const syncSubscriptionInvoiceForUser = async (user) => {
  if (!user?.subscriptionPlan || !user.subscriptionSource) {
    return null;
  }

  const hasPaidAccess = ['active', 'cancelled'].includes(user.subscriptionStatus || '')
    && user.subscriptionEndsAt
    && new Date(user.subscriptionEndsAt) > new Date();

  if (!hasPaidAccess && user.subscriptionStatus !== 'active') {
    return null;
  }

  const planDetails = getPlanDetails(user.subscriptionPlan);
  if (!planDetails) {
    return null;
  }

  if (user.subscriptionSource === 'google_play' && user.googlePlayProductId && user.googlePlayPurchaseToken) {
    const periodKey = user.subscriptionEndsAt
      ? new Date(user.subscriptionEndsAt).toISOString()
      : 'current';
    return createSubscriptionInvoice({
      user,
      plan: user.subscriptionPlan,
      paymentSource: 'google_play',
      externalReference: `google_play:${user.googlePlayProductId}:${periodKey}`,
      amount: planDetails.price,
      currency: planDetails.currency,
      billingPeriodStart: user.subscriptionStartedAt,
      billingPeriodEnd: user.subscriptionEndsAt,
      paidAt: user.subscriptionStartedAt || new Date()
    });
  }

  if (user.subscriptionSource === 'razorpay' && user.razorpaySubscriptionId) {
    const periodKey = user.subscriptionEndsAt
      ? new Date(user.subscriptionEndsAt).toISOString()
      : 'current';
    return createSubscriptionInvoice({
      user,
      plan: user.subscriptionPlan,
      paymentSource: 'razorpay',
      externalReference: `razorpay:${user.razorpaySubscriptionId}:${periodKey}`,
      amount: planDetails.price,
      currency: planDetails.currency,
      billingPeriodStart: user.subscriptionStartedAt,
      billingPeriodEnd: user.subscriptionEndsAt,
      paidAt: new Date()
    });
  }

  return null;
};
