import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.textilehub.catalogue',
  appName: 'ThreadX',
  webDir: 'dist',
  server: {
    allowNavigation: [
      'textilecatalogue.vercel.app',
      'textilecatalogue-production.up.railway.app'
    ]
  }
};

export default config;
