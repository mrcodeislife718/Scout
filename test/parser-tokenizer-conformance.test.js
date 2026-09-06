import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseValue } from '../src/parser.js';
import { tokenize } from '../src/tokenizer.js';

function assertSyntaxError(source, pattern) {
  assert.throws(() => parse(source), (error) => {
    assert.equal(error?.name, 'ScoutSyntaxError');
    assert.match(error.message, pattern);
    return true;
  });
}

test('Scout tokenizer identifies Scout in type errors', () => {
  assert.throws(() => tokenize(null), /Scout source must be a string/);
});

test('Scout accepts RFC 8259 number forms', () => {
  for (const source of ['0', '-0', '1', '-12', '3.14', '1e10', '1E-10', '-2.5e+3']) {
    assert.equal(parseValue(source), JSON.parse(source));
  }
});

test('Scout rejects malformed numeric prefixes instead of tokenizing a valid prefix', () => {
  for (const source of ['01', '-01', '1.', '1e', '1e+', '1e-', '2x', '3.4foo']) {
    assertSyntaxError(source, /Invalid number literal|Unexpected character|Expected eof/);
  }
});

test('Scout rejects numeric overflow outside the finite JSON number model', () => {
  assertSyntaxError('1e9999', /outside Scout numeric range/);
});

test('Scout rejects literal prefixes followed by identifier characters', () => {
  for (const source of ['truex', 'false0', 'nullfoo']) {
    assertSyntaxError(source, /Invalid literal/);
  }
});

test('Scout string decoding matches JSON for valid escapes', () => {
  const values = [
    '"plain"',
    '"quote: \\""',
    '"slash: \\\\"',
    '"line\\nfeed"',
    '"unicode: \\u263A"',
    '"surrogate: \\uD83D\\uDE00"'
  ];
  for (const source of values) assert.equal(parseValue(source), JSON.parse(source));
});

test('Scout rejects invalid strings and control characters', () => {
  for (const source of ['"unterminated', '"bad\\xescape"', '"line\nfeed"']) {
    assertSyntaxError(source, /Unterminated string|Invalid string escape|Unescaped control character/);
  }
});

test('Scout comments and trailing commas preserve JSON-equivalent semantic values', () => {
  const source = `{
    // leading
    "a": 1,
    "b": [true, null, /* inside */ "x",],
  }`;
  assert.deepEqual(parseValue(source), { a: 1, b: [true, null, 'x'] });
  const document = parse(source);
  assert.equal(document.ast.trailingComma, true);
  const b = document.ast.members.find((member) => member.key === 'b');
  assert.equal(b.value.trailingComma, true);
  assert.ok(document.comments.length >= 2);
});

test('Scout duplicate object names remain lossless and deterministic', () => {
  const document = parse('{"key":1,"key":2}');
  assert.equal(document.ast.members.length, 2);
  assert.deepEqual(document.ast.members.map((member) => member.key), ['key', 'key']);
  assert.equal(document.value.key, 2);
  assert.equal(document.value.key, JSON.parse('{"key":1,"key":2}').key);
});

test('Scout source positions remain one-based and point at the original token', () => {
  const document = parse('{\n  "alpha": 1,\n  "beta": "ok"\n}');
  const alpha = document.ast.members[0];
  const beta = document.ast.members[1];
  assert.deepEqual(alpha.keyStart, { offset: 4, line: 2, column: 3 });
  assert.deepEqual(beta.keyStart, { offset: 18, line: 3, column: 3 });
  assert.deepEqual(beta.value.start, { offset: 26, line: 3, column: 11 });
});

test('Scout enforces configured input byte limits using UTF-8 bytes', () => {
  assert.throws(() => parse('"😀"', { maxBytes: 5 }), /exceeds 5 byte limit/);
  assert.equal(parseValue('"😀"', { maxBytes: 6 }), '😀');
});

test('Scout enforces configured nesting depth deterministically', () => {
  assert.deepEqual(parseValue('{"a":1}', { maxDepth: 1 }), { a: 1 });
  assert.throws(() => parse('{"a":{"b":1}}', { maxDepth: 1 }), /nesting exceeds 1 level limit/);
});
