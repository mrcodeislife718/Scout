import { ScoutSyntaxError } from './errors.js';

const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 256;

function boundedInteger(value, fallback, name) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) throw new TypeError(`${name} must be a positive safe integer`);
  return resolved;
}

function createLocator(source) {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index++) if (source[index] === '\n') lineStarts.push(index + 1);
  return (offset) => {
    const safe = Math.max(0, Math.min(source.length, Number.isFinite(offset) ? offset : source.length));
    let low = 0, high = lineStarts.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (lineStarts[middle] <= safe) low = middle + 1;
      else high = middle - 1;
    }
    const lineIndex = Math.max(0, high);
    return { offset: safe, line: lineIndex + 1, column: safe - lineStarts[lineIndex] + 1 };
  };
}

function diag(source, locate, message, start, end = start, expected = [], code = 'syntax-recovery') {
  return { severity: 1, source: 'jova', code, message, expected, start: locate(start), end: locate(end) };
}

function recovery(source, locate, start, end, message, expected = []) {
  return {
    id: `recovery:${start}:${end}`,
    type: 'Recovery',
    message,
    expected,
    raw: source.slice(start, end),
    start: locate(start),
    end: locate(end),
    leadingComments: [],
    trailingComments: [],
  };
}

function scanner(source, locate) {
  let i = 0;
  const tokens = [];
  const diagnostics = [];
  const punct = new Set(['{','}','[',']',':',',']);
  const push = (type, value, start, end = i, extra = {}) => tokens.push({ type, value, start: locate(start), end: locate(end), raw: source.slice(start,end), ...extra });
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) { i++; continue; }
    const start = i;
    if (ch === '/' && source[i+1] === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i++;
      push('comment', { style:'line', text: source.slice(start+2,i) }, start);
      continue;
    }
    if (ch === '/' && source[i+1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i+1] === '/')) i++;
      if (i >= source.length) {
        diagnostics.push(diag(source,locate,'Unterminated block comment',start,source.length,['*/'],'unterminated-comment'));
        push('comment', { style:'block', text: source.slice(start+2) }, start, source.length, { incomplete:true });
        break;
      }
      i += 2;
      push('comment', { style:'block', text: source.slice(start+2,i-2) }, start);
      continue;
    }
    if (punct.has(ch)) { i++; push(ch,ch,start); continue; }
    if (ch === '"') {
      i++;
      let escaped = false;
      let closed = false;
      while (i < source.length) {
        const c = source[i++];
        if (!escaped && c === '"') { closed = true; break; }
        if (!escaped && c === '\\') escaped = true; else escaped = false;
      }
      if (!closed) {
        diagnostics.push(diag(source,locate,'Unterminated string',start,source.length,['"'],'unterminated-string'));
        push('invalid-string', source.slice(start+1), start, source.length, { incomplete:true });
        break;
      }
      const raw = source.slice(start,i);
      let value;
      try { value = JSON.parse(raw); }
      catch { value = raw.slice(1,-1); diagnostics.push(diag(source,locate,'Invalid string escape',start,i,['valid string escape'])); }
      push('string',value,start);
      continue;
    }
    const rest = source.slice(i);
    const number = rest.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) { i += number[0].length; push('number',Number(number[0]),start); continue; }
    const literal = [['true',true],['false',false],['null',null]].find(([word]) => rest.startsWith(word));
    if (literal) { i += literal[0].length; push('literal',literal[1],start); continue; }
    i++;
    diagnostics.push(diag(source,locate,`Unexpected character ${JSON.stringify(ch)}`,start,i,['value','member','}',']',',']));
    push('invalid',ch,start);
  }
  tokens.push({ type:'eof', value:null, start:locate(source.length), end:locate(source.length), raw:'' });
  return { tokens, diagnostics };
}

function scalarNode(token) {
  const type = token.value === null ? 'Null' : typeof token.value === 'string' ? 'String' : typeof token.value === 'number' ? 'Number' : 'Boolean';
  return { id:`recover:${token.start.offset}`, type, value:token.value, raw:token.raw, start:token.start, end:token.end, leadingComments:[], trailingComments:[] };
}

