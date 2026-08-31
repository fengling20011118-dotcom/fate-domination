export const PHASES = Object.freeze([
  "preparation",
  "outpost",
  "action",
  "combat",
]);

export const LOCATIONS = Object.freeze([
  "workshop",
  "mountain",
  "city",
  "scouting",
]);

export const GAME_STATUS = Object.freeze({
  LOBBY: "lobby",
  SETUP: "setup",
  PLAYING: "playing",
  FINISHED: "finished",
});

export const COMMANDS = Object.freeze({
  START_GAME: "game.start",
  ADVANCE_PHASE_PLAYER: "phase.player.complete",
  MAKE_CHOICE: "choice.resolve",
  CANCEL_CHOICE: "choice.cancel",
});
