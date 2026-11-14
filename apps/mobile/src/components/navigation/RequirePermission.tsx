import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { EmptyState, Screen } from '../ui/feedback';
import { Button } from '../ui/primitives';
import type { Action } from '@/lib/permissions';
import { useOrg } from '@/providers/OrgProvider';

/** Guards a screen that the current role is not allowed to open (deep links, shared URLs). */
export function RequirePermission({ action, children }: { action: Action; children: ReactNode }) {
  const { can } = useOrg();
  if (can(action)) return <>{children}</>;
  return (
    <Screen>
      <EmptyState
        icon="lock-outline"
        title="You don't have access to this page"
        message="Your role in this organization doesn't include this area. Ask an administrator if you need access."
        action={<Button title="Go to dashboard" variant="secondary" onPress={() => router.replace('/')} />}
      />
    </Screen>
  );
}