export function parseRecovering(source, options = {}) {
  if (typeof source !== 'string') throw new TypeError('Scout source must be a string');
  const maxBytes = boundedInteger(options.maxBytes, DEFAULT_MAX_BYTES, 'maxBytes');
  const maxDepth = boundedInteger(options.maxDepth, DEFAULT_MAX_DEPTH, 'maxDepth');
  if (Buffer.byteLength(source, 'utf8') > maxBytes) throw new ScoutSyntaxError(`Scout input exceeds ${maxBytes} byte limit`, { offset:0, line:1, column:1 });

  const locate = createLocator(source);
  const scanned = scanner(source, locate);
  const { tokens } = scanned;
  const diagnostics = [...scanned.diagnostics];
  const recoveryNodes = [];
  let i = 0;
  const current = () => tokens[i];
  const consume = () => tokens[i++];
  const skipComments = () => { while (current()?.type === 'comment') i++; };
  const sync = (types) => { while (current() && current().type !== 'eof' && !types.includes(current().type)) i++; };

  function skipNestedValue() {
    const startToken = current();
    if (!startToken || (startToken.type !== '{' && startToken.type !== '[')) return consume();
    const stack = [startToken.type === '{' ? '}' : ']'];
    let last = consume();
    while (stack.length && current()?.type !== 'eof') {
      const token = consume();
      last = token;
      if (token.type === '{') stack.push('}');
      else if (token.type === '[') stack.push(']');
      else if (token.type === stack.at(-1)) stack.pop();
    }
    return { start:startToken.start, end:last?.end ?? startToken.end };
  }

  function depthRecovery(depth) {
    const token = current();
    const start = token?.start.offset ?? source.length;
    const skipped = token && (token.type === '{' || token.type === '[') ? skipNestedValue() : consume();
    const end = skipped?.end?.offset ?? token?.end.offset ?? start;
    const message = `Scout nesting exceeds ${maxDepth} level limit`;
    const node = recovery(source,locate,start,end,message,[]);
    diagnostics.push(diag(source,locate,message,start,end,[],'resource-depth'));
    recoveryNodes.push(node);
    return { value:undefined, node };
  }

  function valueNode(depth = 0) {
    skipComments();
    if (depth > maxDepth) return depthRecovery(depth);
    const token = current();
    if (!token || token.type === 'eof' || token.type === '}' || token.type === ']' || token.type === ',') {
      const at = token?.start.offset ?? source.length;
      const node = recovery(source,locate,at,at,'Expected a value',['object','array','string','number','true','false','null']);
      diagnostics.push(diag(source,locate,node.message,at,at,node.expected));
      recoveryNodes.push(node);
      return { value: undefined, node };
    }
    if (token.type === '{') return objectNode(depth);
    if (token.type === '[') return arrayNode(depth);
    if (token.type === 'string' || token.type === 'number' || token.type === 'literal') { consume(); return { value:token.value, node:scalarNode(token) }; }
    if (token.type === 'invalid-string') {
      consume();
      const node = recovery(source,locate,token.start.offset,token.end.offset,'Unterminated string',['"']);
      recoveryNodes.push(node);
      return { value:undefined, node };
    }
    consume();
    const node = recovery(source,locate,token.start.offset,token.end.offset,'Invalid value',['object','array','string','number','true','false','null']);
    recoveryNodes.push(node);
    return { value:undefined, node };
  }

  function objectNode(depth = 0) {
    const open = consume();
    const members = [];
    const out = {};
    skipComments();
    while (current()?.type !== 'eof' && current()?.type !== '}') {
      skipComments();
      const key = current();
      if (key?.type !== 'string') {
        const start = key?.start.offset ?? source.length;
        const node = recovery(source,locate,start,key?.end.offset ?? start,'Expected object member key',['string','}']);
        recoveryNodes.push(node);
        diagnostics.push(diag(source,locate,node.message,start,key?.end.offset ?? start,node.expected));
        members.push({ id:`member-recovery:${start}`, type:'Member', key:`<recovery@${start}>`, start:node.start, end:node.end, keyStart:node.start, keyEnd:node.end, value:node, leadingComments:[], beforeColonComments:[], beforeValueComments:[], trailingComments:[], recovery:true });
        sync([',','}']);
        if (current()?.type === ',') { consume(); continue; }
        break;
      }
      consume();
      skipComments();
      if (current()?.type !== ':') {
        const at = current()?.start.offset ?? key.end.offset;
        const node = recovery(source,locate,at,at,'Expected colon after object key',[':']);
        recoveryNodes.push(node);
        diagnostics.push(diag(source,locate,node.message,at,at,node.expected));
      } else consume();
      const parsed = valueNode(depth + 1);
      const member = {
        id:`member:${key.start.offset}`,
        type:'Member', key:key.value, rawKey:key.raw, keyStart:key.start, keyEnd:key.end,
        start:key.start, end:parsed.node.end, value:parsed.node,
        leadingComments:[], beforeColonComments:[], beforeValueComments:[], trailingComments:[], recovery: parsed.node.type === 'Recovery'
      };
      members.push(member);
      if (parsed.value !== undefined) out[key.value] = parsed.value;
      skipComments();
      if (current()?.type === ',') { consume(); skipComments(); continue; }
      if (current()?.type === '}') break;
      if (current()?.type === 'eof') break;
      const at = current().start.offset;
      diagnostics.push(diag(source,locate,'Expected comma or closing brace',at,current().end.offset,[',','}']));
      sync([',','}']);
      if (current()?.type === ',') consume();
    }
    let close;
    if (current()?.type === '}') close = consume();
    else {
      const at = current()?.start.offset ?? source.length;
      const node = recovery(source,locate,at,at,'Incomplete object',['}']);
      recoveryNodes.push(node);
      diagnostics.push(diag(source,locate,node.message,at,at,node.expected));
      close = { end: locate(at) };
    }
    return { value:out, node:{ id:`object:${open.start.offset}`, type:'Object', members, start:open.start, end:close.end, leadingComments:[], trailingComments:[], danglingComments:[], incomplete: members.some(m=>m.recovery) || !close.raw } };
  }

  function arrayNode(depth = 0) {
    const open = consume();
    const elements = [];
    const out = [];
    skipComments();
    while (current()?.type !== 'eof' && current()?.type !== ']') {
      const parsed = valueNode(depth + 1);
      const index = elements.length;
      elements.push({ id:`element:${parsed.node.start.offset}:${index}`, type:'Element', index, start:parsed.node.start, end:parsed.node.end, value:parsed.node, leadingComments:[], trailingComments:[], recovery:parsed.node.type==='Recovery' });
      if (parsed.value !== undefined) out.push(parsed.value);
      else out.push(undefined);
      skipComments();
      if (current()?.type === ',') { consume(); skipComments(); continue; }
      if (current()?.type === ']') break;
      if (current()?.type === 'eof') break;
      const at = current().start.offset;
      diagnostics.push(diag(source,locate,'Expected comma or closing bracket',at,current().end.offset,[',',']']));
      sync([',',']']);
      if (current()?.type === ',') consume();
    }
    let close;
    if (current()?.type === ']') close = consume();
    else {
      const at = current()?.start.offset ?? source.length;
      const node = recovery(source,locate,at,at,'Incomplete array',[']']);
      recoveryNodes.push(node);
      diagnostics.push(diag(source,locate,node.message,at,at,node.expected));
      close = { end:locate(at) };
    }
    return { value:out, node:{ id:`array:${open.start.offset}`, type:'Array', elements, start:open.start, end:close.end, leadingComments:[], trailingComments:[], danglingComments:[], incomplete:elements.some(e=>e.recovery) || !close.raw } };
  }

  const parsed = valueNode(0);
  skipComments();
  if (current()?.type !== 'eof') {
    diagnostics.push(diag(source,locate,'Unexpected content after root value',current().start.offset,current().end.offset,['eof']));
  }
  return {
    type:'Document', version:'0.4', revision:0, source, value:parsed.value, ast:parsed.node,
    comments:tokens.filter(t=>t.type==='comment').map(t=>({ ...t.value, start:t.start, end:t.end })),
    tokens, diagnostics, recoveryNodes, incomplete: diagnostics.length > 0 || recoveryNodes.length > 0,
    lastChangeRanges:[], recoveryMode:'mixed-tree'
  };
}
