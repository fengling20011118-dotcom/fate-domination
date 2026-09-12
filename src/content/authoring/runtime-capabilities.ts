import type { FDAuthoringAbility } from "./types.ts";

const CONDITION_TYPES = new Set([
  "player_flag_equals", "player_flag_number_at_least", "player_flag_number_current_round",
  "player_flag_number_not_current_round", "player_flag_number_equals_event_field",
  "player_flag_number_not_event_field", "target_command_seals_at_most",
  "target_command_seals_equals", "command_seals_at_least", "implies", "any_of", "phase_is", "current_situation_id_is", "scheduled_payload_present", "event_number_compare", "event_location_is", "event_type_is", "event_player_is_controller",
  "event_player_is_opponent", "event_location_equals_controller", "event_location_not_controller",
  "event_location_not", "event_definition_is_self", "event_skill_id_is", "event_face_is", "situation_forbids_attribute", "true_name_hidden",
  "true_name_revealed", "event_scouting_rewarded_controller", "event_player_won_combat", "event_player_lost_combat", "event_combat_has_attribute", "event_combat_opponent_count_equals", "event_round_victory_points_gain_crosses",
  "event_eliminated_same_battlefield_player", "source_active", "source_owned", "source_reversed", "source_revealed", "same_location_player_count_equals", "same_battlefield_lower_victory_opponent", "victory_points_is_lowest", "victory_points_is_first", "round_victory_points_gained_equals", "owned_active_card_by_definition",
  "shared_battlefield_this_round_with_controller", "not_same_location_as_controller", "hand_size_at_least",
  "location_is", "location_in", "at_battlefield", "mana_at_least", "mana_below", "has_status", "lacks_status", "target_count_at_least", "target_count_equals", "event_count_at_least", "card_count_at_least", "selected_cards_all_have_attribute", "has_active_basic_attack", "engaged_opponent_victory_points_greater_than_controller", "metric_compare",
]);

const EFFECT_TYPES = new Set([
  "choose_players", "choose_each_player_option", "choose_each_player_cards", "choose_cards", "choose_events", "choose_locations", "ensure_event_deck_count", "shuffle_event_deck", "move_matching_events", "move_selected_events", "swap_selected_event_locations", "replace_selected_event_from_deck", "move_selected_cards", "transfer_selected_cards", "play_selected_cards", "copy_selected_card", "info_note", "choose_one",
  "pay_mana", "pay_victory_points", "pay_command_seals", "gain_mana", "lose_mana", "transfer_mana", "set_mana", "gain_victory_points", "gain_victory_points_per_target",
  "gain_current_battlefield_competition_reward", "lose_victory_points", "transfer_victory_points", "lose_victory_points_per_matching_cards",
  "draw_cards", "discard_all_hand", "discard_current_event_by_victory_points", "combat_power_bonus", "multiply_deployment_bonus",
  "retrigger_card_play_effects", "source_card_power_bonus", "add_card_cost_modifier", "clear_player_status_and_source_card_power_bonus",
  "set_player_flag", "add_player_flag_number", "increment_player_flag", "clear_player_flag",
  "hide_true_name", "reveal_true_name", "lose_command_seals", "if_condition", "schedule_effect",
  "schedule_combat_power_bonus_from_selected_card", "move_player", "move_forward", "claim_all_location_advantages", "defeat_player",
  "remove_selected_cards", "remove_cards_in_zone", "sequester_random_inactive_servant_skill", "transfer_matching_cards", "discard_selected_hand_and_draw", "discard_selected_cards",
  "create_card_instances", "return_card_by_definition", "return_cards_by_definitions", "remove_owned_cards_by_linked_skill",
  "look_deck_top_choose_one_to_hand_discard_rest", "look_target_deck_top_discard_selected_keep_rest",
  "close_source_card", "add_status", "remove_status", "install_ability_rule_modifier", "remove_linked_status", "add_linked_status", "exile_source_card", "close_owned_active_cards_by_definition", "close_selected_card", "close_matching_cards_except_selected", "set_selected_cards_face",
  "gain_mana_from_selected_card_base_power", "gain_victory_points_if_selected_card_base_power_greater", "discard_random_cards",
  "activate_owned_skill_card", "deactivate_owned_skill_card", "reset_skill_usage", "finish_game",
]);

