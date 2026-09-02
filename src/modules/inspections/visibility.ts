export type VisibilityCondition = {
  sourceItemKey: string;
  operator: "equals" | "not_equals" | "is_truthy";
  value?: string | null;
};

function normalized(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim().toLowerCase();
  return "";
}

function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.trim() !== "" && value.trim().toLowerCase() !== "false";
  return false;
}

export function visibilityConditionMatches(
  condition: VisibilityCondition | null | undefined,
  responsesByItemKey: ReadonlyMap<string, unknown>,
): boolean {
  if (!condition) return true;
  const sourceValue = responsesByItemKey.get(condition.sourceItemKey);
  if (condition.operator === "is_truthy") return truthy(sourceValue);
  const sourceHasResponse = sourceValue !== null && sourceValue !== undefined &&
    !(typeof sourceValue === "string" && sourceValue.trim() === "") &&
    !(Array.isArray(sourceValue) && sourceValue.length === 0);
  if (!sourceHasResponse) return false;
  const equal = normalized(sourceValue) === normalized(condition.value);
  return condition.operator === "equals" ? equal : !equal;
}
