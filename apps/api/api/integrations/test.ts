import { preflight } from '../../src/lib/http.js';
import { integrationTest } from '../../src/routes/index.js';

export const OPTIONS = preflight;
export const POST = integrationTest;