const RULE_MODIFIER_RULES = new Set(["face_up_cards_per_round", "card_cost", "card_power", "card_base_power", "card_residual", "combat_power", "movement_cost", "movement_destinations", "card_ability_move_direction", "standard_attack_card_count", "standard_append", "standard_append_cost", "card_draw", "deployment_resource_gain", "deployment_advantage", "deployment_destinations", "skill_use", "elimination", "card_play", "card_play_upgrade", "card_play_with_others", "card_close", "defeat", "defeat_cost", "combat_winner_inclusion", "combat_reward_distribution", "situation_card_play", "situation_mana_gain", "situation_power_bonus", "mana_spending", "non_effect_victory_point_gain"]);
const FORMULA_METRICS = new Set([
  "mana", "combat_power", "victory_points", "round_number", "movement_distance_this_round", "locations_passed_this_round", "deployment_bonus", "hand_size", "deck_size", "discard_size",
  "controlled_attack_count", "active_attack_count", "engaged_opponent_count", "same_battlefield_opponent_count",
  "same_location_opponent_count", "source_card_base_power", "source_card_current_power", "source_card_active_round_count", "selected_card_printed_cost", "selected_card_base_power", "target_card_base_power", "selected_player_event_combat_power", "event_printed_victory_points", "selected_event_victory_points", "selected_event_victory_points_sum", "matching_event_victory_points", "players_with_status_count", "opponents_without_status_count", "selected_card_count", "payload_card_base_power", "face_up_definition_count",
]);
const FORMULA_OPERATIONS = new Set(["add", "subtract", "multiply", "floor_divide", "ceil_divide", "min", "max", "abs"]);
const CARD_FACE_FORMULA_METRICS = new Set(["victory_points", "mana", "round_number", "movement_distance_this_round", "hand_size", "deck_size", "discard_size", "controlled_attack_count", "player_flag_number"]);

export function getAutomaticCardFaceRuntimeGaps(cardFace: { basePowerFormula?: unknown } | undefined): string[] {
  if (cardFace?.basePowerFormula === undefined) return [];
  const gaps: string[] = [];
  validateCardFaceFormula(cardFace.basePowerFormula, gaps);
  return [...new Set(gaps)];
}

