import { preflight } from '../../src/lib/http.js';
import { simulationAutoRun } from '../../src/routes/index.js';

export const OPTIONS = preflight;
export const POST = simulationAutoRun;
