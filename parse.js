// Fast CommonMark + GFM parser returning HTML byte-identical to marked 18.1.3
// (default options). Original implementation, written from the CommonMark/GFM
// specs and from observed marked behaviour on the practice set.

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESC_RE = /[&<>"']/g;
const ESC_NOENC_RE = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g;

// Escape HTML text. encode=true escapes every & (code spans, autolink hrefs);
// encode=false leaves valid entity references (&name;, &#123;, &#xAB;) untouched.
// Manual scanner: avoids the replace-with-callback overhead on hot text.
const ESC_FIRST_RE = /[&<>"']/;
const ESC_NOENC_FIRST_RE = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/;
// For text nodes that contain a decoded numeric reference: the first
// search must also stop at `&`s that look like valid entities in the
// merged text but were escaped by marked's Ie (see ieEscapesAmp).
const ESC_NOENC_NUM_FIRST_RE = /[<>"']|&/;
export function esc(s, encode, numPos, escPos) {
  const n = s.length;
  if (encode) {
    const i0 = s.search(ESC_FIRST_RE);
    if (i0 < 0) return s;
    let out = s.slice(0, i0);
    for (let i = i0; i < n; i++) {
      const c = s[i];
      out += c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : c === "'" ? '&#39;' : c;
    }
    return out;
  }
  if (numPos) {
    const i0 = s.search(ESC_NOENC_NUM_FIRST_RE);
    if (i0 < 0) return s;
    let out = s.slice(0, i0);
    for (let i = i0; i < n; i++) {
      const c = s[i];
      if (c === '<') out += '&lt;';
      else if (c === '>') out += '&gt;';
      else if (c === '"') out += '&quot;';
      else if (c === "'") out += '&#39;';
      else if (c === '&') {
        if (isEntityAt(s, i)) { if (ieEscapesAmp(s, i, numPos, escPos)) out += '&amp;'; else out += c; }
        else out += '&amp;';
      }
      else out += c;
    }
    return out;
  }
  const i0 = s.search(ESC_NOENC_FIRST_RE);
  if (i0 < 0) return s;
  let out = s.slice(0, i0);
  for (let i = i0; i < n; i++) {
    const c = s[i];
    if (c === '<') out += '&lt;';
    else if (c === '>') out += '&gt;';
    else if (c === '"') out += '&quot;';
    else if (c === "'") out += '&#39;';
    else if (c === '&' && !isEntityAt(s, i)) out += '&amp;';
    else out += c;
  }
  return out;
}
// Does marked's text-token Ie escape the `&` at s[i]? Ie runs per text
// chunk (chunks split at the stop chars \ < ! [ ` * ~ _) and escapes a
// bare `&` in any chunk that contains a numeric reference. A `&` that
// looks like a valid entity in the merged text is bare in its chunk when
// the entity name, scanned with alnum only (a literal `_` ends the chunk
// and a decoded numeric ref is a raw `&` there, not a word char), does
// not reach `;` — and then it is escaped iff a numeric ref shares the
// chunk (no literal stop char between the `&` and a recorded ref
// position, skipping decoded-ref positions themselves).
const STOP_CHARS = new Set(['\\', '<', '!', '[', '`', '*', '~', '_']);
function ieEscapesAmp(s, i, numPos, escPos) {
  // 1. Chunk-local lookahead: is the `&` followed, within its chunk, by
  // a numeric ref (`#\d{1,7};` / `#[Xx][hex]{1,6};`) or a name
  // (`\w+;`)? The name scan uses alnum only: a literal `_` ends the
  // chunk, and a decoded-ref position is a raw `&` there, not a word
  // char (and a decoded `;` there is not the `;` of the pattern).
  let j = i + 1;
  if (s[j] === '#') {
    j++;
    if (s[j] === 'x' || s[j] === 'X') {
      j++;
      const st = j;
      while (j < s.length && numPos.indexOf(j) < 0 && ((s[j] >= '0' && s[j] <= '9') || (s[j] >= 'a' && s[j] <= 'f') || (s[j] >= 'A' && s[j] <= 'F'))) j++;
      if (j > st && j - st <= 6 && numPos.indexOf(j) < 0 && (escPos === undefined || escPos.indexOf(j) < 0) && s[j] === ';') return false;
    } else {
      const st = j;
      while (j < s.length && numPos.indexOf(j) < 0 && s[j] >= '0' && s[j] <= '9') j++;
      if (j > st && j - st <= 7 && numPos.indexOf(j) < 0 && (escPos === undefined || escPos.indexOf(j) < 0) && s[j] === ';') return false;
    }
  } else {
    while (j < s.length) {
      const c = s[j];
      if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
        if (numPos.indexOf(j) >= 0) break; // decoded ref: raw `&`, ends the name
        j++;
        continue;
      }
      break;
    }
    if (j > i + 1 && numPos.indexOf(j) < 0 && (escPos === undefined || escPos.indexOf(j) < 0) && s[j] === ';') return false; // chunk-local entity is valid
  }
  for (let q = 0; q < numPos.length; q++) {
    const p = numPos[q];
    const lo = i < p ? i : p, hi = i < p ? p : i;
    let k = lo + 1, same = true;
    while (k < hi) {
      if (numPos.indexOf(k) < 0 && STOP_CHARS.has(s[k])) { same = false; break; }
      if (escPos !== undefined && escPos.indexOf(k) >= 0) { same = false; break; } // escape ends the chunk
      k++;
    }
    if (same) return true;
  }
  return false;
}
// Is there a valid entity reference (&name; / &#123; / &#xAB;) at s[i]?
function isEntityAt(s, i) {
  let j = i + 1;
  if (s[j] === '#') {
    j++;
    if (s[j] === 'x' || s[j] === 'X') {
      j++;
      const st = j;
      while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || (s[j] >= 'a' && s[j] <= 'f') || (s[j] >= 'A' && s[j] <= 'F'))) j++;
      return j > st && j - st <= 6 && s[j] === ';';
    }
    const st = j;
    while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
    return j > st && j - st <= 7 && s[j] === ';';
  }
  const st = j;
  while (j < s.length && ((s[j] >= 'a' && s[j] <= 'z') || (s[j] >= 'A' && s[j] <= 'Z') || (s[j] >= '0' && s[j] <= '9') || s[j] === '_')) j++;
  return j > st && s[j] === ';';
}

const PUNCT = new Set();
for (const c of '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~') PUNCT.add(c);
const PUNCT_CACHE = new Map();
function isPunct(ch) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code < 128) return PUNCT.has(ch);
  let r = PUNCT_CACHE.get(ch);
  if (r === undefined) { r = /[\p{P}\p{S}]/u.test(ch); PUNCT_CACHE.set(ch, r); }
  return r;
}
// ASCII punctuation only (marked's Ye / anyPunctuation): the backslash
// escape and link-destination unescaping use this, not isPunct.
function isAsciiPunct(ch) {
  return !!ch && ch.charCodeAt(0) < 128 && PUNCT.has(ch);
}
function isSpace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v' || (ch > ' ' && /\s/.test(ch));
}
function isDigit(ch) { return ch >= '0' && ch <= '9'; }

// Decode a numeric character reference at s[i] ('&' + '#...;'). Returns
// [decodedChar, length] or null. Mirrors marked: 0, >0x10FFFF and surrogates
// become U+FFFD; 38 becomes '&' (caller escapes it).
function numRef(s, i) {
  if (s[i + 1] !== '#') return null;
  let j = i + 2, hex = false;
  if (s[j] === 'x' || s[j] === 'X') { hex = true; j++; }
  const start = j;
  while (j < s.length && ((hex && ((s[j] >= '0' && s[j] <= '9') || (s[j] >= 'a' && s[j] <= 'f') || (s[j] >= 'A' && s[j] <= 'F'))) || (!hex && s[j] >= '0' && s[j] <= '9'))) j++;
  if (j === start || j >= s.length || s[j] !== ';') return null;
  if (j - start > 7) return null;
  const v = parseInt(s.slice(start, j), hex ? 16 : 10);
  if (v === 0 || v > 0x10FFFF || (v >= 0xD800 && v <= 0xDFFF)) return ['\uFFFD', j - i + 1];
  if (v === 38) return ['&', j - i + 1];
  return [String.fromCodePoint(v), j - i + 1];
}

// Clean a link destination the way marked does: encodeURI, then restore %
// (marked replaces %25 back to % after encodeURI).
const CLEANURL_FAST_RE = /[^A-Za-z0-9;,/?:@&=+$_.!~*'()#\-]/;
function cleanUrl(href) {
  if (href === null || href === undefined) return null;
  // Fast path: no '%' and no character encodeURI would escape.
  if (href.indexOf('%') < 0 && !CLEANURL_FAST_RE.test(href)) return href;
  try { return encodeURI(href).replace(/%25/g, '%'); } catch { return null; }
}

// Normalise a link label: trim, collapse whitespace runs to one space,
// lowercase (marked uses toLowerCase on the trimmed label).
function normLabel(s) {
  // marked's F: lower, upper, lower (so ẞ and SS normalise the same)
  return s.trim().replace(/\s+/g, ' ').toLowerCase().toUpperCase().toLowerCase();
}

const EMAIL_RE = /^[A-Za-z0-9._+\-]+@[a-zA-Z0-9\-_]+(?:\.[a-zA-Z0-9\-_]*[a-zA-Z0-9])+(?![\w\-])/;
const EMAIL_LOCAL_RE = /[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+/;
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.\-]{1,31}:/;
const AUTOLINK_SCHEME_RE = /^<([a-zA-Z][a-zA-Z0-9+.\-]{1,31}:[^\s\x00-\x1f<>]*)>/;
const AUTOLINK_EMAIL_RE = /^<([A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)+)>/;
// Sticky twins of the autolink/tag regexes: exec at position i without
// copying s.slice(i, ...) first.
const AUTOLINK_SCHEME_Y = /<([a-zA-Z][a-zA-Z0-9+.\-]{1,31}:[^\s\x00-\x1f<>]*)>/y;
const AUTOLINK_EMAIL_Y = /<([A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)+)>/y;
const ENTITY_Y = /&[A-Za-z0-9_]+;/y;
// Inline HTML tag (open/close/comment/PI/declaration/CDATA), marked's shape.
const TAG_RE = /^<!--(?:-?>|[\s\S]*?(?:-->|$))|^<\/[a-zA-Z][a-zA-Z0-9\-]*\s*>|^<[a-zA-Z][a-zA-Z0-9\-]*(?:\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?)*\s*\/?>|^<\?[\s\S]*?\?>|^<![a-zA-Z]+\s[\s\S]*?>|^<!\[CDATA\[[\s\S]*?\]\]>/;
const TAG_Y = /<!--(?:-?>|[\s\S]*?(?:-->|$))|<\/[a-zA-Z][a-zA-Z0-9\-]*\s*>|<[a-zA-Z][a-zA-Z0-9\-]*(?:\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?)*\s*\/?>|<\?[\s\S]*?\?>|<![a-zA-Z]+\s[\s\S]*?>|<!\[CDATA\[[\s\S]*?\]\]>/y;

// ---- Emphasis: marked's forward-scanning emStrong, not the CommonMark
// delimiter stack. It finds an opener, then scans forward for a closer
// with a counting rule (opener-like runs add to the count, closers
// subtract, the rule of 3 skips some), and decides em vs strong from
// the opener/closer lengths. This is where marked departs from the spec
// (e.g. `**a *b*c**` stays literal, `**a b*c**` is strong, and a single
// `*` inside `**...**` does not split the strong).
// Regexes are the GFM rules from marked 18.1.3, transcribed verbatim.
const EM_LDELIM = /^(?:\*+(?:((?!\*)(?!~)[\p{P}\p{S}])|([^\s*]))?)|^_+(?:((?!_)(?!~)[\p{P}\p{S}])|([^\s_]))?/u;
const EM_LDELIM_Y = /(?:\*+(?:((?!\*)(?!~)[\p{P}\p{S}])|([^\s*]))?)|_+(?:((?!_)(?!~)[\p{P}\p{S}])|([^\s_]))?/yu;
const EM_RDELIM_AST = /^[^_*]*?__[^_*]*?\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\*)(?!~)[\p{P}\p{S}](\*+)(?=[\s]|$)|(?:[^\s\p{P}\p{S}]|~)(\*+)(?!\*)(?=(?!~)[\s\p{P}\p{S}]|$)|(?!\*)(?!~)[\s\p{P}\p{S}](\*+)(?=(?:[^\s\p{P}\p{S}]|~))|[\s](\*+)(?!\*)(?=(?!~)[\p{P}\p{S}])|(?!\*)(?!~)[\p{P}\p{S}](\*+)(?!\*)(?=(?!~)[\p{P}\p{S}])|(?:[^\s\p{P}\p{S}]|~)(\*+)(?=(?:[^\s\p{P}\p{S}]|~))/gu;
const EM_RDELIM_UND = /^[^_*]*?\*\*[^_*]*?_[^_*]*?(?=\*\*)|[^_]+(?=[^_])|(?!_)[\p{P}\p{S}](_+)(?=[\s]|$)|[^\s\p{P}\p{S}](_+)(?!_)(?=[\s\p{P}\p{S}]|$)|(?!_)[\s\p{P}\p{S}](_+)(?=[^\s\p{P}\p{S}])|[\s](_+)(?!_)(?=[\p{P}\p{S}])|(?!_)[\p{P}\p{S}](_+)(?!_)(?=[\p{P}\p{S}])/gu;
// Sticky splits of the closer regexes: the leading ^-alternative can only
// match at the scan start, so it runs once as its own sticky regex, and
// the remaining alternatives run sticky from the same position. This
// avoids copying the rest of the text (t.slice) for every delimiter.
// (Sticky ^ does not match at lastIndex>0, so the ^ is dropped here.)
const EM_RDELIM_AST_H = /[^_*]*?__[^_*]*?\*[^_*]*?(?=__)/y;
const EM_RDELIM_AST_R = /[^*]+(?=[^*])|(?![*])(?!~)[\p{P}\p{S}](\*+)(?=[\s]|$)|(?:[^\s\p{P}\p{S}]|~)(\*+)(?!\*)(?=(?!~)[\s\p{P}\p{S}]|$)|(?![*])(?!~)[\s\p{P}\p{S}](\*+)(?=(?:[^\s\p{P}\p{S}]|~))|[\s](\*+)(?!\*)(?=(?!~)[\p{P}\p{S}])|(?![*])(?!~)[\p{P}\p{S}](\*+)(?!\*)(?=(?!~)[\p{P}\p{S}])|(?:[^\s\p{P}\p{S}]|~)(\*+)(?=(?:[^\s\p{P}\p{S}]|~))/gu;
const EM_RDELIM_UND_H = /[^_*]*?\*\*[^_*]*?_[^_*]*?(?=\*\*)/y;
const EM_RDELIM_UND_R = /[^_]+(?=[^_])|(?!_)[\p{P}\p{S}](_+)(?=[\s]|$)|[^\s\p{P}\p{S}](_+)(?!_)(?=[\s\p{P}\p{S}]|$)|(?!_)[\s\p{P}\p{S}](_+)(?=[^\s\p{P}\p{S}])|[\s](_+)(?!_)(?=[\p{P}\p{S}])|(?!_)[\p{P}\p{S}](_+)(?!_)(?=[\p{P}\p{S}])/gu;
const EM_PUNCTUATION = /^((?![*_])[\s\p{P}\p{S}])/u;
const EM_UNICODE_ALNUM = /[\p{L}\p{N}]/u;

