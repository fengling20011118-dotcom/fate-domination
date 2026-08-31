import { ModeRegistry } from "./modes.ts";
import { createStandardModeDefinition, type StandardModeOptions } from "./standard-mode.ts";
import { createThreeXModeDefinition, type ThreeXModeOptions } from "./three-x-mode.ts";

export interface DefaultModeRegistryOptions {
  standard?: StandardModeOptions;
  threeX?: ThreeXModeOptions;
}

/** Creates the complete built-in mode set used by new matches. */
export function createDefaultModeRegistry(options: DefaultModeRegistryOptions = {}): ModeRegistry {
  const registry = new ModeRegistry();
  registry.register(createStandardModeDefinition(options.standard));
  registry.register(createThreeXModeDefinition(options.threeX));
  return registry;
}
