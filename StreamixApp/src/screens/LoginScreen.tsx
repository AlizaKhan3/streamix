import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../theme/colors';

export default function LoginScreen({ navigation }: any) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: any) {
      Alert.alert('Login failed', err?.response?.data?.error || 'Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>STREAMIX</Text>
      <TextInput
        style={styles.input} placeholder="Email" placeholderTextColor={colors.textMuted}
        value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
      />
      <TextInput
        style={styles.input} placeholder="Password" placeholderTextColor={colors.textMuted}
        value={password} onChangeText={setPassword} secureTextEntry
      />
      <Pressable style={styles.button} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
      </Pressable>
      <Pressable onPress={() => navigation.navigate('Register')}>
        <Text style={styles.link}>New here? Create an account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.lg },
  logo: { color: colors.primary, fontSize: 34, fontWeight: '900', textAlign: 'center', marginBottom: spacing.xl },
  input: {
    backgroundColor: colors.surface, color: colors.text, borderRadius: 6, padding: spacing.md,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  button: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: 6, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
});
