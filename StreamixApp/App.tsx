import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { RegionProvider } from './src/context/RegionContext';
import { WatchlistProvider } from './src/context/WatchlistContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
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
