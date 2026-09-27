import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { RegionProvider } from './src/context/RegionContext';
import { WatchlistProvider } from './src/context/WatchlistContext';
import AppNavigator from './src/navigation/AppNavigator';
import { initApiBaseUrl } from './src/services/api';

export default function App() {
  useEffect(() => {
    initApiBaseUrl().catch(() => undefined);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0B0B0B" />
      <RegionProvider>
        <AuthProvider>
          <WatchlistProvider>
            <AppNavigator />
          </WatchlistProvider>
        </AuthProvider>
      </RegionProvider>
    </SafeAreaProvider>
  );
}
