# Scout ecosystem role

Scout is the ecosystem's human-friendly, JSON-compatible structured-data format. It is deliberately a data format, not a programming language.

## Intent

Scout keeps JSON's familiar object/array/string/number/boolean/null value model while making configuration and machine-readable documents easier for humans and tools to maintain.

The format includes native `//` and `/* ... */` comments and trailing commas while preserving deterministic JSON-compatible semantic values. Comments/trivia may be retained by lossless tooling but do not silently become application data. Parsing Scout never executes code.

## Relationships

Scout is companion infrastructure for the Cannon ecosystem, but it is not Cannon-specific and should remain useful to software written in other languages.

Potential first-party uses include Cannon/Velocity project configuration, Chronos build/release configuration, Cortex settings/tooling documents and machine-readable manifests. Nova/Cortex tooling can consume source ranges and lossless syntax metadata where useful.

## Boundary

Scout must not turn into a scripting language, template engine, environment-variable runtime or dumping ground for unrelated syntax. Interoperability with ordinary JSON is a core property.

## Branch reconciliation

The important product semantics from `agent/scout-universal-interop` are now represented in canonical `main`: trailing-comma parser behavior, dedicated regression coverage, canonical README documentation, and the Scout 0.5 specification all describe comments + trailing commas as first-class Scout syntax.

The historical branch should be retained until portfolio cleanup verifies no additional unique history or evidence needs preservation, but canonical product truth now lives on `main`.
