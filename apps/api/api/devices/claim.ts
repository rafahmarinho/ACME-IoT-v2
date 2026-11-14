import { preflight } from '../../src/lib/http.js';
import { deviceClaim } from '../../src/routes/index.js';

export const OPTIONS = preflight;
export const POST = deviceClaim;
