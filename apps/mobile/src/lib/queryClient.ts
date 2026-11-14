import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Serve cached data first so the last known state is readable offline.
      networkMode: 'offlineFirst',
      staleTime: 10_000,
      gcTime: 1000 * 60 * 60 * 24,
      retry: (count, err: any) => count < 2 && err?.status !== 401 && err?.status !== 403,
      refetchOnReconnect: true,
    },
    mutations: { networkMode: 'online' },
  },
});

export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'acme-iot-cache-v1', throttleTime: 2000 });

// Online state from NetInfo → pauses queries offline and refetches on reconnect.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false && state.isInternetReachable !== false);
  }),
);

// App foreground/background → pauses polling while in the background.
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (s) => handleFocus(s === 'active'));
    return () => sub.remove();
  });
}
