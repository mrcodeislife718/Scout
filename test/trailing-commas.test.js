import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseValue, toJSON } from '../src/index.js';

test('Scout accepts trailing commas in objects', () => {
  const source = '{\n  // application\n  "name": "Scout",\n  "enabled": true,\n}\n';
  const document = parse(source);
  assert.deepEqual(document.value, { name: 'Scout', enabled: true });
  assert.equal(document.ast.trailingComma, true);
});

test('Scout accepts trailing commas in arrays', () => {
  const source = '[\n  1,\n  2,\n  3,\n]\n';
  const document = parse(source);
  assert.deepEqual(document.value, [1, 2, 3]);
  assert.equal(document.ast.trailingComma, true);
});

test('comments after a trailing comma are preserved as dangling comments', () => {
  const source = '{\n  "port": 3000,\n  // keep this note\n}\n';
  const document = parse(source);
  assert.equal(document.ast.trailingComma, true);
  assert.equal(document.ast.danglingComments.length, 1);
  assert.match(document.ast.danglingComments[0].text, /keep this note/);
});

test('trailing commas do not change semantic JSON values', () => {
  const source = '{ "items": [1, 2,], }';
  assert.deepEqual(parseValue(source), { items: [1, 2] });
  assert.equal(JSON.parse(toJSON(source)).items.length, 2);
});
