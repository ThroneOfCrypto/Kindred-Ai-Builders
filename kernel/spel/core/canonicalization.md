# Canonicalization (κ)

κ maps any valid SPEL encoding to a unique canonical form.

Properties:
- Deterministic
- Order-insensitive where semantics are commutative
- Stable across executions
- Hostile-reader auditable

If two encodings have the same κ output, they are semantically equivalent.
