import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Banner } from '@/components/ui/feedback';
import { PasswordField, TextField } from '@/components/ui/forms';
import { Button } from '@/components/ui/primitives';
import { useAuth } from '@/providers/AuthProvider';
import { colors, font, type } from '@/theme';

export default function SignUp() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await signUp(email, password, name);
      if (res.needsConfirmation) setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <View style={{ gap: 16 }}>
        <Text style={type.h1}>Check your inbox</Text>
        <Text style={type.body}>We sent a confirmation link to {email}. Open it to activate your account.</Text>
        <Link href="/sign-in" style={{ fontFamily: font.semibold, color: colors.primary }}>
          Back to sign in
        </Link>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text style={type.h1}>Create your account</Text>
        <Text style={type.small}>If a teammate invited you, use the same email to join their organization automatically.</Text>
      </View>
      {error ? <Banner tone="danger" title={error} /> : null}
      <TextField label="Full name" icon="person-outline" value={name} onChangeText={setName} autoComplete="name" textContentType="name" error={errors.name} />
      <TextField
        label="Work email"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        error={errors.email}
      />
      <PasswordField label="Password" value={password} onChangeText={setPassword} autoComplete="new-password" textContentType="newPassword" hint="At least 8 characters." error={errors.password} />
      <Button title="Create account" size="lg" onPress={submit} loading={loading} />
      <Text style={[type.small, { textAlign: 'center' }]}>
        Already have an account?{' '}
        <Link href="/sign-in" style={{ fontFamily: font.semibold, color: colors.primary }}>
          Sign in
        </Link>
      </Text>
    </View>
  );
}
