import { parse } from './parser.js';
import { parseTolerant } from './recovery.js';
import { reparseIncremental } from './transaction.js';
import { tokenAt } from './lossless.js';
import { ScoutSyntaxError } from './errors.js';

function positionToOffset(source, position) {
  if (!position || !Number.isInteger(position.line) || !Number.isInteger(position.character)) throw new TypeError('Position must contain zero-based line and character');
  const lines = source.split('\n');
  if (position.line < 0 || position.line >= lines.length) return source.length;
  let offset = 0;
  for (let i = 0; i < position.line; i++) offset += lines[i].length + 1;
  return Math.min(offset + Math.max(0, position.character), offset + lines[position.line].length);
}

function offsetToLspPosition(source, offset) {
  let line = 0;
  let character = 0;
  for (let i = 0; i < Math.min(offset, source.length); i++) {
    if (source[i] === '\n') { line++; character = 0; }
    else character++;
  }
  return { line, character };
}

function nodeRange(source, node) {
  return { start: offsetToLspPosition(source, node.start.offset), end: offsetToLspPosition(source, node.end.offset) };
}

function syntaxErrorDiagnostic(source, error) {
  const offset = error?.position?.offset ?? 0;
  const start = offsetToLspPosition(source, offset);
  const end = offsetToLspPosition(source, Math.min(source.length, offset + 1));
  return { severity: 1, source: 'scout', code: 'syntax', message: error.message, range: { start, end } };
}

function recoveryDiagnosticToLsp(source, item) {
  return {
    severity: item.severity ?? 1,
    source: 'scout',
    code: item.code ?? 'incomplete-syntax',
    message: item.expected?.length ? `${item.message}. Expected: ${item.expected.join(', ')}` : item.message,
    range: {
      start: offsetToLspPosition(source, item.start.offset),
      end: offsetToLspPosition(source, item.end.offset),
    },
    data: { expected: item.expected ?? [] },
  };
}

export function validateText(source) {
  try {
    parse(source);
    return [];
  } catch (error) {
    if (error instanceof ScoutSyntaxError) return [syntaxErrorDiagnostic(source, error)];
    throw error;
  }
}

function nodeIdentity(node) {
  return { scoutNodeId: node.id, jovaNodeId: node.id };
}

function symbolChildren(source, node) {
  if (!node || node.type === 'Recovery') return [];
  if (node.type === 'Object') {
    return node.members.map((member) => ({
      name: member.key,
      kind: member.value.type === 'Object' ? 19 : member.value.type === 'Array' ? 18 : 13,
      range: nodeRange(source, member),
      selectionRange: { start: offsetToLspPosition(source, member.keyStart.offset), end: offsetToLspPosition(source, member.keyEnd.offset) },
      children: symbolChildren(source, member.value),
      ...nodeIdentity(member),
    }));
  }
  if (node.type === 'Array') {
    return node.elements.map((element, index) => ({
      name: `[${index}]`,
      kind: element.value.type === 'Object' ? 19 : element.value.type === 'Array' ? 18 : 13,
      range: nodeRange(source, element),
      selectionRange: nodeRange(source, element.value),
      children: symbolChildren(source, element.value),
      ...nodeIdentity(element),
    }));
  }
  return [];
}

export function documentSymbols(document) {
  if (!document?.ast) throw new TypeError('Expected a Scout document');
  return symbolChildren(document.source, document.ast);
}

export function hoverAt(document, position) {
  if (!document?.source) throw new TypeError('Expected a Scout document');
  const offset = positionToOffset(document.source, position);
  const token = tokenAt(document, offset);
  if (!token || token.type === 'trivia' || token.type === 'eof') return undefined;
  let label = token.type;
  if (token.type === 'comment') label = `${token.value.style} comment`;
  else if (token.type === 'literal') label = typeof token.value;
  return {
    contents: { kind: 'markdown', value: `**Scout ${label}**\n\n\`${token.raw}\`` },
    range: { start: offsetToLspPosition(document.source, token.start.offset), end: offsetToLspPosition(document.source, token.end.offset) },
  };
}

