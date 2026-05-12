import { Capacitor, registerPlugin } from '@capacitor/core';

export const GOOGLE_PLAY_PRODUCTS = {
  monthly: import.meta.env.VITE_GOOGLE_PLAY_MONTHLY_PRODUCT_ID || 'sutra_monthly_599',
  annual: import.meta.env.VITE_GOOGLE_PLAY_ANNUAL_PRODUCT_ID || 'sutra_annual_6499'
} as const;

export type GooglePlayPlan = keyof typeof GOOGLE_PLAY_PRODUCTS;

interface GooglePlayPurchase {
  purchaseToken: string;
  productIds: string[];
}

interface GooglePlayBillingPlugin {
  isAvailable(): Promise<{ available: boolean; packageName: string }>;
  querySubscriptions(options: { productIds: string[] }): Promise<{ products: any[] }>;
  purchase(options: { productId: string }): Promise<GooglePlayPurchase>;
  restoreSubscriptions(): Promise<{ purchases: GooglePlayPurchase[] }>;
  openSubscriptionManagement(options?: { productId?: string }): Promise<void>;
}

const GooglePlayBilling = registerPlugin<GooglePlayBillingPlugin>('GooglePlayBilling');

export const isGooglePlayBillingAvailable = () => Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform();

export const getGooglePlayProductId = (plan: GooglePlayPlan) => GOOGLE_PLAY_PRODUCTS[plan];

export const googlePlayBilling = GooglePlayBilling;
