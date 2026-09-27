import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import MovieCard from '../components/MovieCard';
import { searchCatalog } from '../services/api';
import { colors, spacing } from '../theme/colors';

/** Chip label → TMDb genre name stored in DB */
const GENRES: { label: string; value: string }[] = [
  { label: 'Action', value: 'Action' },
  { label: 'Comedy', value: 'Comedy' },
  { label: 'Drama', value: 'Drama' },
  { label: 'Horror', value: 'Horror' },
  { label: 'Sci-Fi', value: 'Science Fiction' },
  { label: 'Romance', value: 'Romance' },
];

export default function SearchScreen({ navigation }: any) {
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ shardsQueried?: number; total?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  const runSearch = useCallback(async (q: string, g: string | null) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await searchCatalog({
        q: q.trim() || undefined,
        genre: g || undefined,
        sort: 'popularity',
      });
      if (id !== requestId.current) return;
      setResults(Array.isArray(res?.results) ? res.results : []);
      setMeta({ shardsQueried: res?.shardsQueried, total: res?.total });
      setSearched(true);
    } catch (err: any) {
      if (id !== requestId.current) return;
      console.warn('search failed', err?.message || err);
      setResults([]);
      setMeta(null);
      setError(err?.response?.data?.error || err?.message || 'Search failed — is the API running?');
      setSearched(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // Load popular titles when the screen opens
  useEffect(() => {
    runSearch('', null);
  }, [runSearch]);

  const onChangeQuery = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text, genre), 400);
  };

  const onPickGenre = (value: string) => {
    const next = genre === value ? null : value;
    setGenre(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runSearch(query, next);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search titles, actors, directors..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={onChangeQuery}
          onSubmitEditing={() => runSearch(query, genre)}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <Pressable style={styles.searchBtn} onPress={() => runSearch(query, genre)}>
          <Text style={styles.searchBtnText}>Search</Text>
        </Pressable>
      </View>

      <View style={styles.chipRow}>
        {GENRES.map((g) => (
          <Pressable
            key={g.value}
            style={[styles.chip, genre === g.value && styles.chipActive]}
            onPress={() => onPickGenre(g.value)}
          >
            <Text style={[styles.chipText, genre === g.value && styles.chipTextActive]}>{g.label}</Text>
          </Pressable>
        ))}
      </View>

      {meta?.shardsQueried != null && (
        <Text style={styles.metaText}>
          Scatter-gather across {meta.shardsQueried} movie shard(s)
          {meta.total != null ? ` · ${meta.total} match${meta.total === 1 ? '' : 'es'}` : ''}
          {results.length ? ` · showing ${results.length}` : ''}
        </Text>
      )}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.content_id)}
          numColumns={3}
          contentContainerStyle={{ padding: spacing.md, flexGrow: 1 }}
          ListEmptyComponent={
            searched ? (
              <Text style={styles.empty}>
                {error ? 'Could not load results.' : 'No movies found. Try another title or genre.'}
              </Text>
            ) : null
          }
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 6,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  searchBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  metaText: { color: colors.textMuted, fontSize: 11, marginTop: spacing.sm, marginHorizontal: spacing.md },
  errorText: { color: colors.primary, fontSize: 12, marginTop: spacing.xs, marginHorizontal: spacing.md },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    lineHeight: 20,
  },
});
