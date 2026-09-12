import type { CardDefinition } from "../rules-core/content-types.ts";

export const MIYU_SAPPHIRE_SERVANT_ID = "servant.magical-sapphire";
export const MIYU_CARD_SELECTION_ID = "card.derived.master.miyu.card-selection";
export const MIYU_INSTALL_SABER_ID = "card.derived.master.miyu.install.saber";
export const MIYU_INSTALL_LANCER_ID = "card.derived.master.miyu.install.lancer";
export const MIYU_INSTALL_ARCHER_ID = "card.derived.master.miyu.install.archer";
export const MIYU_INSTALL_RIDER_ID = "card.derived.master.miyu.install.rider";
export const MIYU_INSTALL_CASTER_ID = "card.derived.master.miyu.install.caster";
export const MIYU_INSTALL_ASSASSIN_ID = "card.derived.master.miyu.install.assassin";

export const MIYU_INSTALL_IDS = [
  MIYU_INSTALL_SABER_ID,
  MIYU_INSTALL_LANCER_ID,
  MIYU_INSTALL_ARCHER_ID,
  MIYU_INSTALL_RIDER_ID,
  MIYU_INSTALL_CASTER_ID,
  MIYU_INSTALL_ASSASSIN_ID,
] as const;

export const MIYU_SAPPHIRE_DECK = [
  "card.cardb2",
  "card.cardq1",
  "card.cardq2",
  "card.carda1",
  "card.carda1",
  "card.carda2",
  "card.carda2",
  "card.carda4",
  "card.carda4",
  MIYU_CARD_SELECTION_ID,
  MIYU_CARD_SELECTION_ID,
  MIYU_CARD_SELECTION_ID,
] as const;

const sourceRefs: NonNullable<CardDefinition["sourceRefs"]> = [
  { kind: "english-wiki", document: "Fate/Domination Wiki", locator: "Magical_Sapphire" },
  { kind: "legacy", document: "legacy-content.json", locator: "master.miyu.skill.s3" },
];

export const MIYU_CARD_DEFINITIONS: readonly CardDefinition[] = [
  {
    id: MIYU_CARD_SELECTION_ID, version: 1, name: "Card Selection", cardType: "attack",
    ownerType: "master", ownerDefinitionId: "master.miyu", cost: 0, basePower: 0,
    typeLabel: "特殊", attributes: ["特殊"], basic: false,
    phases: ["outpost"], cardAbilityIds: ["miyu.card-selection-draw", "miyu.card-selection-exchange"],
    text: "Passive/Outpost: Discard this card. Draw 2 cards. Passive/Outpost: Exchange this card with a card from a drawn Servant deck or a Miyu Install from outside the game.",
    implementation: { level: "FULL", handlerId: "core.miyu-sapphire" }, sourceRefs,
  },
  {
    id: MIYU_INSTALL_SABER_ID, version: 1, name: "Saber Install", cardType: "attack",
    ownerType: "master", ownerDefinitionId: "master.miyu", cost: 0, basePower: 3,
    typeLabel: "特殊", attributes: ["特殊"], basic: false, limit: "once-per-game", uniqueGroup: "miyu-install-turn",
    phases: ["combat"], cardAbilityIds: ["miyu.install-saber"],
    text: "Only play 1 [Install] per turn. <Once Per Game> Combat: Set the power of all opponents' Magic attacks in your fight to 0.",
    implementation: { level: "FULL", handlerId: "core.miyu-sapphire" }, sourceRefs,
  },
  {
    id: MIYU_INSTALL_LANCER_ID, version: 1, name: "Lancer Install", cardType: "attack",
    ownerType: "master", ownerDefinitionId: "master.miyu", cost: 0, basePower: 4,
    typeLabel: "特殊", attributes: ["特殊"], basic: false, limit: "once-per-game", uniqueGroup: "miyu-install-turn",
    phases: ["action"], cardAbilityIds: ["miyu.install-lancer"],
    text: "Only play 1 [Install] per turn. <Once Per Game> Action: Move to any location besides the Magic Workshop.",
    implementation: { level: "FULL", handlerId: "core.miyu-sapphire" }, sourceRefs,
  },
  {
    id: MIYU_INSTALL_ARCHER_ID, version: 1, name: "Archer Install", cardType: "attack",
    ownerType: "master", ownerDefinitionId: "master.miyu", cost: 0, basePower: 4,
    typeLabel: "力量/迅捷/魔术", attributes: ["力量", "迅捷", "魔术"], basic: false, limit: "once-per-game", uniqueGroup: "miyu-install-turn",
    phases: ["action"], cardAbilityIds: ["miyu.install-archer"],
    text: "Only play 1 [Install] per turn. <Once Per Game> Action: Double your terrain advantage.",
    implementation: { level: "FULL", handlerId: "core.miyu-sapphire" }, sourceRefs,
  },
  {
    id: MIYU_INSTALL_RIDER_ID, version: 1, name: "Rider Install", cardType: "attack",
    ownerType: "master", ownerDefinitionId: "master.miyu", cost: 0, basePower: 0,
    typeLabel: "特殊", attributes: ["特殊"], basic: false, limit: "once-per-game", uniqueGroup: "miyu-install-turn",
    phases: ["action"], cardAbilityIds: ["miyu.install-rider"],
    text: "Only play 1 [Install] per turn. <Once Per Game> Action: Play up to 3 cards from your hand with base power 3 or less.",
    implementation: { level: "FULL", handlerId: "core.miyu-sapphire" }, sourceRefs,
  },
  {
    id: MIYU_INSTALL_CASTER_ID, version: 1, name: "Caster Install", cardType: "attack",
    ownerType: "master", ownerDefinitionId: "master.miyu", cost: 0, basePower: 2,
    typeLabel: "魔术", attributes: ["魔术"], basic: false, limit: "once-per-game", uniqueGroup: "miyu-install-turn",
    residual: true,
    activeSourcePlayAdjustmentForNonBasic: {
      choices: [{ id: "power", powerAdd: 2 }, { id: "cost", costAdd: -3 }],
      closeSourceAfterPlay: true,
    },
    text: "Only play 1 [Install] per turn. <Once Per Game> Permanent: Deactivate this when you play another non-basic attack. Reduce its cost by 3 or increase its power by 2.",
    implementation: { level: "FULL", handlerId: "core.miyu-sapphire" }, sourceRefs,
  },
  {
    id: MIYU_INSTALL_ASSASSIN_ID, version: 1, name: "Assassin Install", cardType: "attack",
    ownerType: "master", ownerDefinitionId: "master.miyu", cost: 0, basePower: 2,
    typeLabel: "迅捷", attributes: ["迅捷"], basic: false, limit: "once-per-game", uniqueGroup: "miyu-install-turn",
    phases: ["combat"], cardAbilityIds: ["miyu.install-assassin"],
    text: "Only play 1 [Install] per turn. <Once Per Game> Combat: Steal 1 VP from each opponent at your location for each skill they used this round.",
    implementation: { level: "FULL", handlerId: "core.miyu-sapphire" }, sourceRefs,
  },
];