function applyChangesToSource(source, changes) {
  let next = source;
  const edits = changes.map((change) => {
    if (!change.range) return { start: 0, end: source.length, text: change.text };
    return {
      start: positionToOffset(source, change.range.start),
      end: positionToOffset(source, change.range.end),
      text: change.text,
    };
  }).sort((a, b) => b.start - a.start);
  for (const edit of edits) next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
  return { source: next, edits };
}

function validateRecoverySnapshot(snapshot) {
  if (snapshot?.schema !== 'scout.document-store/v1' || !Array.isArray(snapshot.documents)) throw new TypeError('invalid Scout document recovery snapshot');
  for (const item of snapshot.documents) {
    if (!item || typeof item.uri !== 'string' || typeof item.source !== 'string' || !Number.isInteger(item.version) || item.version < 0) throw new TypeError('invalid Scout document recovery entry');
    if (item.lastValidSource != null && typeof item.lastValidSource !== 'string') throw new TypeError('invalid Scout last-valid recovery source');
  }
}

export function createDocumentStore() {
  const documents = new Map();

  return {
    open(uri, text, version = 1) {
      if (typeof uri !== 'string' || typeof text !== 'string') throw new TypeError('uri and text are required');
      const document = parseTolerant(text);
      documents.set(uri, { uri, version, document, lastValid: document.incomplete ? undefined : document });
      return document;
    },

    get(uri) { return documents.get(uri)?.document; },
    version(uri) { return documents.get(uri)?.version; },

    update(uri, changes, version) {
      const entry = documents.get(uri);
      if (!entry) throw new RangeError(`Scout document is not open: ${uri}`);
      if (!Array.isArray(changes)) throw new TypeError('changes must be an array');
      const applied = applyChangesToSource(entry.document.source, changes);

      if (!entry.document.incomplete) {
        try {
          reparseIncremental(entry.document, applied.edits);
          entry.lastValid = structuredClone(entry.document);
        } catch (error) {
          if (!(error instanceof ScoutSyntaxError)) throw error;
          entry.document = parseTolerant(applied.source, entry.lastValid ?? entry.document);
        }
      } else {
        const tolerant = parseTolerant(applied.source, entry.lastValid ?? entry.document.lastValidDocument);
        entry.document = tolerant;
        if (!tolerant.incomplete) entry.lastValid = structuredClone(tolerant);
      }

      entry.version = version ?? entry.version + 1;
      return entry.document;
    },

    close(uri) { return documents.delete(uri); },

    diagnostics(uri) {
      const entry = documents.get(uri);
      if (!entry) return [];
      if (entry.document.incomplete) return (entry.document.diagnostics ?? []).map((item) => recoveryDiagnosticToLsp(entry.document.source, item));
      return [];
    },

    symbols(uri) {
      const entry = documents.get(uri);
      return entry ? documentSymbols(entry.document) : [];
    },

    hover(uri, position) {
      const entry = documents.get(uri);
      return entry ? hoverAt(entry.document, position) : undefined;
    },

    snapshot() {
      return {
        schema: 'scout.document-store/v1',
        documents: [...documents.values()].map((entry) => ({
          uri: entry.uri,
          version: entry.version,
          source: entry.document.source,
          lastValidSource: entry.lastValid?.source ?? null,
        })).sort((a, b) => a.uri.localeCompare(b.uri)),
      };
    },

    restore(snapshot) {
      validateRecoverySnapshot(snapshot);
      const rebuilt = new Map();
      for (const item of snapshot.documents) {
        let lastValid;
        if (item.lastValidSource != null) lastValid = parse(item.lastValidSource);
        const document = parseTolerant(item.source, lastValid);
        rebuilt.set(item.uri, {
          uri: item.uri,
          version: item.version,
          document,
          lastValid: document.incomplete ? lastValid : document,
        });
      }
      documents.clear();
      for (const [uri, entry] of rebuilt) documents.set(uri, entry);
      return this.snapshot();
    },
  };
}

export { positionToOffset, offsetToLspPosition };
