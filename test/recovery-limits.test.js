import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecovering, ScoutSyntaxError } from '../src/index.js';

test('recovery parser enforces UTF-8 byte limits before tokenization', () => {
  const source = '"éééé"';
  assert.throws(() => parseRecovering(source, { maxBytes: 6 }), (error) => {
    assert.ok(error instanceof ScoutSyntaxError);
    assert.match(error.message, /exceeds 6 byte limit/);
    return true;
  });
});

test('recovery parser bounds deep arrays without recursing past configured depth', () => {
  const source = `${'['.repeat(2000)}0${']'.repeat(2000)}`;
  const document = parseRecovering(source, { maxDepth: 32, maxBytes: 10000 });
  const depthDiagnostic = document.diagnostics.find((entry) => entry.code === 'resource-depth');
  assert.ok(depthDiagnostic);
  assert.match(depthDiagnostic.message, /exceeds 32 level limit/);
  assert.equal(document.incomplete, true);
  assert.ok(document.recoveryNodes.some((node) => /nesting exceeds/.test(node.message)));
});

test('recovery parser bounds deeply nested objects while preserving surrounding parse', () => {
  let nested = '1';
  for (let index = 0; index < 1000; index++) nested = `{"x":${nested}}`;
  const source = `{"before":1,"deep":${nested},"after":2}`;
  const document = parseRecovering(source, { maxDepth: 16, maxBytes: 100000 });
  assert.equal(document.value.before, 1);
  assert.equal(document.value.after, 2);
  assert.ok(document.diagnostics.some((entry) => entry.code === 'resource-depth'));
});

test('recovery parser preserves exact line and column positions with indexed locator', () => {
  const source = '{\n  "a": 1,\n  "b" 2\n}';
  const document = parseRecovering(source);
  const colon = document.diagnostics.find((entry) => /Expected colon/.test(entry.message));
  assert.ok(colon);
  assert.equal(colon.start.line, 3);
  assert.equal(colon.start.column, 7);
});

test('recovery parser validates resource option values', () => {
  assert.throws(() => parseRecovering('{}', { maxDepth: 0 }), /maxDepth must be a positive safe integer/);
  assert.throws(() => parseRecovering('{}', { maxBytes: -1 }), /maxBytes must be a positive safe integer/);
});
