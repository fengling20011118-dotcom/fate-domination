import type { PendingDecision } from "../domain/state/types.ts";

const LOCATION_LABELS: Record<string, string> = {
  workshop: "魔术工房",
  mountain: "深山町",
  city: "新都",
  scouting: "侦察",
  mooncell: "月之圣杯",
  "moon-cell": "月之圣杯",
  "moon cell": "月之圣杯",
  Workshop: "魔术工房",
  Mountain: "深山町",
  Miyama: "深山町",
  City: "新都",
  Shinto: "新都",
  Scouting: "侦察",
};

const EXACT_LABELS: Record<string, string> = {
  Charlemagne: "查理曼",
  "Dr. Henry Jekyll": "亨利·杰基尔博士",
  "Queenside Castle": "王城奇袭",
  "Ridicule Cat": "嘲弄猫",
  "Demon God Baal": "魔神柱巴力",
  "Demon God Phenex": "魔神柱菲尼克斯",
  "Demon God Forneus": "魔神柱佛钮司",
  "Demon God Flauros": "魔神柱佛劳洛斯",
  "Demon God Zepar": "魔神柱桀派",
  "Demon God Raum": "魔神柱劳姆",
  "Demon God Barbatos": "魔神柱巴巴妥司",
  "Card Selection": "卡牌选择",
  "Saber Install": "梦幻召唤-剑士",
  "Lancer Install": "梦幻召唤-枪兵",
  "Archer Install": "梦幻召唤-弓兵",
  "Rider Install": "梦幻召唤-骑兵",
  "Caster Install": "梦幻召唤-魔术师",
  "Assassin Install": "梦幻召唤-暗杀者",
  "他人格（Alter Ego Class）": "他人格",
  "伪装者（Pretender Class）": "伪装者",
  "复仇者职阶卡（Avenger Class）": "复仇者职阶卡",
  Decline: "不发动",
  Skip: "跳过",
  Pass: "放弃",
  Stay: "留在原地",
  Play: "打出",
  Discard: "弃置",
  "Close source card": "关闭此牌",
  "Do not replace an objective": "不替换事件牌",
  "Leave them attached": "保持附着",
  "Add all Overloads": "加入全部【过载】",
  "Pay 1 VP": "支付1点战果",
  "Pay 3 mana": "支付3点魔力",
  "Move one location along the arrow": "沿箭头移动一处地点",
  "Cannot move this round": "本回合无法移动",
  "Free play one hand card": "免费打出一张手牌",
  "Move to a battlefield": "移动至一处战场",
  "Return Raum to hand": "将劳姆加入手牌",
  "Shuffle Zepar into deck and gain 2 VP": "将桀派洗回牌库并获得2点战果",
  "Demon God": "魔神柱",
  "Deactivate Avatar of Rage": "关闭【愤怒化身】",
  Luck: "幸运",
  Culprit: "犯人",
  Clue: "线索",
  "Break Bounded Field": "结界破坏",
  "Replacement": "替代品",
  "Second Contract": "第二契约",
  "Do not restore the stored objective": "不恢复暂存的事件牌",
  "Apply [defeat]": "施加【败北】",
  "Close Cargo cards": "关闭货箱牌",
  "Keep Cargo cards": "保留货箱牌",
  "Remove Doppelgänger": "移除【分身】",
  "Cannot enter Himiko's current location": "本回合无法进入卑弥呼所在地点",
  "Himiko steals 2 VP": "卑弥呼偷取2点战果",
  "Take your Action phase immediately": "立即进行自己的行动阶段",
  "-3 total power; Himiko +3": "你的合计威力-3；卑弥呼合计威力+3",
  "Power +2": "威力+2",
  "Mana +1": "获得1点魔力",
  "Move up to 1": "沿箭头移动至多一处地点",
  "Keep trained skill": "保留已训练技能",
  "Replace with EX Class": "替换为EX职阶",
  "Basic Strength 5": "力量基础攻击（5威力）",
  "Basic Agility 5": "迅捷基础攻击（5威力）",
  "+1 trained skill power": "已训练技能威力+1",
  "+4 power": "威力+4",
  "-3 cost": "费用-3",
};

