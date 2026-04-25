# Wata-Board Native App Guide

This guide provides instructions on how to transform the Wata-Board DApp into a native mobile application using Capacitor.

## Prerequisites

- Node.js and npm installed
- Android Studio (for Android) or Xcode (for iOS)
- Wata-Board frontend built and ready

## 1. Install Capacitor

Run the following commands in the `wata-board-frontend` directory:

```bash
npm install @capacitor/core @capacitor/cli
npx cap init Wata-Board com.wataboard.app --web-dir dist
```

## 2. Add Platforms

```bash
# For Android
npm install @capacitor/android
npx cap add android

# For iOS
npm install @capacitor/ios
npx cap add ios
```

## 3. Build and Sync

Whenever you update your web code, build it and sync with Capacitor:

```bash
npm run build
npx cap sync
```

## 4. Run on Device

```bash
# Open in Android Studio
npx cap open android

# Open in Xcode
npx cap open ios
```

## 5. PWA Features (Already Implemented)

The app already includes a `manifest.json` and `sw.js` for a high-quality Progressive Web App (PWA) experience, which:
- Provides an "Install App" prompt on mobile browsers.
- Supports offline bill payment status viewing.
- Displays as a standalone app without browser chrome.
- Includes app shortcuts for "Pay Bill" and "Scheduled Payments".

## 6. Native Features Integration

To use native features like Biometric Auth or Camera (for scanning meter QR codes), you can install Capacitor plugins:

```bash
npm install @capacitor-community/barcode-scanner
npx cap sync
```

Then use them in your React components:

```typescript
import { BarcodeScanner } from '@capacitor-community/barcode-scanner';

const startScan = async () => {
  await BarcodeScanner.checkPermission({ force: true });
  BarcodeScanner.hideBackground();
  const result = await BarcodeScanner.startScan();
  if (result.hasContent) {
    console.log(result.content); // Use scanned meter ID
  }
};
```
