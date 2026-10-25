import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../theme/colors';
import { fieldErrorsFromApi, formatApiError, validateLoginLocal } from '../utils/formErrors';

export default function LoginScreen({ navigation }: any) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const local = validateLoginLocal(email, password);
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      const fieldErrs = fieldErrorsFromApi(err);
      if (Object.keys(fieldErrs).length) {
        setErrors(fieldErrs);
      } else {
        Alert.alert('Login failed', formatApiError(err, 'Check your credentials and try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>STREAMIX</Text>
      <TextInput
        style={[styles.input, errors.email && styles.inputError]}
        placeholder="Email"
        placeholderTextColor={colors.textMuted}
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (errors.email) setErrors((e) => ({ ...e, email: '' }));
        }}
        autoCapitalize="none"
        keyboardType="email-address"
        autoCorrect={false}
      />
      {!!errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
      <TextInput
        style={[styles.input, errors.password && styles.inputError]}
        placeholder="Password"
        placeholderTextColor={colors.textMuted}
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          if (errors.password) setErrors((e) => ({ ...e, password: '' }));
        }}
        secureTextEntry
      />
      {!!errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
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
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 6,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: { borderColor: colors.primary },
  errorText: {
    color: colors.primary,
    fontSize: 13,
    marginBottom: spacing.sm,
    marginTop: -2,
  },
  button: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: 6, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
});
