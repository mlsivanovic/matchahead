export async function generatePrivateKeyPem(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const key = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const exported = new Uint8Array(await crypto.subtle.exportKey('pkcs8', key.privateKey));
  let binary = '';
  for (const byte of exported) binary += String.fromCharCode(byte);
  const wrapped = btoa(binary).match(/.{1,64}/g)?.join('\n') ?? '';
  return {
    pem: `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----\n`,
    publicKey: key.publicKey,
  };
}

export function bytesFromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export const VALID_FID = 'cAAAAAAAAAAAAAAAAAAAAA';
export const ENROLL = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718';

export function probeEnv(pem: string) {
  return {
    PROBE_SEND_ENABLED: '1',
    PROBE_ENROLL_SECRET: ENROLL,
    FIREBASE_PROJECT_ID: 'matchahead-probe',
    FCM_CLIENT_EMAIL: 'probe@matchahead-probe.iam.gserviceaccount.com',
    FCM_PRIVATE_KEY: pem,
  };
}
