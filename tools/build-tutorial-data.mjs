import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const documents = [
  ['flow', '回合流程与关键词', 'turn-flow-and-keywords.md'],
  ['base', '基础规则', 'base-rules.md'],
  ['fqa', '规则问答', 'fqa.md'],
  ['qa', '问题解答与规则说明', 'qa-workbook.md'],
  ['three-x', '3X 规则', '3x-rules.md'],
].map(([id, title, file]) => ({ id, title, text: fs.readFileSync(path.join(root, 'docs/rule-sources', file), 'utf8') }));
fs.writeFileSync(path.join(root, 'ui-preview/tutorial-data.js'), 'window.FDTutorialDocuments=' + JSON.stringify(documents, null, 2) + ';\n');
console.log(`Tutorial: ${documents.length} rule documents`);
