import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const source = read('src/content/generated/legacy-content.json');
const art = read('src/content/generated/battle-board-art.json');
const situations = source.situations.map(card => ({
  id: card.id, name: card.name, text: card.text, image: art[card.id],
  mana: card.mana, climax: Boolean(card.climax), count: 1,
}));
const events = [];
for (const group of source.eventGroups.filter(group => group.id === 'event-group.fuyuki')) {
  for (const card of group.cards) {
    const same = events.find(entry => entry.name === card.name && entry.text === card.text && entry.victoryPoints === card.victoryPoints);
    if (same) { same.count += 1; continue; }
    events.push({ id: card.id, name: card.name, text: card.text, image: art[card.id], victoryPoints: card.victoryPoints, group: group.name, count: 1 });
  }
}
for (const card of [...situations, ...events]) {
  if (!card.image || !fs.existsSync(path.resolve(root, 'ui-preview', card.image))) throw new Error(`Missing card art: ${card.id}`);
}
fs.writeFileSync(path.join(root, 'ui-preview/board-codex-data.js'), 'window.FDBoardCodexData=' + JSON.stringify({ situations, events }, null, 2) + ';\n');
console.log(`Board codex: ${situations.length} situations, ${events.length} event types / ${events.reduce((total, card) => total + card.count, 0)} cards`);
