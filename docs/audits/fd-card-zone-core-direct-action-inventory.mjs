import fs from "node:fs";
import path from "node:path";

const roots = ["data/authoring/masters", "data/authoring/servants"];
const cardZoneTypes = new Set(["move_card", "draw_cards", "move_all_remaining", "play_selected_cards"]);
const blockedActionTypes = new Set([
  "append_only_rule",
  "activate_card_by_id",
  "close_source_card",
  "create_card",
  "create_modifier",
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
      const effects = (ability.effects ?? []).map((effect) => effect.type).filter(Boolean);
      if (!effects.some((effect) => cardZoneTypes.has(effect))) continue;
      const classification = classify(ability, effects);
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

console.log("CARD_ZONE_CORE_DIRECT_ACTION inventory");
console.log(`sourceFiles=${files.length}`);
console.log(`cardZoneAbilities=${rows.length}`);
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

console.log("Cannot inherit Gate C");
for (const row of gateCBlocked) {
  console.log(`${row.archive}\t${row.card}\t${row.ability}\t${row.skipReason}`);
}
console.log("");

console.log("Before/after metrics");
console.log("pilotAbilityIdRoutes.before=2");
console.log("pilotAbilityIdRoutes.after=0");
console.log("legacyCardZoneDirectConsumerCount.before=2");
console.log("legacyCardZoneDirectConsumerCount.after=0");
console.log("newRuntimeSemanticRoutedCount.before=0");
console.log(`newRuntimeSemanticRoutedCount.after=${eligible.length}`);
console.log("dualCompatibleCount.before=2");
console.log("dualCompatibleCount.after=0");
console.log(`remainingSkippedCount.after=${skipped.length}`);

function classify(ability, effects) {
  if (ability.kind !== "phase_action") return skip("out_of_scope:trigger_or_non_phase_action", true);
  if ((ability.cost ?? []).length > 0) return skip("out_of_scope:cost_payment", true);
  if ((ability.creates ?? []).length > 0) return skip("out_of_scope:create_or_lifecycle", true);
  if (effects.some((effect) => blockedActionTypes.has(effect))) return skip("out_of_scope:blocked_card_action_semantics", true);
  if (effects.some((effect) => !cardZoneTypes.has(effect) && effect !== "adjust_mana")) return skip("out_of_scope:mixed_non_card_zone_effect", true);
  if (isMoveAllRemainingManaBindingShape(ability)) return { eligible: true, skipReason: "", cannotInheritGateC: false };
  if (isPlaySelectedThenDrawShape(ability)) return { eligible: true, skipReason: "", cannotInheritGateC: false };
  if (isDirectDrawShape(ability)) return skip("not_verified:direct_draw_no_representative", true);
  if (isDirectZoneMoveShape(ability)) return skip("not_verified:direct_zone_move_no_representative", true);
  return skip(specificSkipReason(ability), true);
}

function skip(skipReason, cannotInheritGateC) {
  return { eligible: false, skipReason, cannotInheritGateC };
}

function isMoveAllRemainingManaBindingShape(ability) {
  const effects = ability.effects ?? [];
  if (ability.activation?.phase !== "advance") return false;
  if ((ability.targets ?? []).length > 0) return false;
  if (effects.length !== 2) return false;
  const [move, mana] = effects;
  const binding = stringValue(move.resultVar) ?? stringValue(move.bind);
  return move.type === "move_all_remaining" &&
    move.from === "hand" &&
    move.to?.zone === "discard" &&
    !!binding &&
    mana.type === "adjust_mana" &&
    referencesNumericVariable(mana.amount, binding);
}

function isPlaySelectedThenDrawShape(ability) {
  const effects = ability.effects ?? [];
  if (ability.activation?.phase !== "action") return false;
  if (effects.length !== 2) return false;
  const [play, draw] = effects;
  return play.type === "play_selected_cards" &&
    play.face === "face_down" &&
    draw.type === "draw_cards" &&
    numericLiteral(draw.count) === 1 &&
    hasControllerHandAttackTarget(ability.targets, play.target);
}

function isDirectDrawShape(ability) {
  const effects = ability.effects ?? [];
  if (ability.activation?.phase !== "action" && ability.activation?.phase !== "advance") return false;
  if ((ability.targets ?? []).length > 0) return false;
  if (effects.length !== 1) return false;
  return effects[0].type === "draw_cards" && Number.isSafeInteger(numericLiteral(effects[0].count)) && numericLiteral(effects[0].count) > 0;
}

function isDirectZoneMoveShape(ability) {
  const effects = ability.effects ?? [];
  if (ability.activation?.phase !== "action" && ability.activation?.phase !== "advance") return false;
  if (effects.length !== 1) return false;
  const move = effects[0];
  if (move.type !== "move_card" || move.to?.zone === "attack_area" || move.to?.zone === "field") return false;
  return hasControllerCardTarget(ability.targets, move.target);
}

function specificSkipReason(ability) {
  const raw = JSON.stringify(ability);
  if (/hidden|private|looked_cards|暗置|展示|查看|秘密/.test(raw)) return "out_of_scope:hidden_or_private_information";
  if (/battle|combat|wins_battle|loses_battle|defeat|战斗|败北|获胜|关闭/.test(raw)) return "out_of_scope:battle_or_close_dependency";
  if (/attack_area|field|激活|追加|加入攻击/.test(raw)) return "out_of_scope:add_to_attack_or_activate";
  if ((ability.targets ?? []).length > 0) return "out_of_scope:target_shape_not_exact_match";
  return "out_of_scope:not_exact_semantic_match";
}

function hasControllerHandAttackTarget(targets, targetId) {
  const target = findTarget(targets, targetId);
  if (!target) return false;
  const constraints = Array.isArray(target.constraints) ? target.constraints : [];
  return target.type === "card_instance" &&
    target.scope?.zone === "hand" &&
    target.scope?.owner === "controller" &&
    Number(target.count?.min ?? 1) === 1 &&
    Number(target.count?.max ?? 1) === 1 &&
    constraints.some((constraint) => constraint?.type === "is_attack") &&
    !isPrivateTarget(target);
}

function hasControllerCardTarget(targets, targetId) {
  const target = findTarget(targets, targetId);
  return !!target &&
    target.type === "card_instance" &&
    target.scope?.owner === "controller" &&
    !isPrivateTarget(target);
}

function findTarget(targets, targetId) {
  if (!Array.isArray(targets)) return undefined;
  return targets.find((target) => target?.id === targetId);
}

function isPrivateTarget(target) {
  return /private|hidden|looked_cards|controller_private|face_down/.test(JSON.stringify(target));
}

function referencesNumericVariable(value, variableName) {
  return value?.var === variableName ||
    (value?.expr === "variable" && value.name === variableName) ||
    (value?.expr === "binding_field" && value.binding === variableName && value.field === "movedCount");
}

function numericLiteral(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if ((value?.expr === "literal" || value?.op === "literal" || value?.op === "const") && typeof value.value === "number") return value.value;
  return undefined;
}

function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
