import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import StarRating from '../components/StarRating';
import {
  addToWatchlist, fetchMovie, fetchReviews, removeFromWatchlist, submitReview,
} from '../services/api';
import { colors, spacing } from '../theme/colors';

// NOTE: actual video delivery/CDN streaming is explicitly out of scope for this
// project (see proposal §1 / architecture §11 "Assumptions and Scope" — this is
// a *metadata* platform). This player is a Netflix-style play/pause + scrubber
// mock driven by a local timer, so the UI/UX can be demoed without a video CDN.
// Swap `MockPlayer` for `react-native-video` + a real trailer_key/HLS url later.
function MockPlayer({ posterUrl }: { posterUrl?: string }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setProgress((p) => Math.min(1, p + 0.01)), 300);
    return () => clearInterval(id);
  }, [playing]);

  return (
    <Pressable style={styles.player} onPress={() => setPlaying((p) => !p)}>
      {posterUrl && <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill} blurRadius={playing ? 0 : 2} />}
      <View style={styles.playerOverlay}>
        <Text style={styles.playerIcon}>{playing ? '⏸' : '▶'}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </Pressable>
  );
}

export default function MovieDetailScreen({ route }: any) {
  const { contentId } = route.params;
  const [movie, setMovie] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);

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
      <MockPlayer posterUrl={movie.backdrop_path || movie.poster_path} />

      <View style={styles.body}>
        <Text style={styles.title}>{movie.title}</Text>
        <Text style={styles.meta}>
          {movie.release_year} · {movie.language?.toUpperCase()} · ★ {Number(movie.rating_avg).toFixed(1)}
          {'  '}· served from region {movie.home_region}
        </Text>
        <Text style={styles.genres}>{(movie.genres || []).join(' · ')}</Text>

        <Pressable style={styles.watchlistBtn} onPress={toggleWatchlist}>
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
  player: { height: 220, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center' },
  playerOverlay: {
    ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  playerIcon: { fontSize: 52, color: '#fff' },
  progressTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  progressFill: { height: 3, backgroundColor: colors.primary },
  body: { padding: spacing.md },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  meta: { color: colors.textMuted, marginTop: spacing.xs },
  genres: { color: colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  watchlistBtn: {
    borderWidth: 1, borderColor: colors.textMuted, borderRadius: 6, paddingVertical: 10,
    alignItems: 'center', marginTop: spacing.md,
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
