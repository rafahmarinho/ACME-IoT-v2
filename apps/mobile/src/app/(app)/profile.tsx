import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { PageHeader, Screen } from '@/components/ui/feedback';
import { PasswordField, TextField } from '@/components/ui/forms';
import { Avatar, Badge, Button, Card, SectionTitle } from '@/components/ui/primitives';
import { useOnline } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { accountService } from '@/services/db';
import { type } from '@/theme';

export default function Profile() {
  const { user } = useAuth();
  const { profile, memberships } = useOrg();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name);
    setJobTitle(profile.job_title);
    setPhone(profile.phone);
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSaved = (p: any) => {
    qc.setQueryData(['profile', user?.id], p);
    qc.invalidateQueries({ queryKey: ['team'] });
  };
  const save = useMutation({
    mutationFn: async () => {
      if (fullName.trim().length < 2) {
        setNameError('Enter your full name.');
        throw new Error('validation');
      }
      setNameError(null);
      return accountService.updateProfile(user!.id, { full_name: fullName.trim(), job_title: jobTitle.trim(), phone: phone.trim() });
    },
    onSuccess: (p) => (onSaved(p), toast.show({ title: 'Profile saved', tone: 'success' })),
    onError: (e) => errorMessage(e) !== 'validation' && toast.show({ title: 'Could not save profile', message: errorMessage(e), tone: 'danger' }),
  });
  const avatar = useMutation({
    mutationFn: async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
      if (res.canceled || !res.assets[0]) throw new Error('cancelled');
      const a = res.assets[0];
      return accountService.uploadAvatar(user!.id, a.uri, a.mimeType ?? 'image/jpeg');
    },
    onSuccess: (p) => (onSaved(p), toast.show({ title: 'Photo updated', tone: 'success' })),
    onError: (e) => errorMessage(e) !== 'cancelled' && toast.show({ title: 'Could not upload photo', message: errorMessage(e), tone: 'danger' }),
  });
  const changePassword = useMutation({
    mutationFn: async () => {
      const next: Record<string, string> = {};
      if (password.length < 8) next.password = 'Use at least 8 characters.';
      if (password !== confirm) next.confirm = 'Passwords do not match.';
      setPwErrors(next);
      if (Object.keys(next).length) throw new Error('validation');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setPassword('');
      setConfirm('');
      toast.show({ title: 'Password changed', tone: 'success' });
    },
    onError: (e) => errorMessage(e) !== 'validation' && toast.show({ title: 'Could not change password', message: errorMessage(e), tone: 'danger' }),
  });

  return (
    <Screen maxWidth={820}>
      <PageHeader title="Profile" subtitle="How you appear to your teammates" />
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Avatar name={profile?.full_name ?? ''} url={profile?.avatar_url} size={72} />
          <View style={{ flex: 1, gap: 4, minWidth: 180 }}>
            <Text style={type.h2}>{profile?.full_name}</Text>
            <Text style={type.small}>{user?.email}</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {memberships.map((m) => (
                <Badge key={m.org_id} label={`${m.organizations?.name} · ${ROLE_LABEL[m.role]}`} tone="primary" />
              ))}
            </View>
          </View>
          <Button title="Change photo" icon="photo-camera" variant="secondary" size="sm" onPress={() => avatar.mutate()} loading={avatar.isPending} disabled={!online} />
        </View>
      </Card>
      <Card style={{ gap: 14 }}>
        <SectionTitle title="Personal details" />
        <TextField label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" error={nameError} />
        <TextField label="Job title" value={jobTitle} onChangeText={setJobTitle} placeholder="Facilities Manager" />
        <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="+1 555 0100" />
        <TextField label="Email" value={user?.email ?? ''} editable={false} hint="Contact an administrator to change your sign-in email." />
        <Button title="Save profile" onPress={() => save.mutate()} loading={save.isPending} disabled={!online} style={{ alignSelf: 'flex-start' }} />
      </Card>
      <Card style={{ gap: 14 }}>
        <SectionTitle title="Change password" />
        <PasswordField label="New password" value={password} onChangeText={setPassword} autoComplete="new-password" error={pwErrors.password} />
        <PasswordField label="Confirm new password" value={confirm} onChangeText={setConfirm} autoComplete="new-password" error={pwErrors.confirm} />
        <Button title="Update password" variant="secondary" onPress={() => changePassword.mutate()} loading={changePassword.isPending} disabled={!online} style={{ alignSelf: 'flex-start' }} />
      </Card>
    </Screen>
  );
}