const ABILITY_LABELS: Record<string, string> = {
  Baal: "巴力",
  Phenex: "菲尼克斯",
  Forneus: "佛钮司",
  Flauros: "佛劳洛斯",
  Zepar: "桀派",
  "Mana Defense": "魔力防御",
  Conspiracy: "阴谋",
  Rally: "激烈行进",
  "Allfather's Wisdom": "大神的睿智",
  "Castle of Skye": "影之城",
  "Absolute Surrender": "绝对投降",
  Dissociation: "解离",
  "Maria the Ripper": "解体圣母",
  "Card Holster": "魔卡皮套",
  "Quintett Feuer": "多元重奏饱和炮击",
  "Fast Expansion": "快速扩张",
  "Final Bell Toll": "晚钟",
  "Cut From Fate": "斩断命运",
  Alchemist: "炼金术师",
  "Kabbalistic Study": "卡巴拉研究",
  "Reinforced Golem Plating": "强化魔偶装甲",
  "Dress Change": "换装",
  Tag: "换人",
  "Command Chain · Strength": "指令连携·力量",
  "Command Chain · Agility": "指令连携·迅捷",
  "Command Chain · Magic": "指令连携·魔术",
  Deception: "欺骗",
  Repair: "修复",
  "Bend!": "扭曲！",
  "Perfect Deduction": "完美推理",
  Raum: "劳姆",
  Barbatos: "巴巴托斯",
  "Temple of Time": "冠位时间神殿",
  "Advanced Training": "高级训练",
  "Chaldea Cafeteria": "迦勒底食堂",
  "EX Ruler": "EX裁定者",
  Reboot: "重启",
  "Black Barrel": "黑枪",
  Fusion: "融合",
  "Pilgrim's Call": "朝圣者的召唤",
  "Pilgrim's Respite": "朝圣者的休憩",
  "Privilege Access": "权限访问",
  "B.B. Slot Machine": "B.B.老虎机",
  "Moon Cancer": "月之癌",
  "Moon Cancer - Swap": "月之癌·交换",
  "Gospel of Slaughter": "屠戮的福音",
  "Gospel of Slaughter - Reverse": "屠戮的福音·反转",
  "Oracle of Light": "光之神谕",
  "Mirror Shield": "鬼道·镜之盾",
  "Sacred Land": "鬼道·圣洁之土",
  "Perpetual Engine": "永动炉心",
  "Wise Fox": "才智",
  "Kaleidostick · Draw": "万花筒之杖·抽牌",
  "Kaleidostick · Shuffle": "万花筒之杖·洗牌",
  "Qin Shi Huang": "始皇帝",
  "Cyber Ghost": "电子幽灵",
  "Queenside Castle": "王城奇袭",
};

const PHASE_LABELS: Record<string, string> = {
  preparation: "准备阶段",
  outpost: "前哨阶段",
  action: "行动阶段",
  combat: "战斗阶段",
};

const COMMAND_LABELS: Record<string, string> = {
  "game.start": "开始游戏",
  "game.start.standard": "开始标准模式",
  "phase.player.complete": "完成当前步骤",
  "decision.resolve": "确认选择",
  "decision.cancel": "取消选择",
  "card.play": "打出卡牌",
  "player.deploy": "部署",
  "player.move": "移动",
  "card.ability.use": "使用卡牌能力",
  "player.attack.commit": "确认攻击",
  "combat.resolve": "结算战斗",
  "combat.response.complete": "完成战斗响应",
  "round.end": "结束回合",
  "skill.use": "使用技能",
  "command-seal.use": "使用令咒",
  "setup.assign-identity": "选择角色",
  "setup.set-ready": "准备完成",
  "three-x.ban-master": "禁用御主",
  "three-x.auto-ban": "自动禁用御主",
  "three-x.finalize-ban": "确认禁用",
  "three-x.commit-ban": "提交禁用",
  "three-x.select-master": "选择御主",
  "three-x.finalize-masters": "确认御主",
  "three-x.purchase": "购买强化",
  "three-x.finalize-purchase": "确认购买",
  "three-x.select-servant": "选择从者",
  "three-x.finalize-servants": "确认从者",
  "three-x.lock-turn-order": "确认行动顺位",
};

export function localizeLocationLabel(value: string): string {
  return LOCATION_LABELS[value] ?? value;
}

