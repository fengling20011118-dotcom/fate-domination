import fs from "node:fs";
import path from "node:path";

const roots = ["data/authoring/masters", "data/authoring/servants"];
const cardActionTypes = new Set([
  "activate_card_by_id",
  "activate_card",
  "create_and_activate_card",
  "play_selected_cards",
  "play_source_card",
  "attach_card_to_player_attack",
  "close_source_card",
  "append_only_rule",
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

console.log("CARD_ACTION_SEMANTICS_MINIMAL ACTIVATE inventory");
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

console.log("Cannot inherit ACTIVATE Gate C");
for (const row of gateCBlocked) {
  console.log(`${row.archive}\t${row.card}\t${row.ability}\t${row.skipReason}`);
}
console.log("");

console.log("Before/after metrics");
console.log("legacyActivateConsumerCount.before=1");
console.log("legacyActivateConsumerCount.after=0");
console.log("newRuntimeSemanticRoutedActivateCount.before=0");
console.log(`newRuntimeSemanticRoutedActivateCount.after=${eligible.length}`);
console.log("dualCompatibleActivateCount.before=1");
console.log("dualCompatibleActivateCount.after=0");
console.log(`remainingSkippedCardActionCount.after=${skipped.length}`);

function classify(ability) {
  const effects = ability.effects ?? [];
  if (isExactActivateCardByIdShape(ability)) return { eligible: true, skipReason: "", cannotInheritGateC: false };
  if (effects.some((effect) => effect.type === "activate_card_by_id")) return skip("not_verified:activate_card_by_id_shape_not_exact_match", true);
  if (effects.some((effect) => effect.type === "play_selected_cards" || effect.type === "play_source_card")) return skip("out_of_scope:play_semantics", true);
  if (effects.some((effect) => effect.type === "attach_card_to_player_attack")) return skip("out_of_scope:add_to_attack_semantics", true);
  if (effects.some((effect) => effect.type === "close_source_card")) return skip("out_of_scope:close_semantics", true);
  if (effects.some((effect) => effect.type === "append_only_rule")) return skip("out_of_scope:append_only_rule_marker", true);
  if (effects.some((effect) => effect.type === "create_and_activate_card" || effect.type === "activate_card")) return skip("not_verified:other_activate_shape", true);
  return skip("out_of_scope:not_activate_semantics", true);
}

function skip(skipReason, cannotInheritGateC) {
  return { eligible: false, skipReason, cannotInheritGateC };
}

function isExactActivateCardByIdShape(ability) {
  const effects = ability.effects ?? [];
  if (ability.kind !== "forced_trigger") return false;
  if (ability.activation?.trigger !== "after_controller_first_loses_battle") return false;
  if ((ability.targets ?? []).length > 0) return false;
  if ((ability.cost ?? []).length > 0) return false;
  if ((ability.creates ?? []).length > 0) return false;
  if (effects.length !== 1) return false;
  const [effect] = effects;
  return effect.type === "activate_card_by_id" && typeof effect.definitionId === "string" && effect.definitionId.length > 0;
}
