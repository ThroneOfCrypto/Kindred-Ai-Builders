export type JsonC14nMode = "legacy" | "rfc8785";

export type JsonC14nOptions = {
  mode?: JsonC14nMode;
  /**
   * How to handle cycles. JSON should not contain cycles.
   * - "string": replace with "[Circular]" (legacy-friendly)
   * - "error": throw
   */
  circular?: "string" | "error";
  /**
   * If true, reject non-finite numbers (NaN/Infinity), matching JCS expectations.
   */
  strict_numbers?: boolean;
};

export function stableStringify(value: any, indent?: number, options?: JsonC14nOptions): string;
export function stableJsonText(value: any, indent?: number, options?: JsonC14nOptions): string;
export function jcsStringify(value: any, options?: JsonC14nOptions): string;
