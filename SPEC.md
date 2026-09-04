# Scout 0.5 Grammar and Document Model

Scout is a non-executable, JSON-compatible structured-data format. It preserves JSON's value model while adding native comments and trailing commas, plus lossless document tooling for editors and source-preserving automation.

## Lexical grammar

```ebnf
scout         = ws, value, ws, EOF ;
value         = object | array | string | number | "true" | "false" | "null" ;
object        = "{", ws, [ member, { ws, ",", ws, member }, [ ws, "," ] ], ws, "}" ;
member        = string, ws, ":", ws, value ;
array         = "[", ws, [ value, { ws, ",", ws, value }, [ ws, "," ] ], ws, "]" ;
ws            = { whitespace | line-comment | block-comment } ;
line-comment  = "//", { any-char-except-LF }, [ LF ] ;
block-comment = "/*", { any-char-until-*/ }, "*/" ;
```

Strings, escapes, Unicode escapes, and numbers follow RFC 8259 JSON syntax.

## Trailing commas

Objects and arrays may contain one comma after the final member or element:

```scout
{
  "name": "Scout",
  "enabled": true,
}
```

```scout
[
  1,
  2,
  3,
]
```

The trailing comma is syntax metadata. It does not change the semantic value returned by `parseValue()` or Scout-to-JSON conversion.

Comments may appear between the trailing comma and the closing delimiter. Lossless parsing retains them as dangling container comments.

## Semantic model

Scout has exactly the JSON value categories:

- object
- array
- string
- number
- boolean
- null

Comments, whitespace, source ranges, token identities, formatting, and trailing-comma presence are document metadata, not application data.

## Strict document model

`parse(source)` returns a strict `Document` containing:

- `value`: JSON-equivalent semantic data;
- `ast`: Object, Member, Array, Element, String, Number, Boolean, and Null syntax nodes;
- `comments`: comments in source order with source ranges;
- `tokens`: lossless syntax/comment/whitespace tokens with raw text and IDs;
- `source`: exact source text;
- `revision`: document revision number;
- `lastChangeRanges`: ranges changed by the most recent transaction.

Object and Array nodes record `trailingComma: true` when a trailing comma is present.

## Lossless syntax

The lossless layer retains raw literals, raw quoted property keys, exact source positions, property order, comments, whitespace trivia, token IDs, syntax-node IDs, and trailing-comma presence. Untouched source can therefore remain byte-for-byte unchanged during local edits.

## Comment attachment

Object members may carry `leadingComments`, `beforeColonComments`, `beforeValueComments`, and `trailingComments`. Array elements carry leading and trailing comments. Empty containers and comments appearing after a trailing comma may be represented as dangling comments on the container.

A same-line comment after a comma belongs to the preceding value. A comment beginning on a later line belongs to the following member/element, or to the container when the comma is trailing.

## Source-oriented editing

Scout provides local editing operations including `replaceValue`, `renameMember`, `removeValue`, `insertMember`, `insertElement`, and `moveValue`. These operations modify source ranges rather than canonicalizing the complete document.

## Transactional editing

Scout provides edit sessions and transactions:

```js
const session = createEditSession(document);
const tx = beginTransaction(session, 'change configuration');
addTextEdit(tx, start, end, replacement);
commitTransaction(tx);
undo(session);
redo(session);
```

A transaction contains one or more non-overlapping text edits. Commit applies them atomically, increments the document revision, records change ranges, and adds one undo-history entry. Rollback closes a transaction without changing source. A new commit clears redo history.

## Persistent syntax identity

`reconcileSyntaxIdentity(previous, next)` preserves syntax IDs where identity can be established across a reparse. Identity is document-local and intended for editor state, selections, diagnostics, symbols, and incremental tooling.

## Regional incremental reparsing

`smallestReparseRegion(document, edits)` identifies the smallest AST value subtree containing all edits. `reparseIncremental(document, edits)` reparses that subtree when safe and falls back to the full parser when a contained regional replacement cannot preserve correctness.

The lossless token layer is also updated regionally. Tokens outside a safe edit region are reused where possible, retaining token IDs while suffix positions are shifted by the source-length delta.

## Error-tolerant editor parsing

Editors routinely produce temporarily invalid source while a developer is typing. Scout therefore keeps strict parsing separate from recovery-oriented parsing.

`parseTolerant()` and recovery-aware document-store behavior may return an incomplete editor document containing diagnostics, recovery nodes, expected syntax categories, and the last valid semantic/structural state.

Recovery nodes are syntax-only and never become application data. Invalid Scout is never silently treated as valid configuration.

## Language service

Scout's language-service and LSP layers expose implemented editor operations including document synchronization, diagnostics, completion candidates, quick fixes, hover information, document symbols, folding ranges, selection ranges, and property rename edits.

## Compatibility

Every valid JSON document is valid Scout syntax. Scout-specific comments and trailing commas require a Scout-aware parser. Scout-to-JSON conversion removes Scout-only syntax while preserving semantic values.

Parsing Scout never executes code.

## Ecosystem role

Scout is first-party structured-data infrastructure for the Cannon developer ecosystem, but it is intentionally language-independent. See [ECOSYSTEM.md](./ECOSYSTEM.md) for integration boundaries.

## Current boundary

Scout 0.5 remains pre-1.0. The stable specification should be frozen only when the grammar, parser, conversion behavior, formatter, conformance tests, recovery behavior, and editor tooling agree.