// marked's fe(): the last index of a delimiter run of `ch` that is not
// preceded by a space/tab/newline/CR/FF (the last possible closer).
function lastPossibleCloser(text, ch) {
  let last = -1;
  for (let s = 0; s < text.length; s++) {
    if (text[s] !== ch) continue;
    const o = s === 0 ? '\n' : text[s - 1];
    let i = s + 1;
    while (i < text.length && text[i] === ch) i++;
    if (o !== ' ' && o !== '\t' && o !== '\n' && o !== '\r' && o !== '\f') last = s;
    s = i - 1;
  }
  return last;
}
// Both closers in one pass (for '*' and '_').
function lastPossibleClosers(text) {
  let lastAst = -1, lastUnd = -1;
  for (let s = 0; s < text.length; s++) {
    const ch = text[s];
    if (ch !== '*' && ch !== '_') continue;
    const o = s === 0 ? '\n' : text[s - 1];
    let i = s + 1;
    while (i < text.length && text[i] === ch) i++;
    if (o !== ' ' && o !== '\t' && o !== '\n' && o !== '\r' && o !== '\f') {
      if (ch === '*') lastAst = s; else lastUnd = s;
    }
    s = i - 1;
  }
  return [lastAst, lastUnd];
}

// Masking regexes for emStrong (marked's #n): hide escaped punctuation,
// code spans, links, and html tags from the closer scan, keeping the
// text the same length so indices line up with the raw text.
const MASK_PUNCT = /(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`)|`+|\\([\p{P}\p{S}])/gu;
const MASK_BLOCKSKIP = /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)|(?<!`)()(?<b>`+)[^`]+\k<b>(?!`)|<(?! )[^<>]*?>/g;
const MASK_REFLINK = /!?\[((?:[^\[\]\\`]*(?:\[(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?)\]\[((?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999})\]|!?\[((?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999})\](?:\[\])?(?!\()/g;
const MASK_LINK = /^!?\[((?:\[(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?)\]\([ \t\n]*(<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\)))(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\((?:\\[\s\S]|[^)\\])*\)))?[ \t\n]*\)/;

// marked's linkInText: does `e` contain a link (inline or reference)?
function linkInText(e, refs) {
  if (!e.includes('[')) return false;
  for (const n of e.matchAll(MASK_BLOCKSKIP)) {
    if (MASK_LINK.test(n[0]) && e.charAt(n.index - 1) !== '!') return true;
  }
  for (const n of e.matchAll(MASK_REFLINK)) {
    const s = n[0], r = s.lastIndexOf('[');
    if (!(s.charAt(0) === '!' || !Object.hasOwn(refs, normLabel(s.slice(r + 1, -1)))) && !(r > 1 && linkInText(s.slice(1, r - 1), refs))) return true;
  }
  return false;
}

// Mask reflink labels that resolve to a known link reference.
function maskReflink(text, refs) {
  return text.replace(MASK_REFLINK, (r) => {
    const o = r.lastIndexOf('[');
    if (!Object.hasOwn(refs, normLabel(r.slice(o + 1, -1)))) return r;
    if (o > 1 && r.charAt(0) !== '!') {
      const i = r.slice(1, o - 1);
      if (linkInText(i, refs)) return '[' + maskReflink(i, refs) + '][' + 'a'.repeat(r.length - o - 2) + ']';
    }
    return '[' + 'a'.repeat(r.length - 2) + ']';
  });
}

// marked's #n: mask the inline text for the emStrong closer scan.
function maskInlineText(text, refs, hasRefs) {
  // Fast path: with no backtick, bracket, '<' or backslash there is
  // nothing any masking regex can match.
  const hasTick = text.indexOf('`') >= 0, hasBracket = text.indexOf('[') >= 0;
  if (!hasTick && !hasBracket && text.indexOf('<') < 0 && text.indexOf('\\') < 0) return text;
  let t = text;
  if (hasRefs && hasBracket) t = maskReflink(t, refs);
  if (hasTick || text.indexOf('\\') >= 0) t = t.replace(MASK_PUNCT, (n, s, r) => r ? '+'.repeat(n.length) : s ? s + n.slice(s.length, -s.length).replace(/`/g, '+') + s : n);
  if (hasTick || hasBracket || text.indexOf('<') >= 0) t = t.replace(MASK_BLOCKSKIP, (n, s, r) => { const o = r ? r.length : 0; return n.slice(0, o) + '[' + 'a'.repeat(n.length - o - 2) + ']'; });
  return t;
}

// Find the index just past the `]` that closes the innermost open
// bracket at or after `from` (handles escapes and nested brackets).
// Returns s.length if no closing `]` is found.
function labelEnd(s, from) {
  let depth = 0;
  for (let j = from; j < s.length; j++) {
    const c = s[j];
    if (c === '\\' && j + 1 < s.length) { j++; continue; }
    if (c === '[') depth++;
    else if (c === ']') {
      if (depth === 0) return j + 1;
      depth--;
    }
  }
  return s.length;
}

// Try marked's emStrong at s[i] (a `*` or `_` run). Returns
// {tag, inner, end} or null. `t` is the masked text the closer scan runs
// over (same length as s).
function tryEmStrong(s, i, t, vIn) {
  EM_LDELIM_Y.lastIndex = i;
  const m = EM_LDELIM_Y.exec(s);
  if (!m || (!m[1] && !m[2] && !m[3] && !m[4])) return null;
  const r = m[0][0];
  const n0 = i > 0 ? s[i - 1] : '';
  const o = n0 === r;
  let n = n0;
  const pos = i;
  let l = pos;
  while (l > 0 && t[l - 1] === r) l--;
  // The code point immediately before the run.
  const slice = t.slice(Math.max(0, l - 2), l);
  const p = slice ? [...slice].at(-1) ?? '' : '';
  const h = p === '*' || p === '_' || EM_PUNCTUATION.test(p);
  if (l < pos) n = p;
  const u = l < pos ? h : EM_PUNCTUATION.test(n);
  if (m[4] && EM_UNICODE_ALNUM.test(n)) return null;
  const d = m[1] || m[3] || '';
  if (!d || !n || u) {
    const k = [...m[0]].length - 1;
    let g, b, mm = k, f = 0;
    const y = pos - l + k;
    const R = !!p.trim() && (!!d || (r === '*' && !h));
    if (r !== '*' && r !== '_') return null;
    const v = vIn === undefined ? lastPossibleCloser(t, r) : vIn;
    const Q = pos + k;
    if (v < Q) return null;
    // Closer scan over t directly (sticky, from Q): first the ^-only
    // alternative, then the remaining alternatives. s2.index is absolute
    // in t; the original bound s2.index <= v - Q (relative) is s2.index
    // <= v in absolute terms, and M ends at s2.index + te + b.
    const H = r === '*' ? EM_RDELIM_AST_H : EM_RDELIM_UND_H;
    const A = r === '*' ? EM_RDELIM_AST_R : EM_RDELIM_UND_R;
    H.lastIndex = Q;
    let s2 = H.exec(t);
    A.lastIndex = s2 ? s2.index + s2[0].length : Q;
    let first = true;
    for (;;) {
      if (first) {
        first = false;
        if (!s2) { s2 = A.exec(t); if (!s2) break; }
      } else {
        s2 = A.exec(t);
        if (!s2) break;
      }
      if (s2.index > v) break;
      g = s2[1] || s2[2] || s2[3] || s2[4] || s2[5] || s2[6];
      if (!g) continue;
      b = [...g].length;
      if (s2[3] || s2[4]) { mm += b; continue; }
      else if (s2[5] || s2[6] || R) {
        if (o && (s2[5] || s2[6])) break;
        if (y % 3 && !((y + b) % 3)) { f += b; continue; }
      }
      mm -= b;
      if (mm > 0) continue;
      b = Math.min(b, b + mm + f);
      const te = [...s2[0]][0].length;
      const M = s.slice(i, s2.index + te + b);
      if (Math.min(k, b) % 2) {
        return { tag: 'em', inner: M.slice(1, -1), end: i + M.length };
      }
      return { tag: 'strong', inner: M.slice(2, -2), end: i + M.length };
    }
  }
  return null;
}

// Node kinds: 0 text(raw), 1 code(raw), 2 br, 3 delim, 4 link/img, 5 html(raw),
// 6 del, 7 em/strong wrapper, 8 bracket marker (renders as its text).

// Scan inline markdown into a node list. refs: link reference map.
// st: shared per-document state {inLink, inRawBlock} (marked keeps these in
// its lexer state across inline parses of one document).
function scanInline(s, refs, st) {
  const nodes = [];
  const brackets = []; // {idx, img, active, labelStart}
  let i = 0;
  const n = s.length;
  let cur = null; // current text node being appended to
  // True when the next position is a fresh token start after a construct
  // token (tag, code span, link, emphasis, escape, ...). At such a
  // position marked's url rule runs before the text rule and has no
  // preceding-character lookbehind, so extended autolinks need no prev
  // check there. After literal text the lookbehinds apply instead.
  let afterConstruct = true;
  // Position just after a `+ or ~+ run of length >= 2 that was added as
  // literal text (the run is the text token's first chunk: marked's
  // text tokenizer stops before every ` and ~, so a run always starts
  // its own text token). Marked's text regex cannot stop at
  // `mailto:`/`xmpp:` after such a run (the emailProtocol stop is a
  // consuming pattern and the lazy scan starts after the first chunk),
  // so the protocol form does not link there — only the bare email does.
  // -1 when not set.
  let firstChunkRunEnd = -1;
  // Last char of the most recent text token, for marked's del-opener
  // guard (its `r`): reset to '' after any construct token, and NOT
  // updated when a text token ends in `_` (marked only sets `r` when
  // the token's last char is not `_`).
  let delPrev = '';
  let masked = null; // masked text for the emStrong closer scan (lazy)
  let closerAst = -1, closerUnd = -1; // lastPossibleCloser(masked, r), cached per scanInline call
  let hasRefs = false;
  for (const _k in refs) { hasRefs = true; break; }
  // No autolink trigger anywhere in this text: textRunEnd can skip its
  // trigger scan entirely (conservative: any trigger present disables it).
  const noTriggers = s.indexOf('www.') < 0 && s.indexOf('://') < 0 && s.indexOf('mailto:') < 0 && s.indexOf('xmpp:') < 0 && s.indexOf('@') < 0;
  // If the innermost open bracket will form a link, return its label end
  // and label source; otherwise null. Accounts for the link-in-link
  // block (a label containing a link does not form a link).
  function linkLabelAt(at) {
    if (!brackets.length) return null;
    const br = brackets[brackets.length - 1];
    const endLimit = labelEnd(s, at);
    if (endLimit <= 0 || endLimit > n || s[endLimit - 1] !== ']') return null;
    const labelSrc = s.slice(br.labelStart, endLimit - 1);
    if (!tryLink(s, endLimit, labelSrc, refs)) return null;
    if (!br.img && linkInKids(nodes.slice(br.idx + 1))) return null;
    return { endLimit, labelSrc };
  }
  function textNode() {
    if (cur) return cur;
    cur = { k: 0, s: '', raw: false };
    nodes.push(cur);
    return cur;
  }
  function addText(str, rawFlag) {
    if (!str) return;
    afterConstruct = false;
    // Track marked's del-guard previous char: the last char of the most
    // recent text token, unless it ends in `_` (then `r` is unchanged).
    // Stored text may be escaped (`&lt;` for `<`), but the last char is
    // punctuation in both forms, so the guard outcome is the same.
    if (!rawFlag && str[str.length - 1] !== '_') delPrev = str[str.length - 1];
    if (rawFlag) {
      // raw text (inside <pre>/<script> etc.) must not merge with escaped text
      if (cur && cur.raw) { cur.s += str; return; }
      cur = { k: 0, s: str, raw: true };
      nodes.push(cur);
      return;
    }
    if (cur && !cur.raw) { cur.s += str; return; }
    cur = { k: 0, s: str, raw: false };
    nodes.push(cur);
  }
  function pushNode(nd) { cur = null; nodes.push(nd); afterConstruct = true; delPrev = ''; }
  function closeText() { cur = null; }

  while (i < n) {
    const ch = s[i];
    // Backslash escape / hard break. An escape is valid only before
    // ASCII punctuation (marked's Ye); `\«` is literal. An escaped `&`
    // must not start an entity: it is stored pre-escaped as `&amp;`
    // so the renderer does not treat `\&ouml;` as the entity `&ouml;`.
    // A backslash hard break also swallows the next line's leading
    // spaces/tabs (marked's br regex).
    if (ch === '\\') {
      const nx = s[i + 1];
      if (nx === '\n') {
        let k = i + 2, allWS = true;
        while (k < n) { const c = s[k]; if (c !== ' ' && c !== '\t' && c !== '\n') { allWS = false; break; } k++; }
        if (!allWS) {
          pushNode({ k: 2 });
          i += 2;
          while (i < n && (s[i] === ' ' || s[i] === '\t')) i++;
          continue;
        }
        addText('\\'); i++; continue;
      }
      // A backslash escape is its own token in marked, so the next
      // position is a fresh token start (afterConstruct) even though the
      // escaped char lands in the current text node. Record the escaped
      // char's position: it is a chunk boundary for the entity escape
      // (an `&name_with_underscore;` is escaped by Ie when a numeric
      // ref shares its text chunk, and a chunk ends at an escape).
      if (nx && isAsciiPunct(nx)) {
        const stored = nx === '&' ? '&amp;' : nx;
        addText(stored);
        if (cur && !cur.raw) {
          const startIdx = cur.s.length - stored.length;
          if (!cur.escPos) cur.escPos = [];
          cur.escPos.push(startIdx);
        }
        afterConstruct = true; delPrev = ''; i += 2; continue;
      }
      addText('\\'); i++; continue;
    }
    // Code span
    if (ch === '`') {
      let j = i;
      while (j < n && s[j] === '`') j++;
      const run = j - i;
      // A code span cannot run past the end of a link label (marked
      // tokenizes the label separately): limit the closing-run search
      // to the label end when inside a link-forming bracket.
      let limit = n;
      const ll = linkLabelAt(i);
      if (ll) limit = ll.endLimit;
      let k = j, found = -1;
      while (k < limit) {
        if (s[k] === '`') {
          let e = k;
          while (e < limit && s[e] === '`') e++;
          if (e - k === run) { found = k; break; }
          k = e;
        } else k++;
      }
      if (found >= 0) {
        let content = s.slice(j, found).replace(/\n/g, ' ');
        if (content.length >= 2 && content[0] === ' ' && content[content.length - 1] === ' ' && content.trim() !== '') {
          content = content.slice(1, -1);
        }
        pushNode({ k: 1, s: content });
        i = found + run;
        continue;
      }
      if (run >= 2) firstChunkRunEnd = j;
      addText(s.slice(i, j)); i = j; continue;
    }
    // Entity / numeric reference
    if (ch === '&') {
      const nr = numRef(s, i);
      if (nr) {
        // A decoded '&' (&#38; / &#x26;) is stored pre-escaped: in marked
        // Ie turns it into `&amp;` directly, so it must never fuse with
        // following text into a fake entity (`&#38;foo;` -> `&amp;foo;`).
        // Record the position of every decoded numeric ref on the node:
        // the renderer needs it for the chunk-aware entity escape (an
        // `&name_with_underscore;` is escaped by Ie when a numeric ref
        // shares its text chunk, because the chunk splits at `_`).
        const stored = nr[0] === '&' ? '&amp;' : nr[0];
        addText(stored);
        if (cur && !cur.raw) {
          const startIdx = cur.s.length - stored.length;
          if (!cur.numPos) cur.numPos = [];
          cur.numPos.push(startIdx);
        }
        i += nr[1]; continue;
      }
      const m = /^[A-Za-z][A-Za-z0-9]*;/.exec(s.slice(i + 1, i + 40)) || /^[A-Za-z0-9]+;/.exec(s.slice(i + 1, i + 40));
      // Named entity: pass through literally (&name; / &0; style, marked does
      // not decode named entities).
      ENTITY_Y.lastIndex = i;
      const em = ENTITY_Y.exec(s);
      if (em) { addText(em[0]); i += em[0].length; continue; }
      addText('&amp;'); i++; continue;
    }
    // Hard/soft line break. A hard break (2+ trailing spaces, or a
    // backslash, before the newline) also swallows the next line's
    // leading spaces/tabs (marked's br regex: `^( {2,}|\\\\)\n(?!\s*$)[ \t]*`).
    // It is not a hard break when the rest of the text is only
    // whitespace to the end (the `(?!\s*$)` lookahead).
    if (ch === '\n') {
      // trailing 2+ spaces before the newline -> hard break
      if (cur && !cur.raw) {
        const t = cur.s;
        let e = t.length;
        while (e > 0 && t[e - 1] === ' ') e--;
        if (t.length - e >= 2) {
          let k = i + 1, allWS = true;
          while (k < n) { const c = s[k]; if (c !== ' ' && c !== '\t' && c !== '\n') { allWS = false; break; } k++; }
          if (!allWS) {
            cur.s = t.slice(0, e);
            if (cur.s === '') { nodes.pop(); cur = null; }
            pushNode({ k: 2 });
            i++;
            while (i < n && (s[i] === ' ' || s[i] === '\t')) i++;
            continue;
          }
        }
      }
      addText('\n'); i++; continue;
    }
    // HTML tag / autolink <...>
    if (ch === '<') {
      AUTOLINK_SCHEME_Y.lastIndex = i;
      let m = AUTOLINK_SCHEME_Y.exec(s);
      if (m) {
        const href = cleanUrl(m[1]);
        if (href !== null) {
          pushNode({ k: 4, href, title: null, kids: [{ k: 0, s: m[1], raw: false }], img: false, auto: 'angle', disp: m[1] });
          i += m[0].length; continue;
        }
      }
      AUTOLINK_EMAIL_Y.lastIndex = i;
      m = AUTOLINK_EMAIL_Y.exec(s);
      if (m) {
        pushNode({ k: 4, href: 'mailto:' + m[1], title: null, kids: [{ k: 0, s: m[1], raw: false }], img: false, auto: 'angle', disp: m[1] });
        i += m[0].length; continue;
      }
      TAG_Y.lastIndex = i;
      const tm = TAG_Y.exec(s);
      if (tm) {
        const tag = tm[0];
        if (!st.inLink && /^<a[\s>]/.test(tag)) st.inLink = true;
        else if (st.inLink && /^<\/a\s*>/.test(tag)) st.inLink = false;
        if (!st.inRawBlock && /^<(pre|code|kbd|script)[\s>]/.test(tag)) st.inRawBlock = true;
        else if (st.inRawBlock && /^<\/(pre|code|kbd|script)[\s>]/.test(tag)) st.inRawBlock = false;
        pushNode({ k: 5, s: tag });
        i += tag.length; continue;
      }
      addText('&lt;'); i++; continue;
    }
    // Image / link bracket
    if (ch === '[' || (ch === '!' && s[i + 1] === '[')) {
      const img = ch === '!';
      const idx = nodes.length;
      pushNode({ k: 8, s: img ? '![' : '[' });
      brackets.push({ idx, img, active: true, labelStart: i + (img ? 2 : 1) });
      i += img ? 2 : 1;
      // A `[` marker is literal text, not a construct — except when it
      // opens a link label, whose text marked tokenizes fresh. So the
      // next position is a fresh token start only if this bracket will
      // form a link (e.g. `[www.example.com](url)` links the www.
      // inside the label, while bare `[www.example.com` does not).
      afterConstruct = !!linkLabelAt(i);
      continue;
    }
    // Close bracket: try to form a link
    if (ch === ']') {
      let bi = -1;
      for (let b = brackets.length - 1; b >= 0; b--) if (brackets[b].active) { bi = b; break; }
      if (bi < 0) { addText(']'); i++; continue; }
      const br = brackets[bi];
      const labelSrc = s.slice(br.labelStart, i);
      let link = tryLink(s, i + 1, labelSrc, refs);
      if (link) {
        const kids = nodes.slice(br.idx + 1);
        // A link inside link text blocks the outer link (marked's
        // linkEmitted rule): if kids hold a non-image link, this link fails.
        // Images are exempt: their label may contain links. Extended
        // autolinks are suppressed to text and do not block.
        let blocked = false;
        if (!br.img) blocked = linkInKids(kids);
        if (blocked) {
          // The label stays as literal text: the bracket marker and its
          // contents are NOT discarded (only the `]` is appended).
          br.active = false;
          brackets.splice(bi, 1);
          addText(']'); i++; continue;
        }
        nodes.length = br.idx;
        cur = null;
        // Extended autolinks are suppressed inside link text (inLink).
        unlinkExtended(kids);
        const nd = { k: 4, href: link.href, title: link.title, kids, img: br.img, auto: null, disp: null };
        pushNode(nd);
        brackets.splice(bi, 1);
        i = link.end;
        continue;
      }
      br.active = false;
      brackets.splice(bi, 1);
      addText(']'); i++; continue;
    }
    // Strikethrough (marked: delimiter run of 1-2 tildes, forward counting)
    if (ch === '~') {
      let j = i;
      while (j < n && s[j] === '~') j++;
      const run = j - i;
      if (run <= 2) {
        if (masked === null) {
          masked = maskInlineText(s, refs, hasRefs);
          [closerAst, closerUnd] = lastPossibleClosers(masked);
        }
        let del = null;
        let inLinkLabel = false;
        const ll = linkLabelAt(i);
        if (ll) {
          inLinkLabel = true;
          const br = brackets[brackets.length - 1];
          const labMasked = maskInlineText(ll.labelSrc, refs, hasRefs);
          const lp = i - br.labelStart;
          // The label is tokenized fresh in marked, so its previous-char
          // is the char before the `~` in the label ('' at its start);
          // a `_` there does not update marked's `r`, so it counts as ''.
          const lprev = lp > 0 ? (ll.labelSrc[lp - 1] === '_' ? '' : ll.labelSrc[lp - 1]) : '';
          const ldel = tryDel(ll.labelSrc, lp, run, refs, st, labMasked, lprev);
          if (ldel) del = { k: 6, kids: ldel.kids, end: br.labelStart + ldel.end };
        }
        if (!del && !inLinkLabel) del = tryDel(s, i, run, refs, st, masked, delPrev);
        if (del) { pushNode(del); i = del.end; continue; }
      }
      if (run >= 2) firstChunkRunEnd = j;
      addText(s.slice(i, j)); i = j; continue;
    }
    // Emphasis / strong: marked's forward-scanning emStrong. When it
    // matches, the inner text is tokenized recursively; when it does
    // not, one delimiter is consumed as literal text and the scan
    // retries at the next delimiter (marked's text tokenizer does the
    // same), so a later delimiter in the run can still open. The closer
    // scan runs over the masked text (code spans, links, html tags and
    // escaped punctuation hidden), computed lazily on first use.
    // Inside a link label, marked tokenizes the label separately, so
    // emphasis is scanned on the label text alone: it cannot span the
    // label's closing bracket, and `*`s inside the label are visible
    // (the outer masking hides them).
    if (ch === '*' || ch === '_') {
      if (masked === null) {
        masked = maskInlineText(s, refs, hasRefs);
        [closerAst, closerUnd] = lastPossibleClosers(masked);
      }
      let em = null;
      let inLinkLabel = false;
      const ll = linkLabelAt(i);
      if (ll) {
        inLinkLabel = true;
        const br = brackets[brackets.length - 1];
        const labMasked = maskInlineText(ll.labelSrc, refs, hasRefs);
        const lem = tryEmStrong(ll.labelSrc, i - br.labelStart, labMasked);
        if (lem) em = { tag: lem.tag, inner: lem.inner, end: br.labelStart + lem.end };
      }
      // Inside a link label, only the label-local scan applies: if no
      // closer is inside the label, the delimiter is literal (marked
      // tokenizes the label separately, so a closer outside the label
      // is never visible). Outside a label, scan the full text.
      if (!em && !inLinkLabel) em = tryEmStrong(s, i, masked, ch === '*' ? closerAst : closerUnd);
      if (em) {
        pushNode({ k: 7, tag: em.tag, kids: scanInline(em.inner, refs, st) });
        i = em.end;
        continue;
      }
      // A '_' that does not open emphasis can still start an email
      // (`_a@b.com` links in marked; emStrong is tried first there).
      if (ch === '_' && !st.inLink) {
        const au = tryExtAutolink(s, i, !!linkLabelAt(i), afterConstruct, firstChunkRunEnd);
        if (au) { pushNode(au); i = au.end; continue; }
      }
      addText(ch); i++; continue;
    }
    // Extended autolinks (www. / http(s):// / ftp:// / mailto: / email).
    // An email local part can also start with '.', '+' or '-'.
    if (!st.inLink && (ch === 'w' || ch === 'h' || ch === 'f' || ch === 'm' || ch === 'x' || ch === '.' || ch === '+' || ch === '-' || (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9'))) {
      const au = tryExtAutolink(s, i, !!linkLabelAt(i), afterConstruct, firstChunkRunEnd);
      if (au) { pushNode(au); i = au.end; continue; }
    }
    // Plain text run: consume until the next special char, or the start
    // of an extended autolink (marked's text tokenizer stops at
    // protocol://, wwwStart and email starts). Native indexOf/regex
    // scans instead of a per-character JS loop.
    const j = textRunEnd(s, i, n, st.inLink, noTriggers);
    if (j === i) { // safety: never stall
      addText(ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : ch === "'" ? '&#39;' : ch);
      i++;
      continue;
    }
    let chunk = s.slice(i, j);
    // Escape > " ' in raw text now (they are not special to the scanner)
    if (st.inRawBlock) addText(chunk, true);
    else if (chunk.indexOf('>') < 0 && chunk.indexOf('"') < 0 && chunk.indexOf("'") < 0) addText(chunk);
    else addText(chunk.replace(/[>"']/g, (c) => c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'));
    // The run ended at a trigger start (www. / scheme:// / mailto: /
    // email), not at a special char: marked's text token ended there,
    // so the next position is a fresh token start and extended
    // autolinks need no preceding-character check there.
    if (j < n) {
      const nc = s[j];
      const isSpecial = nc === '\\' || nc === '`' || nc === '&' || nc === '<' || nc === '>' || nc === '\n' || nc === '[' || nc === ']' || nc === '~' || nc === '*' || nc === '_' || (nc === '!' && s[j + 1] === '[');
      if (!isSpecial) afterConstruct = true;
    }
    i = j;
  }
  return nodes;
}

// Replace extended-autolink nodes inside link text with their plain text.
// Does this node list contain a real (non-image) link? Only real links
// block an outer link (marked's linkEmitted is set by De, the link
// tokenizer): extended autolinks are suppressed to text and angle
// autolinks do not set it, so neither blocks. Real links nested inside
// emphasis/del do count; images are exempt and their alt text is not
// descended into.
function linkInKids(kids) {
  for (const kd of kids) {
    if (kd.k === 4) {
      if (!kd.img && kd.auto === null) return true;
    } else if (kd.k === 6 || kd.k === 7) {
      if (linkInKids(kd.kids)) return true;
    }
  }
  return false;
}
function unlinkExtended(kids) {
  for (let idx = 0; idx < kids.length; idx++) {
    const kd = kids[idx];
    if (kd.k === 4 && kd.auto === 'ext') {
      kids[idx] = { k: 0, s: kd.disp, raw: false };
    } else if (kd.k === 4 || kd.k === 6 || kd.k === 7) {
      unlinkExtended(kd.kids);
    }
  }
}

// Try to parse an inline link / reference link starting at s[pos] (just
// after ']'). labelSrc is the raw text between the brackets.
// Returns {href, title, end} (end = index just past ')') or null.
// Parse an inline `(dest "title")` at s[p] ('('). Returns
// {href, title, end} or null. An empty destination `()` is valid.
function tryInlineParen(s, p) {
  const n = s.length;
  p++;
  while (p < n && (s[p] === ' ' || s[p] === '\t' || s[p] === '\n')) p++;
  let href = null;
  if (s[p] === '<') {
    let q = p + 1, dest = '';
    let ok = false;
    while (q < n) {
      const c = s[q];
      if (c === '\n' || c === '<') break;
      if (c === '>') { ok = true; break; }
      // In an angle destination a backslash escapes any following char
      // (so `\>` does not close it); the backslash is dropped only
      // before ASCII punctuation (marked's anyPunctuation).
      if (c === '\\' && q + 1 < n) {
        if (isAsciiPunct(s[q + 1])) dest += s[q + 1];
        else dest += c + s[q + 1];
        q += 2; continue;
      }
      dest += c; q++;
    }
    if (!ok) return null;
    href = dest;
    p = q + 1;
  } else {
    let q = p, depth = 0, dest = '';
    while (q < n) {
      const c = s[q];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') break;
      if (c === '\\' && q + 1 < n && isAsciiPunct(s[q + 1])) { dest += s[q + 1]; q += 2; continue; }
      if (c === '(') depth++;
      if (c === ')') { if (depth === 0) break; depth--; }
      dest += c; q++;
    }
    if (dest === '' && s[q] !== ')') return null;
    href = dest;
    p = q;
  }
  while (p < n && (s[p] === ' ' || s[p] === '\t' || s[p] === '\n')) p++;
  let title = null;
  if (p < n && (s[p] === '"' || s[p] === "'" || s[p] === '(')) {
    const t = parseTitle(s, p);
    if (!t) return null;
    title = t.title; p = t.end;
    while (p < n && (s[p] === ' ' || s[p] === '\t' || s[p] === '\n')) p++;
  }
  if (p >= n || s[p] !== ')') return null;
  const clean = cleanUrl(href);
  if (clean === null) return null;
  return { href: clean, title, end: p + 1 };
}

// marked's link-label pattern `re` (the first group of the link regex):
// a label must match it (followed by `]`) for the link to form. This
// rejects labels whose code spans have unbalanced backticks, etc.
const LINK_LABEL_RE = /^(?:\[(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?\]$/;

function tryLink(s, pos, labelSrc, refs) {
  if (!LINK_LABEL_RE.test(labelSrc + ']')) return null;
  let p = pos;
  const n = s.length;
  if (s[p] === '(') {
    const inl = tryInlineParen(s, p);
    if (inl) return inl;
    // A failed inline destination falls back to a shortcut reference.
  } else if (s[p] === '[') {
    // A full reference: `[label][ref]` (optional whitespace between).
    // If the bracketed ref exists but is NOT defined, the link fails
    // outright (marked's reflink returns literal `[`) — it does NOT
    // fall back to the shortcut. Only when there is no closing `]`
    // at all does the shortcut get a chance.
    let q = p;
    while (q < n && (s[q] === ' ' || s[q] === '\t' || s[q] === '\n')) q++;
    if (s[q] === '[') {
      let r = q + 1;
      while (r < n && s[r] !== ']') r++;
      if (r < n) {
        const lab = s.slice(q + 1, r);
        const key = normLabel(lab === '' ? labelSrc : lab);
        const ref = refs[key];
        if (ref) return { href: ref.href, title: ref.title, end: r + 1 };
        return null;
      }
    }
  }
  // shortcut reference
  const key = normLabel(labelSrc);
  const ref = refs[key];
  if (!ref) return null;
  return { href: ref.href, title: ref.title, end: pos };
}

// Parse a link title at s[p] ('"' or '\'' or '('). Returns {title, end} or null.
// A double-quoted or parenthesised title may span lines (even a blank
// line); a single-quoted title may not span a blank line (marked's
// title regex: '... \n(?!\n) ...'). A parenthesised title may not
// contain an unescaped '('.
function parseTitle(s, p) {
  const open = s[p];
  const close = open === '(' ? ')' : open;
  let q = p + 1, out = '';
  while (q < s.length) {
    const c = s[q];
    if (c === close) return { title: out, end: q + 1 };
    if (c === '\n') {
      if (open === "'" && s[q + 1] === '\n') return null;
      out += '\n'; q++; continue;
    }
    if (open === '(' && c === '(') return null;
    // A backslash pair is consumed (so an escaped quote does not close
    // the title), but the backslash is dropped only before ASCII
    // punctuation (marked applies anyPunctuation to the title value).
    if (c === '\\' && q + 1 < s.length) {
      if (isAsciiPunct(s[q + 1])) out += s[q + 1];
      else out += c + s[q + 1];
      q += 2; continue;
    }
    out += c; q++;
  }
  return null;
}

// Extended autolink at s[i] (www. / scheme:// / email). Returns a link node
// with .end, or null. Mirrors marked's url rule + _backpedal trimming.
// Only cheap prefix checks run per position; regexes run only on plausible
// starts (a full slice per character would be quadratic on long documents).
// Bare-email match, sticky (no copy): the local part is [A-Za-z0-9._+-].
const EMAIL_STICKY_RE = /[A-Za-z0-9._+\-]+@[a-zA-Z0-9\-_]+(?:\.[a-zA-Z0-9\-_]*[a-zA-Z0-9])+(?![\w\-])/y;
function isEmailLocal(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '.' || c === '_' || c === '+' || c === '-';
}
// marked's text-stop WIDE email local class (used only to find where a
// text token stops before an email).
function isWideEmailLocal(c) {
  return isEmailLocal(c) || c === '!' || c === '#' || c === '$' || c === '%' || c === '&' || c === "'" || c === '*' || c === '/' || c === '=' || c === '?' || c === '^' || c === '`' || c === '{' || c === '|' || c === '}' || c === '~';
}
function isAlnum(c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'); }

const EXT_URL_Y = /((?:[hH][tT][tT][pP][sS]?|[fF][tT][pP]):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*/y;
const EXT_MAILTO_Y = /(?:mailto:[A-Za-z0-9._+\-]+@[a-zA-Z0-9\-_]+(?:\.[a-zA-Z0-9\-_]*[a-zA-Z0-9])+(?![\w\-])|xmpp:[A-Za-z0-9._+\-]+@[a-zA-Z0-9\-_]+(?:\.[a-zA-Z0-9\-_]*[a-zA-Z0-9])+(?![\w\-])(?:\/[A-Za-z0-9@.]+)?)/y;
const EXT_EMAIL_Y = /[A-Za-z0-9._+\-]+@[a-zA-Z0-9\-_]+(?:\.[a-zA-Z0-9\-_]*[a-zA-Z0-9])+(?![\w\-])/y;
// Case-insensitive prefix test without allocating a lowercased slice.
function startsSchemeAt(s, i, lit) {
  for (let k = 0; k < lit.length; k++) {
    const c = s.charCodeAt(i + k);
    if (c === undefined || (c | 32) !== lit.charCodeAt(k)) return false;
  }
  return true;
}

// Next special character for the plain-text run (global search regex).
const SPECIAL_RE = /[\\`&<>\n\[\]~*_]|!\[/g;
// End of the plain-text run starting at i: the first position where the
// scanner must stop — a special char, or (when not in a link) the start
// of an extended autolink (www., scheme://, mailto:/xmpp:, bare email).
// Equivalent to the old per-character loop, via native scans.
// Autolink trigger positions in one native scan.
const TRIGGER_RE = /www\.|:\/\/|mailto:|xmpp:|@/g;
function textRunEnd(s, i, n, inLink, noTriggers) {
  SPECIAL_RE.lastIndex = i;
  const m = SPECIAL_RE.exec(s);
  let end = m ? m.index : n;
  if (inLink || noTriggers) return end;
  TRIGGER_RE.lastIndex = i;
  let t;
  while ((t = TRIGGER_RE.exec(s)) !== null) {
    const p = t.index, w = t[0];
    if (w === '@') {
      // Bare email — walk back over marked's WIDE local class to its
      // start. The stop is the START, which can lie before the next
      // special char even though the '@' itself is after it (the old
      // per-character loop stopped at the start the same way). The
      // narrow url regex then decides at that position whether it is a
      // link; if not, the safety path peels one char at a time, exactly
      // as marked's text token does. The walk-back never passes the run
      // start: marked's text token always consumes its first chunk
      // before the email lookahead can stop it, so the run ends at
      // least one char in.
      let k = p - 1;
      while (k > i && isWideEmailLocal(s[k])) k--;
      const start = k + 1;
      if (start >= i && start < end) { end = start; break; }
      if (p >= end) break; // a later '@' can only walk back to after this one
      continue;
    }
    if (p >= end) break;
    if (w === 'www.') {
      // marked's wwwStart lookbehind: start, whitespace, *, _, ~, (.
      // Note: `[` is NOT in the set (marked's class is `[^\\s*_~()]`).
      const prev = p > 0 ? s[p - 1] : '';
      if (prev === '' || prev === ' ' || prev === '\t' || prev === '\n' || prev === '*' || prev === '_' || prev === '~' || prev === '(') { end = p; break; }
    } else if (w === '://') {
      let st = -1;
      if (p >= 5 && startsSchemeAt(s, p - 5, 'https')) st = p - 5;
      else if (p >= 4 && startsSchemeAt(s, p - 4, 'http')) st = p - 4;
      else if (p >= 3 && startsSchemeAt(s, p - 3, 'ftp')) st = p - 3;
      if (st >= i) { end = st; break; }
    } else { // mailto: / xmpp:
      const prev = p > 0 ? s[p - 1] : '';
      if (prev === '' || !isAlnum(prev)) { end = p; break; }
    }
  }
  return end;
}

function tryExtAutolink(s, i, inBracket, afterConstruct, firstChunkRunEnd) {
  let m;
  if (s.startsWith('www.', i) || startsSchemeAt(s, i, 'http://') || startsSchemeAt(s, i, 'https://') || startsSchemeAt(s, i, 'ftp://')) {
    EXT_URL_Y.lastIndex = i;
    m = EXT_URL_Y.exec(s);
    if (m) {
      // www. needs the wwwStart lookbehind only when continuing text
      // (prev: start, whitespace, *, _, ~, (. After a construct token
      // marked's url rule has no lookbehind (e.g. `<div>www.example.com`,
      // `` `code`www.example.com ``), so no check there. Schemes have no
      // preceding-character restriction either way.
      if (m[1] === 'www.' && !afterConstruct && i > 0) {
        const prev = s[i - 1];
        // The lookbehind set is start/ws/*/_/~/ ( — `[` is NOT in it:
        // marked's class is `[^\\s*_~()]`).
        if (!(prev === ' ' || prev === '\t' || prev === '\n' || prev === '*' || prev === '_' || prev === '~' || prev === '(')) {
          // ...unless the text token stopped here for another reason:
          // marked's text regex also stops before a wide-email start
          // (`(?=[wide]+@)`), so a `www.` followed by wide chars and
          // `@` (e.g. `www.example.com@mailto:a@b.com`) still links —
          // the url rule itself has no lookbehind.
          let j = i;
          while (j < s.length && isWideEmailLocal(s[j])) j++;
          if (!(j > i && s[j] === '@')) return null;
        }
      }
      // Inside a link label, marked tokenizes the label text separately,
      // so the URL cannot run past the label's closing `]` (doc-06).
      let raw = m[0];
      if (inBracket) {
        let k = 0;
        while (k < raw.length) {
          if (raw[k] === '\\' && k + 1 < raw.length) { k += 2; continue; }
          if (raw[k] === ']') { raw = raw.slice(0, k); break; }
          k++;
        }
      }
      const t = backpedal(raw);
      if (!t) return null;
      const href = cleanUrl(m[1] === 'www.' ? 'http://' + t : t);
      if (href === null) return null;
      return { k: 4, href, title: null, kids: [{ k: 0, s: t, raw: false }], img: false, auto: 'ext', disp: t, end: i + t.length };
    }
    return null;
  }
  if (s.startsWith('mailto:', i) || s.startsWith('xmpp:', i)) {
    // mailto:/xmpp: need a non-alphanumeric char before them when
    // continuing text (marked's text tokenizer only stops at
    // [^a-zA-Z0-9](?=emailProtocol)); after a construct there is no check.
    // Right after a `+ / ~+ first-chunk run the protocol form never
    // links (the text token already swallowed it; only the bare email
    // links), so block it there too.
    if (i === firstChunkRunEnd) return null;
    if (!afterConstruct && i > 0) {
      const p = s[i - 1];
      if ((p >= 'a' && p <= 'z') || (p >= 'A' && p <= 'Z') || (p >= '0' && p <= '9')) return null;
    }
    EXT_MAILTO_Y.lastIndex = i;
    m = EXT_MAILTO_Y.exec(s);
    if (m) {
      const t = m[0];
      const href = cleanUrl(t);
      if (href === null) return null;
      return { k: 4, href, title: null, kids: [{ k: 0, s: t, raw: false }], img: false, auto: 'ext', disp: t, end: i + t.length };
    }
    return null;
  }
  // bare email: only attempt if a '@' follows within the local-part chars
  let j = i;
  while (j < s.length) {
    const c = s[j];
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '.' || c === '_' || c === '+' || c === '-') { j++; continue; }
    break;
  }
  if (j < s.length && s[j] === '@') {
    EXT_EMAIL_Y.lastIndex = i;
    m = EXT_EMAIL_Y.exec(s);
    if (m) {
      // The preceding char must not be in marked's url-rule email local
      // class [A-Za-z0-9._+-] when continuing text (narrower than the
      // text-stop wide class: a backtick before an email does not block
      // it, e.g. `a@b.com). After a construct (e.g. `\\.foo@bar.com`)
      // there is no check.
      if (!afterConstruct && i > 0 && isEmailLocal(s[i - 1])) return null;
      const t = backpedal(m[0]);
      if (!t) return null;
      const href = cleanUrl('mailto:' + t);
      if (href === null) return null;
      return { k: 4, href, title: null, kids: [{ k: 0, s: t, raw: false }], img: false, auto: 'ext', disp: t, end: i + t.length };
    }
  }
  return null;
}

// marked's _backpedal: repeatedly strip trailing punctuation / unbalanced
// parens / entity-like tails until stable.
const BACKPEDAL_RE = /(?:[^?!.,:;*_'\"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'\"~)]+(?!$))+/;
function backpedal(t) {
  let prev;
  do { prev = t; const m = BACKPEDAL_RE.exec(t); t = m ? m[0] : ''; } while (t !== prev);
  return t;
}

// Strikethrough: marked's del. At s[i] a run of `run` (1-2) tildes.
// Opener: next char is punctuation (not ~) or non-space non-~. Then scan
// forward for a closer run of exactly `run` tildes, counting nested opener
// runs; the match closes when the count reaches zero. The scan runs over
// the masked text `t` (same length as s); content is sliced from raw s.
function tryDel(s, i, run, refs, st, t, prevChar) {
  const n = s.length;
  const nx = s[i + run];
  if (nx === undefined || isSpace(nx) || nx === '~') return null;
  // marked's del-opener guard: the opener is invalid when the char
  // after it is punctuation AND there is a previous char AND that
  // previous char is not punctuation-or-space (with `*` and `_`
  // excluded — they are the emphasis delimiters, and a text token
  // ending in `_` does not update marked's previous-char `r`).
  // `prevChar` is that `r` ('' after a construct / at the start).
  if (prevChar !== undefined && isPunct(nx) && prevChar !== '' && !(isSpace(prevChar) || (isPunct(prevChar) && prevChar !== '*' && prevChar !== '_'))) return null;
  let p = run;
  let j = i + run;
  while (j < n) {
    if (t[j] === '~') {
      let e = j;
      while (e < n && t[e] === '~') e++;
      const len = e - j;
      if (len === run) {
        const prev = j > 0 ? t[j - 1] : '';
        const next = e < n ? t[e] : '';
        const cls = classifyTilde(prev, next);
        if (cls === 1) { p += run; j = e; continue; }
        if (cls === -1) {
          p -= run;
          if (p <= 0) {
            const content = s.slice(i + run, j);
            const kids = scanInline(content, refs, st);
            return { k: 6, kids, end: e };
          }
          j = e; continue;
        }
      }
      j = e; continue;
    }
    j++;
  }
  return null;
}

// Classify a ~ run by its flanking chars (marked's delRDelim alternatives).
// 1 = opener-type, -1 = closer-type, 0 = neither.
function classifyTilde(prev, next) {
  const prevP = isPunct(prev), nextP = isPunct(next);
  const prevS = prev === '' ? false : isSpace(prev);
  const nextS = next === '' ? false : isSpace(next);
  const prevEnd = prev === '';
  const nextEnd = next === '';
  // closer: prev punct, next space/end
  if (prevP && (nextS || nextEnd)) return -1;
  // closer: prev non-punct non-space, next punct/space/end
  if (!prevP && !prevS && !prevEnd && (nextP || nextS || nextEnd)) return -1;
  // closer: prev punct, next punct
  if (prevP && nextP) return -1;
  // closer: prev non-punct non-space, next non-punct non-space
  // (marked's delRDelim group 6 — e.g. `~~x~~www.example.com`, where the
  // closer is followed by a letter and must still close).
  if (!prevP && !prevS && !prevEnd && !nextP && !nextS && !nextEnd) return -1;
  // opener: prev punct/space, next non-punct non-space
  if ((prevP || prevS || prevEnd) && !nextP && !nextS && !nextEnd) return 1;
  // opener: prev space, next punct
  if (prevS && nextP) return 1;
  return 0;
}

// Plain-text rendering of nodes (for image alt text).
function plainNodes(nodes) {
  let out = '';
  for (const nd of nodes) {
    if (nd.k === 0) out += nd.raw ? nd.s : esc(nd.s, false, nd.numPos, nd.escPos);
    else if (nd.k === 1) out += esc(nd.s, true);
    else if (nd.k === 2) out += '';
    else if (nd.k === 4) out += plainNodes(nd.kids);
    else if (nd.k === 5) out += nd.s;
    else if (nd.k === 6 || nd.k === 7) out += plainNodes(nd.kids);
    else if (nd.k === 8) out += nd.s;
  }
  return out;
}

function renderNodes(nodes) {
  let out = '';
  for (const nd of nodes) out += renderNode(nd);
  return out;
}

function renderNode(nd) {
  switch (nd.k) {
    case 0: return nd.raw ? nd.s : esc(nd.s, false, nd.numPos, nd.escPos);
    case 1: return '<code>' + esc(nd.s, true) + '</code>';
    case 2: return '<br>';
    case 5: return nd.s;
    case 6: return '<del>' + renderNodes(nd.kids) + '</del>';
    case 7: return nd.tag === 'strong' ? '<strong>' + renderNodes(nd.kids) + '</strong>' : '<em>' + renderNodes(nd.kids) + '</em>';
    case 8: return nd.s;
    case 4: {
      if (nd.img) {
        const alt = plainNodes(nd.kids);
        let o = '<img src="' + esc(nd.href, false) + '" alt="' + esc(alt, false) + '"';
        // plainNodes already escaped text; esc(false) keeps valid entities.
        // But alt from plainNodes contains &quot; etc already; esc(false) is safe.
        if (nd.title !== null && nd.title !== undefined) o += ' title="' + esc(nd.title, false) + '"';
        return o + '>';
      }
      const inner = nd.auto ? esc(nd.disp, true) : renderNodes(nd.kids);
      let o = '<a href="' + esc(nd.href, nd.auto ? true : false) + '"';
      if (nd.title !== null && nd.title !== undefined) o += ' title="' + esc(nd.title, false) + '"';
      return o + '>' + inner + '</a>';
    }
  }
  return '';
}

// Render inline markdown to HTML (fresh state per call for inLink/inRawBlock
// is wrong: marked shares state across a document, so callers pass st).
export function inlineHtml(s, refs, st) {
  const nodes = scanInline(s, refs, st || { inLink: false, inRawBlock: false });
  return renderNodes(nodes);
}

// ---- Block parsing ----

// Columns of leading whitespace (space=1, tab=to next multiple of 4).
function colIndent(line) {
  let col = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === ' ') col++;
    else if (c === '\t') col += 4 - (col % 4);
    else break;
  }
  return col;
}
function isBlank(line) {
  if (line.length === 0) return true;
  if (line[0] !== ' ' && line[0] !== '\t') return false;
  for (let i = 1; i < line.length; i++) {
    const c = line[i];
    if (c !== ' ' && c !== '\t') return false;
  }
  return true;
}
// Remove n columns from the start of a line (space=1 col, tab=to next
// multiple of 4, any other char=1 col; a partially-consumed tab is expanded
// to spaces).
function stripCols(line, n) {
  let col = 0, i = 0;
  while (col < n && i < line.length) {
    const c = line[i];
    if (c === ' ') { col++; i++; }
    else if (c === '\t') {
      const w = 4 - (col % 4);
      if (col + w <= n) { col += w; i++; }
      else {
        const rem = col + w - n;
        return ' '.repeat(rem) + line.slice(i + 1);
      }
    } else { col++; i++; }
  }
  return line.slice(i);
}
// Like stripCols, but the remaining leading whitespace is expanded to
// spaces using the ORIGINAL columns (a tab's width depends on its column
// in the original line). Used when stripping a container prefix (quote /
// list item) from a line that will be re-parsed for block structure: a
// later indent computation on the stripped line must see the same columns
// cmark's partial-tab tracking sees.
function stripColsExpand(line, n) {
  let col = 0, i = 0, out = '';
  while (col < n && i < line.length) {
    const c = line[i];
    if (c === ' ') { col++; i++; }
    else if (c === '\t') {
      const w = 4 - (col % 4);
      if (col + w <= n) { col += w; i++; }
      // Partial tab: the columns past the strip point stay as spaces,
      // and the next char's ORIGINAL column is the tab's end column
      // (col + w), so later tabs expand from their true positions.
      else { out += ' '.repeat(col + w - n); col = col + w; i++; break; }
    } else { col++; i++; }
  }
  while (i < line.length) {
    const c = line[i];
    if (c === ' ') { out += ' '; col++; i++; }
    else if (c === '\t') { const w = 4 - (col % 4); out += ' '.repeat(w); col += w; i++; }
    else break;
  }
  return out + line.slice(i);
}
function stripUpTo3(line) {
  const ind = colIndent(line);
  return stripCols(line, Math.min(ind, 3));
}

const BLOCK_TAGS = new Set(('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem meta nav noframes ol optgroup option p param search section source summary table tbody td tfoot th thead title tr track ul').split(' '));
const HTML_OPEN_RE = /^<\/?([a-zA-Z][a-zA-Z0-9\-]*)/;

// Classify an HTML block start on a stripped line. Returns {type, end, follow}
// or null. Types 1-6 (can interrupt a paragraph), 7 (cannot). `follow` is
// the character after the tag name ('' at end of line), used by the
// paragraph-interruption rule. `terminated` says whether this line was
// newline-terminated in the source (a newline counts as the whitespace
// after a <pre>/<script>/... tag). Mirrors marked's Ue / Pe regexes.
const HTML_END_CACHE = new Map();
function htmlBlockStart(line, terminated) {
  const testLine = terminated === false ? line : line + '\n';
  let m = /^<(pre|script|style|textarea)([\s>])/i.exec(testLine);
  if (m) {
    const tag = m[1].toLowerCase();
    let end = HTML_END_CACHE.get(tag);
    if (!end) { end = new RegExp('</' + tag + '[\\s>]', 'i'); HTML_END_CACHE.set(tag, end); }
    return { type: 1, end, follow: m[2] };
  }
  if (line.startsWith('<!--')) return { type: 2, end: /-->/, follow: '' };
  if (line.startsWith('<?')) return { type: 3, end: /\?>/, follow: '' };
  if (/^<![A-Z]/.test(line)) return { type: 4, end: />/, follow: '' };
  if (line.startsWith('<![CDATA[')) return { type: 5, end: /\]\]>/, follow: '' };
  m = HTML_OPEN_RE.exec(line);
  if (m) {
    const tag = m[1].toLowerCase();
    const follow = line[m[0].length] || '';
    if (BLOCK_TAGS.has(tag) && (follow === ' ' || follow === '\t' || follow === '/' || follow === '>' || follow === '')) {
      return { type: 6, end: null, follow };
    }
    // Type 7: a complete open or close tag alone on the line, with
    // marked's strict attribute grammar (an attribute name must be
    // [a-zA-Z:_][\w.:-]*, values quoted or unquoted without spaces,
    // attributes separated by spaces; a close tag takes no attributes).
    // `<a h*#ref="hi">`, `</a href="foo">`, `<a href="\"">` fail.
    if (/^<\/[a-zA-Z][a-zA-Z0-9\-]*[ \t]*>[ \t]*$/.test(line)) return { type: 7, end: null, follow };
    if (/^<[a-zA-Z][a-zA-Z0-9\-]*(?: +[a-zA-Z:_][\w.:-]*(?: *= *"[^"]*"| *= *'[^']*'| *= *[^\s"'=<>`]+)?)* *\/?>[ \t]*$/.test(line)) return { type: 7, end: null, follow };
  }
  return null;
}

function atxHeading(line) {
  const m = /^(#{1,6})(?:[ \t]+(.*))?$/.exec(line);
  if (!m) return null;
  let text = m[2] === undefined ? '' : m[2];
  text = text.replace(/[ \t]+$/, '');
  if (/^#+$/.test(text)) text = '';
  else {
    const cm = /^(.*)[ \t]+#+$/.exec(text);
    if (cm) text = cm[1].replace(/[ \t]+$/, '');
  }
  text = text.replace(/^[ \t]+/, '');
  return { t: 'h', level: m[1].length, text };
}

function fenceStart(line) {
  const m = /^(```+|~~~+)[ \t]*(.*)$/.exec(line);
  if (!m) return null;
  const fence = m[1], ch = fence[0];
  let info = m[2].replace(/[ \t]+$/, '');
  if (ch === '`' && info.includes('`')) return null;
  return { ch, len: fence.length, info };
}
const FENCE_END_CACHE = new Map();
function fenceEnd(line, ch, len) {
  const key = ch + len;
  let re = FENCE_END_CACHE.get(key);
  if (!re) {
    re = ch === '`' ? new RegExp('^`{' + len + ',}[ \\t]*$') : new RegExp('^~{' + len + ',}[ \\t]*$');
    FENCE_END_CACHE.set(key, re);
  }
  return re.test(line);
}
function isHr(line) {
  return /^(?:\*[ \t]*){3,}$/.test(line) || /^(?:-[ \t]*){3,}$/.test(line) || /^(?:_[ \t]*){3,}$/.test(line);
}
function isSetext(line) {
  if (/^=+[ \t]*$/.test(line)) return 1;
  if (/^-+[ \t]*$/.test(line)) return 2;
  return 0;
}

// Split a table row line into cells (unescaped pipes), dropping a leading /
// trailing empty cell.
function splitRow(line) {
  const cells = [];
  let cur = '', bs = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\') { cur += c; bs++; continue; }
    if (c === '|') {
      if (bs % 2 === 0) { cells.push(cur); cur = ''; bs = 0; continue; }
      // Escaped pipe: the backslash is dropped (marked's table cell
      // splitter replaces `\|` with `|` before inline parsing).
      cur = cur.slice(0, -1) + '|'; bs = 0; continue;
    }
    cur += c; bs = 0;
  }
  cells.push(cur);
  if (cells.length && cells[0].trim() === '') cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((c) => c.trim());
}
function parseDelimiter(line) {
  const cells = splitRow(line);
  if (!cells.length) return null;
  const aligns = [];
  for (const c of cells) {
    if (!/^:?-+:?$/.test(c)) return null;
    const left = c[0] === ':', right = c[c.length - 1] === ':';
    aligns.push(left && right ? 'center' : left ? 'left' : right ? 'right' : null);
  }
  return aligns;
}

// Link reference definition parsing over a paragraph's joined text.
function parseRefDef(text, pos, refs) {
  const n = text.length;
  let p = pos;
  if (text[p] !== '[') return null;
  let q = p + 1, label = '', closed = false;
  while (q < n) {
    const c = text[q];
    if (c === '\\' && q + 1 < n) { label += text[q + 1]; q += 2; continue; }
    // marked's def label (le) allows no unescaped '[' or ']'
    if (c === '[') return null;
    if (c === ']') { closed = true; break; }
    label += c; q++;
  }
  if (!closed) return null;
  const rawLabel = text.slice(p + 1, q);
  if (rawLabel.trim() === '') return null;
  q++;
  let r = q;
  while (r < n && (text[r] === ' ' || text[r] === '\t')) r++;
  if (text[r] !== ':') return null;
  r++;
  while (r < n && (text[r] === ' ' || text[r] === '\t' || text[r] === '\n')) r++;
  if (r >= n) return null;
  let href = null;
  if (text[r] === '<') {
    let s2 = r + 1, dest = '', ok = false;
    while (s2 < n) {
      const c = text[s2];
      if (c === '\n' || c === '<') break;
      if (c === '>') { ok = true; break; }
      if (c === '\\' && s2 + 1 < n && isAsciiPunct(text[s2 + 1])) { dest += text[s2 + 1]; s2 += 2; continue; }
      dest += c; s2++;
    }
    if (!ok) return null;
    href = dest; r = s2 + 1;
  } else {
    let s2 = r, dest = '', depth2 = 0, badParen = false;
    while (s2 < n) {
      const c = text[s2];
      if (c === ' ' || c === '\t' || c === '\n') break;
      if (c === '\\' && s2 + 1 < n && isAsciiPunct(text[s2 + 1])) { dest += text[s2 + 1]; s2 += 2; continue; }
      if (c === '(') depth2++;
      if (c === ')') { if (depth2 === 0) { badParen = true; break; } depth2--; }
      dest += c; s2++;
    }
    // A bare destination with unbalanced parens is rejected (marked's
    // def tokenizer runs ke(dest, "()") and drops the def).
    if (dest === '' || badParen || depth2 !== 0) return null;
    href = dest; r = s2;
  }
  const clean = cleanUrl(href);
  if (clean === null) return null;
  // Title (marked's Fe): after the dest, a title needs at least one
  // space/tab, or a newline (with indent), before it; after the title
  // only spaces/tabs may follow on its line. If the title is missing
  // or invalid, the def stands only when the remainder after the dest
  // is empty (cm-210); junk after the dest on the same line kills the
  // whole def (cm-209), and no whitespace before the title does too
  // (cm-201: `<bar>(baz)`).
  let title = null;
  let end = r;
  let t2 = r, sawSep = false;
  while (t2 < n && (text[t2] === ' ' || text[t2] === '\t')) { t2++; sawSep = true; }
  if (t2 < n && text[t2] === '\n') {
    let t3 = t2 + 1;
    while (t3 < n && (text[t3] === ' ' || text[t3] === '\t')) t3++;
    if (t3 < n && (text[t3] === '"' || text[t3] === "'" || text[t3] === '(')) {
      const t = parseTitle(text, t3);
      if (t) {
        let e = t.end;
        while (e < n && (text[e] === ' ' || text[e] === '\t')) e++;
        if (e >= n || text[e] === '\n') { title = t.title; end = e; }
      }
    }
    if (title === null) {
      // No usable title on the next line: the def ends after the dest.
      let e = r;
      while (e < n && (text[e] === ' ' || text[e] === '\t')) e++;
      if (e >= n || text[e] === '\n') end = e; else return null;
    }
  } else if (sawSep && t2 < n && (text[t2] === '"' || text[t2] === "'" || text[t2] === '(')) {
    const t = parseTitle(text, t2);
    if (t) {
      let e = t.end;
      while (e < n && (text[e] === ' ' || text[e] === '\t')) e++;
      if (e >= n || text[e] === '\n') { title = t.title; end = e; }
      else return null;
    } else return null;
  } else {
    let e = r;
    while (e < n && (text[e] === ' ' || text[e] === '\t')) e++;
    if (e >= n || text[e] === '\n') end = e; else return null;
  }
  const key = normLabel(rawLabel);
  if (!(key in refs)) refs[key] = { href: clean, title };
  return { end };
}

// Strip leading link reference definitions from a paragraph's lines.
// Returns the remaining inline text (or '' if the paragraph was only defs).
function stripRefDefs(lines, refs) {
  const text = lines.join('\n');
  let pos = 0;
  const n = text.length;
  let any = false;
  for (;;) {
    let p = pos;
    while (p < n && (text[p] === ' ' || text[p] === '\t')) p++;
    let d = parseRefDef(text, p, refs);
    if (d) { any = true; pos = d.end; continue; }
    if (p < n && text[p] === '\n') {
      let p2 = p + 1;
      while (p2 < n && (text[p2] === ' ' || text[p2] === '\t')) p2++;
      d = parseRefDef(text, p2, refs);
      if (d) { any = true; pos = d.end; continue; }
    }
    break;
  }
  if (!any) return text;
  let rest = text.slice(pos);
  if (rest[0] === '\n') rest = rest.slice(1);
  else rest = rest.replace(/^[ \t]+/, '');
  return rest;
}

// ---- List / quote line collection ----

function listMarker(line) {
  const m = /^(\d{1,9})([.)])([ \t]+|$)(.*)$/.exec(line);
  if (m) return finishMarker(line, true, parseInt(m[1], 10), m[2], m[1].length + 1, m[3], m[4]);
  const b = /^([*+-])([ \t]+|$)(.*)$/.exec(line);
  if (b) return finishMarker(line, false, 0, b[1], 1, b[2], b[3]);
  return null;
}
function finishMarker(line, ordered, num, delim, markerLen, spaces, rest) {
  const indentCols = colIndent(line);
  let col = indentCols + markerLen;
  let spCols = 0, i = 0;
  while (i < spaces.length) {
    const c = spaces[i];
    if (c === ' ') { spCols++; i++; }
    else { spCols += 4 - ((col + spCols) % 4); i++; }
  }
  let contentIndent;
  if (rest === '' && spaces.trim() === '') {
    contentIndent = indentCols + markerLen + 1;
    return { ordered, num, delim, markerLen, contentIndent, content: '', blankItem: true, indentCols };
  }
  if (spCols >= 1 && spCols <= 4) contentIndent = col + spCols;
  else contentIndent = col + 1;
  return { ordered, num, delim, markerLen, contentIndent, content: rest, blankItem: false, indentCols };
}
function isListMarkerLine(line) {
  if (colIndent(line) > 3) return null;
  const stripped = stripUpTo3(line);
  return listMarker(stripped);
}

// Can this line be a table body row? Mirrors marked's table regex body
// exclusion: (?! *\n|hr|heading|blockquote|code|fences|list|html).
// A spaces-only line ends the body, but a tab-only line IS a body row
// (the ` *\n` exclusion matches spaces only, and the `code` exclusion
// needs a non-newline char after the indent). A plain paragraph line
// is a body row; only a line that starts a block ends the body.
function tableRowContinues(line) {
  if (/^ *$/.test(line)) return false;
  if (/^[ \t]*$/.test(line)) return true;
  if (colIndent(line) >= 4) return false;
  const s = stripUpTo3(line);
  const c0 = s[0];
  if ((c0 === '*' || c0 === '-' || c0 === '_') && isHr(s)) return false;
  if (c0 === '#' && atxHeading(s)) return false;
  if (c0 === '>') return false;
  if ((c0 === '`' || c0 === '~') && fenceStart(s)) return false;
  const lm = (c0 === '*' || c0 === '+' || c0 === '-' || (c0 >= '0' && c0 <= '9')) ? listMarker(s) : null;
  if (lm && !lm.blankItem) {
    if (!lm.ordered) return false;
    if (lm.num === 1) return false;
  }
  const hb = c0 === '<' ? htmlBlockStart(s, true) : null;
  if (hb) {
    if (hb.type <= 5) return false;
    if (hb.type === 6 && (hb.follow === ' ' || hb.follow === '' || hb.follow === '/' || hb.follow === '>')) return false;
  }
  return true;
}

// Does this stripped line start a block that can interrupt a paragraph?
// inItem: inside a list item's lines, ANY ordered list marker interrupts
// (marked's list tokenizer breaks the item's text at a nextBullet line,
// so the marker is lexed fresh as a nested list); at the top level and
// inside a quote only `1.` interrupts an ordered list.
function interruptsPara(stripped, terminated, inItem) {
  // First-character dispatch: most paragraph lines start with a letter
  // or digit that can never start an interrupting block.
  const c0 = stripped[0];
  if (c0 === '#') return !!atxHeading(stripped);
  if (c0 === '`' || c0 === '~') return !!fenceStart(stripped);
  if (c0 === '<') {
    const hb = htmlBlockStart(stripped, terminated);
    if (hb) {
      if (hb.type <= 5) return true;
      if (hb.type === 6) {
        if (hb.follow === ' ' || hb.follow === '' || hb.follow === '/' || hb.follow === '>') return true;
      }
    }
    return false;
  }
  if (c0 === '>') return true;
  if (c0 === '*' || c0 === '-' || c0 === '_') {
    if (isHr(stripped)) return true;
    const lm = isListMarkerLine(stripped);
    if (lm && !lm.blankItem) return true;
    return false;
  }
  if (c0 === '+' || (c0 >= '0' && c0 <= '9')) {
    const lm = isListMarkerLine(stripped);
    if (lm && !lm.blankItem) {
      if (!lm.ordered) return true;
      if (inItem || lm.num === 1) return true;
    }
    return false;
  }
  return false;
}
function paraLineContinues(line, terminated, inItem) {
  const s = stripUpTo3(line);
  if (isBlank(line)) return false;
  if (interruptsPara(s, terminated, inItem)) return false;
  return true;
}

// The innermost rest of a quote line: strip leading '>' markers and
// list markers until the line no longer starts with one. Used to decide
// whether a quote line leaves a paragraph open (e.g. `1. > Blockquote`
// leaves the inner quote's paragraph open, so a lazy line joins it).
function quoteInnerRest(line) {
  let cur = line;
  for (;;) {
    const ind = colIndent(cur);
    if (ind > 3) break;
    const s = stripCols(cur, ind);
    if (s.startsWith('>')) {
      const after = cur[ind + 1];
      cur = stripColsExpand(cur, ind + 1 + ((after === ' ' || after === '\t') ? 1 : 0));
      continue;
    }
    const lm = listMarker(s);
    if (lm && !isHr(s)) {
      cur = stripColsExpand(cur, ind + lm.contentIndent);
      continue;
    }
    break;
  }
  return cur;
}

// Collect a blockquote starting at lines[i]. Returns {blocks, next}.
// trailingNL: whether the last line of this line array was newline-terminated
// in the source (needed for HTML block trailing newlines).
function collectQuote(lines, i, end, refs, st, trailingNL) {
  const sub = [];
  let j = i;
  let paraOpen = false;
  // Whether the last line pushed to sub was a '>' line. A lazy line
  // directly after a '>' line is a new chunk in marked: if it is
  // indented 4+, it is lexed as indented code and merged into the open
  // paragraph with 4 columns stripped. A lazy line after another lazy
  // line is in the same chunk and keeps its spaces.
  let lastWasQuote = false;
  // An open fenced code block at the top level of this quote's text.
  // A lazy line never crosses a chunk boundary, so it cannot be
  // absorbed into an open fence: the fence ends unterminated and the
  // lazy line starts a new chunk (doc-01).
  let fenceOpen = null;
  while (j < end) {
    const line = lines[j];
    const ind = colIndent(line);
    if (ind <= 3) {
      const s = stripCols(line, ind);
      if (s.startsWith('>')) {
        const gtCol = ind;
        // strip '>' plus one following space column (a tab is partially
        // consumed), expanding remaining leading tabs by original columns
        const after = line[gtCol + 1];
        const rest = stripColsExpand(line, gtCol + 1 + ((after === ' ' || after === '\t') ? 1 : 0));
        sub.push(rest);
        const wasParaOpen = paraOpen;
        // A paragraph is open when the innermost rest is a paragraph
        // line (not an indented-code line).
        const inner = quoteInnerRest(rest);
        paraOpen = colIndent(inner) < 4 && paraLineContinues(inner, j < end - 1 || !!trailingNL);
        // Track a top-level fence: a fence start line opens one (a
        // fence interrupts a paragraph, so it opens even when one is
        // open); a matching fence end closes it.
        if (fenceOpen) {
          if (fenceEnd(rest, fenceOpen.ch, fenceOpen.len)) fenceOpen = null;
        } else {
          const fs = fenceStart(rest);
          if (fs) fenceOpen = fs;
        }
        lastWasQuote = true;
        j++;
        continue;
      }
    }
    if (isBlank(line)) break;
    // A lazy line cannot be absorbed into an open fence: the fence
    // ends unterminated at the chunk boundary.
    if (fenceOpen) break;
    // A 4+-indented line cannot interrupt a paragraph: it is a lazy
    // continuation (indented-code absorption strips 4 columns).
    if (paraOpen && (colIndent(line) >= 4 || !interruptsPara(stripUpTo3(line), j < end - 1 || !!trailingNL))) {
      // Lazy continuation: a line indented 4+ is absorbed as indented
      // code (4 columns stripped); a less-indented line joins as-is.
      // Exception: a lazy setext underline (a run of `=` or `-` with at
      // most 3 spaces of indent) is indented by 4 spaces, so it is
      // absorbed into the paragraph instead of making a heading
      // (marked's blockquoteSetextReplace).
      const li = colIndent(line);
      if (lastWasQuote && li >= 4) {
        // First lazy line of a new chunk: the code merge appends the
        // stripped line to the open paragraph's text (it must not be
        // re-read as a block start, e.g. `- bar` is not a list item).
        sub[sub.length - 1] = sub[sub.length - 1] + '\n' + stripColsExpand(line, 4);
        paraOpen = true;
        lastWasQuote = false;
        j++;
        continue;
      }
      let rest = li >= 4 ? stripColsExpand(line, 4) : line;
      const sm = /^ {0,3}((?:=+|-+)[ \t]*)$/.exec(line);
      if (sm && li < 4) rest = '    ' + sm[1];
      sub.push(rest);
      paraOpen = true;
      lastWasQuote = false;
      j++;
      continue;
    }
    break;
  }
  // marked lexes a container's text after stripping its trailing newlines,
  // so an HTML block at the end of it never carries a trailing '\n'.
  const blocks = parseBlocks(sub, 0, sub.length, refs, st, false).blocks;
  return { blocks, next: j };
}

// Collect a list starting at lines[i]. Returns {block, next}.
function collectList(lines, i, end, refs, st, trailingNL) {
  const baseIndent = colIndent(lines[i]);
  const first = listMarker(stripUpTo3(lines[i]));
  first.contentIndent += baseIndent;
  const ordered = first.ordered;
  const delim = first.delim;
  const markerIndent = baseIndent;
  const items = [];
  let loose = false;
  let j = i;
  let cur = null;
  // A blank line after a finished (empty) item still makes the list
  // loose when a later item follows (cm-315).
  let blankAfterItem = false;
  // Index of the first blank line in the current trailing run of blank
  // lines (used to rewind `next` so the caller sees a blank line that
  // separates this list from the following block).
  let trailBlank = -1;
  // Whether the last line pushed to the current item was a lazy line
  // (a lazy line directly after a content line is a new chunk: an
  // indented lazy line is code-merged into the paragraph).
  let lastWasLazy = false;
  function finishItem() {
    if (!cur) return;
    while (cur.lines.length && cur.lines[cur.lines.length - 1] === '') cur.lines.pop();
    items.push(cur);
    cur = null;
  }
  let firstItem = true;
  while (j < end) {
    const line = lines[j];
    if (isBlank(line)) {
      // An empty item followed by a blank line is finished as empty,
      // but the list continues: a later marker line still starts a new
      // item of this list (cm-315). A non-marker line ends the list
      // (cm-280). The blank line is remembered for looseness.
      if (cur && !cur.sawContent) { finishItem(); blankAfterItem = true; trailBlank = j; j++; continue; }
      if (cur) { cur.lines.push(''); cur.blankAfter = true; cur.paraOpen = false; lastWasLazy = false; if (trailBlank < 0) trailBlank = j; }
      j++;
      continue;
    }
    const ind = colIndent(line);
    const stripped = ind <= 3 ? stripCols(line, ind) : line;
    // A marker line starts a new item of this list when it is indented
    // less than the current item's content indent and at most 3 columns
    // past the list's first marker; a marker of a different kind (bullet
    // vs ordered, or a different ordered delimiter) ends the list.
    if (ind - markerIndent <= 3 && (!cur || ind < cur.marker.contentIndent)) {
      const lm = listMarker(stripped);
      if (lm && !isHr(stripped)) {
        if (lm.ordered === ordered && lm.delim === delim) {
          lm.contentIndent += ind;
          if (!firstItem && ((cur && cur.blankAfter) || blankAfterItem)) loose = true;
          blankAfterItem = false;
          trailBlank = -1;
          lastWasLazy = false;
          finishItem();
          cur = { lines: [], blankInside: false, sawContent: false, blankAfter: false, marker: lm, paraOpen: false, lastOuter: j };
          if (!lm.blankItem) {
            const firstContent = stripColsExpand(line, lm.contentIndent);
            cur.lines.push(firstContent);
            cur.sawContent = true;
            // A paragraph is open when the innermost rest is a paragraph
            // line (e.g. `> Blockquote` leaves the inner quote open).
            const inner = quoteInnerRest(firstContent);
            cur.paraOpen = colIndent(inner) < 4 && paraLineContinues(inner, j < end - 1 || !!trailingNL);
          }
          firstItem = false;
          j++;
          continue;
        }
        break;
      }
    }
    if (!cur) break;
    const contentIndent = cur.marker.contentIndent;
    if (ind >= contentIndent) {
      const sub = stripColsExpand(line, contentIndent);
      if (cur.blankAfter && cur.sawContent) cur.blankInside = true;
      cur.blankAfter = false;
      cur.lines.push(sub);
      cur.lastOuter = j;
      cur.sawContent = true;
      const inner = quoteInnerRest(sub);
      cur.paraOpen = colIndent(inner) < 4 && paraLineContinues(inner, j < end - 1 || !!trailingNL);
      trailBlank = -1;
      lastWasLazy = false;
      j++;
      continue;
    }
    if (cur.paraOpen && colIndent(line) <= 3 && !interruptsPara(stripUpTo3(line), j < end - 1 || !!trailingNL) && !listMarker(stripUpTo3(line))) {
      // Lazy continuation: marked appends the raw line unchanged, so a
      // leading space is kept in the paragraph (doc-17: ` | not |...`
      // keeps its space). Exception: a lazy setext underline is indented
      // by 4 spaces so it does not form a heading (marked's qe rule).
      let lazyLine = line;
      if (isSetext(stripUpTo3(line)) && cur.lines.length && cur.lines[cur.lines.length - 1].trim() !== '') {
        lazyLine = '    ' + line.replace(/^ {0,3}/, '');
      }
      cur.lines.push(lazyLine);
      cur.lastOuter = j;
      cur.sawContent = true;
      cur.paraOpen = paraLineContinues(line, j < end - 1 || !!trailingNL);
      trailBlank = -1;
      lastWasLazy = true;
      j++;
      continue;
    }
    if (cur.paraOpen && colIndent(line) >= 4) {
      // A 4+-indented line cannot interrupt a paragraph: it is a lazy
      // continuation. When it is the first lazy line after a content
      // line it is a new chunk, so it is lexed as indented code and
      // merged into the paragraph with 4 columns stripped (cm-312);
      // a later lazy line in the same chunk keeps its spaces.
      const strippedLine = stripColsExpand(line, 4);
      if (!lastWasLazy && cur.lines.length) {
        cur.lines[cur.lines.length - 1] = cur.lines[cur.lines.length - 1] + '\n' + strippedLine;
      } else {
        cur.lines.push(strippedLine);
      }
      cur.lastOuter = j;
      cur.sawContent = true;
      cur.paraOpen = true;
      trailBlank = -1;
      lastWasLazy = true;
      j++;
      continue;
    }
    break;
  }
  finishItem();
  // Rewind past the trailing blank lines so the caller sees the blank
  // line that separates this list from the following block (cm-325:
  // the blank line between a nested list and the next paragraph makes
  // the outer list loose).
  const next = trailBlank >= 0 ? trailBlank : j;
  const parsedItems = items.map((it) => {
    const parsed = parseBlocks(it.lines, 0, it.lines.length, refs, st, false, true);
    // A list is loose when an item directly contains two blocks
    // separated by a blank line (blank lines inside a nested
    // container do not count).
    if (parsed.blankBetween) loose = true;
    return { blocks: parsed.blocks };
  });
  const listBlock = {
    t: 'list', ordered, start: ordered ? first.num : 0, tight: !loose,
    items: parsedItems,
  };
  return { block: listBlock, next };
}

// Main block parser over an array of lines. trailingNL: whether the last
// line of this array was newline-terminated in the source.
export function parseBlocks(lines, start, end, refs, st, trailingNL, inItem) {
  const blocks = [];
  let blankBetween = false;
  let pendingBlank = false;
  let i = start;
  let para = null;
  function flushPara() {
    if (!para) return;
    const text = stripRefDefs(para, refs);
    if (text !== '') blocks.push({ t: 'para', text });
    para = null;
  }
  while (i < end) {
    const line = lines[i];
    if (isBlank(line)) {
      // A spaces-only line that is the last line of this text (no
      // newline after it) continues an open paragraph (marked's
      // paragraph regex: `[ \t]+\n` is not a continuation, but a
      // trailing spaces-only line without a following newline is).
      // An empty line is a real blank line, not a continuation.
      if (para && line.length > 0 && i === end - 1 && !trailingNL) { para.push(line); i++; continue; }
      flushPara();
      if (blocks.length > 0) pendingBlank = true;
      i++;
      continue;
    }
    if (pendingBlank) { blankBetween = true; pendingBlank = false; }
    const ind = colIndent(line);
    const stripped = ind <= 3 ? stripCols(line, ind) : line;
    if (para) {
      const se = isSetext(stripped);
      if (se && ind <= 3) {
        // marked's lheading trims the text
        const text = stripRefDefs(para, refs).trim();
        if (text === '') {
          // The paragraph was only link reference definitions: it is
          // consumed with no block, and the setext line starts a fresh
          // block (cm-216: `[foo]: /url` + `===` -> `<p>===` ...).
          para = null; continue;
        }
        blocks.push({ t: 'h', level: se, text });
        para = null; i++; continue;
      }
      if (para.length === 1 && para[0].includes('|')) {
        const aligns = parseDelimiter(stripped);
        if (aligns && ind <= 3) {
          const header = splitRow(para[0]);
          // The delimiter must have exactly as many columns as the
          // header (marked's table tokenizer: n.length === s.length),
          // otherwise the lines are a plain paragraph.
          if (aligns.length === header.length) {
            const table = { t: 'table', aligns, header, rows: [] };
            para = null; i++;
            // Body rows stop at a blank line, at a 4+-indented line,
            // and at any line that would start a new block (marked's
            // table regex excludes hr/heading/blockquote/code/fences/
            // list/html lines from the body).
            while (i < end && tableRowContinues(lines[i])) {
              table.rows.push(splitRow(stripUpTo3(lines[i])));
              i++;
            }
            blocks.push(table);
            continue;
          }
        }
      }
      if (interruptsPara(stripped, i < end - 1 || !!trailingNL, inItem)) { flushPara(); continue; }
      para.push(line);
      i++;
      continue;
    }
    if (ind <= 3) {
      // First-character dispatch: skip the block-start regexes whose
      // first character cannot match this line.
      const c0 = stripped[0];
      // A thematic break takes precedence over a list item when the
      // line can be parsed as both (e.g. `- - -`).
      if ((c0 === '*' || c0 === '-' || c0 === '_') && isHr(stripped)) { blocks.push({ t: 'hr' }); i++; continue; }
      if (c0 === '#') { const h = atxHeading(stripped); if (h) { blocks.push(h); i++; continue; } }
      const f = (c0 === '`' || c0 === '~') ? fenceStart(stripped) : null;
      if (f) {
        const content = [];
        i++;
        let closed = false;
        // The fence's own indent (in characters) is removed from each
        // content line — but only for backtick fences: marked's Dt
        // indent compensation regex /^(\s+)(?:```)/ matches a backtick
        // fence only, so a ~~~ fence keeps its content lines verbatim.
        let fi = 0;
        if (f.ch === '`') while (fi < line.length && (line[fi] === ' ' || line[fi] === '\t')) fi++;
        while (i < end) {
          const l2 = lines[i];
          if (colIndent(l2) <= 3 && fenceEnd(stripUpTo3(l2), f.ch, f.len)) { i++; closed = true; break; }
          let k = 0;
          while (k < l2.length && k < fi && (l2[k] === ' ' || l2[k] === '\t')) k++;
          content.push(l2.slice(k));
          i++;
        }
        // The newline before the closing fence (or end of input) is
        // not part of the content: drop one trailing blank line.
        if (content.length && content[content.length - 1] === '') content.pop();
        // The language is the first word of the info string after
        // backslash escapes are removed (marked: info.trim().replace(
        // anyPunctuation, "$1"), then the renderer's notSpaceStart).
        const langWord = f.info === '' ? null : f.info.replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/g, '$1').split(/[ \t]/)[0];
        blocks.push({ t: 'code', lang: langWord, lines: content, fenced: true });
        continue;
      }
      const hb = c0 === '<' ? htmlBlockStart(stripped, i < end - 1 || !!trailingNL) : null;
      if (hb) {
        // marked's html token text: the matched lines joined with '\n',
        // plus one trailing '\n' when the block's last line was followed
        // by exactly one newline (its end-tag line followed by a non-blank
        // line, or the block ran to a newline-terminated end of input);
        // no trailing '\n' when it ends at a blank line.
        const content = [line];
        let trail = false;
        const termIdx = (idx) => idx < end - 1 || !!trailingNL;
        const endHere = (l, idx) => hb.end && hb.end.test(l + (termIdx(idx) ? '\n' : ''));
        const firstIdx = i;
        i++;
        if (hb.type <= 5) {
          // the end marker may already be on the opening line
          let ended = !!endHere(line, firstIdx);
          while (!ended && i < end) {
            const l2 = lines[i];
            const idx2 = i;
            content.push(l2);
            i++;
            if (endHere(l2, idx2)) { ended = true; break; }
          }
          // marked's ge(): the raw keeps its trailing '\n' unless the
          // end marker's line is followed by 2+ newlines, which the
          // regex's greedy (\n+) only consumes when the next line is
          // truly empty; a spaces/tabs-only line does not count.
          if (ended) trail = i < end ? lines[i].length > 0 : !!trailingNL;
          else trail = !!trailingNL;
        } else {
          while (i < end && !isBlank(lines[i])) {
            content.push(lines[i]);
            i++;
          }
          trail = i >= end ? !!trailingNL : false;
        }
        blocks.push({ t: 'html', text: content.join('\n') + (trail ? '\n' : '') });
        continue;
      }
      if (c0 === '>') {
        const q = collectQuote(lines, i, end, refs, st, trailingNL);
        blocks.push({ t: 'quote', blocks: q.blocks });
        i = q.next > i ? q.next : i + 1;
        continue;
      }
      const lm = (c0 === '*' || c0 === '+' || c0 === '-' || (c0 >= '0' && c0 <= '9')) ? listMarker(stripped) : null;
      if (lm) {
        const l = collectList(lines, i, end, refs, st, trailingNL);
        blocks.push(l.block);
        i = l.next > i ? l.next : i + 1;
        continue;
      }
      if (isHr(stripped)) { blocks.push({ t: 'hr' }); i++; continue; }
      if (stripped.includes('|') && i + 1 < end && colIndent(lines[i + 1]) <= 3) {
        const aligns = parseDelimiter(stripUpTo3(lines[i + 1]));
        if (aligns) {
          const header = splitRow(stripped);
          if (aligns.length === header.length) {
            const table = { t: 'table', aligns, header, rows: [] };
            i += 2;
            while (i < end && tableRowContinues(lines[i])) {
              table.rows.push(splitRow(stripUpTo3(lines[i])));
              i++;
            }
            blocks.push(table);
            continue;
          }
        }
      }
    }
    if (ind >= 4) {
      const content = [];
      while (i < end) {
        const l2 = lines[i];
        if (isBlank(l2)) {
          let k = i + 1;
          while (k < end && isBlank(lines[k])) k++;
          // A whitespace-only line inside the block keeps the columns
          // past the 4-column indent (e.g. 6 spaces -> `  ` content).
          if (k < end && colIndent(lines[k]) >= 4) { content.push(stripColsExpand(l2, 4)); i++; continue; }
          break;
        }
        if (colIndent(l2) >= 4) { content.push(stripCols(l2, 4)); i++; continue; }
        break;
      }
      while (content.length && content[content.length - 1].trim() === '') content.pop();
      blocks.push({ t: 'code', lang: null, lines: content, fenced: false });
      continue;
    }
    para = [line];
    i++;
  }
  flushPara();
  return { blocks, blankBetween };
}

// ---- Rendering ----

function renderBlocks(blocks, refs, st, tight) {
  let out = '';
  for (const b of blocks) out += renderBlock(b, refs, st, tight);
  return out;
}
function renderBlock(b, refs, st, tight) {
  switch (b.t) {
    case 'para': {
      const html = inlineHtml(b.text, refs, st);
      return tight ? html + '\n' : '<p>' + html + '</p>\n';
    }
    case 'h': return '<h' + b.level + '>' + inlineHtml(b.text, refs, st) + '</h' + b.level + '>\n';
    case 'code': {
      const content = b.lines.length ? b.lines.join('\n') + '\n' : '';
      const lang = b.lang ? ' class="language-' + esc(b.lang, false) + '"' : '';
      return '<pre><code' + lang + '>' + esc(content, true) + '</code></pre>\n';
    }
    case 'hr': return '<hr>\n';
    case 'html': return b.text;
    case 'quote': return '<blockquote>\n' + renderBlocks(b.blocks, refs, st, false) + '</blockquote>\n';
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      const startAttr = b.ordered && b.start !== 1 ? ' start="' + b.start + '"' : '';
      let out = '<' + tag + startAttr + '>\n';
      for (const item of b.items) out += renderItem(item, b, refs, st);
      return out + '</' + tag + '>\n';
    }
    case 'table': {
      let out = '<table>\n<thead>\n<tr>\n';
      for (let c = 0; c < b.header.length; c++) {
        const al = b.aligns[c];
        out += '<th' + (al ? ' align="' + al + '"' : '') + '>' + inlineHtml(b.header[c], refs, st) + '</th>\n';
      }
      out += '</tr>\n</thead>\n';
      if (b.rows.length) {
        out += '<tbody>';
        for (const row of b.rows) {
          out += '<tr>\n';
          for (let c = 0; c < b.header.length; c++) {
            const al = b.aligns[c];
            const cell = c < row.length ? row[c] : '';
            out += '<td' + (al ? ' align="' + al + '"' : '') + '>' + inlineHtml(cell, refs, st) + '</td>\n';
          }
          out += '</tr>\n';
        }
        out += '</tbody>';
      }
      return out + '</table>\n';
    }
  }
  return '';
}
function renderItem(item, list, refs, st) {
  let blocks = item.blocks;
  let task = null;
  if (blocks.length && blocks[0].t === 'para') {
    const m = /^\[([ xX])\][ \t]+(?=\S)/.exec(blocks[0].text);
    if (m) {
      task = m[1] === ' ' ? '' : ' checked=""';
      blocks = blocks.slice();
      blocks[0] = { t: 'para', text: blocks[0].text.slice(m[0].length) };
    }
  }
  const check = task === null ? '' : '<input' + task + ' disabled="" type="checkbox"> ';
  if (!blocks.length) return '<li>' + check + '</li>\n';
  const tight = list.tight;
  let inner = '';
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    if (tight && b.t === 'para') {
      inner += inlineHtml(b.text, refs, st);
    } else if (k === 0 && b.t === 'para' && task !== null) {
      // A loose task item's checkbox goes inside the first paragraph.
      inner += '<p>' + check + inlineHtml(b.text, refs, st) + '</p>\n';
    } else {
      inner += renderBlock(b, refs, st, tight);
    }
  }
  // A tight task item's checkbox goes before the bare text.
  return '<li>' + (task !== null && tight ? check : '') + inner + '</li>\n';
}

export function parse(markdown) {
  let src = String(markdown);
  if (src.indexOf('\r') >= 0) src = src.replace(/\r\n?/g, '\n');
  let lines = src.split('\n');
  const trailingNL = src.endsWith('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const refs = Object.create(null);
  const st = { inLink: false, inRawBlock: false };
  const parsed = parseBlocks(lines, 0, lines.length, refs, st, trailingNL);
  const blocks = parsed.blocks;
  return renderBlocks(blocks, refs, st, false);
}
