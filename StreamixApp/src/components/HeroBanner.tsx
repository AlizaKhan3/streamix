import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme/colors';

type Movie = { content_id: number; title: string; backdrop_path?: string; overview?: string };

export default function HeroBanner({ movie, onPlay, onInfo }: {
  movie: Movie; onPlay: () => void; onInfo: () => void;
}) {
  return (
    <ImageBackground
      source={movie.backdrop_path ? { uri: movie.backdrop_path } : undefined}
      style={styles.hero}
      imageStyle={{ opacity: 0.85 }}
    >
      <View style={styles.overlay}>
        <Text style={styles.title} numberOfLines={2}>{movie.title}</Text>
        <Text style={styles.overview} numberOfLines={2}>{movie.overview}</Text>
        <View style={styles.buttons}>
          <Pressable style={styles.playBtn} onPress={onPlay}>
            <Text style={styles.playText}>▶ Play</Text>
          </Pressable>
          <Pressable style={styles.infoBtn} onPress={onInfo}>
            <Text style={styles.infoText}>ⓘ More Info</Text>
          </Pressable>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  hero: { height: 420, justifyContent: 'flex-end', backgroundColor: colors.card },
  overlay: { padding: spacing.md, backgroundColor: 'rgba(0,0,0,0.35)' },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  overview: { color: colors.textMuted, marginTop: spacing.xs },
  buttons: { flexDirection: 'row', marginTop: spacing.md },
  playBtn: {
    backgroundColor: colors.text, paddingVertical: 10, paddingHorizontal: 24,
    borderRadius: 4, marginRight: spacing.sm,
  },
  playText: { color: '#000', fontWeight: '700' },
  infoBtn: {
    backgroundColor: 'rgba(255,255,255,0.25)', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 4,
  },
  infoText: { color: colors.text, fontWeight: '700' },
});
