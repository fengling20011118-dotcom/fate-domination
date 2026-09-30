import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const documents = [
  ['flow', '开局与回合流程', 'turn-flow-and-keywords.md'],
  ['base', '地点、部署与移动', 'base-rules.md'],
  ['fqa', '出牌与情报', 'fqa.md'],
  ['qa', '威力、结算与胜负', 'qa-workbook.md'],
  ['keywords', '卡牌关键词', null],
  ['common', '常见问题', null],
  ['three-x', '3X 抽选与购点', '3x-rules.md'],
].map(([id, title, file]) => ({
  id, title,
  text: fs.readFileSync(path.join(root, 'docs/tutorial-guide', id + '.md'), 'utf8'),
  reference: file ? fs.readFileSync(path.join(root, 'docs/rule-sources', file), 'utf8') : '',
  referenceTitle: file === 'qa-workbook.md' ? '问题解答与规则说明原文' : '规则原文',
}));
fs.writeFileSync(path.join(root, 'ui-preview/tutorial-data.js'), 'window.FDTutorialDocuments=' + JSON.stringify(documents, null, 2) + ';\n');
console.log(`Tutorial: ${documents.length} edited chapters, 5 original references`);
