# Fate/Domination Universal Card Inspection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a larger, universal two-level card inspection experience for every visible tabletop card while showing action controls only for cards the current player may operate.

**Architecture:** Keep the static prototype dependency-free. Represent each inspectable card with shared `data-*` metadata, drive one hover preview and one centered modal from `app.js`, and render actions from the card's declared demo permissions rather than card type guesses. Existing selection sets remain the source of truth for the play composer.

**Tech Stack:** Semantic HTML, CSS custom properties and responsive layout, vanilla JavaScript, agent-browser CLI.

---

### Task 1: Add universal card metadata and tabletop examples

**Files:**
- Modify: `prototypes/fd-desktop-ui-reference/index.html`

**Steps:**

1. Convert player-owned skill and hand cards to the shared `.inspectable-card` contract.
2. Add inspectable examples for the current situation card, event card, a location effect card, and another player's public used skill.
3. Give every example `data-name`, `data-source`, `data-description`, `data-card-type`, `data-visibility`, optional `data-cost`/`data-power`, and `data-actions`.
4. Add one hover-preview element and one centered modal dialog with an action footer.
5. Confirm hidden/private cards expose only card-back metadata.

### Task 2: Implement inspection state and permission-aware actions

**Files:**
- Modify: `prototypes/fd-desktop-ui-reference/app.js`

**Steps:**

1. Replace the workspace-only inspector listeners with a universal registry of `.inspectable-card` elements.
2. Implement fixed hover-preview positioning with viewport clamping and keyboard-focus support.
3. Implement centered modal open/close behavior for click, backdrop, close button, and `Escape`.
4. Render modal actions only from `data-actions`; public and opponent examples must render no action buttons.
5. Move regular/additional selection mutations behind modal action buttons.
6. Keep selection badges, composer slots, cost totals, and confirm-button state synchronized.

### Task 3: Enlarge cards and style both inspection layers

**Files:**
- Modify: `prototypes/fd-desktop-ui-reference/styles.css`

**Steps:**

1. Increase expanded-console height and regular card size while preserving the right decision panel.
2. Style the hover preview at 360–400px wide with readable 12–14px body copy.
3. Style the centered dialog as a two-column card-and-rules layout with a clear action footer.
4. Add visible ownership, visibility, selected, public-use, and card-type markers.
5. Ensure focus styles, reduced motion, and 1440×900 viewport containment.

### Task 4: Document the interaction contract

**Files:**
- Modify: `prototypes/fd-desktop-ui-reference/README.md`
- Modify: `prototypes/fd-desktop-ui-reference/DESIGN.md`

**Steps:**

1. Document hover preview versus click inspection.
2. Document the current-turn/ownership permission matrix.
3. State that Chinese summaries are static, human-confirmed structured fields rather than runtime LLM output.
4. Document the mobile fallback: tap opens the centered/full-screen inspection layer.

### Task 5: Verify the complete prototype

**Files:**
- Verify: `prototypes/fd-desktop-ui-reference/index.html`
- Verify: `prototypes/fd-desktop-ui-reference/app.js`
- Verify: `prototypes/fd-desktop-ui-reference/styles.css`

**Steps:**

1. Run `node --check prototypes/fd-desktop-ui-reference/app.js`; expect exit code 0.
2. Start a local static server and open the prototype at 1440×900.
3. Verify hover preview for player skill, event, situation, location effect, and public opponent skill.
4. Verify clicking each opens the centered modal.
5. Verify only owned playable cards display action buttons.
6. Verify owned-card action buttons update regular/additional counts and costs.
7. Verify backdrop, close button, and `Escape` close the modal.
8. Verify document dimensions equal viewport dimensions, referenced assets are present, and browser error output is empty.
9. Capture a final screenshot showing the larger console and centered card inspection.

The workspace root is not a Git repository, so commit steps are intentionally omitted; changes must remain isolated to the prototype and documentation paths above.
