import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'ACME IoT',
  slug: 'acme-iot',
  scheme: 'acmeiot',
  version: '1.0.0',
  orientation: 'default',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'light',
  backgroundColor: '#F6F7FB',
  ios: {
    bundleIdentifier: 'com.acme.iot',
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription: 'ACME IoT uses the camera to scan device QR codes during setup.',
      NSPhotoLibraryUsageDescription: 'ACME IoT uses your photo library to set a profile picture.',
    },
  },
  android: {
    package: 'com.acme.iot',
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#4F46E5',
    },
    permissions: ['android.permission.CAMERA'],
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/images/favicon.png',
    name: 'ACME IoT',
    themeColor: '#4F46E5',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { image: './assets/images/splash-icon.png', imageWidth: 180, resizeMode: 'contain', backgroundColor: '#F6F7FB' },
    ],
    ['expo-camera', { cameraPermission: 'ACME IoT uses the camera to scan device QR codes during setup.' }],
    ['expo-image-picker', { photosPermission: 'ACME IoT uses your photo library to set a profile picture.' }],
    'expo-font',
  ],
  experiments: { typedRoutes: false },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  },
};

export default config;
