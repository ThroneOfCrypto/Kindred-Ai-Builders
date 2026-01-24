// JSON canonicalization kernel for SPEL.
// One place defines stable meaning for hashing/signing.

function isPlainObject(x) {
  if (!x || typeof x !== "object") return false;
  if (Array.isArray(x)) return false;
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

function cmpLegacy(a, b) {
  // historical behavior across the repo
  return String(a).localeCompare(String(b));
}

function cmpCodepoint(a, b) {
  // RFC8785/JCS-style ordering uses codepoint comparisons rather than locale
  a = String(a);
  b = String(b);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function canonicalize(value, opts, seen) {
  // Primitives
  if (value === null) return null;
  const t = typeof value;
  if (t !== "object") {
    if (t === "number" && opts.strict_numbers) {
      if (!Number.isFinite(value)) {
        throw new Error(`Non-finite number not allowed in strict mode: ${value}`);
      }
    }
    return value;
  }

  // Cycles (should not appear in JSON docs, but defensive tooling is good)
  if (seen.has(value)) {
    if (opts.circular === "error") {
      throw new Error("Circular reference encountered during canonicalization");
    }
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((v) => canonicalize(v, opts, seen));
  }

  if (!isPlainObject(value)) {
    // For non-plain objects, best-effort: stringify their enumerable props.
    const out = {};
    for (const k of Object.keys(value).sort(opts._cmp)) {
      out[k] = canonicalize(value[k], opts, seen);
    }
    return out;
  }

  const keys = Object.keys(value).sort(opts._cmp);
  const out = {};
  for (const k of keys) {
    out[k] = canonicalize(value[k], opts, seen);
  }
  return out;
}

export function stableStringify(value, indent = 2, options = {}) {
  const mode = options.mode || "legacy";
  const opts = {
    mode,
    circular: options.circular || "string",
    strict_numbers: Boolean(options.strict_numbers),
    _cmp: mode === "rfc8785" ? cmpCodepoint : cmpLegacy,
  };
  const canon = canonicalize(value, opts, new WeakSet());
  return JSON.stringify(canon, null, indent);
}

export function stableJsonText(value, indent = 2, options = {}) {
  return stableStringify(value, indent, options) + "\n";
}

// Canonical string intended for hashing/signing.
export function jcsStringify(value, options = {}) {
  // JCS expects no whitespace.
  return stableStringify(value, 0, { ...options, mode: options.mode || "rfc8785", strict_numbers: true });
}
