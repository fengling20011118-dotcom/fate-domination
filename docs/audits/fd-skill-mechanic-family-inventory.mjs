import fs from "node:fs";
import path from "node:path";

const roots = ["data/authoring/masters", "data/authoring/servants"];

const files = roots.flatMap((root) =>
  fs
    .readdirSync(root)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(root, name)),
);

const abilities = [];

for (const file of files) {
  const archive = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const card of archive.cards ?? []) {
    for (const ability of card.abilities ?? []) {
      const effects = (ability.effects ?? []).map((effect) => effect.type).filter(Boolean);
      const ruleModifiers = (ability.ruleModifiers ?? []).map((modifier) => modifier.rule).filter(Boolean);
      const powerModifiers = (ability.powerModifiers ?? []).map(
        (modifier) => modifier.rule ?? modifier.type ?? "power_modifier",
      );
      const targets = (ability.targets ?? []).map((target) => target.type).filter(Boolean);
      const raw = JSON.stringify(ability);
      const text = [
        ability.printedClause ?? "",
        JSON.stringify(ability.activation ?? {}),
        JSON.stringify(ability.limit ?? {}),
      ].join(" ");
      const families = [];
      const has = (...types) => types.some((type) => effects.includes(type));

      if (has("adjust_mana", "adjust_command_seals", "adjust_victory_points", "pay_mana")) {
        families.push("RESOURCE_NUMERIC");
      }
      if (
        has(
          "draw_cards",
          "move_card",
          "move_all_remaining",
          "shuffle_zone_into_deck",
          "create_card",
          "replace_card_in_deck",
          "move_source_card",
          "draw_from_independent_deck",
          "create_independent_deck",
        )
      ) {
        families.push("CARD_ZONE");
      }
      if (
        has("play_selected_cards", "play_source_card", "activate_card_by_id", "append_only_rule", "close_source_card") ||
        ruleModifiers.some((rule) =>
          ["skill_zone_mana_requirement", "situation_play_forbid", "play_card_attribute", "use_skill_card"].includes(rule),
        )
      ) {
        families.push("CARD_ACTION_SEMANTICS");
      }
      if ((ability.targets ?? []).length > 0 || targets.length > 0 || raw.includes("selection")) {
        families.push("TARGET_SELECTION");
      }
      if (has("pay_mana") || raw.includes('"cost"') || raw.includes("controller_mana_at_least")) {
        families.push("COST_PAYMENT");
      }
      if (
        ability.kind === "response" ||
        ability.kind === "optional_trigger" ||
        raw.includes("opens") ||
        raw.includes("optional") ||
        raw.includes('count":{"min":0')
      ) {
        families.push("INTERACTION");
      }
      if (raw.includes('"bind"') || raw.includes("resultVar") || raw.includes("binding_field")) {
        families.push("RESULT_BINDING");
      }
      if (
        has(
          "create_modifier",
          "create_status",
          "terrain_multiplier",
          "soul_drag_power_bonus",
          "reverse_situation_and_event_power_modifiers",
          "reduce_opponents_power",
          "set_opponent_power_to_zero",
          "combat_power_modifier",
        ) ||
        ruleModifiers.length > 0 ||
        powerModifiers.length > 0
      ) {
        families.push("MODIFIER");
      }
      if (
        has(
          "create_modifier",
          "terrain_multiplier",
          "soul_drag_power_bonus",
          "reverse_situation_and_event_power_modifiers",
          "reduce_opponents_power",
          "set_opponent_power_to_zero",
          "combat_power_modifier",
        ) ||
        powerModifiers.length > 0 ||
        /威力|地利|power/i.test(text)
      ) {
        families.push("POWER");
      }
      if (has("move_player", "movement_rule_override", "deployment_rule_override") || targets.includes("location") || /移动|部署|地点|战场/.test(text)) {
        families.push("MOVEMENT");
      }
      if (ability.kind && ability.kind !== "phase_action") {
        families.push("TRIGGER");
      }
      if (
        raw.includes("requiresSourceState") ||
        raw.includes("lifecycle") ||
        raw.includes("duration") ||
        raw.includes("per_game") ||
        raw.includes("per_round") ||
        /回合|关闭|限一次|持续|返回|结束/.test(text)
      ) {
        families.push("LIFECYCLE");
      }
      if (raw.includes("limit") || raw.includes("per_game") || raw.includes("per_round") || /本回合|每回合|每局|首次|使用过|移动距离|经过/.test(text)) {
        families.push("HISTORY_USAGE");
      }
      if (
        has("reveal_information", "set_zone_visibility", "look_at_deck_top", "look_at_match_deck_bottoms") ||
        raw.includes("face_down") ||
        raw.includes("private_to_controller") ||
        /暗置|查看|展示|真名|隐藏/.test(text)
      ) {
        families.push("HIDDEN_INFORMATION");
      }
      if (/battle|combat|wins_battle|loses_battle|battle_result|defeat|战斗|获胜|战败|败北|胜者|交战/.test(raw)) {
        families.push("BATTLE_RESULT");
      }
      if (
        has(
          "record_master_directive",
          "false_attendant_book_replacement",
          "create_independent_deck",
          "draw_from_independent_deck",
          "swap_revealed_with_deck_bottom",
          "replace_card_in_deck",
          "activate_card_by_id",
          "return_silence_battle_start",
          "transform_to_return_silence_on_loss",
        )
      ) {
        families.push("SPECIAL_SUBSYSTEM");
      }

      abilities.push({
        archive: archive.id,
        card: card.id,
        ability: ability.id,
        effects,
        families,
      });
    }
  }
}

console.log(`archives=${files.length} cards=${new Set(abilities.map((ability) => ability.card)).size} abilities=${abilities.length}`);

console.log("\nTop-level effect counts");
const effectCounts = new Map();
for (const ability of abilities) {
  for (const effect of ability.effects) {
    effectCounts.set(effect, (effectCounts.get(effect) ?? 0) + 1);
  }
}
for (const [effect, count] of [...effectCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  console.log(`${effect}\t${count}`);
}

console.log("\nFamily counts");
const familyNames = [...new Set(abilities.flatMap((ability) => ability.families))].sort();
for (const family of familyNames) {
  const rows = abilities.filter((ability) => ability.families.includes(family));
  console.log(`${family}\t${rows.length}\t${new Set(rows.map((ability) => ability.card)).size}`);
}

console.log("\nRESOURCE_NUMERIC rows");
for (const ability of abilities.filter((row) => row.families.includes("RESOURCE_NUMERIC"))) {
  console.log(`${ability.archive}\t${ability.card}\t${ability.ability}\t${ability.effects.join(",")}`);
}

console.log("\nMembership rows");
for (const ability of abilities) {
  console.log(`${ability.archive}\t${ability.card}\t${ability.ability}\t${ability.effects.join(",") || "-"}\t${ability.families.join(",") || "-"}`);
}
