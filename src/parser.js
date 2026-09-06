import { tokenize } from './tokenizer.js';
import { tokenizeLossless } from './lossless.js';
import { ScoutSyntaxError } from './errors.js';

const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 256;

function toComment(token) { return { ...token.value, start: token.start, end: token.end }; }
function scalarType(value) {
  if (value === null) return 'Null';
  if (typeof value === 'string') return 'String';
  if (typeof value === 'number') return 'Number';
  if (typeof value === 'boolean') return 'Boolean';
  throw new TypeError(`Unsupported scalar type: ${typeof value}`);
}
function assignNodeIds(node, state = { next: 0 }) {
  if (!node || typeof node !== 'object') return;
  node.id ??= `n${state.next++}`;
  if (node.type === 'Object') for (const member of node.members) { member.id ??= `n${state.next++}`; assignNodeIds(member.value, state); }
  else if (node.type === 'Array') for (const element of node.elements) { element.id ??= `n${state.next++}`; assignNodeIds(element.value, state); }
}
function boundedInteger(value, fallback, name) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) throw new TypeError(`${name} must be a positive safe integer`);
  return resolved;
}

export function parse(source, options = {}) {
  if (typeof source !== 'string') throw new TypeError('Scout source must be a string');
  const maxBytes = boundedInteger(options.maxBytes, DEFAULT_MAX_BYTES, 'maxBytes');
  const maxDepth = boundedInteger(options.maxDepth, DEFAULT_MAX_DEPTH, 'maxDepth');
  const byteLength = Buffer.byteLength(source, 'utf8');
  if (byteLength > maxBytes) throw new ScoutSyntaxError(`Scout input exceeds ${maxBytes} byte limit`, { offset: 0, line: 1, column: 1 });

  const tokens = tokenize(source);
  const comments = tokens.filter((token) => token.type === 'comment').map(toComment);
  let i = 0;
  const current = () => tokens[i];
  const fail = (message, token = current()) => { throw new ScoutSyntaxError(message, token?.start); };
  const consume = (type) => { const token = current(); if (!token || token.type !== type) fail(`Expected ${type}${token ? `, found ${token.type}` : ''}`, token); i++; return token; };
  const takeComments = () => { const found = []; while (current()?.type === 'comment') found.push(toComment(tokens[i++])); return found; };
  const splitAfterComma = (comma, found) => { const trailing = [], leading = []; for (const comment of found) (comment.start.line === comma.end.line ? trailing : leading).push(comment); return { trailing, leading }; };
  const checkDepth = (depth, token = current()) => { if (depth > maxDepth) fail(`Scout nesting exceeds ${maxDepth} level limit`, token); };

  function parseValueNode(leadingComments = [], depth = 0) {
    checkDepth(depth);
    const token = current();
    if (!token) fail('Unexpected end of input');
    if (token.type === 'string' || token.type === 'number' || token.type === 'literal') {
      i++;
      return { value: token.value, node: { type: scalarType(token.value), value: token.value, raw: source.slice(token.start.offset, token.end.offset), start: token.start, end: token.end, leadingComments, trailingComments: [] } };
    }
    if (token.type === '{') return parseObject(leadingComments, depth);
    if (token.type === '[') return parseArray(leadingComments, depth);
    fail(`Expected value, found ${token.type}`, token);
  }

  function parseObject(leadingComments = [], depth = 0) {
    checkDepth(depth);
    const open = consume('{'), out = {}, members = [];
    let pending = takeComments();
    if (current()?.type === '}') { const close = consume('}'); return { value: out, node: { type: 'Object', members, start: open.start, end: close.end, leadingComments, trailingComments: [], danglingComments: pending } }; }
    while (true) {
      const memberLeading = pending, keyToken = consume('string'), beforeColonComments = takeComments();
      consume(':');
      const beforeValueComments = takeComments(), parsed = parseValueNode(beforeValueComments, depth + 1), trailingComments = takeComments();
      Object.defineProperty(out, keyToken.value, { value: parsed.value, enumerable: true, configurable: true, writable: true });
      const member = { type: 'Member', key: keyToken.value, rawKey: source.slice(keyToken.start.offset, keyToken.end.offset), keyStart: keyToken.start, keyEnd: keyToken.end, start: keyToken.start, end: parsed.node.end, leadingComments: memberLeading, beforeColonComments, beforeValueComments, trailingComments, value: parsed.node };
      members.push(member);
      if (current()?.type === '}') { const close = consume('}'); return { value: out, node: { type: 'Object', members, start: open.start, end: close.end, leadingComments, trailingComments: [], danglingComments: [] } }; }
      const comma = consume(','), postComma = splitAfterComma(comma, takeComments());
      member.trailingComments.push(...postComma.trailing); pending = postComma.leading;
      if (current()?.type === '}') {
        const close = consume('}');
        return { value: out, node: { type: 'Object', members, start: open.start, end: close.end, leadingComments, trailingComments: [], danglingComments: pending, trailingComma: true } };
      }
    }
  }

  function parseArray(leadingComments = [], depth = 0) {
    checkDepth(depth);
    const open = consume('['), out = [], elements = [];
    let pending = takeComments();
    if (current()?.type === ']') { const close = consume(']'); return { value: out, node: { type: 'Array', elements, start: open.start, end: close.end, leadingComments, trailingComments: [], danglingComments: pending } }; }
    while (true) {
      const elementLeading = pending, parsed = parseValueNode(elementLeading, depth + 1), trailingComments = takeComments(), index = out.length;
      out.push(parsed.value);
      const element = { type: 'Element', index, start: parsed.node.start, end: parsed.node.end, leadingComments: elementLeading, trailingComments, value: parsed.node };
      elements.push(element);
      if (current()?.type === ']') { const close = consume(']'); return { value: out, node: { type: 'Array', elements, start: open.start, end: close.end, leadingComments, trailingComments: [], danglingComments: [] } }; }
      const comma = consume(','), postComma = splitAfterComma(comma, takeComments());
      element.trailingComments.push(...postComma.trailing); pending = postComma.leading;
      if (current()?.type === ']') {
        const close = consume(']');
        return { value: out, node: { type: 'Array', elements, start: open.start, end: close.end, leadingComments, trailingComments: [], danglingComments: pending, trailingComma: true } };
      }
    }
  }

  const leadingComments = takeComments(), parsed = parseValueNode(leadingComments, 0), trailingComments = takeComments();
  parsed.node.trailingComments = [...(parsed.node.trailingComments || []), ...trailingComments];
  consume('eof'); assignNodeIds(parsed.node);
  return { type: 'Document', version: '0.4', revision: 0, value: parsed.value, ast: parsed.node, comments, tokens: tokenizeLossless(source), source, lastChangeRanges: [] };
}

export function parseValue(source, options) { return parse(source, options).value; }
