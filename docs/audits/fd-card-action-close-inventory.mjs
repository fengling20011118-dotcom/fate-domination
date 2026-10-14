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

console.log("CARD_ACTION_SEMANTICS_MINIMAL CLOSE inventory");
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

console.log("Cannot inherit CLOSE Gate C");
for (const row of gateCBlocked) {
  console.log(`${row.archive}\t${row.card}\t${row.ability}\t${row.skipReason}`);
}
console.log("");

console.log("Before/after metrics");
console.log("legacyCloseConsumerCount.before=1");
console.log("legacyCloseConsumerCount.after=0");
console.log("newRuntimeSemanticRoutedCloseCount.before=0");
console.log(`newRuntimeSemanticRoutedCloseCount.after=${eligible.length}`);
console.log("dualCompatibleCloseCount.before=1");
console.log("dualCompatibleCloseCount.after=0");
console.log(`remainingSkippedCardActionCount.after=${skipped.length}`);

function classify(ability) {
  const effects = ability.effects ?? [];
  if (isExactCloseShape(ability)) return { eligible: true, skipReason: "", cannotInheritGateC: false };
  if (effects.some((effect) => effect.type === "close_source_card")) return skip("not_verified:close_source_shape_not_exact_match", true);
  if (effects.some((effect) => effect.type === "play_source_card")) return skip("out_of_scope:play_source_card_response_semantics", true);
  if (effects.some((effect) => effect.type === "play_selected_cards")) return skip("out_of_scope:play_semantics", true);
  if (effects.some((effect) => effect.type === "attach_card_to_player_attack")) return skip("out_of_scope:add_to_attack_semantics", true);
  if (effects.some((effect) => effect.type === "activate_card_by_id")) return skip("out_of_scope:activate_semantics", true);
  if (effects.some((effect) => effect.type === "append_only_rule")) return skip("out_of_scope:append_only_rule_marker", true);
  return skip("out_of_scope:not_close_semantics", true);
}

function skip(skipReason, cannotInheritGateC) {
  return { eligible: false, skipReason, cannotInheritGateC };
}

function isExactCloseShape(ability) {
  const effects = ability.effects ?? [];
  if (ability.kind !== "residual") return false;
  if (ability.activation?.trigger !== "on_card_played") return false;
  if (ability.activation?.opens !== undefined && ability.activation.opens !== "immediate") return false;
  if ((ability.targets ?? []).length > 0) return false;
  if ((ability.cost ?? []).length > 0) return false;
  if ((ability.creates ?? []).length > 0) return false;
  if (ability.lifecycle?.duration !== undefined && ability.lifecycle.duration !== "while_card_active") return false;
  if (ability.lifecycle?.cleanup !== undefined && ability.lifecycle.cleanup !== "when_card_leaves_active_area") return false;
  if (effects.length !== 1 || effects[0]?.type !== "close_source_card") return false;
  return hasCondition(ability.conditions, "source_card_in_zone", { zone: "field" }) &&
    hasCondition(ability.conditions, "event_played_card_has_attribute", { attribute: "宝具" });
}

function hasCondition(conditions, type, fields) {
  if (!Array.isArray(conditions)) return false;
  return conditions.some((condition) => {
    if (condition?.type !== type) return false;
    return Object.entries(fields).every(([key, value]) => condition?.[key] === value);
  });
}
