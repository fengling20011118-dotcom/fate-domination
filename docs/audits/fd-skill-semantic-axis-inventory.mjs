import fs from "node:fs";
import path from "node:path";

const roots = ["data/authoring/masters", "data/authoring/servants"];

const strictDomainTriggers = new Set([
  "after_battle_ended",
  "after_battle_result_determined",
  "after_controller_enters_location",
  "after_controller_first_loses_battle",
  "after_controller_gains_victory",
  "after_controller_loses_all_command_seals",
  "after_controller_loses_battle",
  "after_controller_wins_battle",
  "after_player_deployed_to_battlefield",
  "before_situation_or_event_resolves",
  "game_start",
  "on_card_played",
  "on_use_declared",
]);

const nonTriggerTimingHooks = new Set([
  "controller_combat_action_window",
  "phase_action",
  "when_formula_condition_met",
  "when_play_requirements_checked",
  "when_power_calculation_applied",
  "while_active",
]);

const files = roots.flatMap((root) =>
  fs
    .readdirSync(root)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(root, name)),
);

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function collectEffects(effects = []) {
  const rows = [];
  const walk = (effect) => {
    if (!effect || typeof effect !== "object") return;
    if (effect.type) rows.push(effect);
    for (const value of Object.values(effect)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") walk(value);
    }
  };
  effects.forEach(walk);
  return rows;
}

function targetShape(target) {
  const count = target.count;
  if (target.type === "card_instance") {
    if (count?.exact || count?.min || count?.max) return "CHOOSE_N_CARDS";
    return "CHOOSE_ONE_CARD";
  }
  if (target.type === "player") return "CHOOSE_ONE_PLAYER";
  if (target.type === "location") return "CHOOSE_LOCATION";
  if (target.type === "choice") return "BRANCH_CHOICE";
  return target.type ? `CHOOSE_${target.type.toUpperCase()}` : null;
}

