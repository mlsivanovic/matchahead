import type { Fixture } from '../../../../packages/domain/src/types.ts';

import { buildUserAgenda, type AgendaEntry } from './agenda.ts';
import type { LastGoodSchedule } from './schedule-store.ts';

/**
 * Faza 05: jedan jedinstveni skup proverenih utakmica iz svih validnih
 * klupskih snimaka. Više snimaka ne pravi odvojene kopije derbija: isti
 * stabilni id postoji tačno jednom, sa najvišom konzistentnom revizijom.
 * Opoziv je izvor prava — svaki odgovor čija pokrivenost kaže da izvor
 * više nije dozvoljen isključuje njegove utakmice iz cele agende, pa stare
 * poverene kopije ne cure posle revokacije.
 */

export function revokedPairKey(provider: string, competitionId: string): string {
  return `${provider}␟${competitionId}`;
}

/**
 * Parovi izvor+takmičenje koji su igde označeni kao dozvoljeni.
 * Opoziv je prelaz: par koji je bio allowed pa to više nije.
 */
export function allowedProviderKeys(snapshots: readonly LastGoodSchedule[]): Set<string> {
  const allowed = new Set<string>();
  for (const snapshot of snapshots) {
    for (const row of snapshot.response.result.coverage) {
      if (row.publication === 'allowed') {
        allowed.add(revokedPairKey(row.provider, row.competitionId));
      }
    }
  }
  return allowed;
}

/**
 * Opozivi iz datih redova pokrivenosti uz poznate dozvoljene parove.
 * Izričito uskraćena prava (forbidden/restricted) opozivaju uvek; `unknown`
 * opoziva samo par koji je prethodno bio allowed (allowed→unknown). Red koji
 * par ne pominje nije opoziv; par koji nikad nije bio allowed takođe nije.
 */
export function revokedKeysFromCoverage(
  rows: readonly { provider: string; competitionId: string; publication: string }[],
  allowed: ReadonlySet<string>,
): Set<string> {
  const revoked = new Set<string>();
  for (const row of rows) {
    const key = revokedPairKey(row.provider, row.competitionId);
    if (row.publication === 'forbidden' || row.publication === 'restricted') {
      revoked.add(key);
    } else if (row.publication !== 'allowed' && allowed.has(key)) {
      revoked.add(key);
    }
  }
  return revoked;
}

/**
 * Unija svih opoziva iz svih snimaka. Izričito uskraćena prava
 * (forbidden/restricted) opozivaju uvek; `unknown` opoziva samo par koji je
 * prethodno bio allowed (allowed→unknown). Par koji nigde nije pomenut ili
 * nikad nije bio allowed nije opoziv i ne briše poslednji prikaz.
 */
export function revokedProviderKeys(snapshots: readonly LastGoodSchedule[]): Set<string> {
  const rows = snapshots.flatMap((snapshot) => snapshot.response.result.coverage);
  return revokedKeysFromCoverage(rows, allowedProviderKeys(snapshots));
}

/**
 * Pobednik za isti stabilni id ili null kod konflikta. Ista revizija sa
 * različitim sadržajem (contentHash) je nedoslednost: takva utakmica se ne
 * objavljuje proizvoljnim izborom, već se odbacuje. Inače pobeđuje najviša
 * konzistentna revizija; među identičnim kopijama odlučuje svežiji fetchedAt.
 * Redosled snimaka ne utiče na ishod.
 */
export function unifyFixtureCopies(copies: readonly Fixture[]): Fixture | null {
  if (copies.length === 0) return null;
  const hashesByRevision = new Map<number, Set<string>>();
  for (const copy of copies) {
    let hashes = hashesByRevision.get(copy.revision);
    if (!hashes) {
      hashes = new Set<string>();
      hashesByRevision.set(copy.revision, hashes);
    }
    hashes.add(copy.contentHash);
  }
  for (const hashes of hashesByRevision.values()) {
    if (hashes.size > 1) return null;
  }
  let best = copies[0]!;
  for (const copy of copies.slice(1)) {
    if (copy.revision !== best.revision) {
      if (copy.revision > best.revision) best = copy;
    } else if (copy.fetchedAt !== best.fetchedAt) {
      if (copy.fetchedAt > best.fetchedAt) best = copy;
    }
  }
  return best;
}

/**
 * Unificirane proverene utakmice: samo verified-schedule snimci čiji je i
 * odgovor proveren, bez opozvanih izvora, deduplikovano po stabilnom id-u.
 * Konfliktne kopije (ista revizija, različit sadržaj) se ne objavljuju.
 */
export function unifiedVerifiedFixtures(snapshots: readonly LastGoodSchedule[]): Fixture[] {
  const revoked = revokedProviderKeys(snapshots);
  const groups = new Map<string, Fixture[]>();
  for (const snapshot of snapshots) {
    if (snapshot.kind !== 'verified-schedule') continue;
    if (snapshot.response.kind !== 'verified-schedule') continue;
    for (const fixture of snapshot.response.result.futureFixtures) {
      if (revoked.has(revokedPairKey(fixture.provider, fixture.competitionId))) continue;
      const group = groups.get(fixture.id);
      if (group) group.push(fixture);
      else groups.set(fixture.id, [fixture]);
    }
  }
  const unified: Fixture[] = [];
  for (const copies of groups.values()) {
    const winner = unifyFixtureCopies(copies);
    if (winner) unified.push(winner);
  }
  return unified;
}

/** Stvarna glavna agenda: unija praćenih klubova i ručnih izbora nad unificiranim skupom. */
export function buildUnifiedServerAgenda(
  snapshots: readonly LastGoodSchedule[],
  followedTeamIds: readonly string[],
  manualFixtureIds: readonly string[],
): AgendaEntry[] {
  return buildUserAgenda(unifiedVerifiedFixtures(snapshots), followedTeamIds, manualFixtureIds);
}

/** Poslednja uspešna provera unificirane agende: najsvežiji checkedAt proverenih snimaka. */
export function unifiedServerProvenance(snapshots: readonly LastGoodSchedule[]): string | null {
  let best: string | null = null;
  for (const snapshot of snapshots) {
    if (snapshot.kind !== 'verified-schedule') continue;
    if (snapshot.response.kind !== 'verified-schedule') continue;
    const checkedAt = snapshot.checkedAt;
    if (checkedAt !== null && (best === null || checkedAt > best)) best = checkedAt;
  }
  return best;
}

/** Imenici za prikaz unificirane agende, iz proverenih snimaka. */
export function unifiedServerTeams(snapshots: readonly LastGoodSchedule[]): Array<{ id: string; name: string }> {
  const byId = new Map<string, string>();
  for (const snapshot of snapshots) {
    if (snapshot.kind !== 'verified-schedule') continue;
    for (const team of snapshot.response.teams) {
      if (!byId.has(team.id)) byId.set(team.id, team.name);
    }
  }
  return [...byId.entries()].map(([id, name]) => ({ id, name }));
}

export function unifiedServerCompetitions(
  snapshots: readonly LastGoodSchedule[],
): Array<{ id: string; name: string }> {
  const byId = new Map<string, string>();
  for (const snapshot of snapshots) {
    if (snapshot.kind !== 'verified-schedule') continue;
    for (const competition of snapshot.response.competitions) {
      if (!byId.has(competition.id)) byId.set(competition.id, competition.name);
    }
  }
  return [...byId.entries()].map(([id, name]) => ({ id, name }));
}
