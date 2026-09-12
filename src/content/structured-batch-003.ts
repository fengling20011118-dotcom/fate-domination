import type { ConfirmedSkillOverride } from "./confirmed-skill-overrides.ts";

// skills-003 批次：由子代理按牌面原文逐项确认后填充。
// 规则：仅在整张卡的语义都能被结构化效果或既有通用字段精确表达时才登记 FULL；
// 任何无法精确表达的条款都不得登记，保持生成结构中的 host_adjudicated 状态。
export const structuredBatch003Overrides: Record<string, ConfirmedSkillOverride> = {};
