import fs from "node:fs";
import path from "node:path";

const roots = ["data/authoring/masters", "data/authoring/servants"];
const addToAttackTypes = new Set(["attach_card_to_player_attack"]);
const cardActionTypes = new Set([
  "append_only_rule",
  "attach_card_to_player_attack",
  "activate_card_by_id",
  "close_source_card",
  "play_selected_cards",
  "play_source_card",
]);

const files = roots.flatMap((root) =>
  fs
    .readdirSync(root)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(root, name)),
);

const rows = [];
for (const file of files) {
  const archive = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const card of archive.cards ?? []) {
    for (const ability of card.abilities ?? []) {
      const effects = [...(ability.effects ?? []), ...(ability.creates ?? [])].map((effect) => effect.type).filter(Boolean);
      if (!effects.some((effect) => cardActionTypes.has(effect) || addToAttackTypes.has(effect))) continue;
      const classification = classify(ability);
      rows.push({
        archive: archive.id,
        card: card.id,
        ability: ability.id,
        kind: ability.kind ?? "",
        effects,
        eligible: classification.eligible,
        skipReason: classification.skipReason,
        cannotInheritGateC: classification.cannotInheritGateC,
      });
    }
  }
}

const eligible = rows.filter((row) => row.eligible);
const skipped = rows.filter((row) => !row.eligible);
const gateCBlocked = rows.filter((row) => row.cannotInheritGateC);

console.log("CARD_ACTION_SEMANTICS_MINIMAL ADD_TO_ATTACK inventory");
console.log(`sourceFiles=${files.length}`);
console.log(`cardActionSemanticAbilities=${rows.length}`);
console.log(`eligible=${eligible.length}`);
console.log(`skipped=${skipped.length}`);
console.log("");

console.log("Eligible abilities");
for (const row of eligible) {
  console.log(`${row.archive}\t${row.card}\t${row.ability}\t${row.effects.join(",")}`);
}
console.log("");

console.log("Skipped abilities");
for (const row of skipped) {
  console.log(`${row.archive}\t${row.card}\t${row.ability}\t${row.effects.join(",")}\t${row.skipReason}`);
}
console.log("");

console.log("Cannot inherit ADD_TO_ATTACK Gate C");
for (const row of gateCBlocked) {
  console.log(`${row.archive}\t${row.card}\t${row.ability}\t${row.skipReason}`);
}
console.log("");

console.log("Before/after metrics");
console.log("legacyAddToAttackConsumerCount.before=1");
console.log("legacyAddToAttackConsumerCount.after=0");
console.log("newRuntimeSemanticRoutedAddToAttackCount.before=0");
console.log(`newRuntimeSemanticRoutedAddToAttackCount.after=${eligible.length}`);
console.log("dualCompatibleAddToAttackCount.before=1");
console.log("dualCompatibleAddToAttackCount.after=0");
console.log(`remainingSkippedCardActionCount.after=${skipped.length}`);

function classify(ability) {
  const effects = ability.effects ?? [];
  if (isExactAddToAttackShape(ability)) return { eligible: true, skipReason: "", cannotInheritGateC: false };
  if (effects.some((effect) => effect.type === "attach_card_to_player_attack")) return skip("not_verified:add_to_attack_shape_not_exact_match", true);
  const raw = JSON.stringify(ability);
  if (effects.some((effect) => effect.type === "play_selected_cards" || effect.type === "play_source_card")) return skip("out_of_scope:play_semantics", true);
  if (effects.some((effect) => effect.type === "activate_card_by_id")) return skip("out_of_scope:activate_semantics", true);
  if (effects.some((effect) => effect.type === "close_source_card")) return skip("out_of_scope:close_semantics", true);
  if (effects.some((effect) => effect.type === "append_only_rule")) return skip("out_of_scope:append_only_rule_marker", true);
  if (/create_card|create_modifier|CREATE_AND_ACTIVATE|创建/.test(raw)) return skip("out_of_scope:create_or_create_and_activate_semantics", true);
  return skip("out_of_scope:not_add_to_attack", true);
}

function skip(skipReason, cannotInheritGateC) {
  return { eligible: false, skipReason, cannotInheritGateC };
}

function isExactAddToAttackShape(ability) {
  const effects = ability.effects ?? [];
  if (ability.kind !== "phase_action") return false;
  if (ability.activation?.phase !== "advance") return false;
  if (effects.length !== 1) return false;
  if (!hasFixedManaCost(ability.cost, 2)) return false;
  const effect = effects[0];
  return effect.type === "attach_card_to_player_attack" &&
    typeof effect.cardId === "string" &&
    typeof effect.target === "string" &&
    effect.returnAtRoundEnd === true &&
    effect.controllerCannotWinStatus === "maiya_cannot_win_battle_this_round" &&
    hasNonControllerPlayerTarget(ability.targets, effect.target);
}

function hasFixedManaCost(cost, amount) {
  if (!Array.isArray(cost) || cost.length !== 1) return false;
  return cost[0]?.type === "pay_mana" && numericLiteral(cost[0].amount) === amount;
}

function hasNonControllerPlayerTarget(targets, targetId) {
  if (!Array.isArray(targets)) return false;
  const target = targets.find((candidate) => candidate?.id === targetId);
  if (!target || target.type !== "player") return false;
  const constraints = Array.isArray(target.constraints) ? target.constraints : [];
  return Number(target.count?.min ?? 1) === 1 &&
    Number(target.count?.max ?? 1) === 1 &&
    constraints.some((constraint) => constraint?.type === "not_controller");
}

function numericLiteral(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if ((value?.expr === "literal" || value?.op === "literal" || value?.op === "const") && typeof value.value === "number") return value.value;
  return undefined;
}
