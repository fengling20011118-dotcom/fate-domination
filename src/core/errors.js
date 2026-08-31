export class RuleError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RuleError";
    this.code = code;
    this.details = details;
  }
}

export function invariant(condition, code, message, details) {
  if (!condition) {
    throw new RuleError(code, message, details);
  }
}
