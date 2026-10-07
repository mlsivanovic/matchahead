import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
import { googleAccessClaim, isAllowedGoogleAccess } from './access-allowlist.ts';
import { activeFirebaseSession } from './firebase-app.ts';

export async function authorizeCalendar(): Promise<{ token: string; uid: string }> {
  const session = activeFirebaseSession();
  const user = session?.auth.currentUser;
  if (!session || !user || !isAllowedGoogleAccess(googleAccessClaim(user))) throw new Error('Prijavi se dozvoljenim Google nalogom.');
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/calendar.events');
  provider.setCustomParameters({ login_hint: user.email!, prompt: 'consent' });
  const result = await reauthenticateWithPopup(user, provider);
  if (session.auth.currentUser?.uid !== user.uid || result.user.uid !== user.uid) throw new Error('Nalog je promenjen. Pokreni dodavanje ponovo.');
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new Error('Dozvola za Google kalendar nije dobijena.');
  return { token, uid: user.uid };
}
