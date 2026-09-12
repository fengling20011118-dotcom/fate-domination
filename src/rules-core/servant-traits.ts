/**
 * Fixed servant-trait metadata used by rules text that explicitly checks a
 * servant's identity/class/appearance. This is content metadata, never inferred
 * from display names or card art at runtime.
 */

/** Fate/Domination English Wiki MHX ruling/hint: all 39 blond Servants. */
export const BLOND_SERVANT_IDS = new Set<string>([
  "servant.jeanne",
  "servant.astraea",
  "servant.voyager",
  "servant.abigail",
  "servant.kintoki",
  "servant.jekyll",
  "servant.avicebron",
  "servant.spartacus",
  "servant.mozart",
  "servant.kinggil",
  "servant.quetzalcoatl",
  "servant.gil",
  "servant.atalanta",
  "servant.billy",
  "servant.ereshkigal",
  "servant.vlad",
  "servant.valkyrie",
  "servant.bradamante",
  "servant.lionking",
  "servant.artoria-alt",
  "servant.deon",
  "servant.arthur",
  "servant.okita",
  "servant.bedivere",
  "servant.jason",
  "servant.saber",
  "servant.nero",
  "servant.gawain",
  "servant.mordred",
  "servant.dioscuri",
  "servant.barghest",
  "servant.gareth",
  "servant.artoriac",
  "servant.ibaraki",
  "servant.nemo",
  "servant.mhx",
  "servant.tezcat",
  "servant.arcueid",
  // English source lists MHXX as the 39th entry. Keep the stable id reserved
  // even though this content build does not currently contain that servant.
  "servant.mhxx",
]);

/**
 * Servants that count as Saber for MHX's anti-Saber check. The Fate/Domination
 * Wiki lists these in the Saber pool; Muramasa and Okita Alter are explicitly
 * ruled as Alter Ego and therefore excluded even though they appear in that pool.
 */
export const SABER_SERVANT_IDS = new Set<string>([
  "servant.saber",
  "servant.nero",
  "servant.mordred",
  "servant.altera",
  "servant.gawain",
  "servant.bedivere",
  "servant.okita",
  "servant.sigurd",
  "servant.siegfried",
  "servant.deon",
  "servant.musashi",
  "servant.artoria-alt",
  "servant.charlemagne",
  "servant.molay",
  "servant.arthur",
  "servant.jason",
  "servant.barghest",
  "servant.saitou",
  "servant.dioscuri",
  "servant.lakshmibai",
  "servant.suzuka",
]);

export function isBlondServant(servantId: string | null | undefined): boolean {
  return typeof servantId === "string" && BLOND_SERVANT_IDS.has(servantId);
}

export function isSaberServant(servantId: string | null | undefined): boolean {
  return typeof servantId === "string" && SABER_SERVANT_IDS.has(servantId);
}

export function getPlayerServantIdentityIds(player: { servantId: string | null; servantIdentityAliases?: string[] }): string[] {
  return [...new Set([player.servantId, ...(player.servantIdentityAliases ?? [])].filter((id): id is string => typeof id === "string" && id.length > 0))];
}

export function playerHasServantIdentity(player: { servantId: string | null; servantIdentityAliases?: string[] }, servantId: string): boolean {
  return getPlayerServantIdentityIds(player).includes(servantId);
}

export function playerHasBlondServantIdentity(player: { servantId: string | null; servantIdentityAliases?: string[] }): boolean {
  return getPlayerServantIdentityIds(player).some(isBlondServant);
}

export function playerHasSaberServantIdentity(player: { servantId: string | null; servantIdentityAliases?: string[] }): boolean {
  return getPlayerServantIdentityIds(player).some(isSaberServant);
}
