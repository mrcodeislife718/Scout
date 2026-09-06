import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTolerant } from '../src/recovery.js';

test('Scout tolerant parsing never treats non-JSON whitespace as valid', () => {
  const document = parseTolerant('{"a":1\u000b}');
  assert.equal(document.incomplete, true);
  assert.ok(document.diagnostics.length > 0);
  assert.ok(document.diagnostics.every((diagnostic) => diagnostic.source === 'scout'));
  assert.ok(document.diagnostics.some((diagnostic) => /Unexpected character/.test(diagnostic.message)));
});

test('Scout tolerant parsing preserves strict numeric overflow failure', () => {
  const document = parseTolerant('1e9999');
  assert.equal(document.incomplete, true);
  assert.ok(document.diagnostics.some((diagnostic) => /outside Scout numeric range/.test(diagnostic.message)));
  assert.ok(document.diagnostics.every((diagnostic) => diagnostic.source === 'scout'));
});

test('Scout tolerant parsing of valid Scout remains strict and diagnostic-free', () => {
  const document = parseTolerant('{"a":1, // comment\n}');
  assert.equal(document.incomplete, false);
  assert.equal(document.recoveryMode, 'strict');
  assert.deepEqual(document.diagnostics, []);
  assert.deepEqual(document.value, { a: 1 });
});
