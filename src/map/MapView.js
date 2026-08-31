const locationOrder = ["workshop", "mountain", "city", "scouting"];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderTokens(tokens = []) {
  return tokens
    .map(
      (token) =>
        `<span class="fd-map-token${token.isLocal ? " is-local" : ""}" ` +
        `title="${escapeHtml(token.label)}">${escapeHtml(token.shortLabel)}</span>`,
    )
    .join("");
}

function renderEffects(effects = []) {
  return effects
    .map(
      (effect) =>
        `<span class="fd-map-effect fd-map-effect--${escapeHtml(effect.kind ?? "status")}" ` +
        `title="${escapeHtml(effect.description ?? effect.label)}">${escapeHtml(effect.label)}</span>`,
    )
    .join("");
}

export class MapView {
  constructor(root, { onLocationClick = () => {} } = {}) {
    this.root = root;
    this.onLocationClick = onLocationClick;
    this.root.addEventListener("click", (event) => {
      const location = event.target.closest("[data-location-id]");
      if (location) this.onLocationClick(location.dataset.locationId);
    });
  }

  render(model) {
    const locations = Object.fromEntries(
      locationOrder.map((id) => [id, model.locations?.[id] ?? {}]),
    );

    this.root.innerHTML = `
      <section class="fd-map" aria-label="冬木市地图">
        <div class="fd-map__cell fd-map__situation-deck">
          <span class="fd-map__vertical-label">局势牌</span>
          <strong class="fd-map__deck-count">${model.situationDeckCount ?? 0}</strong>
        </div>
        <button class="fd-map__cell fd-map__workshop" type="button" data-location-id="workshop">
          <div class="fd-map__cards">${model.situationCardHtml ?? ""}</div>
          <div class="fd-map__location-content">
            <strong>魔术工房</strong>
            <div class="fd-map__effects">${renderEffects(locations.workshop.effects)}</div>
            <div class="fd-map__tokens">${renderTokens(locations.workshop.tokens)}</div>
            <span class="fd-map__movement">1 ▽</span>
          </div>
        </button>
        <div class="fd-map__cell fd-map__event-deck">
          <span class="fd-map__vertical-label">事件牌·${escapeHtml(model.eventGroupName ?? "冬木")}</span>
          <strong class="fd-map__deck-count">${model.eventDeckCount ?? 0}</strong>
        </div>
        <button class="fd-map__cell fd-map__mountain" type="button" data-location-id="mountain">
          <div class="fd-map__cards">${locations.mountain.eventCardsHtml ?? ""}</div>
          <div class="fd-map__location-content">
            <strong>深山町 <span class="fd-map__vp">2</span></strong>
            <div class="fd-map__effects">${renderEffects(locations.mountain.effects)}</div>
            <div class="fd-map__tokens">${renderTokens(locations.mountain.tokens)}</div>
            <span class="fd-map__movement">2 ▽</span>
          </div>
        </button>
        <button class="fd-map__cell fd-map__scouting" type="button" data-location-id="scouting">
          <span class="fd-map__vertical-label">侦察</span>
          <span class="fd-map__vp fd-map__vp--scouting">2</span>
          <div class="fd-map__effects">${renderEffects(locations.scouting.effects)}</div>
          <div class="fd-map__tokens fd-map__tokens--scouting">${renderTokens(locations.scouting.tokens)}</div>
        </button>
        <button class="fd-map__cell fd-map__city" type="button" data-location-id="city">
          <div class="fd-map__cards">${locations.city.eventCardsHtml ?? ""}</div>
          <div class="fd-map__location-content">
            <strong>新都 <span class="fd-map__vp">3</span></strong>
            <div class="fd-map__effects">${renderEffects(locations.city.effects)}</div>
            <div class="fd-map__tokens">${renderTokens(locations.city.tokens)}</div>
            <span class="fd-map__movement">2 ◁</span>
          </div>
        </button>
      </section>
    `;
  }
}
