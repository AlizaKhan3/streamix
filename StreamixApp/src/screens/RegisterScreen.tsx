import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../theme/colors';
import {
  fieldErrorsFromApi,
  formatApiError,
  validateRegisterLocal,
} from '../utils/formErrors';

export default function RegisterScreen({ navigation }: any) {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const local = validateRegisterLocal(fullName, email, password);
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await signUp(email.trim(), password, fullName.trim());
    } catch (err: any) {
      const fieldErrs = fieldErrorsFromApi(err);
      if (Object.keys(fieldErrs).length) {
        setErrors(fieldErrs);
      } else {
        Alert.alert('Registration failed', formatApiError(err, 'Please try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Create Account</Text>

      <TextInput
        style={[styles.input, errors.fullName && styles.inputError]}
        placeholder="Full name"
        placeholderTextColor={colors.textMuted}
        value={fullName}
        onChangeText={(t) => {
          setFullName(t);
          if (errors.fullName) setErrors((e) => ({ ...e, fullName: '' }));
        }}
      />
      {!!errors.fullName && <Text style={styles.errorText}>{errors.fullName}</Text>}

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

      <Pressable style={[styles.button, { marginTop: spacing.sm }]} onPress={submit} disabled={loading}>
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
