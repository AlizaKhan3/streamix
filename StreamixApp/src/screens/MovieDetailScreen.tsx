import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import YoutubePlayer from 'react-native-youtube-iframe';
import StarRating from '../components/StarRating';
import { useWatchlist } from '../context/WatchlistContext';
import {
  fetchMovie, fetchReviews, submitReview,
} from '../services/api';
import { colors, spacing } from '../theme/colors';

const PLAYER_HEIGHT = 220;
const PLAYER_WIDTH = Dimensions.get('window').width;

/**
 * In-app trailer — YouTube's own controls handle play/pause.
 * Uses TMDb trailer_key (full studio features need a licensed CDN).
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
  const [active, setActive] = useState(!!autoplay && !!trailerKey);
  const [playing, setPlaying] = useState(!!autoplay && !!trailerKey);

  const onStateChange = useCallback((state: string) => {
    if (state === 'ended') setPlaying(false);
    if (state === 'playing') setPlaying(true);
    if (state === 'paused') setPlaying(false);
  }, []);

  const start = () => {
    if (!trailerKey) {
      Alert.alert('No trailer', 'TMDb did not provide a trailer for this title.');
      return;
    }
    setActive(true);
    setPlaying(true);
  };

  if (!active || !trailerKey) {
    return (
      <Pressable style={styles.player} onPress={start}>
        {posterUrl && <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill} />}
        <View style={styles.playerOverlay}>
          <Text style={styles.playerIcon}>▶</Text>
          <Text style={styles.playHint}>{trailerKey ? 'Tap to play trailer' : 'No trailer available'}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.player}>
      <YoutubePlayer
        height={PLAYER_HEIGHT}
        width={PLAYER_WIDTH}
        play={playing}
        videoId={trailerKey}
        onChangeState={onStateChange}
        webViewProps={{
          allowsInlineMediaPlayback: true,
          mediaPlaybackRequiresUserAction: false,
        }}
        initialPlayerParams={{
          preventFullScreen: false,
          modestbranding: true,
          rel: false,
          controls: true,
        }}
      />
    </View>
  );
}

export default function MovieDetailScreen({ route }: any) {
  const { contentId, autoplay } = route.params;
  const { has, toggle, refresh } = useWatchlist();
  const inWatchlist = has(contentId);
  const [movie, setMovie] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [playNonce, setPlayNonce] = useState(0);

  useEffect(() => {
    Promise.all([fetchMovie(contentId), fetchReviews(contentId)])
      .then(([m, r]) => { setMovie(m); setReviews(r); })
      .finally(() => setLoading(false));
  }, [contentId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const toggleWatchlist = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const nowIn = await toggle(contentId);
      // optional soft feedback — button label already updates
      if (!nowIn) {
        /* removed */
      }
    } catch {
      Alert.alert('Please sign in', 'You need an account to manage your watchlist.');
    } finally {
      setBusy(false);
    }
  };

  const postReview = async () => {
    if (!rating) return Alert.alert('Pick a star rating first', 'Tap the stars above, then post.');
    try {
      const created = await submitReview(Number(contentId), rating, comment);
      setReviews((prev) => [created, ...prev]);
      setRating(0);
      setComment('');
      Alert.alert('Posted', 'Your review was saved.');
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error || err?.message || 'Could not submit review';
      if (status === 401) {
        Alert.alert('Please sign in', 'Your session expired — sign out and sign in again.');
      } else {
        Alert.alert('Review failed', msg);
      }
    }
  };

  if (loading || !movie) {
    return <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <ScrollView
        style={styles.container}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
      <TrailerPlayer
        key={`${movie.trailer_key}-${playNonce}`}
        trailerKey={movie.trailer_key}
        posterUrl={movie.backdrop_path || movie.poster_path}
        autoplay={!!autoplay || playNonce > 0}
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
            setPlayNonce((n) => n + 1);
          }}
        >
          <Text style={styles.playBtnText}>▶ Play Trailer in Streamix</Text>
        </Pressable>

        <Pressable
          style={[styles.watchlistBtn, inWatchlist && styles.watchlistBtnActive]}
          onPress={toggleWatchlist}
          disabled={busy}
        >
          <Text style={[styles.watchlistText, inWatchlist && styles.watchlistTextActive]}>
            {busy ? '…' : inWatchlist ? '✓ In Watchlist  ·  Tap to remove' : '+ Add to Watchlist'}
          </Text>
        </Pressable>

        <Text style={styles.overview}>{movie.overview}</Text>

        {movie.director && (
          <Text style={styles.section}>
            Director: <Text style={styles.sectionValue}>{movie.director}</Text>
          </Text>
        )}

        <Text style={styles.sectionHeading}>Ratings & Reviews</Text>
        <View style={styles.reviewForm}>
          <Text style={styles.ratingHint}>Tap stars to rate ({rating || 0}/5)</Text>
          <StarRating value={rating} onChange={setRating} />
          <TextInput
            style={styles.commentInput}
            placeholder="Write a review..."
            placeholderTextColor={colors.textMuted}
            value={comment}
            onChangeText={setComment}
            multiline
            editable
            textAlignVertical="top"
            blurOnSubmit={false}
          />
          <Pressable style={styles.submitBtn} onPress={postReview}>
            <Text style={styles.submitText}>Post Review</Text>
          </Pressable>
        </View>

        {reviews.map((r) => (
          <View key={String(r.id)} style={styles.reviewItem}>
            <StarRating value={Number(r.rating)} size={14} />
            {!!r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
          </View>
        ))}
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  player: {
    height: PLAYER_HEIGHT,
    width: '100%',
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  playerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerIcon: { fontSize: 52, color: '#fff' },
  playHint: { color: '#fff', marginTop: 6, fontWeight: '600' },
  body: { padding: spacing.md },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  meta: { color: colors.textMuted, marginTop: spacing.xs },
  genres: { color: colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  playBtn: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  playBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  watchlistBtn: {
    borderWidth: 1,
    borderColor: colors.textMuted,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  watchlistBtnActive: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  watchlistText: { color: colors.text, fontWeight: '700' },
  watchlistTextActive: { color: colors.primary },
  overview: { color: colors.text, marginTop: spacing.md, lineHeight: 20 },
  section: { color: colors.textMuted, marginTop: spacing.md },
  sectionValue: { color: colors.text },
  sectionHeading: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  reviewForm: { backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md },
  ratingHint: { color: colors.textMuted, marginBottom: spacing.sm, fontSize: 13 },
  commentInput: {
    color: colors.text,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    padding: spacing.sm,
    marginTop: spacing.sm,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: colors.card,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    padding: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitText: { color: '#fff', fontWeight: '700' },
  reviewItem: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  reviewComment: { color: colors.textMuted, marginTop: 4 },
});
