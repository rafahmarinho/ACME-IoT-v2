import { onlineManager } from '@tanstack/react-query';
import { supabase } from './supabase';

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
  }
}

/** Calls the ACME IoT API (Vercel) with the current user's access token. */
export async function api<T = any>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!onlineManager.isOnline()) {
    throw new ApiError('You are offline. Reconnect to control devices.', 0, 'offline');
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError('Your session has expired. Please sign in again.', 401, 'unauthenticated');

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Could not reach the ACME IoT service. Check your connection and try again.', 0, 'network_error');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? `Request failed (${res.status})`, res.status, json.code ?? 'error');
  return json as T;
}

export function errorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'message' in err) return String((err as any).message);
  return String(err);
}
