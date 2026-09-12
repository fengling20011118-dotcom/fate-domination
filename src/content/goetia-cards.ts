import type { CardDefinition } from "../rules-core/content-types.ts";

export const GOETIA_DEMON_GOD_TAG = "goetia-demon-god";
export const GOETIA_BAAL_ID = "card.goetia.demon-god.baal";
export const GOETIA_PHENEX_ID = "card.goetia.demon-god.phenex";
export const GOETIA_FORNEUS_ID = "card.goetia.demon-god.forneus";
export const GOETIA_FLAUROS_ID = "card.goetia.demon-god.flauros";
export const GOETIA_ZEPAR_ID = "card.goetia.demon-god.zepar";
export const GOETIA_RAUM_ID = "card.goetia.demon-god.raum";
export const GOETIA_BARBATOS_ID = "card.goetia.demon-god.barbatos";

const common = {
  version: 1,
  cardType: "attack" as const,
  ownerType: "master" as const,
  ownerDefinitionId: "master.goetia",
  basic: false,
  residual: true,
  standardAppendStackGroup: GOETIA_DEMON_GOD_TAG,
  tags: [GOETIA_DEMON_GOD_TAG],
};

/**
 * Physical Demon God attacks are not ordinary Master skill cards. Their
 * printed cost/power/type values come from the development card catalogue;
 * executable text is owned by master.goetia.skill.s2.
 */
export const GOETIA_DEMON_GOD_CARDS: readonly CardDefinition[] = Object.freeze([
  {
    ...common,
    id: GOETIA_BAAL_ID,
    name: "Demon God Baal",
    cost: 13,
    basePower: 1,
    typeLabel: "",
    attributes: [],
    powerImmutable: true,
  },
  {
    ...common,
    id: GOETIA_PHENEX_ID,
    name: "Demon God Phenex",
    cost: 13,
    basePower: 1,
    typeLabel: "",
    attributes: [],
    powerImmutable: true,
  },
  {
    ...common,
    id: GOETIA_FORNEUS_ID,
    name: "Demon God Forneus",
    cost: 5,
    basePower: 0,
    typeLabel: "力量",
    attributes: ["力量"],
  },
  {
    ...common,
    id: GOETIA_FLAUROS_ID,
    name: "Demon God Flauros",
    cost: 4,
    basePower: 0,
    typeLabel: "迅捷",
    attributes: ["迅捷"],
  },
  {
    ...common,
    id: GOETIA_ZEPAR_ID,
    name: "Demon God Zepar",
    cost: 6,
    basePower: 0,
    typeLabel: "魔术",
    attributes: ["魔术"],
  },
  {
    ...common,
    id: GOETIA_RAUM_ID,
    name: "Demon God Raum",
    cost: 2,
    basePower: 0,
    typeLabel: "特殊",
    attributes: ["特殊"],
  },
  {
    ...common,
    id: GOETIA_BARBATOS_ID,
    name: "Demon God Barbatos",
    cost: 3,
    basePower: 0,
    typeLabel: "",
    attributes: [],
  },
]);

export const GOETIA_DEMON_GOD_IDS = Object.freeze(GOETIA_DEMON_GOD_CARDS.map((card) => card.id));
