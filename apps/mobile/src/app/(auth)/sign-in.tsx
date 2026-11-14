import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Banner } from '@/components/ui/feedback';
import { PasswordField, TextField } from '@/components/ui/forms';
import { Button, Divider } from '@/components/ui/primitives';
import { useAuth } from '@/providers/AuthProvider';
import { colors, font, type } from '@/theme';

const DEMO = [
  { email: 'owner@acme.test', role: 'Owner · Acme (admin at Bluefin)' },
  { email: 'admin@acme.test', role: 'Administrator · Acme' },
  { email: 'operator@acme.test', role: 'Operator · Acme' },
  { email: 'viewer@acme.test', role: 'Viewer · Acme' },
  { email: 'owner@bluefin.test', role: 'Owner · Bluefin Hotels' },
];
import { DEMO_PASSWORD } from '@/lib/demo';

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e = email, p = password) => {
    const next: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(e.trim())) next.email = 'Enter a valid email address.';
    if (!p) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setError(null);
    setLoading(true);
    try {
      await signIn(e, p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text style={type.h1}>Welcome back</Text>
        <Text style={type.small}>Sign in to manage your buildings and devices.</Text>
      </View>
      {error ? <Banner tone="danger" title={error} /> : null}
      <TextField
        label="Work email"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@company.com"
        error={errors.email}
        returnKeyType="next"
      />
      <PasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoComplete="password"
        textContentType="password"
        placeholder="••••••••"
        error={errors.password}
        returnKeyType="go"
        onSubmitEditing={() => submit()}
      />
      <Link href="/forgot-password" asChild>
        <Pressable accessibilityRole="link" style={{ alignSelf: 'flex-end' }}>
          <Text style={{ fontFamily: font.semibold, color: colors.primary, fontSize: 14 }}>Forgot password?</Text>
        </Pressable>
      </Link>
      <Button title="Sign in" size="lg" onPress={() => submit()} loading={loading} />
      <Text style={[type.small, { textAlign: 'center' }]}>
        New to ACME IoT?{' '}
        <Link href="/sign-up" style={{ fontFamily: font.semibold, color: colors.primary }}>
          Create an account
        </Link>
      </Text>

      <Divider style={{ marginVertical: 4 }} />
      <View style={{ gap: 8 }}>
        <Text style={type.small}>
          Demo accounts · password <Text style={{ fontFamily: font.semibold, color: colors.text }}>{DEMO_PASSWORD}</Text>
        </Text>
        {DEMO.map((d) => (
          <Pressable
            key={d.email}
            onPress={() => {
              setEmail(d.email);
              setPassword(DEMO_PASSWORD);
              submit(d.email, DEMO_PASSWORD);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Sign in as ${d.email}`}
            style={({ pressed, hovered }: any) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: hovered || pressed ? colors.primaryBorder : colors.border,
              backgroundColor: pressed ? colors.primarySoft : colors.surface,
            })}
          >
            <Text style={{ fontFamily: font.medium, fontSize: 13.5, color: colors.text }}>{d.email}</Text>
            <Text style={[type.small, { fontSize: 12 }]}>{d.role}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
