import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../theme/colors';

export default function ProfileScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  return (
    <View style={styles.container}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{user?.email?.[0]?.toUpperCase()}</Text></View>
      <Text style={styles.email}>{user?.email}</Text>
      <Text style={styles.role}>{user?.role}</Text>

      {user?.role === 'admin' && (
        <Pressable style={styles.adminBtn} onPress={() => navigation.navigate('Admin')}>
          <Text style={styles.adminText}>Catalog Admin</Text>
        </Pressable>
      )}

      <Pressable style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', paddingTop: spacing.xl },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  email: { color: colors.text, fontSize: 18, fontWeight: '700' },
  role: { color: colors.textMuted, marginTop: 2, textTransform: 'uppercase', fontSize: 12 },
  adminBtn: {
    marginTop: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 6, paddingVertical: 10, paddingHorizontal: 24,
  },
  adminText: { color: colors.text, fontWeight: '700' },
  signOutBtn: {
    marginTop: spacing.md, borderWidth: 1, borderColor: colors.primary,
    borderRadius: 6, paddingVertical: 10, paddingHorizontal: 24,
  },
  signOutText: { color: colors.primary, fontWeight: '700' },
});
