import { invariant } from "../core/errors.js";

const ACTIVATION_KINDS = new Set([
  "passive",
  "optional-trigger",
  "active",
  "play",
  "reaction",
  "residual",
]);

export class SkillRegistry {
  #definitions = new Map();
  #handlers = new Map();

  registerDefinition(definition) {
    invariant(definition?.id, "SKILL_ID_REQUIRED", "技能必须拥有稳定 ID。");
    invariant(!this.#definitions.has(definition.id), "SKILL_ID_DUPLICATE", "技能 ID 重复。", {
      id: definition.id,
    });
    invariant(
      ACTIVATION_KINDS.has(definition.activation?.kind),
      "SKILL_ACTIVATION_INVALID",
      "技能必须声明合法的发动类型。",
      { id: definition.id, activation: definition.activation },
    );
    this.#definitions.set(definition.id, structuredClone(definition));
  }

  registerHandler(handlerId, handler) {
    invariant(handlerId, "SKILL_HANDLER_ID_REQUIRED", "技能处理器必须拥有 ID。");
    invariant(typeof handler === "function", "SKILL_HANDLER_INVALID", "技能处理器必须是函数。");
    invariant(!this.#handlers.has(handlerId), "SKILL_HANDLER_DUPLICATE", "技能处理器 ID 重复。", {
      handlerId,
    });
    this.#handlers.set(handlerId, handler);
  }

  get(skillId) {
    return this.#definitions.get(skillId) ?? null;
  }

  hasHandler(handlerId) {
    return this.#handlers.has(handlerId);
  }

  execute(skillId, context) {
    const definition = this.get(skillId);
    invariant(definition, "SKILL_NOT_FOUND", "未找到技能定义。", { skillId });
    const handler = this.#handlers.get(definition.handler);
    invariant(handler, "SKILL_HANDLER_NOT_FOUND", "未找到技能处理器。", {
      skillId,
      handlerId: definition.handler,
    });
    return handler({ ...context, skill: definition });
  }

  list() {
    return [...this.#definitions.values()].map((definition) => structuredClone(definition));
  }
}
