/**
 * Re-export @kamiyo/meishi as a namespace to avoid naming collisions
 * with existing SDK types (e.g. VerificationResult from ./shield).
 *
 * Usage:
 *   import { meishi } from '@kamiyo/sdk';
 *   const client = new meishi.MeishiClient(config);
 */
import * as meishi from '@kamiyo/meishi';
export { meishi };
