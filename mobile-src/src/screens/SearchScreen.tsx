import React, { useState } from 'react';
import {
  ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View, Pressable,
} from 'react-native';
import MovieCard from '../components/MovieCard';
import { searchCatalog } from '../services/api';
import { colors, spacing } from '../theme/colors';

const GENRES = ['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Romance'];

export default function SearchScreen({ navigation }: any) {
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ shardsQueried?: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const runSearch = async (q: string, g: string | null) => {
    setLoading(true);
    try {
      const res = await searchCatalog({ q: q || undefined, genre: g || undefined, sort: 'popularity' });
      setResults(res.results);
      setMeta({ shardsQueried: res.shardsQueried });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Search titles, actors, directors..."
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => runSearch(query, genre)}
        returnKeyType="search"
      />

      <View style={styles.chipRow}>
        {GENRES.map((g) => (
          <Pressable
            key={g}
            style={[styles.chip, genre === g && styles.chipActive]}
            onPress={() => { const next = genre === g ? null : g; setGenre(next); runSearch(query, next); }}
          >
            <Text style={[styles.chipText, genre === g && styles.chipTextActive]}>{g}</Text>
          </Pressable>
        ))}
      </View>

      {meta?.shardsQueried != null && (
        <Text style={styles.metaText}>
          Scatter-gather across {meta.shardsQueried} movie shard(s) · {results.length} results
        </Text>
      )}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
      ) : (
        <FlatList
          data={results}
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
  container: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.md },
  input: {
    backgroundColor: colors.surface, color: colors.text, borderRadius: 6, padding: spacing.md,
    marginHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.md, marginTop: spacing.md, gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  metaText: { color: colors.textMuted, fontSize: 11, marginTop: spacing.sm, marginHorizontal: spacing.md },
});
