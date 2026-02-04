import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.plansrow.billdora',
  appName: 'BillDora',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false
  },
  server: {
    // Disable caching in development
    cleartext: true
  }
};

export default config;
