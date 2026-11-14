import { preflight } from '../../src/lib/http.js';
import { simulationScenario } from '../../src/routes/index.js';

export const OPTIONS = preflight;
export const POST = simulationScenario;
