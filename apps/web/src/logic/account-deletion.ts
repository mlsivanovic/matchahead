export type DeletionResult = 'deleted' | 'needs-recent-login';

export function openingAction(input: { deletionFlag: boolean; marker: boolean }): 'resume-deletion' | 'load' {
  return input.deletionFlag || input.marker ? 'resume-deletion' : 'load';
}

export function isRecentLoginError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code: unknown }).code === 'auth/requires-recent-login';
}

/**
 * Marker ili lokalna zastavica nastavljaju brisanje.
 * auth/requires-recent-login ostavlja zastavicu i ne otvara nov profil.
 */
export async function resumeAccountDeletion(input: {
  deleteDocuments: () => Promise<void>;
  deleteAuthUser: () => Promise<void>;
  setFlag: () => void;
  clearFlag: () => void;
}): Promise<DeletionResult> {
  input.setFlag();
  await input.deleteDocuments();
  try {
    await input.deleteAuthUser();
  } catch (error) {
    if (isRecentLoginError(error)) return 'needs-recent-login';
    throw error;
  }
  input.clearFlag();
  return 'deleted';
}
