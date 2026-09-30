import type { UserProfileRecord } from '../../../../packages/domain/src/user-account.ts';

export type AccountStatus = 'unconfigured' | 'signed-out' | 'offline' | 'working' | 'signed-in' | 'error';

export interface AccountTicket {
  generation: number;
  uid: string | null;
}

export interface LoadedAccountView {
  profile: UserProfileRecord;
  followedTeamIds: string[];
  favoriteTeamIds: string[];
  manualFixtureIds: string[];
  email: string | null;
}

/** Kasni odgovor važi samo za istu generaciju i isti uid. */
export class AccountGate {
  generation = 0;
  uid: string | null = null;
  status: AccountStatus = 'signed-out';
  profile: UserProfileRecord | null = null;
  followedTeamIds: string[] = [];
  favoriteTeamIds: string[] = [];
  manualFixtureIds: string[] = [];
  email: string | null = null;
  message: string | null = null;
  ready = false;

  ticket(): AccountTicket {
    return { generation: this.generation, uid: this.uid };
  }

  showUnconfigured(message: string): AccountTicket {
    const ticket = this.bump(null, 'unconfigured');
    this.message = message;
    this.ready = true;
    return ticket;
  }

  showSignedOut(offline: boolean, message: string | null): AccountTicket {
    const ticket = this.bump(null, offline ? 'offline' : 'signed-out');
    this.message = message;
    this.ready = true;
    return ticket;
  }

  showWorking(message: string): AccountTicket {
    const ticket = this.bump(null, 'working');
    this.message = message;
    this.ready = true;
    return ticket;
  }

  beginUser(uid: string): AccountTicket {
    const ticket = this.bump(uid, 'working');
    this.message = 'Nalog se učitava.';
    this.ready = true;
    return ticket;
  }

  shouldApply(ticket: AccountTicket): boolean {
    return ticket.generation === this.generation && ticket.uid !== null && ticket.uid === this.uid;
  }

  applyLoaded(ticket: AccountTicket, data: LoadedAccountView): boolean {
    if (!this.shouldApply(ticket)) return false;
    this.status = 'signed-in';
    this.profile = data.profile;
    this.followedTeamIds = [...data.followedTeamIds];
    this.favoriteTeamIds = [...data.favoriteTeamIds];
    this.manualFixtureIds = [...data.manualFixtureIds];
    this.email = data.email;
    this.message = null;
    this.ready = true;
    return true;
  }

  applyNotice(ticket: AccountTicket, message: string): boolean {
    if (!this.shouldApply(ticket)) return false;
    this.message = message;
    return true;
  }

  applyError(ticket: AccountTicket, message: string): boolean {
    if (ticket.generation !== this.generation) return false;
    this.status = 'error';
    this.message = message;
    this.clearPrivate();
    this.ready = true;
    return true;
  }

  private bump(uid: string | null, status: AccountStatus): AccountTicket {
    this.generation += 1;
    this.uid = uid;
    this.status = status;
    this.clearPrivate();
    this.message = null;
    return this.ticket();
  }

  private clearPrivate(): void {
    this.profile = null;
    this.followedTeamIds = [];
    this.favoriteTeamIds = [];
    this.manualFixtureIds = [];
    this.email = null;
  }
}

export async function runOwned<T>(
  gate: AccountGate,
  ticket: AccountTicket,
  work: () => Promise<T>,
): Promise<T | null> {
  if (!gate.shouldApply(ticket)) return null;
  const result = await work();
  if (!gate.shouldApply(ticket)) return null;
  return result;
}
