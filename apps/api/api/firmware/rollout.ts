import { preflight } from '../../src/lib/http.js';
import { firmwareRollout } from '../../src/routes/index.js';

export const OPTIONS = preflight;
export const POST = firmwareRollout;
