import { invariant } from "../core/errors.js";

export class ContentRepository {
  constructor(content) {
    this.content = structuredClone(content);
    this.byId = new Map();
    for (const entity of this.#allEntities()) {
      invariant(entity?.id, "CONTENT_ID_REQUIRED", "内容实体缺少 ID。", { entity });
      invariant(!this.byId.has(entity.id), "CONTENT_ID_DUPLICATE", "内容实体 ID 重复。", {
        id: entity.id,
      });
      this.byId.set(entity.id, entity);
    }
  }

  get(id) {
    const entity = this.byId.get(id);
    return entity ? structuredClone(entity) : null;
  }

  require(id) {
    const entity = this.get(id);
    invariant(entity, "CONTENT_NOT_FOUND", "未找到内容实体。", { id });
    return entity;
  }

  list(kind) {
    const collection = this.content[kind];
    invariant(Array.isArray(collection), "CONTENT_KIND_INVALID", "未知内容集合。", { kind });
    return structuredClone(collection);
  }

  #allEntities() {
    return [
      ...this.content.masters.flatMap((master) => [master, ...master.skills]),
      ...this.content.servants.flatMap((servant) => [servant, ...servant.skills]),
      ...this.content.cards,
      ...this.content.situations,
      ...this.content.eventGroups.flatMap((group) => [group, ...group.cards]),
      ...this.content.civilizationRuins,
    ];
  }
}
