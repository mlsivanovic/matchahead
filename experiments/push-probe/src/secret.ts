export function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

/** Pod prihvata samo dugu tajnu sa dovoljno različitih znakova. Kratka lozinka ne otvara upis. */
export function enrollSecretAccepted(secret: string): boolean {
  if (secret.length < 32) return false;
  return new Set(secret).size >= 16;
}

export async function secretMatches(candidate: string, expected: string): Promise<boolean> {
  const candidateHash = await sha256(candidate);
  if (expected.length === 0) return false;
  const expectedHash = await sha256(expected);
  return timingSafeEqualBytes(candidateHash, expectedHash);
}
