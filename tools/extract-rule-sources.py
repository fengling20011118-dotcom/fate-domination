"""Build a searchable UTF-8 corpus from the authoritative rule references.

This is a migration-only tool.  It never changes the source Word, Excel, or
text documents and keeps their paragraph/table/sheet boundaries traceable.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from docx import Document
from openpyxl import load_workbook


def read_docx(path: Path) -> list[dict[str, object]]:
    document = Document(path)
    entries: list[dict[str, object]] = []
    for index, paragraph in enumerate(document.paragraphs, start=1):
        text = paragraph.text.strip()
        if text:
            entries.append({"kind": "paragraph", "locator": f"paragraph:{index}", "text": text})
    for table_index, table in enumerate(document.tables, start=1):
        for row_index, row in enumerate(table.rows, start=1):
            values = [cell.text.strip().replace("\n", " / ") for cell in row.cells]
            if any(values):
                entries.append({
                    "kind": "table-row",
                    "locator": f"table:{table_index}/row:{row_index}",
                    "text": " | ".join(values),
                })
    return entries


def read_xlsx(path: Path) -> list[dict[str, object]]:
    workbook = load_workbook(path, read_only=True, data_only=False)
    entries: list[dict[str, object]] = []
    for sheet in workbook.worksheets:
        for row_index, row in enumerate(sheet.iter_rows(values_only=True), start=1):
            values = [str(value).strip() if value is not None else "" for value in row]
            if any(values):
                entries.append({
                    "kind": "sheet-row",
                    "locator": f"sheet:{sheet.title}/row:{row_index}",
                    "text": " | ".join(values),
                })
    workbook.close()
    return entries


def read_text(path: Path) -> list[dict[str, object]]:
    text = path.read_text(encoding="utf-8-sig")
    return [
        {"kind": "line", "locator": f"line:{index}", "text": line.strip()}
        for index, line in enumerate(text.splitlines(), start=1)
        if line.strip()
    ]


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    source_root = project_root.parent
    sources = [
        ("base-rules", source_root / "Fate_Domination 基础规则【墨水修订1版】.docx", read_docx),
        ("fqa", source_root / "Fate_Domination FQA.docx", read_docx),
        ("rule-answers", source_root / "Fate-桌游问题解答和规则说明.xlsx", read_xlsx),
        ("turn-keywords", source_root / "玩家回合流程和关键词.txt", read_text),
        ("three-x", source_root / "3X模式规则.txt", read_text),
    ]
    documents = []
    for source_id, path, reader in sources:
        if not path.is_file():
            raise FileNotFoundError(path)
        entries = reader(path)
        documents.append({
            "id": source_id,
            "file": path.name,
            "entryCount": len(entries),
            "entries": entries,
        })
    output = {
        "schemaVersion": 1,
        "sourcePriority": [source_id for source_id, _, _ in sources],
        "documents": documents,
    }
    output_path = project_root / "docs" / "generated-rule-sources.json"
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {sum(item['entryCount'] for item in documents)} indexed rule entries: {output_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # keep CI output concise and actionable
        print(f"RULE_SOURCE_EXTRACTION_FAILED: {error}", file=sys.stderr)
        raise
