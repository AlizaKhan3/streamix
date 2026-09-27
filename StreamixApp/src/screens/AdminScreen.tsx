import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { adminBulkDiscover, adminSyncMovie } from '../services/api';
import { colors, spacing } from '../theme/colors';

const GENRES = [
  { id: 28, label: 'Action' },
  { id: 35, label: 'Comedy' },
  { id: 18, label: 'Drama' },
  { id: 878, label: 'Sci-Fi' },
  { id: 27, label: 'Horror' },
  { id: 10749, label: 'Romance' },
];

const REGIONS = ['US', 'EU'] as const;

export default function AdminScreen() {
  const [tmdbId, setTmdbId] = useState('27205');
  const [region, setRegion] = useState<'US' | 'EU'>('US');
  const [busy, setBusy] = useState(false);
  const [lastMsg, setLastMsg] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setLastMsg('');
    try {
      await fn();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Request failed';
      Alert.alert('Admin error', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Catalog Admin</Text>
      <Text style={styles.hint}>
        Sync titles from TMDb into the sharded movie cluster. Writes always go to a shard primary
        (hash of content_id). Requires role = admin.
      </Text>

      <Text style={styles.label}>Home region for writes</Text>
      <View style={styles.row}>
        {REGIONS.map((r) => (
          <Pressable
            key={r}
            style={[styles.chip, region === r && styles.chipActive]}
            onPress={() => setRegion(r)}
          >
            <Text style={[styles.chipText, region === r && styles.chipTextActive]}>{r}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Sync one TMDb ID</Text>
      <TextInput
        style={styles.input}
        value={tmdbId}
        onChangeText={setTmdbId}
        keyboardType="number-pad"
        placeholder="e.g. 27205 (Inception)"
        placeholderTextColor={colors.textMuted}
      />
      <Pressable
        style={styles.btn}
        disabled={busy}
        onPress={() =>
          run(async () => {
            const id = Number(tmdbId);
            if (!id) throw new Error('Enter a valid TMDb id');
            const res = await adminSyncMovie(id, region);
            setLastMsg(`Synced content_id=${res.synced} → region ${res.shardRegion}`);
          })
        }
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sync movie</Text>}
      </Pressable>

      <Text style={[styles.label, { marginTop: spacing.xl }]}>Bulk discover by genre</Text>
      <View style={styles.genreGrid}>
        {GENRES.map((g) => (
          <Pressable
            key={g.id}
            style={styles.genreBtn}
            disabled={busy}
            onPress={() =>
              run(async () => {
                const res = await adminBulkDiscover(g.id, region);
                setLastMsg(`Bulk ${g.label} (${region}): synced ${res.synced} titles`);
              })
            }
          >
            <Text style={styles.genreText}>{g.label}</Text>
          </Pressable>
        ))}
      </View>

      {!!lastMsg && <Text style={styles.success}>{lastMsg}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  heading: { color: colors.text, fontSize: 22, fontWeight: '800' },
  hint: { color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.lg, lineHeight: 18 },
  label: { color: colors.text, fontWeight: '700', marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: 8, marginBottom: spacing.lg },
  chip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 6,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  input: {
    backgroundColor: colors.surface, color: colors.text, borderRadius: 6, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  btn: {
    backgroundColor: colors.primary, borderRadius: 6, paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' },
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genreBtn: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 6, paddingVertical: 10, paddingHorizontal: 14,
  },
  genreText: { color: colors.text, fontWeight: '600' },
  success: { color: colors.success, marginTop: spacing.lg, fontWeight: '600' },
});
