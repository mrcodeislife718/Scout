import { parse } from './parser.js';
import { parseRecovering } from './recovery-parser.js';
import { reconcileSyntaxIdentity } from './identity.js';
import { ScoutSyntaxError } from './errors.js';

function preservePreviousIdentity(previousDocument, recovered) {
  if (!previousDocument?.ast || !recovered?.ast) return recovered;
  reconcileSyntaxIdentity(previousDocument, recovered);
  const lastValid = previousDocument.incomplete ? previousDocument.lastValidDocument : previousDocument;
  recovered.lastValidDocument = lastValid;
  recovered.revision = previousDocument.revision ?? 0;
  if (lastValid?.value !== undefined) recovered.value = structuredClone(lastValid.value);
  return recovered;
}

function strictFailureDiagnostic(error) {
  const position = error.position ?? { offset: error.offset ?? 0, line: error.line ?? 1, column: error.column ?? 1 };
  return {
    severity: 1,
    source: 'scout',
    code: 'strict-syntax',
    message: error.message.replace(/ at \d+:\d+$/, ''),
    expected: [],
    start: { ...position },
    end: { ...position },
  };
}

function normalizeRecoveredDocument(recovered, strictError) {
  recovered.diagnostics = (recovered.diagnostics ?? []).map((diagnostic) => ({ ...diagnostic, source: 'scout' }));
  if (strictError) {
    const strict = strictFailureDiagnostic(strictError);
    const alreadyRepresented = recovered.diagnostics.some((diagnostic) =>
      diagnostic.start?.offset === strict.start.offset && diagnostic.message === strict.message
    );
    if (!alreadyRepresented) recovered.diagnostics.unshift(strict);
  }
  recovered.incomplete = recovered.diagnostics.length > 0 || (recovered.recoveryNodes?.length ?? 0) > 0;
  return recovered;
}

export function parseTolerant(source, previousDocument) {
  try {
    const document = parse(source);
    document.diagnostics = [];
    document.recoveryNodes = [];
    document.incomplete = false;
    document.recoveryMode = 'strict';
    if (previousDocument?.ast) reconcileSyntaxIdentity(previousDocument, document);
    return document;
  } catch (error) {
    if (!(error instanceof ScoutSyntaxError)) throw error;
    const recovered = normalizeRecoveredDocument(parseRecovering(source), error);
    return preservePreviousIdentity(previousDocument, recovered);
  }
}

export function isRecoveryNode(node) {
  return node?.type === 'Recovery';
}