function classifyAbility(archive, card, ability) {
  const effects = collectEffects(ability.effects ?? []);
  const topLevelEffectTypes = (ability.effects ?? []).map((effect) => effect.type).filter(Boolean);
  const effectTypes = effects.map((effect) => effect.type).filter(Boolean);
  const raw = JSON.stringify(ability);
  const printed = ability.printedClause ?? "";
  const activation = ability.activation ?? {};
  const targets = ability.targets ?? [];
  const requirements = ability.requirements ?? [];
  const ruleModifiers = ability.ruleModifiers ?? [];
  const powerModifiers = ability.powerModifiers ?? [];

  const timing = [];
  if (activation.phase) timing.push(activation.phase.toUpperCase());
  if (activation.opens) timing.push(activation.opens.toUpperCase());
  if (activation.trigger && nonTriggerTimingHooks.has(activation.trigger)) {
    timing.push(activation.trigger.toUpperCase());
  }

  const domainTriggers = strictDomainTriggers.has(activation.trigger) ? [activation.trigger] : [];

  const requirement = [];
  if (activation.requiresSourceState) requirement.push(`SOURCE_${String(activation.requiresSourceState).toUpperCase()}`);
  for (const req of requirements) requirement.push(req.type ?? "requirement");
  if (raw.includes("controller_mana_at_least")) requirement.push("MANA");
  if (raw.includes("controller_at_location_kind") || /地点|深山|战场/.test(printed)) requirement.push("LOCATION");
  if (/战斗|交战|battle|combat/.test(raw)) requirement.push("BATTLE_STATE");

  const target = targets.map(targetShape).filter(Boolean);
  const cost = [];
  if (effectTypes.includes("pay_mana") || raw.includes('"cost"')) cost.push("MANA");
  if (effectTypes.includes("adjust_command_seals") && /令咒|command/i.test(printed)) cost.push("COMMAND_SEAL_OR_RESOURCE");
  if (/discard|弃|关闭|close/i.test(raw)) cost.push("DISCARD_OR_CLOSE");

  const interaction = [];
  for (const shape of target) interaction.push(shape);
  if (ability.kind === "response" || String(activation.opens ?? "").includes("response")) interaction.push("RESPONSE");
  if (ability.kind === "optional_trigger" || String(activation.opens ?? "").includes("optional")) interaction.push("YES_NO");
  if (effectTypes.includes("branch")) interaction.push("BRANCH_CHOICE");
  if (raw.includes('"amount"') && raw.includes('"choice"')) interaction.push("CHOOSE_AMOUNT");

  const strictPending = targets.length > 0;

  const primitive = [];
  if (topLevelEffectTypes.some((type) => ["adjust_mana", "adjust_command_seals", "adjust_victory_points", "pay_mana"].includes(type))) {
    primitive.push("RESOURCE_NUMERIC");
  }
  if (
    topLevelEffectTypes.some((type) =>
      [
        "create_card",
        "create_independent_deck",
        "draw_cards",
        "draw_from_independent_deck",
        "look_at_deck_top",
        "look_at_match_deck_bottoms",
        "move_all_remaining",
        "move_card",
        "replace_card_in_deck",
        "shuffle_zone_into_deck",
        "swap_revealed_with_deck_bottom",
      ].includes(type),
    )
  ) {
    primitive.push("CARD_ZONE");
  }
  if (
    topLevelEffectTypes.some((type) =>
      ["activate_card_by_id", "append_only_rule", "close_source_card", "play_selected_cards", "play_source_card"].includes(type),
    )
  ) {
    primitive.push("CARD_ACTION_SEMANTICS");
  }
  if (topLevelEffectTypes.includes("move_player") || topLevelEffectTypes.includes("movement_rule_override")) primitive.push("MOVEMENT");
  if (topLevelEffectTypes.includes("reveal_information") || topLevelEffectTypes.includes("set_zone_visibility")) primitive.push("VISIBILITY");

  const modifier = [];
  if (ruleModifiers.length > 0) modifier.push("RULE_MODIFIER");
  if (powerModifiers.length > 0) modifier.push("POWER_MODIFIER");
  if (
    effectTypes.some((type) =>
      [
        "combat_power_modifier",
        "create_modifier",
        "create_status",
        "reduce_opponents_power",
        "reverse_situation_and_event_power_modifiers",
        "set_opponent_power_to_zero",
        "soul_drag_power_bonus",
        "terrain_multiplier",
      ].includes(type),
    )
  ) {
    modifier.push("EFFECT_MODIFIER");
  }

  const lifecycle = [];
  const pushLifecycle = (prefix, policy) => {
    if (!policy || typeof policy !== "object") return;
    for (const [key, value] of Object.entries(policy)) {
      if (typeof value === "string" || typeof value === "number") lifecycle.push(`${prefix}:${key}:${value}`);
      else if (value && typeof value === "object") pushLifecycle(`${prefix}:${key}`, value);
    }
  };
  pushLifecycle("lifecycle", ability.lifecycle);
  pushLifecycle("limit", ability.limit);
  for (const effect of effects) pushLifecycle("effect_lifecycle", effect.lifecycle);

  const visibility = [];
  if (effectTypes.includes("reveal_information")) visibility.push("REVEAL");
  if (effectTypes.includes("set_zone_visibility")) visibility.push("ZONE_VISIBILITY");
  if (effectTypes.includes("look_at_deck_top") || effectTypes.includes("look_at_match_deck_bottoms")) visibility.push("PRIVATE_LOOK");
  if (raw.includes("face_down") || /暗置|隐藏|真名|查看|展示/.test(printed)) visibility.push("HIDDEN_OR_PRIVATE");

  const resultBinding = [];
  if (raw.includes("resultVar")) resultBinding.push("RESULT_VAR");
  if (raw.includes("binding_field")) resultBinding.push("BINDING_FIELD");
  if (raw.includes('"bind"')) resultBinding.push("BIND");

  const battle = [];
  if (/battle|combat|战斗|交战|败北|战败|获胜|胜者|defeat|wins_battle|loses_battle/.test(raw)) battle.push("BATTLE_INTEGRATION");

  const special = [];
  if (
    effectTypes.some((type) =>
      [
        "create_independent_deck",
        "draw_from_independent_deck",
        "false_attendant_book_replacement",
        "record_master_directive",
        "replace_card_in_deck",
        "return_silence_battle_start",
        "swap_revealed_with_deck_bottom",
        "transform_to_return_silence_on_loss",
      ].includes(type),
    )
  ) {
    special.push("SPECIAL_SUBSYSTEM");
  }

  return {
    archive: archive.id,
    card: card.id,
    ability: ability.id,
    kind: String(ability.kind ?? "UNSPECIFIED").toUpperCase(),
    timing: uniq(timing),
    domainTriggers,
    requirement: uniq(requirement),
    target: uniq(target),
    cost: uniq(cost),
    interaction: uniq(interaction),
    strictPending,
    primitive: uniq(primitive),
    modifier: uniq(modifier),
    lifecycle: uniq(lifecycle),
    visibility: uniq(visibility),
    resultBinding: uniq(resultBinding),
    battle: uniq(battle),
    special: uniq(special),
    effects: uniq(effectTypes),
  };
}

