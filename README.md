# Scout

**JSON you can actually write.**

Scout is a human-friendly, JSON-compatible structured-data format for configuration, manifests, tooling, and machine-readable documents. Scout keeps JSON's familiar value model while adding the two authoring features developers repeatedly need: **native comments** and **trailing commas**.

```scout
{
  // Application configuration
  "app": {
    "name": "My Application",
    "version": "1.0.0",
  },

  /* Production database settings */
  "database": {
    "host": "localhost",
    "port": 5432,
  },
}
```

Scout files use the `.scout` extension.

## Core guarantees

- Every valid JSON document is valid Scout syntax.
- Scout preserves the JSON value model: object, array, string, number, boolean, and null.
- `//` line comments and `/* ... */` block comments are native syntax.
- Objects and arrays may contain a trailing comma before their closing delimiter.
- Comments and trailing commas never change the resulting semantic data value.
- Parsing Scout never executes code.
- Scout can convert cleanly to ordinary JSON.
- Strict parsing and recovery-oriented editor parsing remain separate.

## Trailing commas

Scout permits a single trailing comma after the final object member or array element:

```scout
{
  "name": "Scout",
  "version": 1,
}
```

```scout
[
  "web",
  "apps",
  "ai",
]
```

The canonical `main` implementation and regression suite verify trailing commas for objects and arrays, preserve comments after trailing commas as dangling container comments, and verify that trailing commas do not change JSON-equivalent semantic values.

## What Scout is

Scout is a data format, not a programming language. A `.scout` document is never executable simply because it is Scout. Parsing produces ordinary JSON-compatible values plus optional document metadata for comments, source positions, formatting, syntax identity, and editor tooling.

## JSON interoperability

```bash
scout to-json config.scout
scout from-json config.json
```

Scout-specific comments and trailing commas are removed when converting to standard JSON while semantic values are preserved.

## CLI

```bash
scout parse config.scout
scout validate config.scout
scout format config.scout
scout to-json config.scout
scout from-json config.json
```

The package also exposes `scout-lsp` for editor integration.

## Architecture

```text
.scout source
     │
     ▼
Tokenizer + lossless lexer
     │
     ▼
Strict parser ───────── Recovery parser
     │                         │
     └────────────┬────────────┘
                  ▼
          Scout Document Model
                  │
       ┌──────────┼───────────┐
       ▼          ▼           ▼
 JSON value     AST       comments/trivia
       │          │           │
       └──────────┼───────────┘
                  ▼
       source-preserving edits
                  │
                  ▼
 formatter / serializer / LSP
```

The lossless representation can retain exact source text, comments, whitespace trivia, raw scalar spellings, raw quoted keys, property order, source ranges, token identity, syntax-node identity, and trailing-comma presence.

## Editor tooling

Scout's language-service/LSP foundation includes diagnostics, completion candidates, quick fixes, hover information, document symbols, folding ranges, selection ranges, property rename edits, incremental synchronization, and malformed-edit recovery.

VS Code uses:

```text
Language ID: scout
Extension:   .scout
Scope:       source.scout
```

See [VSCODE.md](./VSCODE.md).

## Role in the Cannon developer ecosystem

Scout is companion infrastructure for Cannon, but it is intentionally not Cannon-specific. It can be used for Velocity project configuration, Chronos build/release configuration, Cortex settings/tooling documents, manifests, AI/model configuration, infrastructure metadata, and software written in other languages.

Scout remains non-executable structured data while Cannon/Cannon+ remain executable languages.

See [ECOSYSTEM.md](./ECOSYSTEM.md) for ecosystem boundaries.

## What Scout is not

Scout is not a scripting language, template engine, executable configuration runtime, environment-variable engine, shell, or dumping ground for unrelated syntax extensions.

## Specification

The canonical grammar and implementation contract live in [SPEC.md](./SPEC.md).

## Project status

Scout is under active pre-1.0 development. Canonical `main` contains strict and recovery parsing, lossless syntax, source-oriented editing, incremental reparsing, diagnostics, editor intelligence, stdio LSP transport, VS Code support, native comments, and trailing-comma parsing/regression coverage.

The stable 1.0 specification should be frozen only when grammar, implementation, conformance tests, formatter, conversion behavior, recovery behavior, and editor tooling agree.

## License

MIT

---

**Scout** — *Structured for machines. Documented for humans.*
