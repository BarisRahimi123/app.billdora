# Apple In-App Purchase Integration Guide for Billdora

## Overview
This guide explains how to implement Apple In-App Purchases (StoreKit 2) for subscription upgrades in the Billdora iOS app built with Capacitor.

---

## Prerequisites

1. **Apple Developer Account** with App Store Connect access
2. **Xcode 14+** installed
3. **Capacitor iOS project** already set up

---

## Step 1: Configure App Store Connect

### 1.1 Create In-App Purchase Products

1. Go to **App Store Connect** → **My Apps** → **Billdora**
2. Navigate to **Features** → **In-App Purchases**
3. Click **+** to create new subscriptions:

| Product ID | Type | Price | Description |
|------------|------|-------|-------------|
| `billdora.starter.monthly` | Auto-Renewable | $20/mo | Starter Monthly Plan |
| `billdora.starter.yearly` | Auto-Renewable | $200/yr | Starter Yearly Plan |
| `billdora.professional.monthly` | Auto-Renewable | $60/mo | Professional Monthly Plan |
| `billdora.professional.yearly` | Auto-Renewable | $600/yr | Professional Yearly Plan |

### 1.2 Create Subscription Group

1. Create a subscription group called **"Billdora Plans"**
2. Add all 4 products to this group
3. Set the ranking (Professional > Starter)

---

## Step 2: Enable Capabilities in Xcode

### 2.1 Add In-App Purchase Capability

```
1. Open ios/App/App.xcworkspace in Xcode
2. Select the App target
3. Go to "Signing & Capabilities" tab
4. Click "+ Capability"
5. Add "In-App Purchase"
```

### 2.2 Enable App Groups (for receipt sharing)

```
1. In "Signing & Capabilities"
2. Add "App Groups" capability
3. Create group: group.com.billdora.app
```

---

## Step 3: Create StoreKit Configuration (for testing)

### 3.1 Create StoreKit Config File

1. In Xcode: **File** → **New** → **File**
2. Search for **"StoreKit Configuration File"**
3. Name it `Products.storekit`
4. Add your subscription products matching App Store Connect

---

## Step 4: Implement StoreKit 2 in Swift

### 4.1 Create `StoreKitManager.swift`

Create this file in `ios/App/App/`:

```swift
import StoreKit

@MainActor
class StoreKitManager: ObservableObject {
    static let shared = StoreKitManager()
    
    @Published var products: [Product] = []
    @Published var purchasedProductIDs: Set<String> = []
    
    private let productIDs: Set<String> = [
        "billdora.starter.monthly",
        "billdora.starter.yearly",
        "billdora.professional.monthly",
        "billdora.professional.yearly"
    ]
    
    init() {
        Task {
            await loadProducts()
            await updatePurchasedProducts()
        }
        
        // Listen for transactions
        Task {
            for await result in Transaction.updates {
                await handleTransaction(result)
            }
        }
    }
    
    func loadProducts() async {
        do {
            products = try await Product.products(for: productIDs)
            products.sort { $0.price < $1.price }
        } catch {
            print("Failed to load products: \(error)")
        }
    }
    
    func purchase(_ product: Product) async throws -> Transaction? {
        let result = try await product.purchase()
        
        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)
            await updatePurchasedProducts()
            await transaction.finish()
            
            // Send to backend to sync with Stripe
            await syncPurchaseWithBackend(transaction: transaction, product: product)
            
            return transaction
            
        case .userCancelled:
            return nil
            
        case .pending:
            return nil
            
        @unknown default:
            return nil
        }
    }
    
    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw StoreError.failedVerification
        case .verified(let safe):
            return safe
        }
    }
    
    func updatePurchasedProducts() async {
        var purchased: Set<String> = []
        
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result {
                purchased.insert(transaction.productID)
            }
        }
        
        purchasedProductIDs = purchased
    }
    
    private func handleTransaction(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = result else { return }
        await updatePurchasedProducts()
        await transaction.finish()
    }
    
    // Sync Apple purchase with your Supabase backend
    private func syncPurchaseWithBackend(transaction: Transaction, product: Product) async {
        guard let appStoreReceiptURL = Bundle.main.appStoreReceiptURL,
              FileManager.default.fileExists(atPath: appStoreReceiptURL.path),
              let receiptData = try? Data(contentsOf: appStoreReceiptURL) else {
            return
        }
        
        let receiptString = receiptData.base64EncodedString()
        
        // Call your Supabase Edge Function to validate and sync
        let url = URL(string: "https://bqxnagmmegdbqrzhheip.supabase.co/functions/v1/apple-receipt-validate")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "receipt": receiptString,
            "product_id": product.id,
            "transaction_id": String(transaction.id),
            "original_transaction_id": String(transaction.originalID)
        ]
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        do {
            let (_, _) = try await URLSession.shared.data(for: request)
            print("Purchase synced with backend")
        } catch {
            print("Failed to sync purchase: \(error)")
        }
    }
}

enum StoreError: Error {
    case failedVerification
}
```

