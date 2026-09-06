import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseValue, ScoutSyntaxError } from '../src/index.js';

test('Scout rejects inputs above the configured byte ceiling before tokenization', () => {
  const source = JSON.stringify({ value: 'x'.repeat(1024) });
  assert.throws(
    () => parse(source, { maxBytes: 128 }),
    (error) => error instanceof ScoutSyntaxError && /exceeds 128 byte limit/.test(error.message)
  );
});

test('Scout rejects nesting above the configured depth ceiling', () => {
  const source = '[[[[[0]]]]]';
  assert.throws(
    () => parse(source, { maxDepth: 3 }),
    (error) => error instanceof ScoutSyntaxError && /nesting exceeds 3 level limit/.test(error.message)
  );
});

test('Scout parser limits remain configurable for legitimate deep documents', () => {
  const source = '[[[[[0]]]]]';
  assert.deepEqual(parseValue(source, { maxDepth: 8 }), [[[[[0]]]]]);
});

test('Scout validates parser limit options instead of silently accepting invalid bounds', () => {
  assert.throws(() => parse('{}', { maxBytes: 0 }), /maxBytes must be a positive safe integer/);
  assert.throws(() => parse('{}', { maxDepth: -1 }), /maxDepth must be a positive safe integer/);
});
