# Scout Vision

## Product identity

Scout is **JSON you can actually write**: a human-friendly, JSON-compatible structured-data format for configuration, manifests, tooling, and machine-readable documents.

Scout is not a Cannon-only format and must remain independently useful to software written in any language.

## Primary comparison set

Scout is our answer to the problem space occupied by:

- JSON
- JSONC
- JSON5-style human-authored structured configuration

Scout does not exist to copy these systems. It exists to preserve JSON's strongest property — universal, predictable machine-readable data — while removing recurring authoring and tooling friction.

## Strengths to preserve

- JSON-compatible value model.
- Every valid JSON document remains valid Scout syntax.
- Native comments.
- Trailing commas.
- Deterministic non-executable parsing.
- Clean JSON interoperability.
- Lossless syntax/document representation.
- Strict parsing and recovery parsing as distinct modes.
- Formatter, conversion, CLI, LSP, diagnostics, incremental editing, and source-preserving tooling.

## Weaknesses to eliminate

Scout should remove common pain associated with raw JSON without becoming a language:

- no inability to document configuration;
- no fragile manual comma editing;
- no need to discard comments during tooling operations;
- no editor architecture that requires reparsing malformed documents as if they were complete;
- no executable configuration semantics hidden inside a data format.

## Independent ceiling

Scout should be technically excellent as a standalone structured-data/configuration format and tooling ecosystem even for developers who never use Cannon.

## Ecosystem role

Scout may be used by Cannon, Velocity, Chronos, Cortex, and other tools for structured configuration and manifests, but those products own the semantics of their own configuration. Scout owns the data format and its tooling.

## Architectural invariant

**Do not turn Scout into executable configuration, a scripting language, a package manager, or a universal control plane. Integration must strengthen Scout's original vision, not redefine it.**
