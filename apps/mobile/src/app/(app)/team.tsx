import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ConfirmDialog, EmptyState, FormSheet, PageHeader, Screen, SkeletonCards } from '@/components/ui/feedback';
import { SearchBar, Select, TextField } from '@/components/ui/forms';
import { Avatar, Badge, Button, Card, Divider, SectionTitle } from '@/components/ui/primitives';
import { useInvitations, useOnline, useTeam } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/permissions';
import { useAuth } from '@/providers/AuthProvider';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { teamService } from '@/services/db';
import { teamApi } from '@/services/device-api';
import { type } from '@/theme';
import type { OrgRole } from '@/types/db';

const ROLE_TONE = { owner: 'primary', admin: 'info', operator: 'success', viewer: 'neutral' } as const;

export default function Team() {
  const { org, can, role: myRole } = useOrg();
  const { user } = useAuth();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const manage = can('team.manage');
  const team = useTeam();
  const invitations = useInvitations(manage);
  const [q, setQ] = useState('');
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('viewer');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ user_id: string; name: string } | null>(null);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['team', org?.id] });
    qc.invalidateQueries({ queryKey: ['invitations', org?.id] });
  };

  const invite = useMutation({
    mutationFn: () => {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
        setEmailError('Enter a valid email address.');
        throw new Error('validation');
      }
      return teamApi.invite(org!.id, email.trim(), role);
    },
    onSuccess: (r) => {
      invalidate();
      toast.show({ title: r.status === 'added' ? 'Member added' : 'Invitation sent', message: r.message, tone: 'success' });
      setInviting(false);
      setEmail('');
    },
    onError: (e) => errorMessage(e) !== 'validation' && toast.show({ title: 'Could not invite', message: errorMessage(e), tone: 'danger' }),
  });
  const setMemberRole = useMutation({
    mutationFn: ({ userId, role: r }: { userId: string; role: OrgRole }) => teamService.setRole(org!.id, userId, r),
    onSuccess: () => {
      invalidate();
      toast.show({ title: 'Role updated', tone: 'success' });
    },
    onError: (e) => toast.show({ title: 'Could not change role', message: errorMessage(e), tone: 'danger' }),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => teamService.remove(org!.id, userId),
    onSuccess: () => {
      invalidate();
      setRemoving(null);
      toast.show({ title: 'Member removed', tone: 'success' });
    },
    onError: (e) => toast.show({ title: 'Could not remove member', message: errorMessage(e), tone: 'danger' }),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => teamService.revokeInvitation(id),
    onSuccess: invalidate,
    onError: (e) => toast.show({ title: 'Could not revoke', message: errorMessage(e), tone: 'danger' }),
  });

  const roles: OrgRole[] = myRole === 'owner' ? ['owner', 'admin', 'operator', 'viewer'] : ['admin', 'operator', 'viewer'];
  const members = (team.data ?? []).filter((m) => `${m.profiles?.full_name} ${m.profiles?.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Screen onRefresh={() => team.refetch()} refreshing={team.isRefetching}>
      <PageHeader title="Team" subtitle={`${team.data?.length ?? 0} members in ${org?.name}`} actions={manage ? <Button title="Invite" icon="person-add" size="sm" onPress={() => setInviting(true)} disabled={!online} /> : null} />
      <SearchBar value={q} onChangeText={setQ} placeholder="Search people" />
      {team.isLoading && !team.data ? <SkeletonCards count={2} /> : null}
      <Card>
        {members.map((m, i) => {
          const isMe = m.user_id === user?.id;
          const editable = manage && online && !isMe && (m.role !== 'owner' || myRole === 'owner');
          return (
            <View key={m.user_id}>
              {i ? <Divider /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, flexWrap: 'wrap' }}>
                <Avatar name={m.profiles?.full_name ?? '?'} url={m.profiles?.avatar_url} size={40} />
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={type.h3}>{m.profiles?.full_name || m.profiles?.email}{isMe ? ' (you)' : ''}</Text>
                  <Text style={type.small}>{m.profiles?.email}{m.profiles?.job_title ? ` · ${m.profiles.job_title}` : ''}</Text>
                </View>
                {editable ? (
                  <View style={{ width: 170 }}>
                    <Select value={m.role} onChange={(r) => setMemberRole.mutate({ userId: m.user_id, role: r as OrgRole })} options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r], description: ROLE_DESCRIPTION[r] }))} />
                  </View>
                ) : (
                  <Badge label={ROLE_LABEL[m.role]} tone={ROLE_TONE[m.role]} />
                )}
                {editable ? <Button title="Remove" size="sm" variant="ghost" onPress={() => setRemoving({ user_id: m.user_id, name: m.profiles?.full_name ?? '' })} /> : null}
              </View>
            </View>
          );
        })}
        {team.data && !members.length ? <Text style={type.small}>No one matches “{q}”.</Text> : null}
      </Card>
      {manage ? (
        <Card>
          <SectionTitle title="Pending invitations" />
          {(invitations.data ?? []).map((inv, i) => (
            <View key={inv.id}>
              {i ? <Divider /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>{inv.email}</Text>
                  <Text style={type.small}>{ROLE_LABEL[inv.role]} · invited {timeAgo(inv.created_at)}</Text>
                </View>
                <Button title="Revoke" size="sm" variant="ghost" onPress={() => revoke.mutate(inv.id)} disabled={!online} />
              </View>
            </View>
          ))}
          {invitations.data && !invitations.data.length ? <EmptyState icon="mark-email-read" title="No pending invitations" /> : null}
        </Card>
      ) : null}
      <Card>
        <SectionTitle title="Roles" />
        {(['owner', 'admin', 'operator', 'viewer'] as OrgRole[]).map((r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 12, paddingVertical: 8, alignItems: 'center' }}>
            <View style={{ width: 120 }}><Badge label={ROLE_LABEL[r]} tone={ROLE_TONE[r]} /></View>
            <Text style={[type.small, { flex: 1 }]}>{ROLE_DESCRIPTION[r]}</Text>
          </View>
        ))}
      </Card>
      <FormSheet visible={inviting} title="Invite a teammate" onClose={() => setInviting(false)}>
        <TextField label="Email" icon="mail-outline" value={email} onChangeText={(v) => (setEmail(v), setEmailError(null))} autoCapitalize="none" keyboardType="email-address" error={emailError} />
        <Select label="Role" value={role} onChange={(v) => setRole(v as OrgRole)} options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r], description: ROLE_DESCRIPTION[r] }))} />
        <Text style={type.small}>Email delivery is simulated. The invitee joins automatically when they sign up with this address.</Text>
        <Button title="Send invitation" size="lg" onPress={() => invite.mutate()} loading={invite.isPending} />
      </FormSheet>
      <ConfirmDialog visible={!!removing} title="Remove member?" message={`${removing?.name} will lose access to ${org?.name}.`} confirmLabel="Remove" destructive loading={remove.isPending} onCancel={() => setRemoving(null)} onConfirm={() => removing && remove.mutate(removing.user_id)} />
    </Screen>
  );
}
