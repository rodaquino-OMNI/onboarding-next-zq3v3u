/**
 * Capacitor Configuration for AUSTA Integration Platform Mobile App
 * Version: 1.0.0
 * 
 * This configuration implements enhanced security features, biometric authentication,
 * and platform-specific optimizations for the AUSTA mobile application.
 */

import { CapacitorConfig } from '@capacitor/cli';
import { environment } from '../environments/environment';

const config: CapacitorConfig = {
  appId: 'health.austa.mobile',
  appName: 'AUSTA Health',
  webDir: 'www',
  bundledWebRuntime: false,
  plugins: {
    // Splash screen configuration with branded colors
    SplashScreen: {
      launchShowDuration: 3000,
      backgroundColor: '#2196F3',
      spinnerColor: '#ffffff',
      showSpinner: true
    },
    // Keyboard behavior optimization
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true
    },
    // Local notification settings with branded elements
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#2196F3',
      sound: 'notification.wav'
    },
    // Enhanced biometric authentication configuration
    NativeBiometric: {
      enabled: true,
      allowDeviceCredentials: true,
      maxAttempts: 3,
      lockoutDuration: 30,
      strongAuth: true,
      requireConfirmation: true
    }
  },
  // Server configuration with security headers
  server: {
    hostname: 'app.austa.health',
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: ['*.austa.health'],
    cleartext: false,
    headers: {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    }
  },
  // Android-specific configuration
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: !environment.production,
    minSdkVersion: 23,
    targetSdkVersion: 31,
    hideLogs: environment.production,
    overscroll: false,
    backgroundColor: '#2196F3'
  },
  // iOS-specific configuration
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
    scrollEnabled: true,
    usesFontScaling: true,
    preferredContentMode: 'mobile',
    backgroundColor: '#2196F3',
    statusBarStyle: 'dark',
    hideStatusBar: false,
    webViewSuspensionEnabled: true
  }
};

export default config;