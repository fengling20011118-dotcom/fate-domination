import fs from "node:fs";
import path from "node:path";

const roots = ["data/authoring/masters", "data/authoring/servants"];
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
      if (!effects.some((effect) => cardActionTypes.has(effect))) continue;
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

console.log("CARD_ACTION_SEMANTICS_MINIMAL PLAY inventory");
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

console.log("Cannot inherit PLAY Gate C");
for (const row of gateCBlocked) {
  console.log(`${row.archive}\t${row.card}\t${row.ability}\t${row.skipReason}`);
}
console.log("");

console.log("Before/after metrics");
console.log("legacyPlayConsumerCount.before=1");
console.log("legacyPlayConsumerCount.after=0");
console.log("newRuntimeSemanticRoutedPlayCount.before=0");
console.log(`newRuntimeSemanticRoutedPlayCount.after=${eligible.length}`);
console.log("dualCompatiblePlayCount.before=1");
console.log("dualCompatiblePlayCount.after=0");
console.log(`remainingSkippedCardActionCount.after=${skipped.length}`);

function classify(ability) {
  const effects = ability.effects ?? [];
  if (isExactPlayShape(ability)) return { eligible: true, skipReason: "", cannotInheritGateC: false };
  if (isExactPlaySourceResponseShape(ability)) return skip("separate_contract:play_source_card_response", true);
  if (effects.some((effect) => effect.type === "play_source_card")) return skip("not_verified:play_source_card_cost_or_response_semantics", true);
  if (effects.some((effect) => effect.type === "play_selected_cards")) return skip("not_verified:play_selected_shape_not_exact_match", true);
  if (effects.some((effect) => effect.type === "attach_card_to_player_attack")) return skip("out_of_scope:add_to_attack_semantics", true);
  if (effects.some((effect) => effect.type === "activate_card_by_id")) return skip("out_of_scope:activate_semantics", true);
  if (effects.some((effect) => effect.type === "close_source_card")) return skip("out_of_scope:close_semantics", true);
  if (effects.some((effect) => effect.type === "append_only_rule")) return skip("out_of_scope:append_only_rule_marker", true);
  return skip("out_of_scope:not_play_semantics", true);
}

function skip(skipReason, cannotInheritGateC) {
  return { eligible: false, skipReason, cannotInheritGateC };
}

function isExactPlayShape(ability) {
  const effects = ability.effects ?? [];
  if (ability.kind !== "phase_action") return false;
  if (ability.activation?.phase !== "action") return false;
  if ((ability.cost ?? []).length > 0) return false;
  if ((ability.creates ?? []).length > 0) return false;
  if (effects.length !== 2) return false;
  const [play, draw] = effects;
  return play.type === "play_selected_cards" &&
    play.face === "face_down" &&
    draw.type === "draw_cards" &&
    numericLiteral(draw.count) === 1 &&
    hasControllerHandAttackTarget(ability.targets, play.target);
}

function isExactPlaySourceResponseShape(ability) {
  const effects = ability.effects ?? [];
  if (ability.kind !== "response") return false;
  if (ability.activation?.trigger !== "controller_combat_action_window") return false;
  if (ability.responseWindow?.opens !== "controller_combat_action_window") return false;
  if ((ability.targets ?? []).length > 0) return false;
  if ((ability.creates ?? []).length > 0) return false;
  if (!hasFixedManaCost(ability.cost, 2)) return false;
  if (effects.length !== 1) return false;
  const [effect] = effects;
  return effect.type === "play_source_card" && effect.face === "face_up";
}

function hasControllerHandAttackTarget(targets, targetId) {
  if (!Array.isArray(targets)) return false;
  const target = targets.find((candidate) => candidate?.id === targetId);
  if (!target || target.type !== "card_instance") return false;
  const constraints = Array.isArray(target.constraints) ? target.constraints : [];
  return target.scope?.zone === "hand" &&
    target.scope?.owner === "controller" &&
    Number(target.count?.min ?? 1) === 1 &&
    Number(target.count?.max ?? 1) === 1 &&
    constraints.some((constraint) => constraint?.type === "is_attack") &&
    !/private|hidden|looked_cards|controller_private|face_down/.test(JSON.stringify(target));
}

function hasFixedManaCost(costs, amount) {
  if (!Array.isArray(costs) || costs.length !== 1) return false;
  const [cost] = costs;
  return cost?.type === "pay_mana" && numericLiteral(cost.amount) === amount;
}

function numericLiteral(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if ((value?.expr === "literal" || value?.op === "literal" || value?.op === "const") && typeof value.value === "number") return value.value;
  return undefined;
}
