/**
 * Stable JSON utilities.
 *
 * JSON.stringify preserves insertion order of object keys, which is not a
 * reliable determinism guarantee when objects are constructed from varying
 * sources. These helpers canonicalize plain objects by sorting keys.
 */

function isPlainObject(x: any): x is Record<string, any> {
  if (!x || typeof x !== "object") return false;
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

export function canonicalizeJsonValue<T = any>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => canonicalizeJsonValue(v)) as any;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    const out: Record<string, any> = {};
    for (const k of keys) out[k] = canonicalizeJsonValue((value as any)[k]);
    return out as any;
  }
  return value;
}

export function stableStringify(value: any, indent: number = 2): string {
  return JSON.stringify(canonicalizeJsonValue(value), null, indent);
}

export function stableJsonText(value: any, indent: number = 2): string {
  return stableStringify(value, indent) + "\n";
}
