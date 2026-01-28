import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Crown, X } from 'lucide-react';
import { billingApi } from '../services/api';
import { SubscriptionStatus } from '../types';

interface Plan {
  id: 'monthly' | 'annual';
  name: string;
  price: number;
  currency: string;
  interval: string;
}

interface Props {
  isOpen: boolean;
  subscription?: SubscriptionStatus | null;
  isBlocking?: boolean;
  onClose: () => void;
  onSubscribed?: () => void;
}

const defaultPlans: Plan[] = [
  { id: 'monthly', name: 'Monthly', price: 299, currency: 'INR', interval: 'month' },
  { id: 'annual', name: 'Annual', price: 2999, currency: 'INR', interval: 'year' }
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

export const PricingDialog: React.FC<Props> = ({ isOpen, subscription, isBlocking, onClose, onSubscribed }) => {
  const [plans, setPlans] = useState<Plan[]>(defaultPlans);
  const [loadingPlan, setLoadingPlan] = useState<Plan['id'] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    billingApi.getPlans()
      .then(({ plans: fetchedPlans }) => setPlans(fetchedPlans as Plan[]))
      .catch(() => setPlans(defaultPlans));
  }, [isOpen]);

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
        name: 'TextileHub',
        description: planId === 'annual' ? 'Annual subscription' : 'Monthly subscription',
        prefill: { email: payload.email },
        theme: { color: '#4f46e5' },
        handler: () => {
          onSubscribed?.();
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-gray-900">Upgrade to Pro</h2>
            <p className="text-xs text-gray-500 mt-1">
              {subscription?.isFree
                ? 'Your account has free access.'
                : trialDaysLeft !== null
                  ? `Free trial: ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left`
                  : 'Start a subscription to continue'}
            </p>
          </div>
          {!isBlocking && (
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {plans.map(plan => (
              <div key={plan.id} className="border rounded-2xl p-5 flex flex-col gap-4">
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

          <div className="text-xs text-gray-500">
            Free for 7 days on every email. <span className="font-semibold">sunitapoddar95@gmail.com</span> stays free.
          </div>
        </div>
      </div>
    </div>
  );
};
