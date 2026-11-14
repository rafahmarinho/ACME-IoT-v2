import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import { useOrg } from './OrgProvider';
import { useToast } from './ToastProvider';

const TABLE_KEYS: Record<string, string[]> = {
  devices: ['devices', 'readings', 'room-readings'],
  alerts: ['alerts'],
  events: ['events'],
  firmware_jobs: ['firmware-jobs', 'devices'],
  commands: ['commands'],
  simulation_state: ['simulation'],
  automation_runs: ['automation-runs', 'automations'],
};

/**
 * Subscribes to Supabase Realtime for the current org and invalidates the
 * matching queries. The channel is closed while the app is in the background
 * or offline, and re-opened (with a refetch) when it comes back.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { org } = useOrg();
  const toast = useToast();
  const [active, setActive] = useState(AppState.currentState === 'active' || Platform.OS === 'web');
  const [online, setOnline] = useState(onlineManager.isOnline());
  const pending = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active' || Platform.OS === 'web'));
    const unsub = onlineManager.subscribe((o) => setOnline(o));
    return () => {
      sub.remove();
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!org || !user || !active || !online) return;
    const orgId = org.id;

    const flush = () => {
      for (const key of pending.current) qc.invalidateQueries({ queryKey: [key, orgId] });
      pending.current.clear();
    };
    const schedule = (keys: string[]) => {
      keys.forEach((k) => pending.current.add(k));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 350);
    };

    let channel = supabase.channel(`org:${orgId}`);
    for (const table of Object.keys(TABLE_KEYS)) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `org_id=eq.${orgId}` }, () =>
        schedule(TABLE_KEYS[table]),
      );
    }
    channel = channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
      (payload) => {
        qc.invalidateQueries({ queryKey: ['notifications', user.id] });
        const n = payload.new as { title: string; body: string; severity: string; org_id: string };
        if (n.org_id === orgId) toast.show({ title: n.title, message: n.body, tone: n.severity === 'critical' ? 'danger' : n.severity === 'warning' ? 'warning' : 'info' });
      },
    );
    channel.subscribe();

    // Catch up on anything missed while paused.
    qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === orgId });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [org?.id, user?.id, active, online]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}
