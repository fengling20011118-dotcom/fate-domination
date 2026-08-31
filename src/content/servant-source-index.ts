import { createRequire } from "node:module";

export interface EnglishServantSource {
  kind: "chm";
  document: string;
  category: "servant/english";
  page: string;
  className: string;
}

interface SourceIndexEntry {
  className: string;
  sourcePage: string;
  servantId: string | null;
  matchStatus: string;
}

interface SourceIndex {
  entries?: SourceIndexEntry[];
}

const require = createRequire(import.meta.url);
const sourceIndex = require("./generated/english-servant-sources.json") as SourceIndex;
const exactByServantId = new Map(
  (sourceIndex.entries ?? [])
    .filter((entry) => entry.matchStatus === "exact" && typeof entry.servantId === "string")
    .map((entry) => [entry.servantId as string, entry]),
);

/** Returns the CHM page only for entries proven to be in the English servant branch. */
export function getEnglishServantSource(servantId: string): EnglishServantSource | undefined {
  const entry = exactByServantId.get(servantId);
  if (!entry) return undefined;
  return {
    kind: "chm",
    document: "FD全卡图鉴V2.0.chm",
    category: "servant/english",
    page: entry.sourcePage,
    className: entry.className,
  };
}

export function hasEnglishServantSource(servantId: string): boolean {
  return exactByServantId.has(servantId);
}
