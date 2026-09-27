import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../theme/colors';

export default function RegisterScreen({ navigation }: any) {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await signUp(email, password, fullName);
    } catch (err: any) {
      Alert.alert('Registration failed', err?.response?.data?.error || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Create Account</Text>
      <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={colors.textMuted}
        value={fullName} onChangeText={setFullName} />
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textMuted}
        value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput style={styles.input} placeholder="Password" placeholderTextColor={colors.textMuted}
        value={password} onChangeText={setPassword} secureTextEntry />
      <Pressable style={styles.button} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign Up</Text>}
      </Pressable>
      <Pressable onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.lg },
  logo: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: spacing.xl },
  input: {
    backgroundColor: colors.surface, color: colors.text, borderRadius: 6, padding: spacing.md,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  button: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: 6, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
});