export function getAutomaticAbilityRuntimeGaps(ability: FDAuthoringAbility): string[] {
  const gaps: string[] = [];
  for (const condition of ability.conditions ?? []) validateCondition(condition, gaps);
  for (const effect of ability.effects ?? []) validateEffect(effect, gaps);
  for (const create of ability.creates ?? []) {
    if (create.type !== "card") gaps.push(`create:type:${String(create.type ?? "missing")}`);
    if (typeof create.definitionId !== "string" && typeof create.linkedSkillId !== "string") gaps.push("create:definition");
    if (create.zone !== undefined && !["hand", "deck", "discard", "attack", "removed", "master-skills", "servant-skills", "board"].includes(String(create.zone))) gaps.push(`create:zone:${String(create.zone)}`);
    if (create.zone === "board" && typeof create.boardLocationId !== "string") gaps.push("create:boardLocationId");
    if (create.count !== undefined) validateFormula(create.count, gaps);
    if (create.target !== undefined && create.target !== "controller") gaps.push(`create:target:${String(create.target)}`);
    const cleanup = create.lifecycle?.cleanup;
    if (cleanup !== undefined && !["remain_active", "close_at_round_end", "discard_at_round_end", "remove_from_game"].includes(String(cleanup))) gaps.push(`create:cleanup:${String(cleanup)}`);
  }
  for (const copy of ability.copies ?? []) {
    const sourceOk = copy.source === "selected_card" || (isRecord(copy.source) && copy.source.type === "linked_skill" && typeof copy.source.linkedSkillId === "string");
    if (!sourceOk) gaps.push(`copy:source:${String(copy.source ?? "missing")}`);
    if (copy.zone !== undefined && !["hand", "deck", "discard", "attack", "removed", "master-skills", "servant-skills", "board"].includes(String(copy.zone))) gaps.push(`copy:zone:${String(copy.zone)}`);
    if (copy.zone === "board" && typeof copy.boardLocationId !== "string") gaps.push("copy:boardLocationId");
    const duration = copy.lifecycle?.duration;
    if (duration !== undefined && !["this_round", "permanent", "while_active", "until_card_closed", "until_condition_met"].includes(String(duration))) gaps.push(`copy:lifecycle:${String(duration)}`);
    const cleanup = copy.lifecycle?.cleanup;
    if (cleanup !== undefined && !["remain_active", "close_at_round_end", "discard_at_round_end", "remove_from_game"].includes(String(cleanup))) gaps.push(`copy:cleanup:${String(cleanup)}`);
  }
  for (const transform of ability.transforms ?? []) {
    if (transform.type !== "card") gaps.push(`transform:type:${String(transform.type ?? "missing")}`);
    if (ability.kind !== "passive" && ability.kind !== "residual") gaps.push("transform:continuous-source-required");
    const subject = transform.target?.subject ?? "controller";
    if (!["controller", "all_players", "opponents"].includes(subject)) gaps.push(`transform:subject:${subject}`);
    const setKeys = Object.keys(transform.set ?? {});
    if (setKeys.some((key) => key !== "name") || (transform.set?.name !== undefined && typeof transform.set.name !== "string")) gaps.push("transform:set");
    if (!transform.set?.name && !(transform.grantAbilities?.length)) gaps.push("transform:empty");
    const duration = transform.lifecycle?.duration ?? ability.lifecycle?.duration;
    if (!["while_active", "until_card_closed", "permanent"].includes(String(duration))) gaps.push("transform:lifecycle");
    for (const granted of transform.grantAbilities ?? []) {
      if (!granted.id || !granted.activation?.phase) gaps.push("transform:grantedAbility:identity");
      if (granted.limit !== undefined && granted.limit !== "once-per-round") gaps.push(`transform:grantedAbility:limit:${String(granted.limit)}`);
      if (granted.handlerId !== undefined && (typeof granted.handlerId !== "string" || !granted.handlerId)) gaps.push("transform:grantedAbility:handlerId");
      if (granted.allowedZones !== undefined) {
        const allowedCardZones = new Set(["master-skills", "servant-skills", "deck", "hand", "attack", "attached", "discard", "removed"]);
        if (!Array.isArray(granted.allowedZones) || granted.allowedZones.length === 0 || granted.allowedZones.some((zone) => !allowedCardZones.has(String(zone)))) gaps.push("transform:grantedAbility:allowedZones");
      }
      if (granted.allowInactive !== undefined && typeof granted.allowInactive !== "boolean") gaps.push("transform:grantedAbility:allowInactive");
      for (const modifier of granted.ruleModifiers ?? []) {
        if (!RULE_MODIFIER_RULES.has(modifier.rule)) gaps.push(`transform:grantedAbility:ruleModifier:${modifier.rule}`);
        if (modifier.value !== undefined) validateFormula(modifier.value, gaps);
        if (modifier.lifecycle?.duration !== "this_round") gaps.push("transform:grantedAbility:ruleModifier:lifecycle");
      }
    }
  }
  for (const modifier of ability.ruleModifiers ?? []) {
    if (!RULE_MODIFIER_RULES.has(modifier.rule)) gaps.push(`ruleModifier:${modifier.rule}`);
    if (modifier.value !== undefined) validateFormula(modifier.value, gaps);
    if (ability.kind !== "passive" && ability.kind !== "residual") {
      const duration = modifier.lifecycle?.duration ?? ability.lifecycle?.duration;
      if (!["this_round", "permanent", "while_active", "until_card_closed"].includes(String(duration))) gaps.push("ruleModifier:lifecycle");
    }
  }
  return [...new Set(gaps)];
}

