import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const script = readFileSync(new URL("app.js", root), "utf8");
const styles = readFileSync(new URL("styles.css", root), "utf8");

test("provides hover and centered inspection layers", () => {
  assert.match(html, /class="card-hover-preview"/);
  assert.match(html, /id="card-inspection-modal"/);
  assert.match(html, /role="dialog"/);
});

test("exposes all required tabletop card categories", () => {
  for (const cardType of ["situation", "event", "location-effect", "public-skill"]) {
    assert.match(html, new RegExp(`data-card-type="${cardType}"`));
  }
});

test("declares actions only on owned playable examples", () => {
  assert.match(html, /class="[^"]*play-card[^"]*"[^>]*data-actions="[^"]+"/);

  for (const cardType of ["situation", "event", "location-effect", "public-skill"]) {
    const tag = html.match(new RegExp(`<[^>]+data-card-type="${cardType}"[^>]*>`))?.[0];
    assert.ok(tag, `missing ${cardType} example`);
    assert.doesNotMatch(tag, /data-actions=/, `${cardType} must be view-only`);
  }
});

test("implements modal inspection and permission action rendering", () => {
  assert.match(script, /function openCardInspection\(/);
  assert.match(script, /function closeCardInspection\(/);
  assert.match(script, /function renderInspectionActions\(/);
  assert.match(script, /availableActions/);
});

test("keeps the hover preview click-through so nearby cards remain operable", () => {
  assert.doesNotMatch(styles, /\.card-hover-preview\.is-visible\s*\{[^}]*pointer-events:\s*auto/);
});
