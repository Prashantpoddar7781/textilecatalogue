import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle, Crown, ShieldCheck, Trash2 } from 'lucide-react';
import { billingApi, usersApi } from '../services/api';
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    refreshSubscription();
    billingApi.getPlans()
      .then(({ plans: fetchedPlans }) => setPlans(fetchedPlans as Plan[]))
      .catch(() => setPlans(defaultPlans));
  }, []);

  const trialDaysLeft = useMemo(() => {
    if (!subscription?.trialEndsAt) return null;
    const msLeft = new Date(subscription.trialEndsAt).getTime() - Date.now();
    return Math.max(Math.ceil(msLeft / (24 * 60 * 60 * 1000)), 0);
  }, [subscription?.trialEndsAt]);

  const handleSubscribe = async (planId: Plan['id']) => {
    setError('');
    setLoadingPlan(planId);
    try {
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
        name: 'SutraDhar',
        description: planId === 'annual' ? 'Annual subscription' : 'Monthly subscription',
        prefill: { email: payload.email },
        theme: { color: '#4f46e5' },
        handler: () => {
          refreshSubscription();
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
              {subscription?.isTrialActive && trialDaysLeft !== null && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-indigo-500" />
                  <span>Trial active: {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left.</span>
                </div>
              )}
              {!subscription?.isTrialActive && !subscription?.isFree && subscription?.isActive && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span>Subscription active.</span>
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
                Renews/ends on {new Date(subscription.subscriptionEndsAt).toLocaleDateString()}
              </p>
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
                {loadingPlan === plan.id ? 'Opening checkout...' : `Subscribe ${plan.name}`}
              </button>
            </div>
          ))}
        </div>

        <div className="border-2 border-red-100 bg-red-50/50 rounded-2xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <Trash2 className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-black text-gray-900">Delete account</h2>
              <p className="text-sm text-gray-600 mt-1">
                Permanently delete your SutraDhar account, catalogues, designs, contacts, orders, and share links. This cannot be undone. If you subscribe via Google Play, cancel the subscription there so you are not charged again.
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
