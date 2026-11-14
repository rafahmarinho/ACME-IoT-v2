import { router, usePathname } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlerts, useNotifications, useOnline } from '@/hooks/queries';
import { can, ROLE_LABEL, type Action } from '@/lib/permissions';
import { useAuth } from '@/providers/AuthProvider';
import { useOrg } from '@/providers/OrgProvider';
import { colors, font, radius, type } from '@/theme';
import type { OrgRole } from '@/types/db';
import { useIsWide } from '../ui/feedback';
import { Avatar, Icon, IconButton, type IconName } from '../ui/primitives';
import { Logo } from './Logo';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  section: 'Monitor' | 'Operate' | 'Manage';
  requires?: Action;
  match?: string[];
}

export const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: 'space-dashboard', section: 'Monitor' },
  { href: '/buildings', label: 'Buildings', icon: 'apartment', section: 'Monitor', match: ['/buildings', '/rooms'] },
  { href: '/devices', label: 'Devices', icon: 'developer-board', section: 'Monitor' },
  { href: '/alerts', label: 'Alerts', icon: 'notifications-active', section: 'Monitor' },
  { href: '/events', label: 'Events', icon: 'history', section: 'Monitor' },
  { href: '/automations', label: 'Automations', icon: 'auto-mode', section: 'Operate' },
  { href: '/firmware', label: 'Firmware', icon: 'system-update-alt', section: 'Operate', requires: 'firmware.view' },
  { href: '/simulation', label: 'Simulation', icon: 'science', section: 'Operate', requires: 'simulation.run' },
  { href: '/integrations', label: 'Integrations', icon: 'hub', section: 'Manage', requires: 'integration.manage' },
  { href: '/team', label: 'Team', icon: 'groups', section: 'Manage' },
  { href: '/settings', label: 'Settings', icon: 'settings', section: 'Manage' },
];

const MOBILE_TABS = ['/', '/buildings', '/devices', '/alerts'];

export function visibleNav(role: OrgRole | null) {
  return NAV.filter((n) => !n.requires || can(role, n.requires));
}

function isActive(item: NavItem, path: string) {
  if (item.href === '/') return path === '/' || path === '';
  return [item.href, ...(item.match ?? [])].some((m) => path === m || path.startsWith(`${m}/`));
}

