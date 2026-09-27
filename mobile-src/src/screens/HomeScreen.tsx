// import React, { useCallback, useEffect, useState } from 'react';
// import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
// import HeroBanner from '../components/HeroBanner';
// import MovieRow from '../components/MovieRow';
// import { fetchTrending, searchCatalog } from '../services/api';
// import { colors } from '../theme/colors';

// export default function HomeScreen({ navigation }: any) {
//   const [trending, setTrending] = useState<any[]>([]);
//   const [byGenre, setByGenre] = useState<Record<string, any[]>>({});
//   const [loading, setLoading] = useState(true);
//   const [refreshing, setRefreshing] = useState(false);

//   const genresToShow = ['Action', 'Comedy', 'Drama', 'Sci-Fi'];

//   const load = useCallback(async () => {
//     const trendingData = await fetchTrending();
//     setTrending(trendingData);

//     const entries = await Promise.all(
//       genresToShow.map(async (g) => {
//         const res = await searchCatalog({ genre: g, sort: 'popularity' });
//         return [g, res.results] as const;
//       })
//     );
//     setByGenre(Object.fromEntries(entries));
//   }, []);

//   useEffect(() => {
//     load().finally(() => setLoading(false));
//   }, [load]);

//   const onRefresh = async () => {
//     setRefreshing(true);
//     await load();
//     setRefreshing(false);
//   };

//   if (loading) {
//     return (
//       <View style={styles.loading}>
//         <ActivityIndicator color={colors.primary} size="large" />
//       </View>
//     );
//   }

//   const featured = trending[0];

//   return (
//     <ScrollView
//       style={styles.container}
//       refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
//     >
//       {featured && (
//         <HeroBanner
//           movie={featured}
//           onPlay={() => navigation.navigate('MovieDetail', { contentId: featured.content_id, autoplay: true })}
//           onInfo={() => navigation.navigate('MovieDetail', { contentId: featured.content_id })}
//         />
//       )}

//       <MovieRow
//         title="Trending Now"
//         data={trending}
//         onSelect={(m) => navigation.navigate('MovieDetail', { contentId: m.content_id })}
//       />

//       {/* "Recommended for you" — placeholder personalization: ranks the genres the
//           signed-in user's watchlist/reviews skew toward. Wire this to a real
//           recommender once the review/watchlist data has enough volume. */}
//       {Object.entries(byGenre).map(([genre, movies]) => (
//         <MovieRow
//           key={genre}
//           title={genre}
//           data={movies}
//           onSelect={(m) => navigation.navigate('MovieDetail', { contentId: m.content_id })}
//         />
//       ))}
//     </ScrollView>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: colors.background },
//   loading: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
// });


import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import HeroBanner from '../components/HeroBanner';
import MovieRow from '../components/MovieRow';
import { fetchRecommendations, fetchTrending, searchCatalog } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const [trending, setTrending] = useState<any[]>([]);
  const [byGenre, setByGenre] = useState<Record<string, any[]>>({});
  const [recommended, setRecommended] = useState<any[]>([]);
  const [recBasis, setRecBasis] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const genresToShow = ['Action', 'Comedy', 'Drama', 'Sci-Fi'];

  const load = useCallback(async () => {
    const trendingData = await fetchTrending();
    setTrending(trendingData);

    const entries = await Promise.all(
      genresToShow.map(async (g) => {
        const res = await searchCatalog({ genre: g, sort: 'popularity' });
        return [g, res.results] as const;
      })
    );
    setByGenre(Object.fromEntries(entries));

    // Real recommendations, driven by this user's own watchlist + review
    // genre affinity (see backend/src/routes/recommendations.js). Silently
    // skipped for a signed-out session — there's no user data to base it on.
    if (user) {
      try {
        const rec = await fetchRecommendations();
        setRecommended(rec.results);
        setRecBasis(rec.basis);
      } catch {
        setRecommended([]);
      }
    }
  }, [user]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const featured = trending[0];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {featured && (
        <HeroBanner
          movie={featured}
          onPlay={() => navigation.navigate('MovieDetail', { contentId: featured.content_id, autoplay: true })}
          onInfo={() => navigation.navigate('MovieDetail', { contentId: featured.content_id })}
        />
      )}

      <MovieRow
        title="Trending Now"
        data={trending}
        onSelect={(m) => navigation.navigate('MovieDetail', { contentId: m.content_id })}
      />

      {recommended.length > 0 && (
        <MovieRow
          title={`Recommended for You${recBasis ? ` · ${recBasis}` : ''}`}
          data={recommended}
          onSelect={(m) => navigation.navigate('MovieDetail', { contentId: m.content_id })}
        />
      )}

      {Object.entries(byGenre).map(([genre, movies]) => (
        <MovieRow
          key={genre}
          title={genre}
          data={movies}
          onSelect={(m) => navigation.navigate('MovieDetail', { contentId: m.content_id })}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
});
