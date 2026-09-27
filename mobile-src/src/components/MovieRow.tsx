import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import MovieCard from './MovieCard';
import { useWatchlist } from '../context/WatchlistContext';
import { colors, spacing } from '../theme/colors';

type Movie = { content_id: number; title: string; poster_path?: string; rating_avg?: number };

export default function MovieRow({
  title, data, onSelect,
}: { title: string; data: Movie[]; onSelect: (m: Movie) => void }) {
  const { has } = useWatchlist();
  if (!data?.length) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={data}
        keyExtractor={(item) => String(item.content_id)}
        contentContainerStyle={{ paddingHorizontal: spacing.md }}
        renderItem={({ item }) => (
          <MovieCard
            title={item.title}
            posterUrl={item.poster_path}
            rating={item.rating_avg}
            inWatchlist={has(item.content_id)}
            onPress={() => onSelect(item)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  heading: {
    color: colors.text, fontSize: 16, fontWeight: '700',
    marginLeft: spacing.md, marginBottom: spacing.sm,
  },
});
