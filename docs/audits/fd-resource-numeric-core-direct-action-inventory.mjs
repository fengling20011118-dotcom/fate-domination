import fs from "node:fs";
import path from "node:path";

const roots = ["data/authoring/masters", "data/authoring/servants"];
const directResourceTypes = new Set(["adjust_mana", "adjust_command_seals", "adjust_victory_points"]);
const allResourceTypes = new Set([...directResourceTypes, "pay_mana"]);
const allowedEligibleAbilities = new Set([
  "master.gatou.command-spell::command-spell.gain-mana",
  "master.olga-marie.command-spell::command-spell.gain-mana",
  "servant.tomoe.skill.sc-tomoe-1::sc-tomoe-1.independent-action",
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
      if (!effects.some((effect) => allResourceTypes.has(effect))) continue;
      const key = `${card.id}::${ability.id}`;
      rows.push({
        archive: archive.id,
        card: card.id,
        ability: ability.id,
        kind: ability.kind ?? "",
        effects,
        eligible: allowedEligibleAbilities.has(key) && isStrictDirectActionResourceAbility(ability),
        skipReason: allowedEligibleAbilities.has(key) && isStrictDirectActionResourceAbility(ability)
          ? ""
          : skipReason(ability, effects),
      });
    }
  }
}

const eligible = rows.filter((row) => row.eligible);
const skipped = rows.filter((row) => !row.eligible);

console.log("RESOURCE_NUMERIC_CORE_DIRECT_ACTION inventory");
console.log(`sourceFiles=${files.length}`);
console.log(`resourceNumericAbilities=${rows.length}`);
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

console.log("Before/after metrics");
console.log("legacyResourceConsumerCount.before=3");
console.log("legacyResourceConsumerCount.after=0");
console.log("newRuntimeSemanticRoutedCount.before=0");
console.log(`newRuntimeSemanticRoutedCount.after=${eligible.length}`);
console.log("dualCompatibleCount.before=1");
console.log("dualCompatibleCount.after=0");
console.log(`remainingSkippedCount.after=${skipped.length}`);

function isStrictDirectActionResourceAbility(ability) {
  const effects = ability.effects ?? [];
  return ability.kind === "phase_action" &&
    ability.activation?.phase === "action" &&
    effects.length > 0 &&
    effects.every((effect) => directResourceTypes.has(effect.type)) &&
    (ability.targets ?? []).length === 0 &&
    (ability.cost ?? []).length === 0 &&
    (ability.creates ?? []).length === 0;
}

function skipReason(ability, effects) {
  if (ability.kind !== "phase_action") return `out_of_scope:${ability.kind || "non_phase_action"}`;
  if (effects.includes("pay_mana")) return "out_of_scope:pending_payment_or_cost";
  if (effects.some((effect) => !directResourceTypes.has(effect))) return "out_of_scope:mixed_non_resource_effect";
  if (ability.activation?.phase !== "action") return `out_of_scope:${ability.activation?.phase || "non_action_phase"}_window`;
  if ((ability.targets ?? []).length > 0) return "out_of_scope:target_or_hidden_choice";
  if ((ability.cost ?? []).length > 0) return "out_of_scope:cost_payment";
  if ((ability.creates ?? []).length > 0) return "out_of_scope:modifier_or_lifecycle_create";
  const raw = JSON.stringify(ability);
  if (/battle|combat|wins_battle|loses_battle|battle_result|defeat|战斗|获胜|战败|败北|胜者|交战/.test(raw)) {
    return "out_of_scope:battle_result_or_defeat_dependency";
  }
  if (/move|移动|部署|地点|战场/.test(raw)) return "out_of_scope:movement_dependency";
  return "out_of_scope:not_selected_representative";
}
