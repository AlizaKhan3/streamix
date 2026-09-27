import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import YoutubePlayer, { YoutubeIframeRef } from 'react-native-youtube-iframe';
import StarRating from '../components/StarRating';
import {
  addToWatchlist, fetchMovie, fetchReviews, removeFromWatchlist, submitReview,
} from '../services/api';
import { colors, spacing } from '../theme/colors';

const PLAYER_HEIGHT = 220;
const PLAYER_WIDTH = Dimensions.get('window').width;

/**
 * In-app trailer player — stays inside Streamix with Play / Pause / Stop.
 * Uses TMDb YouTube trailer_key (full studio features need a licensed CDN).
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
  const playerRef = useRef<YoutubeIframeRef>(null);
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

  const togglePlayPause = () => {
    if (!active) {
      start();
      return;
    }
    setPlaying((p) => !p);
  };

  const stop = async () => {
    setPlaying(false);
    try {
      await playerRef.current?.seekTo(0, true);
    } catch {
      // ignore
    }
    setActive(false);
  };

  if (!active || !trailerKey) {
    return (
      <View>
        <Pressable style={styles.player} onPress={start}>
          {posterUrl && <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill} />}
          <View style={styles.playerOverlay}>
            <Text style={styles.playerIcon}>▶</Text>
            <Text style={styles.playHint}>{trailerKey ? 'Tap to play trailer' : 'No trailer available'}</Text>
          </View>
        </Pressable>
        <View style={styles.controls}>
          <Pressable style={[styles.controlBtn, styles.controlPrimary]} onPress={start}>
            <Text style={styles.controlText}>▶ Play</Text>
          </Pressable>
          <Pressable style={styles.controlBtn} disabled>
            <Text style={[styles.controlText, styles.controlDisabled]}>⏸ Pause</Text>
          </Pressable>
          <Pressable style={styles.controlBtn} disabled>
            <Text style={[styles.controlText, styles.controlDisabled]}>⏹ Stop</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.player}>
        <YoutubePlayer
          ref={playerRef}
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
          }}
        />
      </View>
      <View style={styles.controls}>
        <Pressable style={[styles.controlBtn, styles.controlPrimary]} onPress={togglePlayPause}>
          <Text style={styles.controlText}>{playing ? '⏸ Pause' : '▶ Play'}</Text>
        </Pressable>
        <Pressable style={styles.controlBtn} onPress={stop}>
          <Text style={styles.controlText}>⏹ Stop</Text>
        </Pressable>
      </View>
    </View>
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
  const [playNonce, setPlayNonce] = useState(0);

  useEffect(() => {
    Promise.all([fetchMovie(contentId), fetchReviews(contentId)])
      .then(([m, r]) => { setMovie(m); setReviews(r); })
      .finally(() => setLoading(false));
  }, [contentId]);

  const toggleWatchlist = async () => {
    try {
      if (inWatchlist) { await removeFromWatchlist(contentId); setInWatchlist(false); }
      else { await addToWatchlist(contentId); setInWatchlist(true); }
    } catch {
      Alert.alert('Please sign in', 'You need an account to manage your watchlist.');
    }
  };

  const postReview = async () => {
    if (!rating) return Alert.alert('Pick a star rating first');
    try {
      const created = await submitReview(contentId, rating, comment);
      setReviews((prev) => [created, ...prev]);
      setRating(0); setComment('');
    } catch {
      Alert.alert('Please sign in', 'You need an account to leave a review.');
    }
  };

  if (loading || !movie) {
    return <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  return (
    <ScrollView style={styles.container} nestedScrollEnabled>
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

        <Pressable style={styles.watchlistBtn} onPress={toggleWatchlist}>
          <Text style={styles.watchlistText}>{inWatchlist ? '✓ In Watchlist' : '+ Add to Watchlist'}</Text>
        </Pressable>

        <Text style={styles.overview}>{movie.overview}</Text>

        {movie.director && (
          <Text style={styles.section}>
            Director: <Text style={styles.sectionValue}>{movie.director}</Text>
          </Text>
        )}

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
  player: {
    height: PLAYER_HEIGHT,
    width: '100%',
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  controls: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: 8,
  },
  controlBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  controlPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  controlText: { color: colors.text, fontWeight: '700' },
  controlDisabled: { color: colors.textMuted },
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
  watchlistText: { color: colors.text, fontWeight: '700' },
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
  commentInput: {
    color: colors.text,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    padding: spacing.sm,
    marginTop: spacing.sm,
    minHeight: 60,
    textAlignVertical: 'top',
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
