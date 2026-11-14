import { preflight } from '../../src/lib/http.js';
import { deviceSimulate } from '../../src/routes/index.js';

export const OPTIONS = preflight;
export const POST = deviceSimulate;
