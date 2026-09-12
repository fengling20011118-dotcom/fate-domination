import type { EventDefinition } from "../rules-core/content-types.ts";

export const RUSSIAN_LOSTBELT_POOL_ID = "lostbelt:russia";
export const SCANDINAVIAN_LOSTBELT_POOL_ID = "lostbelt:scandinavia";
export const INDIAN_LOSTBELT_POOL_ID = "lostbelt:india";
export const CHINESE_LOSTBELT_POOL_ID = "lostbelt:china";

function copies(
  prefix: string,
  count: number,
  victoryPoints: number,
  tags: string[],
  combatPower?: EventDefinition["combatPower"],
): EventDefinition[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}.${index + 1}`,
    victoryPoints,
    tags: [...tags],
    ...(combatPower ? { combatPower: structuredClone(combatPower) } : {}),
  }));
}

const russianObjectives: EventDefinition[] = [
  ...copies("event.lostbelt.russia.frozen-wastes", 5, 1, [
    "lostbelt-objective",
    "lostbelt-group:russia",
    "lostbelt-effect:frozen-wastes",
  ]),
  ...copies("event.lostbelt.russia.survival-of-fittest", 2, 3, [
    "lostbelt-objective",
    "lostbelt-group:russia",
    "lostbelt-effect:survival-of-fittest",
    "lostbelt:block-exit",
  ]),
  ...copies("event.lostbelt.russia.royal-decree", 2, 5, [
    "lostbelt-objective",
    "lostbelt-group:russia",
    "lostbelt-effect:royal-decree",
  ]),
];

const scandinavianObjectives: EventDefinition[] = [
  ...copies("event.lostbelt.scandinavia.day-of-peace", 3, 0, [
    "lostbelt-objective",
    "lostbelt-group:scandinavia",
    "lostbelt-effect:day-of-peace",
    "lostbelt:remove-after-combat",
  ]),
  ...copies("event.lostbelt.scandinavia.surtrs-domain", 2, 4, [
    "lostbelt-objective",
    "lostbelt-group:scandinavia",
    "lostbelt-effect:surtrs-domain",
  ], { cardAddByAttribute: { "力量": 4, "迅捷": -2 } }),
  ...copies("event.lostbelt.scandinavia.envoys-domain", 2, 4, [
    "lostbelt-objective",
    "lostbelt-group:scandinavia",
    "lostbelt-effect:envoys-domain",
  ], { cardAddByAttribute: { "迅捷": 4, "魔术": -2 } }),
  ...copies("event.lostbelt.scandinavia.skadis-domain", 2, 4, [
    "lostbelt-objective",
    "lostbelt-group:scandinavia",
    "lostbelt-effect:skadis-domain",
  ], { cardAddByAttribute: { "魔术": 4, "力量": -2 } }),
];

const indianObjectives: EventDefinition[] = [
  ...copies("event.lostbelt.india.lotus-fields", 2, 1, ["lostbelt-objective", "lostbelt-group:india", "india-type-bonus:力量", "india-extra-draw-if-not-expanded"]),
  ...copies("event.lostbelt.india.field-research", 2, 1, ["lostbelt-objective", "lostbelt-group:india", "india-type-bonus:魔术", "india-extra-draw-if-not-expanded"]),
  ...copies("event.lostbelt.india.hunting-grounds", 2, 1, ["lostbelt-objective", "lostbelt-group:india", "india-type-bonus:迅捷", "india-extra-draw-if-not-expanded"]),
  ...copies("event.lostbelt.india.great-sky-boulder", 1, 0, ["lostbelt-objective", "lostbelt-group:india", "india-great-sky-boulder"]),
  ...copies("event.lostbelt.india.fading-town", 1, 0, ["lostbelt-objective", "lostbelt-group:india", "india-fading-town"]),
  ...copies("event.lostbelt.india.withering-plains", 1, 0, ["lostbelt-objective", "lostbelt-group:india", "india-withering-plains"]),
  ...copies("event.lostbelt.india.ocean-of-milk", 1, 2, ["lostbelt-objective", "lostbelt-group:india", "india-ocean-of-milk"]),
];

const QIN_NPC_ID = "npc.qin-shi-huang";
const qinPresence = `npc-presence:${QIN_NPC_ID}`;
const china = ["lostbelt-objective", "lostbelt-group:china", qinPresence];
const chineseObjectives: EventDefinition[] = [
  ...copies("event.lostbelt.china.storm-the-capital", 1, 7, [...china, `npc-power:${QIN_NPC_ID}:7`, "lostbelt:remove-after-combat", "lostbelt:no-return"]),
  ...copies("event.lostbelt.china.quest-for-perfection", 1, 3, [...china, `npc-power:${QIN_NPC_ID}:2`, "china-positive-board-power-x2"]),
  ...copies("event.lostbelt.china.quest-for-immortality", 1, 3, [...china, `npc-power:${QIN_NPC_ID}:2`, "china-defeat-immunity"]),
  ...copies("event.lostbelt.china.walk-on-clouds", 1, 3, [...china, `npc-power:${QIN_NPC_ID}:3`, "china-total-power:single-face-up:5"]),
  ...copies("event.lostbelt.china.walk-under-the-sun", 1, 2, [...china, `npc-power:${QIN_NPC_ID}:3`, "china-total-power:all-active-printed-even:5"]),
  ...copies("event.lostbelt.china.walk-on-water", 1, 2, [...china, `npc-power:${QIN_NPC_ID}:3`, "china-total-power:all-active-printed-even:5"]),
  ...copies("event.lostbelt.china.deep-tranquility", 1, 1, [...china, `npc-power:${QIN_NPC_ID}:-3`, "china-forbid-attribute:力量"]),
  ...copies("event.lostbelt.china.deep-dive", 1, 1, [...china, `npc-power:${QIN_NPC_ID}:-3`, "china-forbid-attribute:迅捷"]),
  ...copies("event.lostbelt.china.deep-lore", 1, 1, [...china, `npc-power:${QIN_NPC_ID}:-3`, "china-forbid-attribute:魔术"]),
];

export const LOSTBELT_SPECIAL_EVENT_POOLS: Readonly<Record<string, readonly EventDefinition[]>> = Object.freeze({
  [RUSSIAN_LOSTBELT_POOL_ID]: Object.freeze(russianObjectives),
  [SCANDINAVIAN_LOSTBELT_POOL_ID]: Object.freeze(scandinavianObjectives),
  [INDIAN_LOSTBELT_POOL_ID]: Object.freeze(indianObjectives),
  [CHINESE_LOSTBELT_POOL_ID]: Object.freeze(chineseObjectives),
});
