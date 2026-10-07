export type ThemePreference = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

/** Pozadinske boje iz dogovorenog plana. Manifest boje nisu ovde. */
export const LIGHT_THEME_COLOR = '#F7F9FC';
export const DARK_THEME_COLOR = '#111318';

export function parseThemePreference(value: unknown): ThemePreference {
  if (value === 'light' || value === 'dark' || value === 'auto') return value;
  return 'auto';
}

/** Nedostaje zapis, pokvaren JSON ili nepoznata vrednost: Auto. */
export function themeFromPrefsJson(raw: string | null): ThemePreference {
  if (!raw) return 'auto';
  try {
    const parsed = JSON.parse(raw) as { theme?: unknown } | null;
    if (!parsed || typeof parsed !== 'object') return 'auto';
    return parseThemePreference(parsed.theme);
  } catch {
    return 'auto';
  }
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemDark ? 'dark' : 'light';
}

export function themeColor(resolved: ResolvedTheme): string {
  return resolved === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
}

/**
 * Aktivni izbor živi u memoriji. Upis u skladište je best-effort:
 * neuspeo setItem ne sme da vrati ručni Light/Dark na Auto dok traje sesija.
 * Posle ponovnog učitavanja, nedostupan zapis i dalje znači Auto.
 */
let rememberedTheme: ThemePreference | null = null;

export function rememberThemePreference(preference: ThemePreference): void {
  rememberedTheme = parseThemePreference(preference);
}

export function activeThemePreference(stored: ThemePreference = 'auto'): ThemePreference {
  return rememberedTheme ?? stored;
}

export interface ThemeDocumentLike {
  documentElement: {
    dataset: { theme?: string };
    style: { colorScheme: string; backgroundColor: string };
  };
  querySelector(selector: string): { setAttribute(name: string, value: string): void } | null;
}

/** `data-theme` je uvek light ili dark. Auto se razrešava pre upisa. */
export function applyDocumentTheme(
  doc: ThemeDocumentLike,
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme {
  const resolved = resolveTheme(preference, systemDark);
  doc.documentElement.dataset.theme = resolved;
  doc.documentElement.style.colorScheme = resolved;
  doc.documentElement.style.backgroundColor = themeColor(resolved);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor(resolved));
  return resolved;
}

export interface ColorSchemeMedia {
  matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

export function subscribeSystemTheme(media: ColorSchemeMedia, onDark: (dark: boolean) => void): () => void {
  const listener = () => onDark(media.matches);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

/**
 * Primeni temu odmah i ponovo samo dok je izbor Auto.
 * Ručni Light ili Dark se ne menjaju kad sistem promeni šemu.
 */
export function watchDocumentTheme(
  doc: ThemeDocumentLike,
  readPreference: () => ThemePreference,
  media: ColorSchemeMedia,
): () => void {
  const apply = () => applyDocumentTheme(doc, readPreference(), media.matches);
  apply();
  return subscribeSystemTheme(media, () => {
    if (readPreference() === 'auto') apply();
  });
}
