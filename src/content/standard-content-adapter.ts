import { buildStandardContent, type LegacyContentPackage } from "./content-package.ts";
import type { StandardContent } from "../match-engine/standard-match-engine.ts";

/** Raw collections accepted at the content boundary before normalization. */
export interface StandardContentSources {
  masters?: LegacyContentPackage["masters"];
  servants?: LegacyContentPackage["servants"];
  cards?: LegacyContentPackage["cards"];
  situations?: LegacyContentPackage["situations"];
  eventGroups?: LegacyContentPackage["eventGroups"];
}

/**
 * Production-facing adapter: constructs the raw package explicitly and sends
 * that package through the one canonical Content -> StandardContent boundary.
 */
export function buildStandardContentFromSources(sources: StandardContentSources): StandardContent {
  const raw: LegacyContentPackage = {
    masters: sources.masters ?? [],
    servants: sources.servants ?? [],
    cards: sources.cards ?? [],
    situations: sources.situations ?? [],
    eventGroups: sources.eventGroups ?? [],
  };

  return buildStandardContent(raw);
}
