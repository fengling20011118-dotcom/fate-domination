import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// Drafts deliberately carry no executable effects or handler binding. A line is
// a candidate fragment, not a claim that it is an independently usable ability.
export function scaffoldSkillCards(content, ids) {
  if (!Array.isArray(ids) || !ids.length) throw new Error("SKILL_IDS_REQUIRED");
  const index = new Map();
  for (const ownerType of ["master", "servant"]) {
    for (const owner of content[`${ownerType}s`] ?? []) {
      for (const skill of owner.skills ?? []) {
        if (index.has(skill.id)) throw new Error(`DUPLICATE_SOURCE_SKILL:${skill.id}`);
        index.set(skill.id, { ownerType, owner, skill });
      }
    }
  }
  return [...new Set(ids)].map((id) => {
    const entry = index.get(id);
    if (!entry) throw new Error(`UNKNOWN_SKILL:${id}`);
    const { ownerType, owner, skill } = entry;
    if (typeof skill.text !== "string" || typeof skill.name !== "string") {
      throw new Error(`SOURCE_TEXT_INVALID:${id}`);
    }
    const authored = skill.rules?.abilities;
    const useAuthored = Array.isArray(authored) && authored.length > 0
      && authored.every((ability) => typeof ability.printedClause === "string"
        && ability.printedClause.length > 0 && skill.text.includes(ability.printedClause));
    const fragments = useAuthored
      ? authored.map((ability) => ({ id: ability.id, text: ability.printedClause, kind: ability.kind }))
      : skill.text.split(/\r\n|\n|\r/).filter((text) => text.trim()).map((text, i) => ({ id: `fragment-${i + 1}`, text }));
    if (!fragments.length) throw new Error(`SOURCE_TEXT_EMPTY:${id}`);
    const cardFace = {};
    for (const key of ["typeLabel", "cost", "basePower", "attributes"]) {
      if (skill[key] != null) cardFace[key] = skill[key];
    }
    if (Number.isFinite(skill.requirement)) {
      cardFace.requirement = skill.requirement === 0
        ? { type: "none" } : { type: "min_mana", value: skill.requirement };
    }
    const knownKinds = new Set(["passive", "play_trigger", "phase_action", "response", "residual"]);
    return {
      id,
      ownerType,
      ownerId: owner.id,
      name: skill.name,
      printedText: skill.text,
      cardFace,
      abilities: fragments.map((fragment, i) => ({
        id: fragment.id || `fragment-${i + 1}`,
        printedClause: fragment.text,
        kind: knownKinds.has(fragment.kind) ? fragment.kind : "passive",
        conditions: [],
        targets: [],
        effects: [],
        execution: { mode: "unsupported", reason: "Draft scaffold: confirm ability boundaries, activation, costs, targets, effects and lifecycle before enabling." },
        ambiguities: knownKinds.has(fragment.kind) ? [] : ["kind is a schema placeholder; confirm from source text/card image."],
        unmodeledClauses: [fragment.text],
      })),
      evidence: skill.sourceRefs ?? [],
      verification: {
        status: "scaffold-unverified",
        fragmentSource: useAuthored ? "existing-authoring" : "source-lines",
        sourceActivation: skill.activation ?? null,
        sourceImage: skill.image ?? null,
      },
      ambiguities: ["Verify complete clause coverage and small-ability boundaries; source line breaks alone do not establish separate abilities."],
      unmodeledClauses: [skill.text],
    };
  });
}

export function runScaffold(args) {
  let input = path.join(root, "src/content/generated/legacy-content.json");
  let output;
  const ids = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!["--input", "--out", "--id"].includes(arg)) throw new Error(`UNKNOWN_ARG:${arg}`);
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`ARG_VALUE_REQUIRED:${arg}`);
    if (arg === "--input") input = path.resolve(root, value);
    else if (arg === "--out") output = path.resolve(root, value);
    else ids.push(...value.split(",").map((id) => id.trim()).filter(Boolean));
  }
  if (!output) throw new Error("OUTPUT_REQUIRED: --out <new-file.json>");
  const skillCards = scaffoldSkillCards(JSON.parse(fs.readFileSync(input, "utf8")), ids);
  const document = { schemaVersion: "fd-card-authoring-v1", source: path.relative(root, input), skillCards };
  // Exclusive creation rejects existing files and symlinks, including input.
  fs.writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return document;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runScaffold(process.argv.slice(2));
    console.log(`Created ${result.skillCards.length} unverified authoring scaffold(s); all clauses remain unsupported.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
