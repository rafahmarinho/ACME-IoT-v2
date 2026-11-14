import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setTemperatureUnit } from '@/lib/format';
import { can, type Action } from '@/lib/permissions';
import { accountService } from '@/services/db';
import type { Membership, Organization, OrgRole, Profile, UserSettings } from '@/types/db';
import { useAuth } from './AuthProvider';

interface OrgState {
  memberships: Membership[];
  org: Organization | null;
  role: OrgRole | null;
  profile: Profile | null;
  settings: UserSettings | null;
  loading: boolean;
  error: unknown;
  switchOrg: (orgId: string) => void;
  can: (action: Action) => boolean;
  refetch: () => void;
}

const OrgContext = createContext<OrgState | null>(null);
const KEY = 'acme-iot-current-org';

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => v && setSelected(v));
  }, []);

  const memberships = useQuery({
    queryKey: ['memberships', user?.id],
    queryFn: () => accountService.memberships(user!.id),
    enabled: !!user,
  });
  const profile = useQuery({ queryKey: ['profile', user?.id], queryFn: () => accountService.profile(user!.id), enabled: !!user });
  const settings = useQuery({ queryKey: ['settings', user?.id], queryFn: () => accountService.settings(user!.id), enabled: !!user });

  useEffect(() => {
    if (settings.data) setTemperatureUnit(settings.data.temperature_unit);
  }, [settings.data]);

  const list = memberships.data ?? [];
  const current =
    list.find((m) => m.org_id === selected) ?? list.find((m) => m.org_id === settings.data?.default_org_id) ?? list[0] ?? null;

  const switchOrg = useCallback(
    (orgId: string) => {
      setSelected(orgId);
      AsyncStorage.setItem(KEY, orgId);
      if (user) accountService.updateSettings(user.id, { default_org_id: orgId }).catch(() => undefined);
      qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === orgId });
    },
    [qc, user],
  );

  const value = useMemo<OrgState>(
    () => ({
      memberships: list,
      org: current?.organizations ?? null,
      role: current?.role ?? null,
      profile: profile.data ?? null,
      settings: settings.data ?? null,
      loading: memberships.isLoading,
      error: memberships.error,
      switchOrg,
      can: (action) => can(current?.role, action),
      refetch: () => {
        memberships.refetch();
        profile.refetch();
        settings.refetch();
      },
    }),
    [list, current, profile.data, settings.data, memberships, profile, settings, switchOrg],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used inside OrgProvider');
  return ctx;
}

/** Current org id; screens under (app) only render once it is known. */
export function useOrgId() {
  return useOrg().org?.id ?? '';
}