function OrgSwitcher({ compact }: { compact?: boolean }) {
  const { org, memberships, switchOrg, role } = useOrg();
  const [open, setOpen] = useState(false);
  if (!org) return null;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.org, compact && styles.orgCompact]} accessibilityRole="button" accessibilityLabel={`Organization: ${org.name}. Switch organization`}>
        <View style={styles.orgMark}>
          <Text style={styles.orgMarkText}>{org.name.slice(0, 1)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.body, { fontFamily: font.semibold, fontSize: 14 }]} numberOfLines={1}>
            {org.name}
          </Text>
          {!compact ? <Text style={[type.small, { fontSize: 12 }]}>{role ? ROLE_LABEL[role] : ''}</Text> : null}
        </View>
        <Icon name="unfold-more" size={18} color={colors.textSubtle} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.orgMenu}>
            <Text style={[type.caption, { marginBottom: 8 }]}>Switch organization</Text>
            {memberships.map((m) => (
              <Pressable
                key={m.org_id}
                onPress={() => {
                  switchOrg(m.org_id);
                  setOpen(false);
                  router.replace('/');
                }}
                style={({ pressed }) => [styles.orgOption, (pressed || m.org_id === org.id) && { backgroundColor: colors.primarySoft }]}
                accessibilityRole="button"
              >
                <View style={styles.orgMark}>
                  <Text style={styles.orgMarkText}>{m.organizations?.name.slice(0, 1)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontFamily: font.semibold }]}>{m.organizations?.name}</Text>
                  <Text style={type.small}>
                    {ROLE_LABEL[m.role]} · {m.organizations?.industry}
                  </Text>
                </View>
                {m.org_id === org.id ? <Icon name="check" color={colors.primary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function OfflineBar() {
  const online = useOnline();
  if (online) return null;
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <Icon name="cloud-off" size={16} color="#fff" />
      <Text style={styles.offlineText}>Offline — showing last synced data. Device controls are paused.</Text>
    </View>
  );
}

function useBadges() {
  const alerts = useAlerts();
  const notifications = useNotifications();
  return {
    alerts: (alerts.data ?? []).filter((a) => a.status === 'open').length,
    unread: (notifications.data ?? []).filter((n) => !n.read_at).length,
  };
}

function Sidebar() {
  const path = usePathname();
  const { role, profile } = useOrg();
  const { user } = useAuth();
  const badges = useBadges();
  const items = visibleNav(role);
  const sections = ['Monitor', 'Operate', 'Manage'] as const;
  return (
    <View style={styles.sidebar}>
      <View style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
        <Logo />
      </View>
      <OrgSwitcher />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 2, paddingBottom: 12 }}>
        {sections.map((s) => {
          const list = items.filter((i) => i.section === s);
          if (!list.length) return null;
          return (
            <View key={s} style={{ marginTop: 14 }}>
              <Text style={[type.caption, { paddingHorizontal: 12, marginBottom: 6 }]}>{s}</Text>
              {list.map((item) => {
                const active = isActive(item, path);
                const badge = item.href === '/alerts' ? badges.alerts : 0;
                return (
                  <Pressable
                    key={item.href}
                    onPress={() => router.navigate(item.href as any)}
                    accessibilityRole="link"
                    accessibilityState={{ selected: active }}
                    style={({ hovered }: any) => [styles.navItem, hovered && { backgroundColor: colors.surfaceAlt }, active && styles.navItemActive]}
                  >
                    <Icon name={item.icon} size={20} color={active ? colors.primary : colors.textMuted} />
                    <Text style={[styles.navLabel, active && { color: colors.primary, fontFamily: font.semibold }]}>{item.label}</Text>
                    {badge ? (
                      <View style={styles.navBadge}>
                        <Text style={styles.navBadgeText}>{badge}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
      <Pressable onPress={() => router.navigate('/profile')} style={({ hovered }: any) => [styles.me, hovered && { backgroundColor: colors.surfaceAlt }]} accessibilityRole="link" accessibilityLabel="Your profile">
        <Avatar name={profile?.full_name ?? user?.email ?? ''} url={profile?.avatar_url} size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.body, { fontFamily: font.semibold, fontSize: 13.5 }]} numberOfLines={1}>
            {profile?.full_name || 'Your profile'}
          </Text>
          <Text style={[type.small, { fontSize: 12 }]} numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function TopBar({ wide }: { wide: boolean }) {
  const insets = useSafeAreaInsets();
  const badges = useBadges();
  return (
    <View style={[styles.topBar, { paddingTop: wide ? 12 : insets.top + 6 }]}>
      {wide ? <View style={{ flex: 1 }} /> : (
        <>
          <Logo compact />
          <View style={{ flex: 1, maxWidth: 220 }}>
            <OrgSwitcher compact />
          </View>
          <View style={{ flex: 1 }} />
        </>
      )}
      <IconButton icon="search" label="Search devices" onPress={() => router.navigate('/devices')} />
      <IconButton icon="notifications-none" label="Notifications" badge={badges.unread} onPress={() => router.navigate('/notifications')} />
    </View>
  );
}

function BottomTabs() {
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const badges = useBadges();
  const tabs = NAV.filter((n) => MOBILE_TABS.includes(n.href));
  const moreActive = !tabs.some((t) => isActive(t, path));
  return (
    <View style={[styles.tabs, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map((t) => {
        const active = isActive(t, path);
        const badge = t.href === '/alerts' ? badges.alerts : 0;
        return (
          <Pressable key={t.href} onPress={() => router.navigate(t.href as any)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={t.label}>
            <View>
              <Icon name={t.icon} size={24} color={active ? colors.primary : colors.textSubtle} />
              {badge ? (
                <View style={[styles.navBadge, styles.tabBadge]}>
                  <Text style={styles.navBadgeText}>{badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.tabLabel, active && { color: colors.primary }]}>{t.label}</Text>
          </Pressable>
        );
      })}
      <Pressable onPress={() => router.navigate('/more')} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: moreActive }} accessibilityLabel="More">
        <Icon name="menu" size={24} color={moreActive ? colors.primary : colors.textSubtle} />
        <Text style={[styles.tabLabel, moreActive && { color: colors.primary }]}>More</Text>
      </Pressable>
    </View>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const wide = useIsWide();
  if (wide) {
    return (
      <View style={styles.root}>
        <Sidebar />
        <View style={{ flex: 1 }}>
          <OfflineBar />
          <TopBar wide />
          <View style={{ flex: 1 }}>{children}</View>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.root, { flexDirection: 'column' }]}>
      <TopBar wide={false} />
      <OfflineBar />
      <View style={{ flex: 1 }}>{children}</View>
      <BottomTabs />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
  sidebar: { width: 248, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border, padding: 12, gap: 8 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 40, paddingHorizontal: 12, borderRadius: radius.md, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}) },
  navItemActive: { backgroundColor: colors.primarySoft },
  navLabel: { flex: 1, fontFamily: font.medium, fontSize: 14, color: colors.textMuted },
  navBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  navBadgeText: { color: '#fff', fontFamily: font.bold, fontSize: 11 },
  tabBadge: { position: 'absolute', top: -4, right: -12, minWidth: 18, height: 18, borderWidth: 2, borderColor: colors.surface },
  org: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  orgCompact: { paddingVertical: 6, paddingHorizontal: 8, borderWidth: 0, backgroundColor: colors.surfaceAlt },
  orgMark: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  orgMarkText: { color: '#fff', fontFamily: font.bold, fontSize: 14 },
  orgMenu: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 14, gap: 4 },
  orgOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md, minHeight: 56 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 16 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md, borderTopWidth: 1, borderTopColor: colors.border },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingBottom: 6, backgroundColor: colors.bg },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 50, justifyContent: 'center' },
  tabLabel: { fontFamily: font.medium, fontSize: 11, color: colors.textSubtle },
  offline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#334155', paddingVertical: 8, paddingHorizontal: 12 },
  offlineText: { color: '#fff', fontFamily: font.medium, fontSize: 13, flexShrink: 1 },
});