const EXACT_TEXTS: Readonly<Record<string, string>> = Object.freeze({
  "Passive/Outpost: Discard this card. Draw 2 cards. Passive/Outpost: Exchange this card with a card from a drawn Servant deck or a Miyu Install from outside the game.":
    "被动/前哨阶段：弃置此牌，抽2张牌。\n被动/前哨阶段：将此牌与游戏开始时你所抽取从者的牌堆中的牌或游戏外的【梦幻召唤】交换。",
  "Only play 1 [Install] per turn. <Once Per Game> Combat: Set the power of all opponents' Magic attacks in your fight to 0.":
    "每回合只能进行1次【梦幻召唤】<每局游戏限一次>。战斗阶段：将同一战场所有对手的魔术属性威力变为0。",
  "Only play 1 [Install] per turn. <Once Per Game> Action: Move to any location besides the Magic Workshop.":
    "每回合只能进行1次【梦幻召唤】<每局游戏限一次>。行动阶段：移动到【魔术工房】以外的任何地点。",
  "Only play 1 [Install] per turn. <Once Per Game> Action: Double your terrain advantage.":
    "每回合只能进行1次【梦幻召唤】<每局游戏限一次>。行动阶段：将你的地利翻倍。",
  "Only play 1 [Install] per turn. <Once Per Game> Action: Play up to 3 cards from your hand with base power 3 or less.":
    "每回合只能进行1次【梦幻召唤】<每局游戏限一次>。行动阶段：从手牌中打出至多3张基本威力3及以下的牌。",
  "Only play 1 [Install] per turn. <Once Per Game> Permanent: Deactivate this when you play another non-basic attack. Reduce its cost by 3 or increase its power by 2.":
    "每回合只能进行1次【梦幻召唤】<每局游戏限一次>。残留：当你打出另一张非基础攻击时关闭此牌。令那张牌获得威力+2或费用-3。",
  "Only play 1 [Install] per turn. <Once Per Game> Combat: Steal 1 VP from each opponent at your location for each skill they used this round.":
    "每回合只能进行1次【梦幻召唤】<每局游戏限一次>。战斗阶段：与你交战的对手本回合每使用过一张技能牌，便偷取他们的1点战果。",
});

export function localizePlayerFacingLabel(rawLabel: string, optionId?: string): string {
  const label = String(rawLabel ?? "").trim();
  if (!label) return optionId ? localizeLocationLabel(optionId) : label;
  if (EXACT_LABELS[label]) return EXACT_LABELS[label];
  if (LOCATION_LABELS[label]) return LOCATION_LABELS[label];
  if (optionId && LOCATION_LABELS[optionId] && (label === optionId || label.toLowerCase() === optionId.toLowerCase())) {
    return LOCATION_LABELS[optionId];
  }

  let match = label.match(/^Gain (\d+) mana$/i);
  if (match) return `获得${match[1]}点魔力`;
  match = label.match(/^Draw (\d+)$/i);
  if (match) return `抽${match[1]}张牌`;
  match = label.match(/^Pay (\d+) mana$/i);
  if (match) return `支付${match[1]}点魔力`;
  match = label.match(/^Pay (\d+) VP$/i);
  if (match) return `支付${match[1]}点战果`;
  match = label.match(/^Play (.+)$/i);
  if (match) return `打出${localizePlayerFacingLabel(match[1])}`;
  match = label.match(/^Discard (.+)$/i);
  if (match) return `弃置${localizePlayerFacingLabel(match[1])}`;
  match = label.match(/^Replace (.+) with (.+)$/i);
  if (match) return `将${localizePlayerFacingLabel(match[1])}替换为${localizePlayerFacingLabel(match[2])}`;
  match = label.match(/^Replace (.+)$/i);
  if (match) return `替换为${localizePlayerFacingLabel(match[1])}`;
  match = label.match(/^Wisdom (\d+)$/i);
  if (match) return `才智 ${match[1]}`;
  match = label.match(/^Analysis · (.+)$/i);
  if (match) return `解析 · ${localizePlayerFacingLabel(match[1])}`;
  match = label.match(/^Challenge · (.+)$/i);
  if (match) return `挑战 · ${localizePlayerFacingLabel(match[1])}`;
  match = label.match(/^Secret Garden(?: \((.+)\))?$/i);
  if (match) return match[1] ? `秘密花园（${match[1]}）` : "秘密花园";
  match = label.match(/^Clue:\s*(.+)$/i);
  if (match) return `线索：${localizePlayerFacingLabel(match[1])}`;
  match = label.match(/^(.+): location or 2 VP$/i);
  if (match) return `${match[1]}：地点限制或偷取2点战果`;
  match = label.match(/^(.+): immediate Action or ±3 power$/i);
  if (match) return `${match[1]}：立即行动或合计威力±3`;
  match = label.match(/^Place Break Bounded Field at (workshop|mountain|city|scouting)$/i);
  if (match) return `将【结界破坏】放置于${localizeLocationLabel(match[1].toLowerCase())}`;
  match = label.match(/^(.+) @ (workshop|mountain|city|scouting)$/i);
  if (match) return `${match[1]} · ${localizeLocationLabel(match[2].toLowerCase())}`;

  return label
    .replace(/病弱[（(]Weak Constitution[）)]/gi, "病弱")
    .replace(/厄运[（(]Misfortune[）)]/gi, "厄运")
    .replace(/女神的神核[（(]Divine Core[）)]/gi, "女神的神核")
    .replace(/撕裂天际的光辉之船[（(]Astrapte Argo[）)]/gi, "撕裂天际的光辉之船")
    .replace(/小型魔像[（(]Lesser Golem[）)]/gi, "小型魔像")
    .replace(/普通魔像[（(]Common Golem[）)]/gi, "普通魔像")
    .replace(/[（(]Saber Class[）)]/gi, "（剑士职阶）")
    .replace(/[（(]Archer Class[）)]/gi, "（弓兵职阶）")
    .replace(/[（(]Lancer Class[）)]/gi, "（枪兵职阶）")
    .replace(/[（(]Rider Class[）)]/gi, "（骑兵职阶）")
    .replace(/[（(]Caster Class[）)]/gi, "（魔术师职阶）")
    .replace(/[（(]Assassin Class[）)]/gi, "（暗杀者职阶）")
    .replace(/[（(]Pretender Class[）)]/gi, "（伪装者职阶）")
    .replace(/[（(]Avenger Class[）)]/gi, "（复仇者职阶）")
    .replace(/[（(]Alter Ego Class[）)]/gi, "（他人格职阶）")
    .replace(/\s*[（(]Attack[）)]/gi, "（攻击）")
    .replace(/对Saber/g, "对剑士")
    .replace(/[（(]Caster[）)]/g, "（魔术师）")
    .replace(/\bworkshop\b/g, "魔术工房")
    .replace(/\bmountain\b/g, "深山町")
    .replace(/\bcity\b/g, "新都")
    .replace(/\bscouting\b/g, "侦察")
    .replace(/\bMiyama\b/g, "深山町")
    .replace(/\bMountain\b/g, "深山町")
    .replace(/\bShinto\b/g, "新都")
    .replace(/\bCity\b/g, "新都")
    .replace(/\bWorkshop\b/g, "魔术工房")
    .replace(/\bScouting\b/g, "侦察")
    .replace(/\bMoon Cell\b/gi, "月之圣杯");
}

