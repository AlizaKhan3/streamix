import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import MovieCard from '../components/MovieCard';
import { useWatchlist } from '../context/WatchlistContext';
import { fetchMovie, fetchWatchlist } from '../services/api';
import { colors, spacing } from '../theme/colors';

export default function WatchlistScreen({ navigation }: any) {
  const { refresh } = useWatchlist();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setLoading(true);
      refresh();
      fetchWatchlist()
        .then(async (rows) => {
          const movies = await Promise.all(rows.map((r: any) => fetchMovie(r.content_id).catch(() => null)));
          if (alive) setItems(movies.filter(Boolean));
        })
        .catch(() => alive && setItems([]))
        .finally(() => alive && setLoading(false));
      return () => { alive = false; };
    }, [refresh])
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {items.length === 0 ? (
        <Text style={styles.empty}>Your watchlist is empty. Add titles from the Home or Search tab.</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.content_id)}
          numColumns={3}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item }) => (
            <View style={{ margin: 4 }}>
              <MovieCard
                title={item.title}
                posterUrl={item.poster_path}
                rating={item.rating_avg}
                width={100}
                inWatchlist
                onPress={() => navigation.navigate('MovieDetail', { contentId: item.content_id })}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
});
