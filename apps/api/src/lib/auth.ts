import { HttpError } from './http.js';
import { admin } from './supabase.js';

export type OrgRole = 'owner' | 'admin' | 'operator' | 'viewer';

export interface AuthContext {
  userId: string;
  email: string;
  /** Resolves the caller's role in an org and enforces the allowed set. */
  requireRole: (orgId: string, allowed: OrgRole[]) => Promise<OrgRole>;
}

export const CAN_CONTROL: OrgRole[] = ['owner', 'admin', 'operator'];
export const CAN_MANAGE: OrgRole[] = ['owner', 'admin'];

export async function authenticate(request: Request): Promise<AuthContext> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Sign in to continue.', 'unauthenticated');

  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Please sign in again.', 'unauthenticated');
  const user = data.user;

  return {
    userId: user.id,
    email: user.email ?? '',
    async requireRole(orgId, allowed) {
      const { data: m } = await admin()
        .from('memberships')
        .select('role')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!m) throw new HttpError(403, 'You are not a member of this organization.', 'forbidden');
      const role = m.role as OrgRole;
      if (!allowed.includes(role)) {
        throw new HttpError(403, `Your role (${role}) does not allow this action.`, 'forbidden');
      }
      return role;
    },
  };
}
