import { preflight } from '../../src/lib/http.js';
import { deviceCommand } from '../../src/routes/index.js';

export const OPTIONS = preflight;
export const POST = deviceCommand;
