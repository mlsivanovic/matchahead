import assert from 'node:assert/strict';
import test from 'node:test';

import { settleUidAfterAccountEnd } from '../src/logic/use-account.ts';

/**
 * Pinovanje pravila (samo novi kod): obe finally grane use-account.ts
 * (odjava i brisanje naloga) delegiraju čišćenje lastUid-a tačno na ovu
 * funkciju — veza je grep-proverljiva na mestima poziva. Kraj starog
 * postupka čisti samo svog vlasnika; uid novije prijave ostaje.
 * Ovo nije fail-first test: na starom kodu simbol ne postoji jer je
 * čišćenje bilo bezuslovno `lastUid.current = null`.
 */
test('settleUidAfterAccountEnd čuva uid novijeg vlasnika', () => {
  assert.equal(settleUidAfterAccountEnd('ana', 'ana'), null);
  assert.equal(settleUidAfterAccountEnd('boris', 'ana'), 'boris');
  assert.equal(settleUidAfterAccountEnd(null, 'ana'), null);
});
