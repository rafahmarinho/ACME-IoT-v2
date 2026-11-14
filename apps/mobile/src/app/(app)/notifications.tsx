import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { EmptyState, ErrorState, PageHeader, Screen, SkeletonCards } from '@/components/ui/feedback';
import { Button, Card, Divider, Icon } from '@/components/ui/primitives';
import { SEVERITY_ICON } from '@/components/ui/widgets';
import { useNotifications, useOnline } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';
import { useOrg } from '@/providers/OrgProvider';
import { useToast } from '@/providers/ToastProvider';
import { notificationService } from '@/services/db';
import { colors, font, type } from '@/theme';
import type { AppNotification } from '@/types/db';

export default function Notifications() {
  const { user } = useAuth();
  const { memberships, org, switchOrg } = useOrg();
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const notifications = useNotifications();
  const list = notifications.data ?? [];
  const unread = list.filter((n) => !n.read_at);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications', user?.id] });

  const markRead = useMutation({ mutationFn: (ids: string[]) => notificationService.markRead(ids), onSuccess: invalidate, onError: (e) => toast.show({ title: 'Could not update', message: errorMessage(e), tone: 'danger' }) });
  const clear = useMutation({ mutationFn: () => notificationService.clear(user!.id), onSuccess: invalidate, onError: (e) => toast.show({ title: 'Could not clear', message: errorMessage(e), tone: 'danger' }) });

  const open = (n: AppNotification) => {
    if (!n.read_at && online) markRead.mutate([n.id]);
    if (n.org_id !== org?.id) switchOrg(n.org_id);
    if (n.link) router.push(n.link as any);
  };

  return (
    <Screen onRefresh={() => notifications.refetch()} refreshing={notifications.isRefetching} maxWidth={820}>
      <PageHeader
        title="Notifications"
        subtitle={`${unread.length} unread`}
        actions={
          <>
            <Button title="Mark all read" size="sm" variant="secondary" onPress={() => markRead.mutate(unread.map((n) => n.id))} disabled={!unread.length || !online} />
            <Button title="Clear all" size="sm" variant="ghost" onPress={() => clear.mutate()} disabled={!list.length || !online} />
          </>
        }
      />
      {notifications.error && !notifications.data ? <ErrorState error={notifications.error} onRetry={() => notifications.refetch()} /> : null}
      {notifications.isLoading && !notifications.data ? <SkeletonCards count={2} height={80} /> : null}
      {notifications.data && !list.length ? <EmptyState icon="notifications-none" title="No notifications" message="Alerts and automation results will appear here." /> : null}
      {list.length ? (
        <Card padded={false}>
          {list.map((n, i) => {
            const color = n.severity === 'critical' ? colors.danger : n.severity === 'warning' ? colors.warning : colors.primary;
            return (
              <View key={n.id}>
                {i ? <Divider /> : null}
                <Pressable onPress={() => open(n)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', gap: 12, padding: 16, backgroundColor: pressed ? colors.surfaceAlt : n.read_at ? colors.surface : '#FAFAFF' })}>
                  <Icon name={SEVERITY_ICON[n.severity]} size={22} color={color} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.body, { fontFamily: n.read_at ? font.regular : font.semibold, fontSize: 14.5 }]}>{n.title}</Text>
                    <Text style={type.small}>{n.body}</Text>
                    <Text style={[type.small, { fontSize: 12 }]}>
                      {memberships.find((m) => m.org_id === n.org_id)?.organizations?.name} · {timeAgo(n.created_at)}
                    </Text>
                  </View>
                  {!n.read_at ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 }} /> : null}
                </Pressable>
              </View>
            );
          })}
        </Card>
      ) : null}
    </Screen>
  );
}
