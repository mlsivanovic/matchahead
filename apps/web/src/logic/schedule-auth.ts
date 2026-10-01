/**
 * Faza 05: token za Authorization: Bearer preko postojećeg Firebase adaptera.
 * Nova prijava se ne pokreće ovde; poziva ga isključivo klik.
 * null dok korisnik nije prijavljen ili dok sesija ne postoji —
 * tada server vraća 401, a UI to kaže bez izmišljenog uspeha.
 * Token nikad ne ide u URL, log, trajni keš ni Vite config.
 * Firebase modul se uvozi lenjo: testovi prosleđuju sesiju ili null
 * i ne povlače firebase runtime.
 */

export interface ScheduleAuthUser {
  getIdToken(forceRefresh: boolean): Promise<string>;
}

export interface ScheduleAuthSession {
  auth: { currentUser: ScheduleAuthUser | null };
}

export async function currentScheduleIdToken(
  session?: ScheduleAuthSession | null,
): Promise<string | null> {
  const resolved: ScheduleAuthSession | null = session !== undefined
    ? session
    : (await import('./firebase-app.ts')).activeFirebaseSession();
  const user = resolved?.auth.currentUser ?? null;
  if (!user) return null;
  try {
    const token = await user.getIdToken(false);
    return token || null;
  } catch {
    return null;
  }
}
