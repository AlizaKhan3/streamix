import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MovieCard from '../components/MovieCard';
import { useWatchlist } from '../context/WatchlistContext';
import { searchCatalog } from '../services/api';
import { colors, spacing } from '../theme/colors';

const GENRES: { label: string; value: string }[] = [
  { label: 'Action', value: 'Action' },
  { label: 'Comedy', value: 'Comedy' },
  { label: 'Drama', value: 'Drama' },
  { label: 'Horror', value: 'Horror' },
  { label: 'Sci-Fi', value: 'Science Fiction' },
  { label: 'Romance', value: 'Romance' },
];

export default function SearchScreen({ navigation }: any) {
  const watchlist = useWatchlist();
  const inList = (id: number | string) =>
    typeof watchlist?.has === 'function' ? watchlist.has(id) : false;

  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ shardsQueried?: number; total?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const inputRef = useRef<TextInput>(null);
  const genreRef = useRef<string | null>(null);

  useEffect(() => {
    genreRef.current = genre;
  }, [genre]);

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
    } catch (err: any) {
      if (id !== requestId.current) return;
      setResults([]);
      setMeta(null);
      setError(err?.response?.data?.error || err?.message || 'Search failed — is the API running?');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    runSearch('', null);
  }, [runSearch]);

  const onChangeQuery = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(text, genreRef.current);
    }, 450);
  };

  const onPickGenre = (value: string) => {
    const next = genre === value ? null : value;
    setGenre(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runSearch(query, next);
  };

  const header = (
    <View>
      <View style={styles.searchRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Search titles, actors, directors..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={onChangeQuery}
          onSubmitEditing={() => runSearch(query, genre)}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          editable
          selectTextOnFocus={false}
          blurOnSubmit={false}
          keyboardAppearance="dark"
        />
        <Pressable
          style={styles.searchBtn}
          onPress={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            runSearch(query, genre);
          }}
        >
          <Text style={styles.searchBtnText}>Go</Text>
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
          Scatter-gather across {meta.shardsQueried} shard(s)
          {meta.total != null ? ` · ${meta.total} matches` : ''}
        </Text>
      )}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={results}
        keyExtractor={(item) => String(item.content_id)}
        numColumns={3}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              {error ? 'Could not load results.' : 'No movies found. Try another title or genre.'}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <MovieCard
              title={item.title}
              posterUrl={item.poster_path}
              rating={item.rating_avg}
              width={100}
              inWatchlist={inList(item.content_id)}
              onPress={() => navigation.navigate('MovieDetail', { contentId: item.content_id })}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  input: {
    flex: 1,
    minHeight: 48,
    backgroundColor: colors.surface,
    color: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
    marginRight: 8,
  },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    minHeight: 48,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  metaText: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: spacing.xs,
    marginHorizontal: spacing.md,
  },
  errorText: {
    color: colors.primary,
    fontSize: 12,
    marginTop: spacing.xs,
    marginHorizontal: spacing.md,
  },
  cardWrap: { margin: 4, marginLeft: spacing.md },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    lineHeight: 20,
  },
});
