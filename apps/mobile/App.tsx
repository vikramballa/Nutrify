import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from '@expo-google-fonts/quicksand';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AuthProvider } from './src/auth/AuthContext';

SplashScreen.preventAutoHideAsync();

/** How long a cached response stays usable offline. */
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnReconnect: true, // refetch stale queries when connectivity returns
      // Must outlive the persisted cache, or restored entries are garbage
      // collected the moment they are rehydrated.
      gcTime: CACHE_MAX_AGE_MS,
    },
  },
});

// People cook in kitchens with bad wifi. Persisting the cache means the app
// opens with yesterday's plan, recipes and goals instead of a row of spinners.
const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'nutrichef-query-cache',
  throttleTime: 2000,
});

export default function App() {
  const [loaded] = useFonts({
    Quicksand_400Regular,
    Quicksand_500Medium,
    Quicksand_600SemiBold,
    Quicksand_700Bold,
  });

  // Refetch stale queries when the app comes back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
    });
    return () => sub.remove();
  }, []);

  const onReady = useCallback(async () => {
    if (loaded) await SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: CACHE_MAX_AGE_MS,
          dehydrateOptions: {
            // Never write a failed or in-flight query to disk — restoring one
            // shows a stale error state on a launch that might work fine.
            shouldDehydrateQuery: (q) => q.state.status === 'success',
          },
        }}
      >
        <AuthProvider>
          <NavigationContainer onReady={onReady}>
            <StatusBar style="dark" />
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
