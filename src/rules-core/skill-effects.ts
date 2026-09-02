export type SkillEffectSpec =
  | { kind: "draw-cards"; count: number }
  | { kind: "gain-mana"; amount: number }
  | { kind: "gain-victory-points"; amount: number }
  | { kind: "restore-command-seal"; amount: number }
  | { kind: "combat-power-bonus"; amount: number; scope: "self" };

/**
 * Faithful authored-text segmentation for migration evidence. Clauses are
 * not executable until a verified handler explicitly implements them.
 */
export interface SkillTextClause {
  index: number;
  text: string;
  /** Explicit section title printed before a phase/keyword clause. */
  sectionName?: string;
  phase?: "preparation" | "outpost" | "action" | "combat";
  trigger: "passive" | "optional-phase" | "phase" | "play" | "other";
  hasChoice: boolean;
  hasDerivedCard: boolean;
  hasLifecycle: boolean;
  hasCombat: boolean;
}

export interface ParsedSkillEffects {
  effects: SkillEffectSpec[];
  unparsed: string[];
  clauses: SkillTextClause[];
}

/**
 * Parses only deterministic, unconditional clauses. Unknown or conditional
 * text is retained in `unparsed` so migration never turns an approximation
 * into a FULL implementation.
 */
export function parseSkillEffects(text: string): ParsedSkillEffects {
  const effects: SkillEffectSpec[] = [];
  const unparsed: string[] = [];
  const clauses = segmentSkillText(text);
  for (const { text: rawClause } of clauses) {
    // These are card metadata markers, not unresolved effects.  They are
    // already represented by the structured skill fields and must not keep a
    // card partial when the remaining text is deterministic.
    const clause = rawClause
      .replace(/^【真名解放】\s*/, "")
      .replace(/^<每局游戏限一次>\s*/, "")
      .replace(/^打出时[:：]\s*/, "")
      .replace(/^(?:(?:被动|可选)[／/]\s*)?(?:行动阶段|战斗阶段|前哨阶段|准备阶段)[:：]\s*/, "")
      .trim();
    if (!clause || clause === "（升华技，解锁后将此牌加入你的技能区）" || clause === "（升华技，将此牌加入你的技能区）") continue;
    let match = /^(?:你)?抽(一|二|两|三|四|五|六|七|八|九|十|\d+)张牌$/.exec(clause);
    if (match) {
      effects.push({ kind: "draw-cards", count: parseCount(match[1]) });
      continue;
    }
    match = /^(?:你)?获得(一|二|两|三|四|五|六|七|八|九|十|\d+)点魔力$/.exec(clause);
    if (match) {
      effects.push({ kind: "gain-mana", amount: parseCount(match[1]) });
      continue;
    }
    match = /^(?:你)?获得(一|二|两|三|四|五|六|七|八|九|十|\d+)点战果$/.exec(clause);
    if (match) {
      effects.push({ kind: "gain-victory-points", amount: parseCount(match[1]) });
      continue;
    }
    if (clause === "立刻恢复一枚令咒" || clause === "恢复一枚令咒") {
      effects.push({ kind: "restore-command-seal", amount: 1 });
      continue;
    }
    match = /^(?:你的)?(?:总威力|合计威力)[+＋](一|二|两|三|四|五|六|七|八|九|十|\d+)$/.exec(clause);
    if (match) {
      effects.push({ kind: "combat-power-bonus", amount: parseCount(match[1]), scope: "self" });
      continue;
    }
    unparsed.push(rawClause);
  }
  return { effects, unparsed, clauses };
}

function parseCount(value: string): number {
  const values: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const parsed = values[value] ?? Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("SKILL_EFFECT_COUNT_INVALID");
  return parsed;
}

/** Splits authored text without inferring unverified rules semantics. */
export function segmentSkillText(text: string): SkillTextClause[] {
  // Development card text uses a spaced slash as a top-level separator for
  // independent clauses.  Keep inline forms such as "被动/行动阶段" intact.
  return text.split(/[\n。]+|\s+\/\s+/).map((part) => part.trim()).filter(Boolean).map((rawClause, index) => {
    // Only capture an explicit, short title immediately followed by a
    // documented phase/keyword marker.  Ordinary prose containing a dash is
    // intentionally left untouched; this is metadata, never rule inference.
    const sectionMatch = /^([^：:\n]{1,30})\s*[-—]\s*(?=(?:被动|行动阶段|战斗阶段|前哨阶段|准备阶段|反转|残留|唯一|【真名解放】))/.exec(rawClause);
    const sectionName = sectionMatch?.[1]?.trim();
    const phaseMatch = /^(准备|前哨|行动|战斗)阶段[:：]?/.exec(rawClause);
    const phaseNames = { 准备: "preparation", 前哨: "outpost", 行动: "action", 战斗: "combat" } as const;
    const phase = phaseMatch ? phaseNames[phaseMatch[1] as keyof typeof phaseNames] : undefined;
    const optionalPhase = /^被动[／/]\s*(准备|前哨|行动|战斗)阶段/.test(rawClause);
    return {
      index,
      text: rawClause,
      ...(sectionName ? { sectionName } : {}),
      phase,
      trigger: /^被动[:：]/.test(rawClause) ? "passive" : optionalPhase ? "optional-phase" : phase ? "phase" : /^(此牌需追加打出|【真名解放】)/.test(rawClause) ? "play" : "other",
      hasChoice: /选择|可以|任意|至多|展示|若如此|你可/.test(rawClause),
      hasDerivedCard: /衍生|从游戏外|创造|加入.*(?:手牌|牌库|技能区|弃牌堆)/.test(rawClause),
      hasLifecycle: /残留|关闭|移除游戏|弃置|洗回|回合结束|下回合/.test(rawClause),
      hasCombat: /战斗阶段|战力|威力|败北|获胜|战败/.test(rawClause),
    };
  });
}
