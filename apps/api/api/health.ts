import { json } from '../src/lib/http.js';

export function GET() {
  return json({ ok: true, service: 'acme-iot-api', time: new Date().toISOString() });
}
