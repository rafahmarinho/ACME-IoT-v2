import { preflight } from '../../src/lib/http.js';
import { simulationTick } from '../../src/routes/index.js';

export const OPTIONS = preflight;
export const POST = simulationTick;
