# Servant Recognition Workflow

This workflow treats each servant HTM page as the unit of work.

## Approved rules

1. Create `staging/<htm-name>/` before any servant-named folder exists.
2. Confirm exactly one unique servant main card before creating approved servant output.
3. If a unique main card cannot be confirmed, route the entire page into `review-pending/<htm-name>/`.
4. Only after the main card is confirmed may the workflow create a servant folder derived from the confirmed `character_name`.
5. Every PNG extracted from the page must produce a same-stem JSON draft artifact.
6. A PNG filename may use a visible `A/B` pair only when the card face visibly displays both cost `A` and power `B`. In Windows-safe persisted filenames, this pair is stored as `卡名(A／B).png`.
7. If cost/power or card identity cannot be recognized stably, mark the result for human review instead of forcing an automatic decision.

## Verification checklist

- `npm test -- packages/pipeline/tests/servant-page-orchestrator.test.ts`
- `npm test -- packages/pipeline/tests/servant-main-card-selection.test.ts`
- `npm test -- packages/pipeline/tests/card-rename-policy.test.ts`
- `npm test -- packages/pipeline/tests/run-servant-page.test.ts`
- `npm test -- packages/content/tests/review-draft-schema.test.ts`
- `npm test`
- `npx tsc -p "D:/fd/packages/pipeline/tsconfig.json" --noEmit`
- `npx tsc -p "D:/fd/packages/content/tsconfig.json" --noEmit`

## Output separation

- Approved servant content is materialized under `data/staged/servants/<character_name>/` only after a unique main card is confirmed.
- Ambiguous pages are routed to `data/staged/review-pending/<htm-name>/page-manifest.json`.
- Non-main-card extraction outputs remain draft artifacts and are persisted separately from the approved content library schema.
