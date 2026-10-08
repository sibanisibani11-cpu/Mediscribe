'use strict';
const protectedWords = new Set(['no', 'not', 'none', 'never', 'without', 'negative', 'positive', 'absent', 'present', 'left', 'right', 'bilateral', 'mg', 'mcg', 'g', 'ml', 'mm', 'cm', 'iv', 'im', 'po']);
function correctionChoices(text, flagged) {
  if (typeof text !== 'string' || !Array.isArray(flagged)) return [];
  let end = 0;
  return flagged.filter(item => item && typeof item === 'object').sort((a, b) => a.position - b.position).flatMap(item => {
    const { word, position, length } = item;
    if (!Number.isInteger(position) || position < end || length !== word?.length || text.slice(position, position + length) !== word || !/^[A-Za-z]{3,40}$/.test(word) || protectedWords.has(word.toLowerCase())) return [];
    // Never allow a partial word or a replacement containing punctuation, units, or digits.
    if (/[\p{L}\p{N}_]/u.test(text[position - 1] || '') || /[\p{L}\p{N}_]/u.test(text[position + length] || '')) return [];
    end = position + length;
    const suggestions = [...new Set((Array.isArray(item.suggestions) ? item.suggestions : []).filter(value => typeof value === 'string' && /^[A-Za-z]{3,40}$/.test(value) && !protectedWords.has(value.toLowerCase())))].slice(0, 3);
    return suggestions.length ? [{ word, position, length, suggestions }] : [];
  });
}
function applySpellingCorrections(text, choices, response) {
  let parsed;
  try { parsed = JSON.parse(response); } catch { return text; }
  if (!parsed || !Array.isArray(parsed.corrections) || parsed.corrections.length > choices.length) return text;
  const used = new Set(), edits = [];
  for (const correction of parsed.corrections) {
    if (!correction || typeof correction !== 'object') return text;
    const item = choices[correction.index];
    if (!Number.isInteger(correction?.index) || !item || used.has(correction.index) || !item.suggestions.includes(correction.replacement)) return text;
    if (text.slice(item.position, item.position + item.length) !== item.word) return text;
    used.add(correction.index); edits.push({ ...item, replacement: correction.replacement });
  }
  let output = text;
  for (const edit of edits.sort((a, b) => b.position - a.position)) output = output.slice(0, edit.position) + edit.replacement + output.slice(edit.position + edit.length);
  return output;
}
function escapeSendKeys(text) {
  return text.replace(/\r\n|\r|\n|[{}+^%~()[\]]/g, value => /[\r\n]/.test(value) ? '{ENTER}' : '{' + value + '}');
}
module.exports = { correctionChoices, applySpellingCorrections, escapeSendKeys };