export function localizePlayerFacingText(rawText: string): string {
  const text = String(rawText ?? "");
  const exact = EXACT_TEXTS[text];
  if (exact) return exact;
  return text
    .replace(/复仇者职阶卡[（(]Avenger Class[）)]/gi, "复仇者职阶卡")
    .replace(/[（(]Avenger Class[）)]/gi, "（复仇者职阶）")
    .replace(/源Wiki/g, "源维基")
    .replace(/Deck变体/g, "牌库变体")
    .replace(/\bNPC\b/g, "非玩家角色")
    .replace(/Saber必须死！/g, "剑士必须死！")
    .replace(/职阶为Saber/g, "职阶为剑士");
}

export function localizeActionLabel(rawLabel: string | undefined, commandType: string): string {
  if (!rawLabel || rawLabel === commandType) return COMMAND_LABELS[commandType] ?? localizePlayerFacingLabel(rawLabel ?? commandType);
  // Decision kinds are implementation identifiers and should never be presented directly to players.
  if (commandType === "decision.resolve") return "确认选择";
  if (commandType === "decision.cancel") return "取消选择";
  return localizePlayerFacingLabel(rawLabel);
}

export function localizeSkillActionLabel(input: {
  skillName: string;
  abilityName?: string;
  abilityWindows?: readonly string[];
  currentPhase?: string;
  ordinal?: number;
  sameWindowCount?: number;
}): string {
  const skillName = localizePlayerFacingLabel(input.skillName);
  if (!input.abilityName) return skillName;
  const mapped = ABILITY_LABELS[input.abilityName] ?? localizePlayerFacingLabel(input.abilityName);
  if (!/[A-Za-z]{2,}/.test(mapped)) return `${skillName}·${mapped}`;

  const phase = input.currentPhase && input.abilityWindows?.includes(input.currentPhase)
    ? input.currentPhase
    : input.abilityWindows?.[0];
  const phaseLabel = phase ? PHASE_LABELS[phase] : undefined;
  const base = phaseLabel ? `${phaseLabel}能力` : "技能能力";
  const suffix = (input.sameWindowCount ?? 0) > 1 && Number.isInteger(input.ordinal)
    ? `${base}${Number(input.ordinal) + 1}`
    : base;
  return `${skillName}·${suffix}`;
}

export function localizePendingDecision(decision: PendingDecision): PendingDecision {
  return {
    ...structuredClone(decision),
    options: decision.options.map((option) => ({
      ...structuredClone(option),
      label: localizePlayerFacingLabel(option.label, option.id),
    })),
  };
}
