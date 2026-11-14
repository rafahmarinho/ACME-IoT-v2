import { preflight } from '../../src/lib/http.js';
import { firmwareRollback } from '../../src/routes/index.js';

export const OPTIONS = preflight;
export const POST = firmwareRollback;
