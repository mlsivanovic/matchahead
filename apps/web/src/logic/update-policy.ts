/** Nova verzija se ne učitava dok je unos u toku ili beleška neispražnjena. */
export function mayApplyUpdate(input: { composing: boolean; draftDirty: boolean }): boolean {
  return !input.composing && !input.draftDirty;
}

export function isComposingElement(element: { tagName?: string; isContentEditable?: boolean; type?: string } | null): boolean {
  if (!element?.tagName) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (element.type ?? 'text').toLowerCase();
  return !['button', 'submit', 'checkbox', 'radio', 'file', 'range', 'color', 'hidden'].includes(type);
}
