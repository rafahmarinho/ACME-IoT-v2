import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Banner } from '@/components/ui/feedback';
import { PasswordField } from '@/components/ui/forms';
import { Button } from '@/components/ui/primitives';
import { useAuth } from '@/providers/AuthProvider';
import { type } from '@/theme';

export default function ResetPassword() {
  const { updatePassword, session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    if (confirm !== password) next.confirm = 'Passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    setError(null);
    try {
      await updatePassword(password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text style={type.h1}>Choose a new password</Text>
        <Text style={type.small}>{session?.user.email ? `For ${session.user.email}` : 'Open this page from the link in your reset email.'}</Text>
      </View>
      {!session ? <Banner tone="warning" title="Reset link missing or expired" message="Request a new link from the sign-in page." /> : null}
      {error ? <Banner tone="danger" title={error} /> : null}
      <PasswordField label="New password" value={password} onChangeText={setPassword} autoComplete="new-password" error={errors.password} hint="At least 8 characters." />
      <PasswordField label="Confirm password" value={confirm} onChangeText={setConfirm} autoComplete="new-password" error={errors.confirm} onSubmitEditing={submit} />
      <Button title="Update password" size="lg" onPress={submit} loading={loading} disabled={!session} />
    </View>
  );
}
