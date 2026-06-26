const ORDERS_UPDATED_EVENT = 'threadx-orders-updated';
const ORDERS_UPDATED_STORAGE_KEY = 'threadx-orders-updated-at';
const ORDERS_CHANNEL_NAME = 'threadx-orders';

export function notifyOrdersUpdated() {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent(ORDERS_UPDATED_EVENT));

  try {
    const channel = new BroadcastChannel(ORDERS_CHANNEL_NAME);
    channel.postMessage({ type: ORDERS_UPDATED_EVENT, at: Date.now() });
    channel.close();
  } catch {
    // BroadcastChannel is not available in every WebView/browser.
  }

  try {
    window.localStorage.setItem(ORDERS_UPDATED_STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage may be blocked in some embedded browsers.
  }
}

export function subscribeToOrdersUpdated(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined;

  const eventHandler = () => callback();
  window.addEventListener(ORDERS_UPDATED_EVENT, eventHandler);

  const storageHandler = (event: StorageEvent) => {
    if (event.key === ORDERS_UPDATED_STORAGE_KEY) callback();
  };
  window.addEventListener('storage', storageHandler);

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(ORDERS_CHANNEL_NAME);
    channel.onmessage = event => {
      if (event.data?.type === ORDERS_UPDATED_EVENT) callback();
    };
  } catch {
    channel = null;
  }

  return () => {
    window.removeEventListener(ORDERS_UPDATED_EVENT, eventHandler);
    window.removeEventListener('storage', storageHandler);
    channel?.close();
  };
}