const abilities = [];

for (const file of files) {
  const archive = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const card of archive.cards ?? []) {
    for (const ability of card.abilities ?? []) abilities.push(classifyAbility(archive, card, ability));
  }
}

function countAxis(axis, rows = abilities) {
  const map = new Map();
  for (const row of rows) {
    const values = Array.isArray(row[axis]) ? row[axis] : [row[axis]];
    for (const value of values.filter(Boolean)) {
      if (!map.has(value)) map.set(value, []);
      map.get(value).push(row.ability);
    }
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

function table(title, axis) {
  console.log(`\n## ${title}`);
  console.log("| Value | Ability Count | Ability IDs |");
  console.log("|---|---:|---|");
  for (const [value, ids] of countAxis(axis)) {
    console.log(`| \`${value}\` | ${ids.length} | ${ids.map((id) => `\`${id}\``).join(", ")} |`);
  }
}

console.log(`# FD Skill Semantic Axis Matrix\n`);
console.log(`- Document Role: AUDIT`);
console.log(`- Status: ACTIVE / PHASE_3_TAXONOMY_REMEDIATION_CANDIDATE`);
console.log(`- Scope: orthogonal semantic-axis classification for current abilities in data/authoring`);
console.log(`- Implementation Status: DOCUMENTATION_ONLY`);
console.log(`- Acceptance Status: This matrix does not promote any primitive, card, flow, mechanic family, or release target.`);
console.log(`- Generated By: \`node docs/audits/fd-skill-semantic-axis-inventory.mjs\``);
console.log(``);
console.log(`archives=${files.length} cards=${new Set(abilities.map((row) => row.card)).size} abilities=${abilities.length}`);
console.log(`strictDomainTriggerAbilities=${abilities.filter((row) => row.domainTriggers.length > 0).length}`);
console.log(`explicitLifecycleAbilities=${abilities.filter((row) => row.lifecycle.length > 0).length}`);
console.log(`explicitInteractionAbilities=${abilities.filter((row) => row.interaction.length > 0).length}`);
console.log(`strictPendingInteractionAbilities=${abilities.filter((row) => row.strictPending).length}`);

table("Ability Kind", "kind");
table("Timing / Window", "timing");
table("Strict Domain Event Trigger", "domainTriggers");
table("Requirement", "requirement");
table("Target", "target");
table("Cost", "cost");
table("Interaction Semantic", "interaction");
table("Effect Primitive", "primitive");
table("Modifier", "modifier");
table("Lifecycle / Reset / Persistence", "lifecycle");
table("Visibility / Hidden Information", "visibility");
table("Result Binding", "resultBinding");
table("Battle Integration", "battle");
table("Special Subsystem", "special");

console.log("\n## Ability-Level Semantic Axis Matrix");
console.log("| Archive | Card | Ability | Kind | Timing / Window | Domain Event Trigger | Requirement | Target | Cost | Interaction | Pending Runtime | Effect Primitive | Modifier | Lifecycle | Visibility | Result Binding | Battle | Special |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const row of abilities) {
  const cell = (value) => {
    const values = Array.isArray(value) ? value : [value];
    return values.length ? values.map((item) => `\`${item}\``).join(", ") : "`NONE`";
  };
  console.log(
    `| \`${row.archive}\` | \`${row.card}\` | \`${row.ability}\` | ${cell(row.kind)} | ${cell(row.timing)} | ${cell(row.domainTriggers)} | ${cell(row.requirement)} | ${cell(row.target)} | ${cell(row.cost)} | ${cell(row.interaction)} | \`${row.strictPending ? "YES" : "NO"}\` | ${cell(row.primitive)} | ${cell(row.modifier)} | ${cell(row.lifecycle)} | ${cell(row.visibility)} | ${cell(row.resultBinding)} | ${cell(row.battle)} | ${cell(row.special)} |`,
  );
}