function validateCondition(condition: Record<string, unknown>, gaps: string[]): void {
  const type = typeof condition.type === "string" ? condition.type.replaceAll("-", "_") : "";
  if (!CONDITION_TYPES.has(type)) gaps.push(`condition:${String(condition.type)}`);
  if (type === "any_of" && Array.isArray(condition.conditions)) {
    for (const nested of condition.conditions) if (isRecord(nested)) validateCondition(nested, gaps);
  }
  if (type === "any_of" && Array.isArray(condition.conditions)) {
    for (const nested of condition.conditions) if (isRecord(nested)) validateCondition(nested, gaps);
  }
  if (type === "implies") {
    for (const key of ["when", "then", "require"] as const) {
      if (!Array.isArray(condition[key])) continue;
      for (const nested of condition[key]) if (isRecord(nested)) validateCondition(nested, gaps);
    }
  }
}

function validateEffect(effect: Record<string, unknown>, gaps: string[]): void {
  const rawType = typeof effect.type === "string" ? effect.type : "";
  const type = rawType.replaceAll("-", "_");
  if (!EFFECT_TYPES.has(type)) gaps.push(`effect:${rawType || "missing"}`);
  if (type === "sequester_random_inactive_servant_skill" && effect.returnOn !== "controller_elimination") gaps.push(`sequestration:returnOn:${String(effect.returnOn ?? "missing")}`);
  if (effect.amount !== undefined) validateFormula(effect.amount, gaps);
  if (type === "choose_one" && isRecord(effect.recordChoice)) {
    const scope = effect.recordChoice.scope;
    if (scope !== undefined && !["round", "game", "until_source_closed"].includes(String(scope))) gaps.push(`recordChoice:scope:${String(scope)}`);
  }
  if (Array.isArray(effect.then)) for (const nested of effect.then) if (isRecord(nested)) validateEffect(nested, gaps);
  if (Array.isArray(effect.options)) {
    for (const option of effect.options) {
      if (!isRecord(option) || !Array.isArray(option.effects)) continue;
      for (const nested of option.effects) if (isRecord(nested)) validateEffect(nested, gaps);
    }
  }
}

function validateCardFaceFormula(value: unknown, gaps: string[]): void {
  if (Number.isInteger(value)) return;
  if (!isRecord(value)) { gaps.push("cardFaceFormula:invalid"); return; }
  if (value.type === "constant" && Number.isInteger(value.value)) return;
  if (value.type === "metric") {
    if (typeof value.metric !== "string" || !CARD_FACE_FORMULA_METRICS.has(value.metric)) gaps.push(`cardFaceFormula:metric:${String(value.metric ?? "unknown")}`);
    if (value.metric === "player_flag_number" && (typeof value.key !== "string" || !value.key)) gaps.push("cardFaceFormula:player_flag_number:key");
    return;
  }
  if (value.type === "formula") {
    if (typeof value.op !== "string" || !FORMULA_OPERATIONS.has(value.op) || !Array.isArray(value.args)) {
      gaps.push(`cardFaceFormula:${String(value.op ?? "unknown")}`);
      return;
    }
    for (const arg of value.args) validateCardFaceFormula(arg, gaps);
    return;
  }
  gaps.push(`cardFaceFormula:${String(value.type ?? "unknown")}`);
}

function validateFormula(value: unknown, gaps: string[]): void {
  if (Number.isInteger(value)) return;
  if (!isRecord(value)) { gaps.push("formula:invalid"); return; }
  if (value.type === "constant" && Number.isInteger(value.value)) return;
  if (value.type === "metric" && typeof value.metric === "string" && FORMULA_METRICS.has(value.metric)) {
    if (value.locationIds !== undefined && (!Array.isArray(value.locationIds) || value.locationIds.some((item) => typeof item !== "string" || !item))) {
      gaps.push("formula:metric:locationIds");
    }
    return;
  }
  if (value.type === "formula") {
    if (typeof value.op !== "string" || !FORMULA_OPERATIONS.has(value.op) || !Array.isArray(value.args)) {
      gaps.push(`formula:${String(value.op ?? "unknown")}`);
      return;
    }
    for (const arg of value.args) validateFormula(arg, gaps);
    return;
  }
  if (["payload_count", "payload-count", "payload_number", "payload-number", "payload_number_plus", "payload-number-plus"].includes(String(value.type))) return;
  gaps.push(`formula:${String(value.type ?? "unknown")}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
