import { auth } from './firebase';
function accountKey(name: string, uid: string | undefined): string {
  if (!uid || auth?.currentUser?.uid !== uid) throw new Error('Account changed. Reopen this library.');
  return name + ':' + encodeURIComponent(uid);
}
function validate(name: string, value: unknown): asserts value is any[] {
  if (!Array.isArray(value) || value.length > 100000) throw new Error('The saved library is invalid. Its original data has been preserved.');
  const dictionary = name.includes('dictionary');
  const ids = new Set<string>();
  for (const item of value) {
    if (dictionary) { if (typeof item !== 'string' || !item.trim()) throw new Error('Invalid dictionary entry.'); continue; }
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error('Invalid or duplicate library entry.');
    ids.add(item.id);
    if (name.includes('keywords') && (typeof item.keyword !== 'string' || !item.keyword.trim() || typeof item.description !== 'string' || !item.description.trim())) throw new Error('Invalid keyword entry.');
    if (name.includes('templates') && (typeof item.name !== 'string' || !item.name.trim() || typeof item.category !== 'string' || item.type !== 'text' || typeof item.content !== 'string' || !item.content.trim())) throw new Error('Invalid browser template.');
  }
}
export function readAccountLibrary<T>(name: string, uid: string | undefined): T[] {
  const raw = localStorage.getItem(accountKey(name, uid));
  const value = raw ? JSON.parse(raw) : [];
  validate(name, value); return value as T[];
}
export function writeAccountLibrary(name: string, uid: string | undefined, value: unknown[]) {
  // Refuse to overwrite malformed data that may still be recoverable.
  readAccountLibrary(name, uid);
  validate(name, value);
  localStorage.setItem(accountKey(name, uid), JSON.stringify(value));
}
