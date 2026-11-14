import { preflight } from '../../src/lib/http.js';
import { simulationReset } from '../../src/routes/index.js';

export const OPTIONS = preflight;
export const POST = simulationReset;
