import { preflight } from '../../src/lib/http.js';
import { teamInvite } from '../../src/routes/index.js';

export const OPTIONS = preflight;
export const POST = teamInvite;
