import React from 'react';
import { StyleSheet, View } from 'react-native';

type TabName = 'Home' | 'Search' | 'Watchlist' | 'Profile';

type Props = {
  name: TabName | string;
  color: string;
  size?: number;
  focused?: boolean;
};

/** Vector-free tab icons — no custom font linking required (fixes ? boxes on iOS). */
export default function TabBarIcon({ name, color, size = 24, focused }: Props) {
  const stroke = 2;

  if (name === 'Home') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: size * 0.32,
            borderRightWidth: size * 0.32,
            borderBottomWidth: size * 0.26,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: color,
            marginBottom: -1,
          }}
        />
        <View
          style={{
            width: size * 0.5,
            height: size * 0.4,
            borderWidth: stroke,
            borderColor: color,
            borderTopWidth: 0,
            backgroundColor: focused ? `${color}33` : 'transparent',
          }}
        />
      </View>
    );
  }

  if (name === 'Search') {
    const r = size * 0.32;
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <View
          style={{
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            borderWidth: stroke,
            borderColor: color,
            position: 'absolute',
            top: size * 0.12,
            left: size * 0.12,
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: size * 0.34,
            height: stroke,
            backgroundColor: color,
            borderRadius: 1,
            right: size * 0.08,
            bottom: size * 0.18,
            transform: [{ rotate: '45deg' }],
          }}
        />
      </View>
    );
  }

  if (name === 'Watchlist') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <View
          style={{
            width: size * 0.42,
            height: size * 0.62,
            borderWidth: stroke,
            borderColor: color,
            borderRadius: 2,
            backgroundColor: focused ? `${color}33` : 'transparent',
          }}
        />
        <View
          style={{
            position: 'absolute',
            bottom: size * 0.12,
            width: 0,
            height: 0,
            borderLeftWidth: size * 0.14,
            borderRightWidth: size * 0.14,
            borderBottomWidth: size * 0.2,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: color,
            transform: [{ rotate: '180deg' }],
          }}
        />
      </View>
    );
  }

  // Profile
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View
        style={{
          width: size * 0.34,
          height: size * 0.34,
          borderRadius: size * 0.17,
          borderWidth: stroke,
          borderColor: color,
          marginBottom: 2,
          backgroundColor: focused ? `${color}33` : 'transparent',
        }}
      />
      <View
        style={{
          width: size * 0.58,
          height: size * 0.28,
          borderTopLeftRadius: size * 0.3,
          borderTopRightRadius: size * 0.3,
          borderWidth: stroke,
          borderColor: color,
          borderBottomWidth: 0,
          backgroundColor: focused ? `${color}22` : 'transparent',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
