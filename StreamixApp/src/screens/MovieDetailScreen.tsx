import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import StarRating from '../components/StarRating';
import {
  addToWatchlist, fetchMovie, fetchReviews, removeFromWatchlist, submitReview,
} from '../services/api';
import { colors, spacing } from '../theme/colors';

function youtubeWatchUrl(key: string) {
  return `https://www.youtube.com/watch?v=${key}`;
}

function youtubeEmbedHtml(key: string) {
  // YouTube often serves a blank page if you load /embed directly in WKWebView.
  // An iframe document + baseUrl is the reliable in-app pattern on iOS.
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
    iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
  </style>
</head>
<body>
  <iframe
    src="https://www.youtube.com/embed/${key}?playsinline=1&rel=0&modestbranding=1&controls=1"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
    allowfullscreen
    referrerpolicy="strict-origin-when-cross-origin"
  ></iframe>
</body>
</html>`;
}

async function openTrailerExternally(trailerKey: string) {
  const url = youtubeWatchUrl(trailerKey);
  const can = await Linking.canOpenURL(url);
  if (!can) {
    Alert.alert('Cannot open YouTube', url);
    return;
  }
  await Linking.openURL(url);
}

/**
 * In-app YouTube trailer. Falls back to Safari/YouTube if the embed fails
 * (common on iOS Simulator).
 */
function TrailerPlayer({
  trailerKey,
  posterUrl,
  autoplay = false,
}: {
  trailerKey?: string | null;
  posterUrl?: string;
  autoplay?: boolean;
}) {
  const [playing, setPlaying] = useState(!!autoplay && !!trailerKey);

  if (playing && trailerKey) {
    return (
      <View style={styles.player}>
        <WebView
          source={{ html: youtubeEmbedHtml(trailerKey), baseUrl: 'https://www.youtube.com' }}
          style={styles.webview}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
          onHttpError={() => {
            setPlaying(false);
            openTrailerExternally(trailerKey);
          }}
          onError={() => {
            setPlaying(false);
            openTrailerExternally(trailerKey);
          }}
        />
        <View style={styles.playerActions}>
          <Pressable style={styles.closePlayer} onPress={() => setPlaying(false)}>
            <Text style={styles.closePlayerText}>Close</Text>
          </Pressable>
          <Pressable style={styles.closePlayer} onPress={() => openTrailerExternally(trailerKey)}>
            <Text style={styles.closePlayerText}>Open in YouTube</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      style={styles.player}
      onPress={() => {
        if (!trailerKey) {
          Alert.alert('No trailer', 'TMDb did not provide a trailer for this title.');
          return;
        }
        setPlaying(true);
      }}
    >
      {posterUrl && <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill} />}
      <View style={styles.playerOverlay}>
        <Text style={styles.playerIcon}>▶</Text>
        <Text style={styles.playHint}>{trailerKey ? 'Play trailer' : 'No trailer available'}</Text>
      </View>
    </Pressable>
  );
}

export default function MovieDetailScreen({ route }: any) {
  const { contentId, autoplay } = route.params;
  const [movie, setMovie] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [forcePlay, setForcePlay] = useState(false);

  useEffect(() => {
    Promise.all([fetchMovie(contentId), fetchReviews(contentId)])
      .then(([m, r]) => { setMovie(m); setReviews(r); })
      .finally(() => setLoading(false));
  }, [contentId]);

  const toggleWatchlist = async () => {
    try {
      if (inWatchlist) { await removeFromWatchlist(contentId); setInWatchlist(false); }
      else { await addToWatchlist(contentId); setInWatchlist(true); }
    } catch (err: any) {
      Alert.alert('Please sign in', 'You need an account to manage your watchlist.');
    }
  };

  const postReview = async () => {
    if (!rating) return Alert.alert('Pick a star rating first');
    try {
      const created = await submitReview(contentId, rating, comment);
      setReviews((prev) => [created, ...prev]);
      setRating(0); setComment('');
    } catch (err: any) {
      Alert.alert('Please sign in', 'You need an account to leave a review.');
    }
  };

  if (loading || !movie) {
    return <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  return (
    <ScrollView style={styles.container}>
      <TrailerPlayer
        key={forcePlay ? 'playing' : 'idle'}
        trailerKey={movie.trailer_key}
        posterUrl={movie.backdrop_path || movie.poster_path}
        autoplay={!!autoplay || forcePlay}
      />

      <View style={styles.body}>
        <Text style={styles.title}>{movie.title}</Text>
        <Text style={styles.meta}>
          {movie.release_year} · {movie.language?.toUpperCase()} · ★ {Number(movie.rating_avg).toFixed(1)}
          {'  '}· served from region {movie.home_region}
        </Text>
        <Text style={styles.genres}>{(movie.genres || []).join(' · ')}</Text>

        <Pressable
          style={styles.playBtn}
          onPress={() => {
            if (!movie.trailer_key) {
              Alert.alert('No trailer', 'TMDb did not provide a trailer for this title.');
              return;
            }
            // Prefer external YouTube — most reliable on iOS Simulator
            openTrailerExternally(movie.trailer_key);
          }}
        >
          <Text style={styles.playBtnText}>▶ Play Trailer</Text>
        </Pressable>

        <Pressable
          style={styles.watchlistBtn}
          onPress={() => {
            if (!movie.trailer_key) {
              Alert.alert('No trailer', 'TMDb did not provide a trailer for this title.');
              return;
            }
            setForcePlay(true);
          }}
        >
          <Text style={styles.watchlistText}>▶ Play in app</Text>
        </Pressable>

        <Pressable style={[styles.watchlistBtn, { marginTop: spacing.sm }]} onPress={toggleWatchlist}>
          <Text style={styles.watchlistText}>{inWatchlist ? '✓ In Watchlist' : '+ Add to Watchlist'}</Text>
        </Pressable>

        <Text style={styles.overview}>{movie.overview}</Text>

        {movie.director && <Text style={styles.section}>Director: <Text style={styles.sectionValue}>{movie.director}</Text></Text>}

        <Text style={styles.sectionHeading}>Ratings & Reviews</Text>
        <View style={styles.reviewForm}>
          <StarRating value={rating} onChange={setRating} />
          <TextInput
            style={styles.commentInput}
            placeholder="Write a review..."
            placeholderTextColor={colors.textMuted}
            value={comment}
            onChangeText={setComment}
            multiline
          />
          <Pressable style={styles.submitBtn} onPress={postReview}>
            <Text style={styles.submitText}>Post Review</Text>
          </Pressable>
        </View>

        {reviews.map((r) => (
          <View key={r.id} style={styles.reviewItem}>
            <StarRating value={r.rating} size={14} />
            {!!r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  player: { height: 240, width: '100%', backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  webview: { width: '100%', height: 240, backgroundColor: '#000' },
  playerActions: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 6 },
  closePlayer: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4,
  },
  closePlayerText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  playerOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  playerIcon: { fontSize: 52, color: '#fff' },
  playHint: { color: '#fff', marginTop: 6, fontWeight: '600' },
  body: { padding: spacing.md },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  meta: { color: colors.textMuted, marginTop: spacing.xs },
  genres: { color: colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  playBtn: {
    backgroundColor: colors.primary, borderRadius: 6, paddingVertical: 12,
    alignItems: 'center', marginTop: spacing.md,
  },
  playBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  watchlistBtn: {
    borderWidth: 1, borderColor: colors.textMuted, borderRadius: 6, paddingVertical: 10,
    alignItems: 'center', marginTop: spacing.sm,
  },
  watchlistText: { color: colors.text, fontWeight: '700' },
  overview: { color: colors.text, marginTop: spacing.md, lineHeight: 20 },
  section: { color: colors.textMuted, marginTop: spacing.md },
  sectionValue: { color: colors.text },
  sectionHeading: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: spacing.xl, marginBottom: spacing.sm },
  reviewForm: { backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md },
  commentInput: {
    color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    padding: spacing.sm, marginTop: spacing.sm, minHeight: 60, textAlignVertical: 'top',
  },
  submitBtn: { backgroundColor: colors.primary, borderRadius: 6, padding: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  submitText: { color: '#fff', fontWeight: '700' },
  reviewItem: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.sm, marginTop: spacing.sm },
  reviewComment: { color: colors.textMuted, marginTop: 4 },
});
