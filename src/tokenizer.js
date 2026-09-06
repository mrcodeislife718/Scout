import { ScoutSyntaxError } from './errors.js';

const punctuation = new Set(['{', '}', '[', ']', ':', ',']);
const whitespace = /[\u0020\u000A\u000D\u0009]/;
const literalWords = [['true', true], ['false', false], ['null', null]];

export function tokenize(source) {
  if (typeof source !== 'string') throw new TypeError('Scout source must be a string');

  const tokens = [];
  let i = 0;
  let line = 1;
  let column = 1;

  const pos = () => ({ offset: i, line, column });
  const advance = () => {
    const ch = source[i++];
    if (ch === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
    return ch;
  };
  const push = (type, value, start) => tokens.push({ type, value, start, end: pos() });
  const fail = (message, at = pos()) => {
    throw new ScoutSyntaxError(message, at);
  };

  while (i < source.length) {
    const ch = source[i];

    if (whitespace.test(ch)) {
      advance();
      continue;
    }

    const start = pos();

    if (ch === '/' && source[i + 1] === '/') {
      advance();
      advance();
      let text = '';
      while (i < source.length && source[i] !== '\n') text += advance();
      push('comment', { style: 'line', text }, start);
      continue;
    }

    if (ch === '/' && source[i + 1] === '*') {
      advance();
      advance();
      let text = '';
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) text += advance();
      if (i >= source.length) fail('Unterminated block comment', start);
      advance();
      advance();
      push('comment', { style: 'block', text }, start);
      continue;
    }

    if (punctuation.has(ch)) {
      advance();
      push(ch, ch, start);
      continue;
    }

    if (ch === '"') {
      const rawStart = i;
      advance();
      let escaped = false;
      let closed = false;

      while (i < source.length) {
        const c = advance();
        if (!escaped && c === '"') {
          closed = true;
          break;
        }
        if (!escaped && c.charCodeAt(0) < 0x20) fail('Unescaped control character in string', start);
        if (!escaped && c === '\\') escaped = true;
        else escaped = false;
      }

      if (!closed) fail('Unterminated string', start);

      const raw = source.slice(rawStart, i);
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        fail('Invalid string escape', start);
      }
      push('string', value, start);
      continue;
    }

    const rest = source.slice(i);
    const number = rest.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) {
      const raw = number[0];
      const next = rest[raw.length];
      if (next !== undefined && !isTokenBoundary(next)) fail('Invalid number literal', start);
      const value = Number(raw);
      if (!Number.isFinite(value)) fail('Number is outside Scout numeric range', start);
      for (let n = 0; n < raw.length; n++) advance();
      push('number', value, start);
      continue;
    }

    let matched = false;
    for (const [word, value] of literalWords) {
      if (rest.startsWith(word)) {
        const next = rest[word.length];
        if (next !== undefined && !isTokenBoundary(next)) fail(`Invalid literal ${word}`, start);
        for (let n = 0; n < word.length; n++) advance();
        push('literal', value, start);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    fail(`Unexpected character ${JSON.stringify(ch)}`, start);
  }

  tokens.push({ type: 'eof', value: null, start: pos(), end: pos() });
  return tokens;
}

function isTokenBoundary(ch) {
  return whitespace.test(ch) || punctuation.has(ch) || ch === '/';
}
