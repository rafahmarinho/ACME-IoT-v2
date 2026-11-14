import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Banner } from '@/components/ui/feedback';
import { TextField } from '@/components/ui/forms';
import { Button } from '@/components/ui/primitives';
import { useAuth } from '@/providers/AuthProvider';
import { colors, font, type } from '@/theme';

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setFieldError('Enter a valid email address.');
    setFieldError(null);
    setError(null);
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text style={type.h1}>Reset your password</Text>
        <Text style={type.small}>Enter the email you use for ACME IoT and we’ll send you a secure reset link.</Text>
      </View>
      {sent ? (
        <Banner tone="success" title="Check your email" message={`If an account exists for ${email}, a reset link is on its way. The link opens this app to choose a new password.`} />
      ) : null}
      {error ? <Banner tone="danger" title={error} /> : null}
      <TextField
        label="Work email"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        error={fieldError}
        onSubmitEditing={submit}
      />
      <Button title={sent ? 'Send again' : 'Send reset link'} size="lg" onPress={submit} loading={loading} />
      <Link href="/sign-in" style={{ fontFamily: font.semibold, color: colors.primary, textAlign: 'center' }}>
        Back to sign in
      </Link>
    </View>
  );
}
