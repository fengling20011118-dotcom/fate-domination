// resource helper coverage remains focused on rules-core behavior.
import assert from "node:assert/strict";
import test from "node:test";
import { consumeCustomResource, gainCustomResource, getCustomResource, spendCustomResource, transferCustomResource } from "../src/rules-core/resources.ts";

test("custom resource pool supports gain spend and transfer", () => {
  const a: any = { flags: {}, customResources: {} };
  const b: any = { flags: {}, customResources: {} };

  assert.equal(gainCustomResource(a, "beast", 5, 10), 5);
  assert.equal(getCustomResource(a, "beast"), 5);
  assert.equal(spendCustomResource(a, "beast", 2), 2);
  assert.equal(transferCustomResource(a, b, "beast", 1), 1);
  assert.equal(getCustomResource(a, "beast"), 2);
  assert.equal(getCustomResource(b, "beast"), 1);
  assert.equal(consumeCustomResource(b, "beast", 1), true);
  assert.equal(getCustomResource(b, "beast"), 0);
});
test("custom resource gain respects caps and failed consume does not mutate", () => {
  const state: any = { flags: {}, customResources: {} };

  assert.equal(gainCustomResource(state, "beast", 8, 5), 5);
  assert.equal(consumeCustomResource(state, "beast", 6), false);
  assert.equal(getCustomResource(state, "beast"), 5);
});

test("custom resource consume handles zero-cost checks without mutation", () => {
  const state: any = { flags: {}, customResources: { beast: 3 } };

  assert.equal(consumeCustomResource(state, "beast", 0), true);
  assert.equal(getCustomResource(state, "beast"), 3);
});
