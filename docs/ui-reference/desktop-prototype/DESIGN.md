# Fate/Domination Desktop Reference Design

## Mode

Operate. Players must scan state, choose an action, and confirm it with confidence.

## Visual World

A digital ritual table: cinematic near-black surfaces and precise modern hierarchy carry the task, while restrained Art Deco framing, cut corners, metallic gold, and a central luminous battlefield carry the Fate identity. The interface should feel crafted and ceremonial without becoming a gold-glow spectacle.

## Flow

Orbital. The battlefield anchors the center; seven seats, public rule sources, and the decision console relate back to it. The eye enters through the phase rail, lands on the highlighted battlefield, moves to the current decision, and ends at the local player's card composer.

## Color Strategy

Restrained full palette:

- Obsidian canvas for the room.
- Charcoal and blue-black surfaces for information layers.
- Champagne text for primary reading.
- Antique gold for current focus and executable actions.
- Arcane blue-violet for mana and system explanation.
- Blood red for battle, defeat, danger, and destructive confirmation.
- Per-player hues for token ownership only.

## Typography

- Display: local serif stack with Roman proportions for phase and location names.
- Interface: local system sans stack for dense Chinese labels and controls.
- Numeric data uses tabular figures.
- No external font requests; portability and first render stability take priority in the reference prototype.

## Geometry and Depth

- Major panels use shallow cut corners rather than rounded cards.
- Fine gold or cool-gray borders define structure; elevation uses dark offset shadows, not border-plus-halo everywhere.
- Art Deco brackets and measured double lines appear only at primary anchors.
- Player seats and cards are not a uniform dashboard grid; size and density follow task importance.

## Motion

- One expo-out family: `cubic-bezier(0.16, 1, 0.3, 1)`.
- 160–260ms for control feedback; 420ms for console and state transitions.
- The authored moment is the decision-path transition: battlefield emphasis, decision panel content, and card composer update as one coordinated change.
- No perpetual particles, bobbing cards, or decorative parallax.

## Interaction Signatures

- Cards seat into visible source rails and lift into a separate play composer when selected.
- Every visible card uses two inspection levels: hover or keyboard focus for a fixed quick preview, then click for a centered full inspection dialog.
- Hover previews never contain actions. Full inspection renders controls only from the server-provided `availableActions` list.
- Public situation, event, location-effect, and already-used opponent cards reuse the same inspection component as owned cards.
- Chinese summaries are human-confirmed structured card fields, never runtime LLM paraphrases.
- Regular and additional cards use position and labels, never color alone.
- A player seat opens a public-information drawer without revealing hidden cards.
- The bottom console collapses outside the local decision and expands when action is required.

## Responsive Contract

Desktop owns the full orbital composition. Narrow widths receive a safe informational fallback in this prototype. The production mobile surface will reuse semantic components but recompose them into map/cards/action/player views with a persistent current-decision drawer.