### 4.2 Create Capacitor Plugin for StoreKit

Create `StoreKitPlugin.swift`:

```swift
import Capacitor
import StoreKit

@objc(StoreKitPlugin)
public class StoreKitPlugin: CAPPlugin {
    
    @objc func getProducts(_ call: CAPPluginCall) {
        Task { @MainActor in
            let manager = StoreKitManager.shared
            await manager.loadProducts()
            
            let productsData = manager.products.map { product in
                return [
                    "id": product.id,
                    "displayName": product.displayName,
                    "description": product.description,
                    "price": product.price.description,
                    "displayPrice": product.displayPrice
                ]
            }
            
            call.resolve(["products": productsData])
        }
    }
    
    @objc func purchase(_ call: CAPPluginCall) {
        guard let productID = call.getString("productId") else {
            call.reject("Product ID required")
            return
        }
        
        Task { @MainActor in
            let manager = StoreKitManager.shared
            
            guard let product = manager.products.first(where: { $0.id == productID }) else {
                call.reject("Product not found")
                return
            }
            
            do {
                let transaction = try await manager.purchase(product)
                if let transaction = transaction {
                    call.resolve([
                        "success": true,
                        "transactionId": String(transaction.id),
                        "productId": transaction.productID
                    ])
                } else {
                    call.resolve(["success": false, "cancelled": true])
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }
    
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task { @MainActor in
            let manager = StoreKitManager.shared
            await manager.updatePurchasedProducts()
            
            call.resolve([
                "restored": Array(manager.purchasedProductIDs)
            ])
        }
    }
    
    @objc func getCurrentSubscription(_ call: CAPPluginCall) {
        Task { @MainActor in
            let manager = StoreKitManager.shared
            await manager.updatePurchasedProducts()
            
            call.resolve([
                "subscriptions": Array(manager.purchasedProductIDs)
            ])
        }
    }
}
```

### 4.3 Register Plugin

In `ios/App/App/AppDelegate.swift`, add:

```swift
import Capacitor

// In application(_:didFinishLaunchingWithOptions:)
// Register the StoreKit plugin
```

Create `StoreKitPlugin.m`:

```objc
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(StoreKitPlugin, "StoreKit",
    CAP_PLUGIN_METHOD(getProducts, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(purchase, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(restorePurchases, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getCurrentSubscription, CAPPluginReturnPromise);
)
```

---

## Step 5: Call from React/TypeScript

### 5.1 Create StoreKit Service

Create `src/lib/storekit.ts`:

