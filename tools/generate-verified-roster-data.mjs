import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const rulesRoot = process.argv[2] || process.env.FD_RULES_ROOT || path.resolve(projectRoot, '../binchen648_fd/work');
const libraryPath = path.join(rulesRoot, 'data/generated/fd-playtest-v1.content-library.json');
const manifestPath = path.join(rulesRoot, 'apps/client/src/state/fd-asset-manifest.ts');

const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
const manifestSource = fs.readFileSync(manifestPath, 'utf8');
const manifestMatch = manifestSource.match(/=\s*({[\s\S]*})\s*as const;/);
if (!manifestMatch) throw new Error(`无法解析资源清单：${manifestPath}`);
const manifest = JSON.parse(manifestMatch[1]);

const masterIds = [
  'master.kayneth',
  'master.shinji',
  'master.kiritsugu',
  'master.maiya',
  'master.gatou',
  'master.irisviel',
  'master.olga-marie',
];
const servantIds = [
  'servant.artoriac',
  'servant.drake',
  'servant.achilles',
  'servant.artoria-alt',
  'servant.ereshkigal',
  'servant.tomoe',
  'servant.kintoki',
];
const displayNames = {
  'master.kayneth': '肯尼斯',
  'master.irisviel': '爱丽丝菲尔',
};
const cardTypeNames = {
  command_spell: '令咒',
  master_skill: '御主技能',
  servant_skill: '从者技能',
  basic_attack: '基础攻击',
};
const basicImages = {
  'basic.luck': './playtest/assets/fd/real/basic-attacks/basic-luck.png',
  'basic.surveil': './playtest/assets/fd/real/basic-attacks/basic-surveil.png',
  'basic.preparation': './playtest/assets/fd/real/basic-attacks/basic-preparation.png',
};

const authoredCards = new Map(library.cards.map(card => [card.id, card]));
const runtimeCards = library.rules.cards || {};
const entityById = new Map([...library.masters, ...library.servants].map(entity => [entity.id, entity]));

function localAsset(assetPath = '') {
  return assetPath ? `./playtest${assetPath}` : '';
}

function cardById(id) {
  return authoredCards.get(id) || runtimeCards[id] || null;
}

function rulesText(card) {
  if (!card) return '';
  if (card.printedText) return card.printedText;
  const clauses = (card.abilities || []).map(ability => ability.printedClause).filter(Boolean);
  if (clauses.length) return clauses.join('\n');
  const power = card.cardFace?.basePower;
  return power == null ? '' : `以基础威力 ${power} 参与战斗。`;
}

function cardView(id) {
  const card = cardById(id);
  if (!card) throw new Error(`内容库缺少卡牌：${id}`);
  const face = card.cardFace || {};
  const type = face.typeLabel || cardTypeNames[card.cardType] || '卡牌';
  const asset = manifest.cards[id];
  return {
    id,
    name: card.name,
    type,
    text: rulesText(card),
    cost: card.printedCost ?? face.cost ?? null,
    requirement: card.requirement ?? null,
    basePower: card.printedValue ?? face.basePower ?? null,
    image: asset ? localAsset(asset) : (basicImages[id] || ''),
  };
}

function className(entity) {
  return entity.classTag || entity.class || entity.className || entity.servantClass || (entity.id.startsWith('master.') ? 'Master' : 'Servant');
}

function portraitPath(entity, displayName) {
  const folder = entity.id.startsWith('master.') ? 'masters' : 'servants';
  return `../assets/cards/${folder}/${displayName}.png`;
}

function deckFor(entity) {
  const ids = library.rules.decks?.[entity.id] || [];
  const groups = [];
  for (const id of ids) {
    const existing = groups.find(group => group.id === id);
    if (existing) existing.count += 1;
    else groups.push({...cardView(id), count: 1});
  }
  return groups;
}

function characterView(id) {
  const entity = entityById.get(id);
  if (!entity) throw new Error(`内容库缺少角色：${id}`);
  const name = displayNames[id] || entity.name;
  const skillIds = [...(entity.commandSpellCardIds || []), ...(entity.skillCardIds || [])];
  return {
    sourceId: id,
    name,
    fullName: entity.name,
    class: className(entity),
    image: portraitPath(entity, name),
    skills: skillIds.map(cardView),
    ...(id.startsWith('servant.') ? {deck: deckFor(entity)} : {}),
  };
}

function bucket(ids) {
  return Object.fromEntries(ids.map(id => {
    const view = characterView(id);
    return [view.name, view];
  }));
}

const detail = {masters: bucket(masterIds), servants: bucket(servantIds)};
const preview = {
  masters: Object.fromEntries(Object.entries(detail.masters).map(([name, item]) => [name, {
    sourceId: item.sourceId,
    name: item.name,
    fullName: item.fullName,
    class: item.class,
    image: item.image,
    skills: item.skills.map(({id, name: skillName, type, text}) => ({id, name: skillName, type, text})),
  }])),
  servants: Object.fromEntries(Object.entries(detail.servants).map(([name, item]) => [name, {
    sourceId: item.sourceId,
    name: item.name,
    fullName: item.fullName,
    class: item.class,
    image: item.image,
    skills: item.skills.map(({id, name: skillName, type, text}) => ({id, name: skillName, type, text})),
  }])),
};

fs.writeFileSync(path.join(projectRoot, 'ui-preview/codex-detail-data.js'), `window.FDCodexDetailData=${JSON.stringify(detail, null, 2)};\n`);
fs.writeFileSync(path.join(projectRoot, 'ui-preview/character-preview-data.js'), `window.FDCharacterPreviewData=${JSON.stringify(preview, null, 2)};\n`);

const skillCount = [...Object.values(detail.masters), ...Object.values(detail.servants)]
  .reduce((total, entity) => total + entity.skills.length, 0);
const deckTypeCount = Object.values(detail.servants).reduce((total, entity) => total + entity.deck.length, 0);
console.log(`已生成 ${masterIds.length} 名御主、${servantIds.length} 名从者、${skillCount} 个技能、${deckTypeCount} 种卡组条目。`);
