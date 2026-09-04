# Scout ecosystem role

Scout is the ecosystem's human-friendly, JSON-compatible structured-data format. It is deliberately a data format, not a programming language.

## Intent

Scout keeps JSON's familiar object/array/string/number/boolean/null value model while making configuration and machine-readable documents easier for humans and tools to maintain.

The intended format includes native `//` and `/* ... */` comments and trailing commas while preserving deterministic JSON-compatible semantic values. Comments/trivia may be retained by lossless tooling but do not silently become application data. Parsing Scout never executes code.

## Relationships

Scout is companion infrastructure for the Cannon ecosystem, but it is not Cannon-specific and should remain useful to software written in other languages.

Potential first-party uses include Cannon/Velocity project configuration, Chronos build/release configuration, Cortex settings/tooling documents and machine-readable manifests. Nova/Cortex tooling can consume source ranges and lossless syntax metadata where useful.

## Boundary

Scout must not turn into a scripting language, template engine, environment-variable runtime or dumping ground for unrelated syntax. Interoperability with ordinary JSON is a core property.

## Branch-preservation note

The `agent/scout-universal-interop` branch contains the explicit comments + trailing-commas product definition plus parser/tokenizer/language-service work and dedicated trailing-comma tests. Preserve and semantically reconcile that work into canonical main before any branch cleanup.
