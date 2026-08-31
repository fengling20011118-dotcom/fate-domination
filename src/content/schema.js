export const CONTENT_KINDS = Object.freeze([
  "master",
  "servant",
  "attack-card",
  "skill-card",
  "event-card",
  "situation-card",
]);

export function isStableId(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(value);
}
