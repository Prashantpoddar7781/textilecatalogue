package com.textilehub.catalogue;

import android.content.Intent;
import android.net.Uri;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "GooglePlayBilling")
public class GooglePlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient billingClient;
    private final Map<String, ProductDetails> productDetailsCache = new HashMap<>();
    private PluginCall pendingPurchaseCall;

    private interface BillingReadyCallback {
        void onReady();
    }

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder()
                    .enableOneTimeProducts()
                    .build()
            )
            .build();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject response = new JSObject();
        response.put("available", true);
        response.put("packageName", getContext().getPackageName());
        call.resolve(response);
    }

    @PluginMethod
    public void querySubscriptions(PluginCall call) {
        JSArray productIds = call.getArray("productIds");
        List<String> ids = readProductIds(productIds);
        if (ids.isEmpty()) {
            call.reject("No Google Play product IDs provided");
            return;
        }

        withBillingClient(call, () -> queryProductDetails(ids, call));
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null || productId.trim().isEmpty()) {
            call.reject("Missing Google Play product ID");
            return;
        }

        withBillingClient(call, () -> {
            ProductDetails cached = productDetailsCache.get(productId);
            if (cached != null) {
                launchPurchaseFlow(call, cached);
                return;
            }

            List<String> ids = new ArrayList<>();
            ids.add(productId);
            queryProductDetails(ids, call, details -> launchPurchaseFlow(call, details));
        });
    }

    @PluginMethod
    public void restoreSubscriptions(PluginCall call) {
        withBillingClient(call, () -> {
            QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build();

            billingClient.queryPurchasesAsync(params, (billingResult, purchases) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject(billingResult.getDebugMessage());
                    return;
                }

                JSArray items = new JSArray();
                for (Purchase purchase : purchases) {
                    items.put(serializePurchase(purchase));
                }

                JSObject response = new JSObject();
                response.put("purchases", items);
                call.resolve(response);
            });
        });
    }

    @PluginMethod
    public void openSubscriptionManagement(PluginCall call) {
        String productId = call.getString("productId");
        String uri = "https://play.google.com/store/account/subscriptions?package=" + getContext().getPackageName();
        if (productId != null && !productId.trim().isEmpty()) {
            uri += "&sku=" + Uri.encode(productId);
        }

        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        getActivity().startActivity(intent);
        call.resolve();
    }

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        if (pendingPurchaseCall == null) return;

        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            rejectPendingPurchase("Purchase cancelled");
            return;
        }

        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            rejectPendingPurchase(billingResult.getDebugMessage());
            return;
        }

        Purchase purchase = purchases.get(0);
        if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) {
            rejectPendingPurchase("Purchase is pending. Please try again after payment is completed.");
            return;
        }

        if (!purchase.isAcknowledged()) {
            AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.getPurchaseToken())
                .build();
            billingClient.acknowledgePurchase(params, result -> resolvePendingPurchase(purchase));
            return;
        }

        resolvePendingPurchase(purchase);
    }

    private void withBillingClient(PluginCall call, BillingReadyCallback callback) {
        if (billingClient != null && billingClient.isReady()) {
            callback.onReady();
            return;
        }

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    callback.onReady();
                } else {
                    call.reject(billingResult.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
            }
        });
    }

    private interface ProductDetailsCallback {
        void onProductDetails(ProductDetails details);
    }

    private void queryProductDetails(List<String> ids, PluginCall call) {
        queryProductDetails(ids, call, null);
    }

    private void queryProductDetails(List<String> ids, PluginCall call, ProductDetailsCallback callback) {
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        for (String id : ids) {
            products.add(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(id)
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build()
            );
        }

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(products)
            .build();

        billingClient.queryProductDetailsAsync(params, (billingResult, result) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject(billingResult.getDebugMessage());
                return;
            }

            List<ProductDetails> productDetailsList = result.getProductDetailsList();
            for (ProductDetails details : productDetailsList) {
                productDetailsCache.put(details.getProductId(), details);
            }

            if (callback != null) {
                if (productDetailsList.isEmpty()) {
                    call.reject("Google Play product was not found. Make sure the subscription is active in Play Console.");
                    return;
                }
                callback.onProductDetails(productDetailsList.get(0));
                return;
            }

            JSArray items = new JSArray();
            for (ProductDetails details : productDetailsList) {
                items.put(serializeProductDetails(details));
            }

            JSObject response = new JSObject();
            response.put("products", items);
            call.resolve(response);
        });
    }

    private void launchPurchaseFlow(PluginCall call, ProductDetails details) {
        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) {
            call.reject("No subscription offer is available for this product");
            return;
        }

        ProductDetails.SubscriptionOfferDetails offer = offers.get(0);
        BillingFlowParams.ProductDetailsParams productDetailsParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)
            .setOfferToken(offer.getOfferToken())
            .build();

        List<BillingFlowParams.ProductDetailsParams> productDetailsParamsList = new ArrayList<>();
        productDetailsParamsList.add(productDetailsParams);

        BillingFlowParams flowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(productDetailsParamsList)
            .build();

        pendingPurchaseCall = call;
        call.setKeepAlive(true);
        BillingResult result = billingClient.launchBillingFlow(getActivity(), flowParams);
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            pendingPurchaseCall = null;
            call.setKeepAlive(false);
            call.reject(result.getDebugMessage());
        }
    }

    private List<String> readProductIds(JSArray productIds) {
        List<String> ids = new ArrayList<>();
        if (productIds == null) return ids;

        for (int index = 0; index < productIds.length(); index++) {
            try {
                String id = productIds.getString(index);
                if (id != null && !id.trim().isEmpty()) {
                    ids.add(id);
                }
            } catch (JSONException ignored) {
            }
        }
        return ids;
    }

    private JSObject serializeProductDetails(ProductDetails details) {
        JSObject item = new JSObject();
        item.put("productId", details.getProductId());
        item.put("title", details.getTitle());
        item.put("name", details.getName());
        item.put("description", details.getDescription());

        JSArray offers = new JSArray();
        List<ProductDetails.SubscriptionOfferDetails> offerDetails = details.getSubscriptionOfferDetails();
        if (offerDetails != null) {
            for (ProductDetails.SubscriptionOfferDetails offer : offerDetails) {
                JSObject offerJson = new JSObject();
                offerJson.put("basePlanId", offer.getBasePlanId());
                offerJson.put("offerId", offer.getOfferId());
                offerJson.put("offerToken", offer.getOfferToken());

                JSArray phases = new JSArray();
                for (ProductDetails.PricingPhase phase : offer.getPricingPhases().getPricingPhaseList()) {
                    JSObject phaseJson = new JSObject();
                    phaseJson.put("formattedPrice", phase.getFormattedPrice());
                    phaseJson.put("priceAmountMicros", phase.getPriceAmountMicros());
                    phaseJson.put("priceCurrencyCode", phase.getPriceCurrencyCode());
                    phaseJson.put("billingPeriod", phase.getBillingPeriod());
                    phaseJson.put("billingCycleCount", phase.getBillingCycleCount());
                    phaseJson.put("recurrenceMode", phase.getRecurrenceMode());
                    phases.put(phaseJson);
                }

                offerJson.put("pricingPhases", phases);
                offers.put(offerJson);
            }
        }

        item.put("offers", offers);
        return item;
    }

    private JSObject serializePurchase(Purchase purchase) {
        JSObject item = new JSObject();
        item.put("purchaseToken", purchase.getPurchaseToken());
        item.put("orderId", purchase.getOrderId());
        item.put("purchaseState", purchase.getPurchaseState());
        item.put("acknowledged", purchase.isAcknowledged());
        item.put("productIds", new JSArray(purchase.getProducts()));
        return item;
    }

    private void resolvePendingPurchase(Purchase purchase) {
        if (pendingPurchaseCall == null) return;

        JSObject response = serializePurchase(purchase);
        pendingPurchaseCall.setKeepAlive(false);
        pendingPurchaseCall.resolve(response);
        pendingPurchaseCall = null;
    }

    private void rejectPendingPurchase(String message) {
        if (pendingPurchaseCall == null) return;

        pendingPurchaseCall.setKeepAlive(false);
        pendingPurchaseCall.reject(message == null || message.isEmpty() ? "Purchase failed" : message);
        pendingPurchaseCall = null;
    }
}
