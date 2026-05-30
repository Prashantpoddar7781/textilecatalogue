import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle, Crown, Download, FileText, ShieldCheck, Trash2 } from 'lucide-react';
import { billingApi, usersApi, SubscriptionInvoice } from '../services/api';
import { getGooglePlayProductId, googlePlayBilling, isGooglePlayBillingAvailable } from '../services/googlePlayBilling';
import { SubscriptionStatus } from '../types';

interface Plan {
  id: 'monthly' | 'annual';
  name: string;
  price: number;
  currency: string;
  interval: string;
}

interface Props {
  user: { email: string; name?: string } | null;
  subscription: SubscriptionStatus | null;
  refreshSubscription: () => Promise<void>;
  onBack: () => void;
  onAccountDeleted?: () => void;
}

const defaultPlans: Plan[] = [
  { id: 'monthly', name: 'Monthly', price: 599, currency: 'INR', interval: 'month' },
  { id: 'annual', name: 'Annual', price: 6499, currency: 'INR', interval: 'year' }
];

const loadRazorpayScript = () =>
  new Promise<boolean>((resolve) => {
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export const BillingPage: React.FC<Props> = ({ user, subscription, refreshSubscription, onBack, onAccountDeleted }) => {
  const [plans, setPlans] = useState<Plan[]>(defaultPlans);
  const [loadingPlan, setLoadingPlan] = useState<Plan['id'] | null>(null);
  const [error, setError] = useState('');
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [restoringSubscription, setRestoringSubscription] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);
  const useGooglePlayBilling = isGooglePlayBillingAvailable();

  const loadInvoices = async () => {
    setLoadingInvoices(true);
    try {
      const { invoices: fetchedInvoices } = await billingApi.getInvoices();
      setInvoices(fetchedInvoices);
    } catch {
      setInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const refreshInvoicesAfterPurchase = async () => {
    try {
      const { invoices: syncedInvoices } = await billingApi.syncInvoices();
      setInvoices(syncedInvoices);
    } catch {
      await loadInvoices();
    }
  };

  useEffect(() => {
    refreshSubscription();
    billingApi.getPlans()
      .then(({ plans: fetchedPlans }) => setPlans(fetchedPlans as Plan[]))
      .catch(() => setPlans(defaultPlans));
    loadInvoices();
  }, []);

  useEffect(() => {
    if (!useGooglePlayBilling) return;

    googlePlayBilling.querySubscriptions({
      productIds: [getGooglePlayProductId('monthly'), getGooglePlayProductId('annual')]
    }).catch(error => {
      console.warn('Google Play subscriptions are not ready yet', error);
    });
  }, [useGooglePlayBilling]);

  const handleSubscribe = async (planId: Plan['id']) => {
    setError('');
    setLoadingPlan(planId);
    try {
      if (useGooglePlayBilling) {
        const productId = getGooglePlayProductId(planId);
        const purchase = await googlePlayBilling.purchase({ productId });
        const purchasedProductId = purchase.productIds?.[0] || productId;
        await billingApi.verifyGooglePlaySubscription(purchasedProductId, purchase.purchaseToken);
        await refreshSubscription();
        await refreshInvoicesAfterPurchase();
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setError('Unable to load Razorpay checkout. Please try again.');
        return;
      }

      const payload = await billingApi.createRazorpaySubscription(planId);
      const RazorpayConstructor = (window as any).Razorpay;
      const razorpay = new RazorpayConstructor({
        key: payload.razorpayKeyId,
        subscription_id: payload.subscriptionId,
        name: 'ThreadX',
        description: planId === 'annual' ? 'Annual subscription' : 'Monthly subscription',
        prefill: { email: payload.email },
        theme: { color: '#4f46e5' },
        handler: async () => {
          await refreshSubscription();
          await refreshInvoicesAfterPurchase();
        }
      });

      razorpay.on('payment.failed', () => {
        setError('Payment failed. Please try again.');
      });

      razorpay.open();
    } catch (err: any) {
      setError(err.message || 'Subscription failed. Please try again.');
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleRestoreGooglePlaySubscription = async () => {
    setError('');
    setRestoringSubscription(true);
    try {
      const { purchases } = await googlePlayBilling.restoreSubscriptions();
      const knownProductIds = new Set([getGooglePlayProductId('monthly'), getGooglePlayProductId('annual')]);
      const purchase = purchases.find(item => item.productIds?.some(productId => knownProductIds.has(productId)));
      const productId = purchase?.productIds?.find(id => knownProductIds.has(id));

      if (!purchase || !productId) {
        setError('No active Google Play subscription was found for this account.');
        return;
      }

      await billingApi.verifyGooglePlaySubscription(productId, purchase.purchaseToken);
      await refreshSubscription();
      await refreshInvoicesAfterPurchase();
    } catch (err: any) {
      setError(err.message || 'Could not restore Google Play subscription.');
    } finally {
      setRestoringSubscription(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') return;
    setDeletingAccount(true);
    setError('');
    try {
      await usersApi.deleteAccount();
      setDeleteOpen(false);
      onAccountDeleted?.();
    } catch (err: any) {
      setError(err.message || 'Could not delete account. Try again or use the email option on our deletion help page.');
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleCancelSubscription = async () => {
    const confirmed = window.confirm('Cancel your subscription? You will keep access until the current paid period ends.');
    if (!confirmed) return;

    setCancellingSubscription(true);
    setError('');
    try {
      await billingApi.cancelRazorpaySubscription();
      await refreshSubscription();
    } catch (err: any) {
      setError(err.message || 'Could not cancel subscription. Please try again.');
    } finally {
      setCancellingSubscription(false);
    }
  };

  const handleDownloadInvoice = async (invoice: SubscriptionInvoice) => {
    setDownloadingInvoiceId(invoice.id);
    setError('');
    try {
      await billingApi.downloadInvoice(invoice.id, invoice.invoiceNumber);
    } catch (err: any) {
      setError(err.message || 'Could not download invoice.');
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const formatInvoiceAmount = (invoice: SubscriptionInvoice) =>
    invoice.currency === 'INR'
      ? `₹${invoice.amount.toLocaleString('en-IN')}`
      : `${invoice.currency} ${invoice.amount.toLocaleString()}`;

  const formatInvoiceDate = (value?: string | null) =>
    value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const canCancelSubscription = Boolean(
    subscription?.isActive &&
      !subscription.isFree &&
      !subscription.isTrialActive &&
      subscription.source !== 'google_play' &&
      subscription.status !== 'cancelled'
  );
  const canManageGooglePlaySubscription = Boolean(
    useGooglePlayBilling &&
      subscription?.source === 'google_play' &&
      subscription.isActive &&
      !subscription.isFree &&
      !subscription.isTrialActive
  );
  const googlePlayManagementProductId = subscription?.plan === 'annual'
    ? getGooglePlayProductId('annual')
    : getGooglePlayProductId('monthly');

  return (
    <div className="min-h-screen bg-[#FDFDFF] pb-20">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b px-4 py-3 md:px-8 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-lg font-black text-gray-900">Billing</h1>
              <p className="text-xs text-gray-500">{user?.email || 'Account'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-2 rounded-2xl text-xs font-bold">
            <Crown className="w-4 h-4" />
            <span>{subscription?.isFree ? 'Free Access' : subscription?.isActive ? 'Pro Active' : 'Upgrade'}</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-white border-2 border-gray-100 rounded-2xl p-5 shadow-sm md:col-span-2">
            <h2 className="text-base font-black text-gray-900 mb-2">Current status</h2>
            <div className="text-sm text-gray-600 space-y-2">
              {subscription?.isFree && (
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span>Free access enabled for this account.</span>
                </div>
              )}
              {subscription?.isFreeDesignAllowanceActive && !subscription.needsPayment && !subscription.isFree && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-indigo-500" />
                  <span>
                    Free plan: {subscription.designCount ?? 0}/{subscription.freeDesignLimit ?? 8} designs used.
                    {' '}{subscription.freeDesignsRemaining ?? 0} remaining.
                  </span>
                </div>
              )}
              {!subscription?.isFreeDesignAllowanceActive && !subscription?.isFree && subscription?.isActive && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span>Subscription active.</span>
                </div>
              )}
              {subscription?.status === 'cancelled' && subscription?.isActive && (
                <div className="flex items-center gap-2 text-amber-700">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Subscription cancelled. Access continues until the paid period ends.</span>
                </div>
              )}
              {subscription?.needsPayment && (
                <div className="flex items-center gap-2 text-red-600">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Subscription required to continue.</span>
                </div>
              )}
            </div>
          </div>
          <div className="bg-white border-2 border-gray-100 rounded-2xl p-5 shadow-sm">
            <h2 className="text-base font-black text-gray-900 mb-2">Plan details</h2>
            <p className="text-sm text-gray-600">
              {subscription?.plan ? `${subscription.plan} plan` : 'No active plan'}
            </p>
            {subscription?.subscriptionEndsAt && (
              <p className="text-xs text-gray-500 mt-2">
                {subscription.status === 'cancelled' ? 'Ends on' : 'Renews on'} {new Date(subscription.subscriptionEndsAt).toLocaleDateString()}
              </p>
            )}
            {canCancelSubscription && (
              <button
                type="button"
                onClick={handleCancelSubscription}
                disabled={cancellingSubscription}
                className="mt-4 w-full px-4 py-2.5 rounded-xl border-2 border-red-100 text-red-700 text-sm font-bold hover:bg-red-50 disabled:opacity-50"
              >
                {cancellingSubscription ? 'Cancelling...' : 'Cancel subscription'}
              </button>
            )}
            {canManageGooglePlaySubscription && (
              <button
                type="button"
                onClick={() => googlePlayBilling.openSubscriptionManagement({ productId: googlePlayManagementProductId })}
                className="mt-4 w-full px-4 py-2.5 rounded-xl border-2 border-indigo-100 text-indigo-700 text-sm font-bold hover:bg-indigo-50"
              >
                Manage Google Play subscription
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {plans.map(plan => (
            <div key={plan.id} className="border rounded-2xl p-5 flex flex-col gap-4 bg-white shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-gray-900">{plan.name}</h3>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">{plan.interval}</p>
                </div>
                <Crown className="w-6 h-6 text-indigo-500" />
              </div>
              <div className="text-3xl font-black text-gray-900">
                ₹{plan.price.toLocaleString()}
                <span className="text-sm font-semibold text-gray-500">/{plan.interval}</span>
              </div>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span>Unlimited designs & catalogues</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span>Share links & order tracking</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span>Priority updates</span>
                </div>
              </div>
              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={loadingPlan === plan.id}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold shadow-lg transition-all disabled:opacity-50"
              >
                {loadingPlan === plan.id
                  ? 'Opening checkout...'
                  : useGooglePlayBilling
                    ? `Subscribe ${plan.name} with Google Play`
                    : `Subscribe ${plan.name}`}
              </button>
            </div>
          ))}
        </div>

        {useGooglePlayBilling && (
          <button
            type="button"
            onClick={handleRestoreGooglePlaySubscription}
            disabled={restoringSubscription}
            className="w-full border-2 border-gray-200 bg-white text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 disabled:opacity-50"
          >
            {restoringSubscription ? 'Restoring...' : 'Restore Google Play subscription'}
          </button>
        )}

        <div className="bg-white border-2 border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-black text-gray-900">Invoices</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Download receipts for your ThreadX subscription payments. Invoices include your firm name, plan details, and amount paid.
          </p>
          {loadingInvoices ? (
            <p className="text-sm text-gray-500">Loading invoices...</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-gray-500">
              No invoices yet. An invoice is generated automatically after you subscribe.
            </p>
          ) : (
            <div className="space-y-3">
              {invoices.map(invoice => (
                <div
                  key={invoice.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-gray-100 rounded-xl p-4"
                >
                  <div>
                    <p className="font-bold text-gray-900">{invoice.invoiceNumber}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {invoice.firmName ? `${invoice.firmName} · ` : ''}{invoice.planName} · {formatInvoiceAmount(invoice)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Paid on {formatInvoiceDate(invoice.paidAt)}
                      {invoice.billingPeriodEnd ? ` · Valid until ${formatInvoiceDate(invoice.billingPeriodEnd)}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadInvoice(invoice)}
                    disabled={downloadingInvoiceId === invoice.id}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-indigo-100 text-indigo-700 text-sm font-bold hover:bg-indigo-50 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    {downloadingInvoiceId === invoice.id ? 'Downloading...' : 'Download'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-2 border-red-100 bg-red-50/50 rounded-2xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <Trash2 className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-black text-gray-900">Delete account</h2>
              <p className="text-sm text-gray-600 mt-1">
                Permanently delete your ThreadX account, catalogues, designs, contacts, orders, and share links. This cannot be undone. Cancel your subscription first so you are not charged again.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Details for the Play Store and a mail-in option:{' '}
                <a href="/delete-account.html" className="text-indigo-600 underline font-semibold">
                  Account &amp; data deletion
                </a>
              </p>
              <button
                type="button"
                onClick={() => {
                  setDeleteOpen(true);
                  setDeleteConfirmText('');
                }}
                className="mt-3 w-full sm:w-auto px-4 py-2.5 rounded-xl border-2 border-red-200 bg-white text-red-700 text-sm font-bold hover:bg-red-50"
              >
                Delete my account…
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-500 pt-4 space-x-3">
          <a href="/contact-us.html" className="underline hover:text-gray-800">
            Contact us
          </a>
          <span className="text-gray-300">·</span>
          <a href="/privacy-policy.html" className="underline hover:text-gray-800">
            Privacy policy
          </a>
          <span className="text-gray-300">·</span>
          <a href="/delete-account.html" className="underline hover:text-gray-800">
            Delete account help
          </a>
        </p>
      </main>

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <h2 id="delete-account-title" className="text-lg font-black text-gray-900">Confirm account deletion</h2>
            <p className="text-sm text-gray-600">
              Type <strong className="text-gray-900">DELETE</strong> below to permanently erase your account and all data we store for it.
            </p>
            <input
              type="text"
              autoComplete="off"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-red-400"
            />
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => { setDeleteOpen(false); setDeleteConfirmText(''); }}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE' || deletingAccount}
                onClick={handleDeleteAccount}
                className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-40"
              >
                {deletingAccount ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
