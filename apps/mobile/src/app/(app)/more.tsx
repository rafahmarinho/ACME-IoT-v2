import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { visibleNav } from '@/components/navigation/AppShell';
import { PageHeader, Screen } from '@/components/ui/feedback';
import { Avatar, Card, Divider, Icon, ListItem } from '@/components/ui/primitives';
import { ROLE_LABEL } from '@/lib/permissions';
import { useAuth } from '@/providers/AuthProvider';
import { useOrg } from '@/providers/OrgProvider';
import { colors, type } from '@/theme';

const TABS = ['/', '/buildings', '/devices', '/alerts'];

export default function More() {
  const { role, profile, org } = useOrg();
  const { user, signOut } = useAuth();
  const items = visibleNav(role).filter((n) => !TABS.includes(n.href));
  return (
    <Screen maxWidth={720}>
      <PageHeader title="More" />
      <Card onPress={() => router.push('/profile')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={profile?.full_name ?? ''} url={profile?.avatar_url} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={type.h3}>{profile?.full_name}</Text>
          <Text style={type.small}>{user?.email} · {role ? ROLE_LABEL[role] : ''} at {org?.name}</Text>
        </View>
        <Icon name="chevron-right" color={colors.textSubtle} />
      </Card>
      <Card padded={false} style={{ paddingVertical: 4 }}>
        {items.map((n, i) => (
          <View key={n.href}>
            {i ? <Divider style={{ marginLeft: 56 }} /> : null}
            <ListItem title={n.label} left={<Icon name={n.icon} size={22} color={colors.primary} />} onPress={() => router.push(n.href as any)} chevron />
          </View>
        ))}
        <Divider style={{ marginLeft: 56 }} />
        <ListItem title="Notifications" left={<Icon name="notifications-none" size={22} color={colors.primary} />} onPress={() => router.push('/notifications')} chevron />
        <Divider style={{ marginLeft: 56 }} />
        <ListItem title="Sign out" left={<Icon name="logout" size={22} color={colors.danger} />} onPress={signOut} />
      </Card>
    </Screen>
  );
}
