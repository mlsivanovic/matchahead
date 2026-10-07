import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  activeThemePreference,
  applyDocumentTheme,
  parseThemePreference,
  rememberThemePreference,
  resolveTheme,
  subscribeSystemTheme,
  themeColor,
  themeFromPrefsJson,
  watchDocumentTheme,
} from '../src/logic/theme.ts';
import { readDevicePrefs, writeDevicePrefs, memoryStore } from '../src/logic/user-local.ts';

test('neispravna tema je Auto, a ručni izbor ima prednost nad sistemom', () => {
  assert.equal(parseThemePreference('light'), 'light');
  assert.equal(parseThemePreference('nope'), 'auto');
  assert.equal(parseThemePreference(undefined), 'auto');
  assert.equal(themeFromPrefsJson(null), 'auto');
  assert.equal(themeFromPrefsJson('{'), 'auto');
  assert.equal(themeFromPrefsJson(JSON.stringify({ theme: 'dark' })), 'dark');
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(themeColor('dark'), '#111318');
  assert.equal(themeColor('light'), '#F7F9FC');
});

test('dokument dobija razrešenu temu i prati sistem samo dok je Auto', () => {
  const meta = { value: '', setAttribute(_name: string, content: string) { this.value = content; } };
  const doc = {
    documentElement: { dataset: {} as { theme?: string }, style: { colorScheme: '', backgroundColor: '' } },
    querySelector() { return meta; },
  };
  assert.equal(applyDocumentTheme(doc, 'auto', true), 'dark');
  assert.equal(doc.documentElement.dataset.theme, 'dark');
  assert.equal(doc.documentElement.style.colorScheme, 'dark');
  assert.equal(doc.documentElement.style.backgroundColor, '#111318');
  assert.equal(meta.value, '#111318');

  let preference: 'light' | 'dark' | 'auto' = 'light';
  let dark = false;
  const listeners = new Set<() => void>();
  const media = {
    get matches() { return dark; },
    addEventListener(_type: 'change', listener: () => void) { listeners.add(listener); },
    removeEventListener(_type: 'change', listener: () => void) { listeners.delete(listener); },
  };
  const stop = watchDocumentTheme(doc, () => preference, media);
  assert.equal(doc.documentElement.dataset.theme, 'light');
  dark = true;
  for (const listener of listeners) listener();
  assert.equal(doc.documentElement.dataset.theme, 'light');
  preference = 'auto';
  for (const listener of listeners) listener();
  assert.equal(doc.documentElement.dataset.theme, 'dark');
  stop();
  assert.equal(listeners.size, 0);
  subscribeSystemTheme(media, () => {});
});

test('ručni Dark ostaje i kad upis ne uspe, a sistem pređe na svetlo', () => {
  rememberThemePreference('auto');
  const doc = {
    documentElement: { dataset: {} as { theme?: string }, style: { colorScheme: '', backgroundColor: '' } },
    querySelector() { return { setAttribute() {} }; },
  };
  let stored: 'light' | 'dark' | 'auto' = 'auto';
  let dark = true;
  const listeners = new Set<() => void>();
  const media = {
    get matches() { return dark; },
    addEventListener(_type: 'change', listener: () => void) { listeners.add(listener); },
    removeEventListener(_type: 'change', listener: () => void) { listeners.delete(listener); },
  };
  const stop = watchDocumentTheme(doc, () => activeThemePreference(stored), media);
  rememberThemePreference('dark');
  applyDocumentTheme(doc, 'dark', true);
  stored = 'auto';
  dark = false;
  for (const listener of listeners) listener();
  assert.equal(doc.documentElement.dataset.theme, 'dark');
  assert.equal(doc.documentElement.style.backgroundColor, '#111318');
  assert.equal(activeThemePreference(stored), 'dark');
  stop();
  rememberThemePreference('auto');
});

test('tema u podešavanjima uređaja preživljava čitanje', () => {
  const local = memoryStore();
  writeDevicePrefs(local, { timeZone: 'Europe/Belgrade', reminderMinutes: 30, theme: 'dark' });
  assert.equal(readDevicePrefs(local).theme, 'dark');
});

test('tema se primenjuje pre React modula', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.indexOf('matchahead.device.prefs');
  const module = html.indexOf('/src/main.tsx');
  assert.ok(script > 0 && script < module);
  assert.match(html, /data-theme/);
  assert.match(html, /prefers-color-scheme/);
  assert.match(html, /backgroundColor/);
  assert.match(html, /#111318/);
  assert.match(html, /#F7F9FC/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /interactive-widget=resizes-content/);
});
