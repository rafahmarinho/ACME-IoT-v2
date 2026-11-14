import { ZodError, type ZodType } from 'zod';
import { authenticate, type AuthContext } from './auth.js';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'error') {
    super(message);
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim());
  const allowOrigin = allowed.includes('*') ? '*' : origin && allowed.includes(origin) ? origin : allowed[0] ?? '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

type Handler<T> = (ctx: { body: T; auth: AuthContext; request: Request }) => Promise<unknown>;

/** Wraps a JSON POST handler with auth, validation and consistent error responses. */
export function route<T>(schema: ZodType<T>, handler: Handler<T>) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    try {
      const auth = await authenticate(request);
      let raw: unknown = {};
      const text = await request.text();
      if (text) {
        try {
          raw = JSON.parse(text);
        } catch {
          throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
        }
      }
      const body = schema.parse(raw);
      const result = await handler({ body, auth, request });
      return json(result ?? { ok: true }, 200, origin);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status, origin);
      if (err instanceof ZodError) {
        const issue = err.issues[0];
        return json({ error: `${issue?.path.join('.') || 'body'}: ${issue?.message}`, code: 'validation_error' }, 422, origin);
      }
      console.error('[api] unhandled error', err);
      return json({ error: 'Something went wrong on our side. Please try again.', code: 'internal_error' }, 500, origin);
    }
  };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
