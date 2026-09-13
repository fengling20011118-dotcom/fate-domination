import { MapView } from "../map/MapView.js";

const PHASE_LABELS = {
  preparation: "准备",
  outpost: "前哨",
  action: "行动",
  combat: "战斗",
};

const LOCATION_LABELS = {
  workshop: "魔术工房",
  mountain: "深山町",
  city: "新都",
  scouting: "侦察",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function phaseLabel(phase) {
  return PHASE_LABELS[phase] ?? String(phase ?? "-");
}

function resolveIdentityName(id, identityLabels = {}) {
  if (!id) return "？？？";
  return identityLabels[id] ?? id;
}

function shortPlayerName(player) {
  const name = String(player?.name ?? player?.id ?? "?");
  return name.length > 4 ? name.slice(0, 4) : name;
}

function visibleInstances(view, predicate) {
  return Object.values(view?.cards ?? {}).filter(predicate);
}

function cardDefinition(definitions, instance) {
  return instance?.definitionId ? definitions?.[instance.definitionId] ?? null : null;
}

function cardTitle(definitions, instance) {
  if (!instance) return "未知卡牌";
  const definition = cardDefinition(definitions, instance);
  if (definition) return definition.name;
  return instance.face === "down" ? "暗置卡牌" : "未知卡牌";
}

function cardAttributes(definition) {
  if (!definition) return "";
  if (Array.isArray(definition.attributes) && definition.attributes.length) return definition.attributes.join(" / ");
  return definition.typeLabel ?? "";
}

function renderCard(instance, definitions, { compact = false, selected = false } = {}) {
  const definition = cardDefinition(definitions, instance);
  const hidden = !definition;
  const title = cardTitle(definitions, instance);
  const cost = definition?.cost ?? "?";
  const power = definition?.basePower ?? "?";
  const attributes = cardAttributes(definition);
  const classes = ["fd-ui-card", compact ? "is-compact" : "", hidden ? "is-hidden" : "", selected ? "is-selected" : ""]
    .filter(Boolean)
    .join(" ");

  return `
    <button class="${classes}" type="button" data-card-instance-id="${escapeHtml(instance.instanceId)}" title="${escapeHtml(title)}">
      <span class="fd-ui-card__shine"></span>
      <span class="fd-ui-card__cost">${escapeHtml(cost)}</span>
      <span class="fd-ui-card__power">${escapeHtml(power)}</span>
      <span class="fd-ui-card__name">${escapeHtml(title)}</span>
      <span class="fd-ui-card__attrs">${escapeHtml(attributes)}</span>
    </button>`;
}

function renderOpponent(player, view, identityLabels, isActive) {
  const location = LOCATION_LABELS[player.locationId] ?? "未部署";
  const master = resolveIdentityName(player.masterId, identityLabels);
  const servant = resolveIdentityName(player.servantId, identityLabels);
  const classes = ["fd-opponent", isActive ? "is-active" : "", player.defeated ? "is-defeated" : "", player.eliminated ? "is-eliminated" : ""]
    .filter(Boolean)
    .join(" ");
  return `
    <article class="${classes}" data-player-id="${escapeHtml(player.id)}">
      <div class="fd-opponent__portrait fd-opponent__portrait--master"><span>御</span></div>
      <div class="fd-opponent__portrait fd-opponent__portrait--servant"><span>从</span></div>
      <div class="fd-opponent__body">
        <div class="fd-opponent__name">${escapeHtml(player.name)}</div>
        <div class="fd-opponent__identity">${escapeHtml(master)} · ${escapeHtml(servant)}</div>
        <div class="fd-opponent__meta">
          <span>魔力 <b>${escapeHtml(player.mana)}</b></span>
          <span>战果 <b>${escapeHtml(player.victoryPoints)}</b></span>
          <span>令咒 <b>${escapeHtml(player.commandSeals)}</b></span>
          <span>${escapeHtml(location)}</span>
        </div>
      </div>
    </article>`;
}

function renderAction(action) {
  const className = action.commandType === "decision.resolve" ? "fd-action is-primary" : "fd-action";
  return `<button class="${className}" type="button" data-action-id="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`;
}

function renderEventCard(eventId) {
  const hidden = eventId === "event:hidden";
  return `<span class="fd-map-mini-card${hidden ? " is-hidden" : ""}" title="${escapeHtml(hidden ? "暗置事件" : eventId)}">${hidden ? "?" : "事"}</span>`;
}

function mapModelFromView(view, viewerId) {
  const locations = Object.fromEntries(Object.keys(LOCATION_LABELS).map((locationId) => {
    const players = Object.values(view.players ?? {}).filter((player) => player.locationId === locationId && !player.eliminated);
    return [locationId, {
      tokens: players.map((player) => ({
        label: player.name,
        shortLabel: shortPlayerName(player).slice(0, 1),
        isLocal: player.id === viewerId,
      })),
      effects: [],
      eventCardsHtml: (view.board?.currentEvents?.[locationId] ?? []).map(renderEventCard).join(""),
    }];
  }));

  return {
    situationDeckCount: view.board?.situationDeck?.length ?? 0,
    eventDeckCount: view.board?.eventDeck?.length ?? 0,
    eventGroupName: "冬木",
    situationCardHtml: (view.board?.activeSituations ?? []).map(() => '<span class="fd-map-mini-card is-situation">局</span>').join(""),
    locations,
  };
}

/**
 * Pure presentation shell for MatchView + AvailableAction.
 * It never mutates match state or derives rule legality.
 */
export class GameShell {
  constructor(root, {
    viewerId,
    onAction = () => {},
    onLocationClick = () => {},
    onCardClick = () => {},
  } = {}) {
    if (!root) throw new Error("GAME_SHELL_ROOT_REQUIRED");
    this.root = root;
    this.viewerId = viewerId;
    this.onAction = onAction;
    this.onLocationClick = onLocationClick;
    this.onCardClick = onCardClick;
    this.mapView = null;
    this.lastRender = null;

    this.root.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-action-id]");
      if (actionButton && this.lastRender) {
        const action = this.lastRender.actions.find((candidate) => candidate.id === actionButton.dataset.actionId);
        if (action) this.onAction(action);
        return;
      }
      const cardButton = event.target.closest("[data-card-instance-id]");
      if (cardButton && this.lastRender) {
        const instance = this.lastRender.view.cards?.[cardButton.dataset.cardInstanceId];
        if (instance) this.onCardClick(instance);
      }
    });
  }

  render({ view, actions = [], cardDefinitions = {}, identityLabels = {} }) {
    if (!view) throw new Error("GAME_SHELL_VIEW_REQUIRED");
    const viewerId = this.viewerId ?? view.activePlayerId ?? Object.keys(view.players ?? {})[0];
    const me = view.players?.[viewerId];
    if (!me) throw new Error(`GAME_SHELL_VIEWER_NOT_FOUND:${viewerId}`);

    this.lastRender = { view, actions, cardDefinitions, identityLabels };
    const opponents = Object.values(view.players ?? {})
      .filter((player) => player.id !== viewerId)
      .sort((a, b) => a.seat - b.seat);
    const hand = visibleInstances(view, (card) => card.ownerPlayerId === viewerId && card.zone === "hand");
    const attacks = visibleInstances(view, (card) => card.controllerPlayerId === viewerId && card.zone === "attack");
    const skillCards = visibleInstances(view, (card) => card.ownerPlayerId === viewerId && (card.zone === "master-skills" || card.zone === "servant-skills"));

    this.root.innerHTML = `
      <main class="fd-game-shell" data-phase="${escapeHtml(view.phase)}">
        <div class="fd-game-shell__aurora"></div>
        <header class="fd-topbar">
          <div class="fd-brand">
            <span class="fd-brand__mark">F/D</span>
            <span class="fd-brand__title">Fate / Domination</span>
          </div>
          <div class="fd-phase-track" aria-label="回合阶段">
            ${Object.entries(PHASE_LABELS).map(([id, label]) => `<span class="fd-phase${view.phase === id ? " is-active" : ""}">${label}</span>`).join("")}
          </div>
          <div class="fd-round-info">
            <span>第 <b>${escapeHtml(view.round)}</b> 回合</span>
            <span>当前：<b>${escapeHtml(view.players?.[view.activePlayerId]?.name ?? "-")}</b></span>
          </div>
        </header>

        <section class="fd-opponents-strip" aria-label="其他玩家">
          ${opponents.map((player) => renderOpponent(player, view, identityLabels, player.id === view.activePlayerId)).join("") || '<div class="fd-opponents-strip__empty">暂无其他玩家</div>'}
        </section>

        <section class="fd-battlefield-layout">
          <aside class="fd-side-panel fd-side-panel--left">
            <div class="fd-panel-title">己方技能</div>
            <div class="fd-skill-list">
              ${skillCards.map((card) => renderCard(card, cardDefinitions, { compact: true })).join("") || '<div class="fd-empty">暂无可见技能牌</div>'}
            </div>
          </aside>

          <section class="fd-map-stage">
            <div class="fd-map-stage__frame">
              <div class="fd-map-stage__inner" data-ui-map-root></div>
            </div>
          </section>

          <aside class="fd-side-panel fd-side-panel--right">
            <div class="fd-panel-title">当前攻击</div>
            <div class="fd-attack-list">
              ${attacks.map((card) => renderCard(card, cardDefinitions, { compact: true })).join("") || '<div class="fd-empty">尚未打出攻击</div>'}
            </div>
          </aside>
        </section>

        <section class="fd-action-ribbon">
          <div class="fd-action-ribbon__status">
            <span class="fd-status-pip"></span>
            <strong>${escapeHtml(phaseLabel(view.phase))}阶段</strong>
            <span>${escapeHtml(me.defeated ? "败北状态" : me.eliminated ? "已淘汰" : "等待操作")}</span>
          </div>
          <div class="fd-action-ribbon__buttons">
            ${actions.map(renderAction).join("") || '<span class="fd-action-ribbon__idle">当前没有可执行操作</span>'}
          </div>
        </section>

        <footer class="fd-command-deck">
          <section class="fd-identity-panel fd-identity-panel--master">
            <div class="fd-identity-panel__portrait">M</div>
            <div class="fd-identity-panel__body">
              <span class="fd-identity-panel__role">御主</span>
              <strong>${escapeHtml(resolveIdentityName(me.masterId, identityLabels))}</strong>
              <span class="fd-identity-panel__player">${escapeHtml(me.name)}</span>
              <div class="fd-resource-row">
                <span>魔力 <b>${escapeHtml(me.mana)}</b></span>
                <span>战果 <b>${escapeHtml(me.victoryPoints)}</b></span>
                <span>令咒 <b>${escapeHtml(me.commandSeals)}</b></span>
              </div>
            </div>
          </section>

          <section class="fd-hand-zone">
            <div class="fd-hand-zone__meta">
              <span>牌库 <b>${escapeHtml(me.deckCount)}</b></span>
              <span>弃牌 <b>${escapeHtml(me.discardCount)}</b></span>
              <span>手牌 <b>${escapeHtml(me.handCount)}</b></span>
            </div>
            <div class="fd-hand-zone__cards">
              ${hand.map((card) => renderCard(card, cardDefinitions)).join("") || '<div class="fd-empty fd-empty--hand">手牌为空</div>'}
            </div>
          </section>

          <section class="fd-identity-panel fd-identity-panel--servant">
            <div class="fd-identity-panel__body">
              <span class="fd-identity-panel__role">从者</span>
              <strong>${escapeHtml(resolveIdentityName(me.servantId, identityLabels))}</strong>
              <span class="fd-identity-panel__player">${escapeHtml(me.trueNameRevealed ? "真名已解放" : "真名隐藏")}</span>
              <div class="fd-resource-row"><span>${escapeHtml(LOCATION_LABELS[me.locationId] ?? "未部署")}</span></div>
            </div>
            <div class="fd-identity-panel__portrait">S</div>
          </section>
        </footer>
      </main>`;

    const mapRoot = this.root.querySelector("[data-ui-map-root]");
    this.mapView = new MapView(mapRoot, { onLocationClick: this.onLocationClick });
    this.mapView.render(mapModelFromView(view, viewerId));
  }
}
