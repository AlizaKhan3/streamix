import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useRegion } from '../context/RegionContext';
import { ClientRegion } from '../services/region';
import { colors, spacing } from '../theme/colors';

const REGIONS: ClientRegion[] = ['US', 'EU'];

const AVATAR_COLORS = ['#E50914', '#564D4D', '#1A5C3A', '#0D47A1', '#6A1B9A'];

function avatarColor(email?: string) {
  if (!email) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash + email.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash];
}

function displayName(email?: string) {
  if (!email) return 'Member';
  const local = email.split('@')[0] || 'Member';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default function ProfileScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { region, detectedRegion, exactLabel, setRegion, useDetected } = useRegion();
  const initial = user?.email?.[0]?.toUpperCase() || '?';
  const name = displayName(user?.email);
  const isAuto = region === detectedRegion;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
    >
      <Text style={styles.pageTitle}>My Profile</Text>

      <View style={styles.hero}>
        <View style={[styles.avatar, { backgroundColor: avatarColor(user?.email) }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {user?.role === 'admin' && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>ADMIN</Text>
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.rowLabel}>Membership</Text>
            <Text style={styles.rowValue}>Streamix Standard</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue} numberOfLines={1}>{user?.email}</Text>
          </View>
        </View>
        {user?.role === 'admin' && (
          <>
            <View style={styles.divider} />
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => navigation.navigate('Admin')}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.rowLabel}>Manage catalog</Text>
                <Text style={styles.rowValue}>Admin tools</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>Streaming region</Text>
      <View style={styles.card}>
        <View style={styles.regionMeta}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Your location</Text>
            <Text style={styles.metaValue}>{exactLabel}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Nearest shard</Text>
            <Text style={styles.metaValue}>{detectedRegion}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Active</Text>
            <Text style={[styles.metaValue, styles.metaActive]}>{region}</Text>
          </View>
        </View>

        <View style={styles.segment}>
          {REGIONS.map((r) => {
            const active = region === r;
            return (
              <Pressable
                key={r}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setRegion(r)}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{r}</Text>
              </Pressable>
            );
          })}
        </View>

        {!isAuto && (
          <Pressable style={styles.resetBtn} onPress={useDetected}>
            <Text style={styles.resetText}>Reset to auto ({detectedRegion})</Text>
          </Pressable>
        )}

        <Text style={styles.hint}>
          Near You routes to US or EU movie shards. Your device timezone maps to the nearest one.
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.signOutBtn, pressed && styles.signOutPressed]}
        onPress={signOut}
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      <Text style={styles.footer}>Streamix · Distributed streaming demo</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2 },
  pageTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: spacing.lg,
  },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { color: '#fff', fontSize: 42, fontWeight: '800' },
  name: { color: colors.text, fontSize: 22, fontWeight: '700' },
  email: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  badge: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 3,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  rowPressed: { backgroundColor: colors.card },
  rowLeft: { flex: 1, paddingRight: spacing.md },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowValue: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  chevron: { color: colors.textMuted, fontSize: 26, fontWeight: '300', marginTop: -2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.md },
  regionMeta: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  metaBlock: { flex: 1 },
  metaLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  metaValue: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 4 },
  metaActive: { color: colors.primary },
  segment: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: 6,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 5,
  },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.textMuted, fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  segmentTextActive: { color: '#fff' },
  resetBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  resetText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
  },
  signOutBtn: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  signOutPressed: { backgroundColor: colors.surface },
  signOutText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  footer: {
    color: '#555',
    textAlign: 'center',
    marginTop: spacing.xl,
    fontSize: 12,
  },
});