```typescript
import { Capacitor, registerPlugin } from '@capacitor/core';

interface StoreKitPlugin {
  getProducts(): Promise<{ products: Product[] }>;
  purchase(options: { productId: string }): Promise<PurchaseResult>;
  restorePurchases(): Promise<{ restored: string[] }>;
  getCurrentSubscription(): Promise<{ subscriptions: string[] }>;
}

interface Product {
  id: string;
  displayName: string;
  description: string;
  price: string;
  displayPrice: string;
}

interface PurchaseResult {
  success: boolean;
  cancelled?: boolean;
  transactionId?: string;
  productId?: string;
}

const StoreKit = registerPlugin<StoreKitPlugin>('StoreKit');

export async function getAppleProducts(): Promise<Product[]> {
  if (!Capacitor.isNativePlatform()) {
    console.log('StoreKit only available on iOS');
    return [];
  }
  
  const result = await StoreKit.getProducts();
  return result.products;
}

export async function purchaseProduct(productId: string): Promise<PurchaseResult> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('StoreKit only available on iOS');
  }
  
  return await StoreKit.purchase({ productId });
}

export async function restorePurchases(): Promise<string[]> {
  if (!Capacitor.isNativePlatform()) {
    return [];
  }
  
  const result = await StoreKit.restorePurchases();
  return result.restored;
}

export async function getCurrentSubscription(): Promise<string[]> {
  if (!Capacitor.isNativePlatform()) {
    return [];
  }
  
  const result = await StoreKit.getCurrentSubscription();
  return result.subscriptions;
}
```

### 5.2 Update UpgradeModal to Support Apple Pay

In your `UpgradeModal.tsx`, add iOS-specific purchase flow:

```typescript
import { Capacitor } from '@capacitor/core';
import { purchaseProduct, getAppleProducts } from '../lib/storekit';

// Map database plan IDs to Apple product IDs
const APPLE_PRODUCT_MAP: Record<string, string> = {
  'Starter Monthly': 'billdora.starter.monthly',
  'Starter Yearly': 'billdora.starter.yearly',
  'Professional Monthly': 'billdora.professional.monthly',
  'Professional Yearly': 'billdora.professional.yearly',
};

// In handleUpgrade function:
const handleUpgrade = async (plan) => {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
    // Use Apple In-App Purchase
    const appleProductId = APPLE_PRODUCT_MAP[plan.name];
    if (appleProductId) {
      const result = await purchaseProduct(appleProductId);
      if (result.success) {
        // Purchase successful - backend will sync via webhook
        onClose();
        showToast('Subscription activated!');
      }
    }
  } else {
    // Use Stripe Checkout for web
    // ... existing Stripe code
  }
};
```

---

## Step 6: Backend Receipt Validation

Create Supabase Edge Function `apple-receipt-validate`:

```typescript
// supabase/functions/apple-receipt-validate/index.ts
Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { receipt, product_id, transaction_id, user_id } = await req.json();

  // Validate receipt with Apple
  const validationURL = 'https://buy.itunes.apple.com/verifyReceipt'; // Use sandbox for testing
  
  const response = await fetch(validationURL, {
    method: 'POST',
    body: JSON.stringify({
      'receipt-data': receipt,
      'password': Deno.env.get('APPLE_SHARED_SECRET'), // From App Store Connect
    }),
  });

  const result = await response.json();

  if (result.status === 0) {
    // Valid receipt - update user subscription in database
    // Map Apple product to your plan and update billdora_subscriptions
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: false }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
```

---

## Step 7: Testing

### 7.1 Sandbox Testing

1. Create **Sandbox Tester** accounts in App Store Connect
2. Sign out of App Store on test device
3. Sign in with Sandbox account when prompted during purchase
4. Use StoreKit Configuration file for local testing in Xcode

### 7.2 Test Scenarios

- [ ] Fresh purchase of each plan
- [ ] Upgrade from Starter to Professional
- [ ] Downgrade from Professional to Starter
- [ ] Cancel and resubscribe
- [ ] Restore purchases on new device

---

## Summary

| Component | Location |
|-----------|----------|
| StoreKit Manager | `ios/App/App/StoreKitManager.swift` |
| Capacitor Plugin | `ios/App/App/StoreKitPlugin.swift` |
| TypeScript Service | `src/lib/storekit.ts` |
| Backend Validation | `supabase/functions/apple-receipt-validate` |
| Products Config | App Store Connect + `Products.storekit` |

---

## Apple Review Notes

For App Store submission, include in your review notes:
- Demo account credentials for testing
- Explanation that subscriptions are for business management features
- Note that both Apple Pay (iOS) and Stripe (web) are supported
