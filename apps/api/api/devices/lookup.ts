import { preflight } from '../../src/lib/http.js';
import { deviceLookup } from '../../src/routes/index.js';

export const OPTIONS = preflight;
export const POST = deviceLookup;
