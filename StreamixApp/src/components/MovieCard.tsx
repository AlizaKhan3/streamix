import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

type Props = {
  title: string;
  posterUrl?: string | null;
  rating?: number;
  onPress: () => void;
  width?: number;
  inWatchlist?: boolean;
};

export default function MovieCard({
  title, posterUrl, rating, onPress, width = 120, inWatchlist = false,
}: Props) {
  return (
    <Pressable onPress={onPress} style={[styles.card, { width }]}>
      <View>
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={[styles.poster, { width, height: width * 1.5 }]} />
        ) : (
          <View style={[styles.poster, styles.placeholder, { width, height: width * 1.5 }]}>
            <Text style={styles.placeholderText} numberOfLines={3}>{title}</Text>
          </View>
        )}
        {inWatchlist && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>✓</Text>
          </View>
        )}
      </View>
      {typeof rating === 'number' && rating > 0 && (
        <Text style={styles.rating}>★ {Number(rating).toFixed(1)}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginRight: 10 },
  poster: { borderRadius: 6, backgroundColor: colors.card },
  placeholder: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  placeholderText: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  rating: { color: colors.star, fontSize: 12, marginTop: 4 },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.primary,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 12 },
});
