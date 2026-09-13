const HOME_ITEMS = [
  { id: "single", label: "单人模式", eyebrow: "SOLO" },
  { id: "multi", label: "多人模式", eyebrow: "MULTIPLAYER" },
  { id: "codex", label: "图鉴", eyebrow: "ARCHIVE" },
  { id: "tutorial", label: "教程", eyebrow: "GUIDE" },
  { id: "settings", label: "设置", eyebrow: "OPTIONS" },
];

const MODES = [
  {
    id: "free-select",
    title: "自选模式",
    subtitle: "自由选择御主与从者，使用标准流程进行对局。",
    tag: "STANDARD",
  },
  {
    id: "three-x",
    title: "3X模式",
    subtitle: "使用 3X 专属规则与构筑流程开始一局对战。",
    tag: "3X",
  },
];

const SERVANT_CLASSES = ["全部", "Saber", "Archer", "Lancer", "Rider", "Caster", "Assassin", "Berserker", "Extra"];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function modeCard(mode, multiplayer) {
  return `
    <button class="fd-menu-mode-card" type="button" data-mode-id="${escapeHtml(mode.id)}">
      <span class="fd-menu-mode-card__art" aria-hidden="true">
        <span class="fd-menu-mode-card__sigil">${escapeHtml(mode.tag)}</span>
      </span>
      <span class="fd-menu-mode-card__body">
        <span class="fd-menu-mode-card__kicker">${multiplayer ? "创建联机房间" : "开始单人对局"}</span>
        <strong>${escapeHtml(mode.title)}</strong>
        <span>${escapeHtml(mode.subtitle)}</span>
      </span>
      <span class="fd-menu-mode-card__arrow">›</span>
    </button>`;
}

function tutorialCard(id, title, description, index) {
  return `
    <button class="fd-tutorial-card" type="button" data-tutorial-id="${escapeHtml(id)}">
      <span class="fd-tutorial-card__index">0${index}</span>
      <span class="fd-tutorial-card__icon">${index === 1 ? "◇" : "≡"}</span>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(description)}</span>
    </button>`;
}

function codexCard(entry, type) {
  return `
    <button class="fd-codex-card" type="button" data-codex-id="${escapeHtml(entry.id)}">
      <span class="fd-codex-card__portrait">${escapeHtml((entry.name ?? "?").slice(0, 1))}</span>
      <span class="fd-codex-card__name">${escapeHtml(entry.name)}</span>
      <span class="fd-codex-card__meta">${escapeHtml(type === "servant" ? entry.className ?? "Extra" : "御主")}</span>
    </button>`;
}

export class FrontEndShell {
  constructor(root, {
    onSingleMode = () => {},
    onCreateRoom = () => {},
    onTutorial = () => {},
    onCodexOpen = () => {},
    catalog = { masters: [], servants: [] },
  } = {}) {
    if (!root) throw new Error("FRONT_END_ROOT_REQUIRED");
    this.root = root;
    this.onSingleMode = onSingleMode;
    this.onCreateRoom = onCreateRoom;
    this.onTutorial = onTutorial;
    this.onCodexOpen = onCodexOpen;
    this.catalog = catalog;
    this.screen = "splash";
    this.codexTab = "servant";
    this.codexClass = "全部";
    this.entered = false;

    this.onKeyDown = (event) => {
      if (this.screen === "splash" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        this.enterHome();
        return;
      }
      if (event.key === "Escape" && this.screen !== "home" && this.screen !== "splash") this.navigate("home");
    };
    window.addEventListener("keydown", this.onKeyDown);

    this.root.addEventListener("click", (event) => {
      const splash = event.target.closest("[data-enter-game]");
      if (splash) {
        this.enterHome();
        return;
      }

      const homeItem = event.target.closest("[data-home-nav]");
      if (homeItem) {
        this.navigate(homeItem.dataset.homeNav);
        return;
      }

      const back = event.target.closest("[data-menu-back]");
      if (back) {
        this.navigate("home");
        return;
      }

      const mode = event.target.closest("[data-mode-id]");
      if (mode) {
        const modeId = mode.dataset.modeId;
        if (this.screen === "multi") this.onCreateRoom(modeId);
        else this.onSingleMode(modeId);
        return;
      }

      const tutorial = event.target.closest("[data-tutorial-id]");
      if (tutorial) {
        this.onTutorial(tutorial.dataset.tutorialId);
        return;
      }

      const tab = event.target.closest("[data-codex-tab]");
      if (tab) {
        this.codexTab = tab.dataset.codexTab;
        this.codexClass = "全部";
        this.render();
        return;
      }

      const classFilter = event.target.closest("[data-class-filter]");
      if (classFilter) {
        this.codexClass = classFilter.dataset.classFilter;
        this.render();
        return;
      }

      const codex = event.target.closest("[data-codex-id]");
      if (codex) this.onCodexOpen({ id: codex.dataset.codexId, type: this.codexTab });
    });

    this.render();
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
  }

  enterHome() {
    if (this.entered) return;
    this.entered = true;
    this.root.classList.add("is-entering");
    window.setTimeout(() => {
      this.screen = "home";
      this.root.classList.remove("is-entering");
      this.render();
    }, 420);
  }

  navigate(screen) {
    this.screen = screen;
    this.render();
  }

  render() {
    if (this.screen === "splash") this.renderSplash();
    else if (this.screen === "home") this.renderHome();
    else if (this.screen === "single") this.renderModes(false);
    else if (this.screen === "multi") this.renderModes(true);
    else if (this.screen === "codex") this.renderCodex();
    else if (this.screen === "tutorial") this.renderTutorial();
    else if (this.screen === "settings") this.renderSettings();
  }

  backdrop() {
    return `
      <div class="fd-menu-bg" aria-hidden="true">
        <div class="fd-menu-bg__image"></div>
        <div class="fd-menu-bg__veil"></div>
        <div class="fd-menu-bg__grain"></div>
        <div class="fd-menu-bg__flare"></div>
      </div>`;
  }

  logo() {
    return `
      <div class="fd-menu-logo" aria-label="Fate Domination">
        <span class="fd-menu-logo__fate">FATE</span>
        <span class="fd-menu-logo__slash">/</span>
        <span class="fd-menu-logo__domination">DOMINATION</span>
      </div>`;
  }

  renderSplash() {
    this.root.innerHTML = `
      <main class="fd-front fd-front--splash">
        ${this.backdrop()}
        <section class="fd-splash" data-enter-game>
          <div class="fd-splash__composition">
            <span class="fd-splash__eyebrow">FATE / DOMINATION</span>
            ${this.logo()}
            <p class="fd-splash__tagline">争夺圣杯，支配战场。</p>
          </div>
          <button class="fd-press-any" type="button" data-enter-game>
            <span class="fd-press-any__diamond">◇</span>
            <span>按任意键进入</span>
          </button>
          <div class="fd-splash__footer">
            <span>Fate / Domination</span>
            <span>重构版</span>
          </div>
        </section>
      </main>`;
  }

  renderHome() {
    this.root.innerHTML = `
      <main class="fd-front fd-front--home">
        ${this.backdrop()}
        <header class="fd-home-header">
          ${this.logo()}
          <div class="fd-home-profile">
            <span class="fd-home-profile__badge">FD</span>
            <span><small>PLAYER</small><strong>御主</strong></span>
          </div>
        </header>
        <section class="fd-home-menu">
          <div class="fd-home-menu__line"></div>
          ${HOME_ITEMS.map((item, index) => `
            <button class="fd-home-nav" type="button" data-home-nav="${item.id}" style="--menu-index:${index}">
              <span class="fd-home-nav__eyebrow">${item.eyebrow}</span>
              <strong>${item.label}</strong>
              <span class="fd-home-nav__accent"></span>
            </button>`).join("")}
        </section>
        <section class="fd-home-hero-copy">
          <span class="fd-home-hero-copy__number">01</span>
          <span class="fd-home-hero-copy__line"></span>
          <p>Fuyuki Holy Grail War</p>
        </section>
        <footer class="fd-home-footer">
          <span>ENTER 选择</span>
          <span>ESC 返回</span>
        </footer>
      </main>`;
  }

  renderModes(multiplayer) {
    const title = multiplayer ? "多人模式" : "单人模式";
    const kicker = multiplayer ? "MULTIPLAYER" : "SOLO PLAY";
    this.root.innerHTML = `
      <main class="fd-front fd-front--subscreen">
        ${this.backdrop()}
        <header class="fd-sub-header">
          <button class="fd-back" type="button" data-menu-back>‹ 返回</button>
          <div><span>${kicker}</span><h1>${title}</h1></div>
        </header>
        <section class="fd-mode-grid">
          ${MODES.map((mode) => modeCard(mode, multiplayer)).join("")}
        </section>
        <div class="fd-sub-note">${multiplayer ? "选择规则后进入创建房间流程。" : "选择一种模式开始新的单人对局。"}</div>
      </main>`;
  }

  renderCodex() {
    const source = this.codexTab === "master" ? this.catalog.masters : this.catalog.servants;
    const entries = this.codexTab === "servant" && this.codexClass !== "全部"
      ? source.filter((entry) => entry.className === this.codexClass || (this.codexClass === "Extra" && !SERVANT_CLASSES.slice(1, 8).includes(entry.className)))
      : source;
    this.root.innerHTML = `
      <main class="fd-front fd-front--subscreen fd-front--codex">
        ${this.backdrop()}
        <header class="fd-sub-header">
          <button class="fd-back" type="button" data-menu-back>‹ 返回</button>
          <div><span>ARCHIVE</span><h1>图鉴</h1></div>
        </header>
        <section class="fd-codex-toolbar">
          <div class="fd-codex-tabs">
            <button class="${this.codexTab === "master" ? "is-active" : ""}" type="button" data-codex-tab="master">御主</button>
            <button class="${this.codexTab === "servant" ? "is-active" : ""}" type="button" data-codex-tab="servant">从者</button>
          </div>
          ${this.codexTab === "servant" ? `<div class="fd-class-filter">${SERVANT_CLASSES.map((name) => `<button class="${this.codexClass === name ? "is-active" : ""}" type="button" data-class-filter="${name}">${name}</button>`).join("")}</div>` : ""}
        </section>
        <section class="fd-codex-grid">
          ${entries.length ? entries.map((entry) => codexCard(entry, this.codexTab)).join("") : '<div class="fd-codex-empty">图鉴数据接入后将在这里显示全部角色、技能和卡组。</div>'}
        </section>
      </main>`;
  }

  renderTutorial() {
    this.root.innerHTML = `
      <main class="fd-front fd-front--subscreen">
        ${this.backdrop()}
        <header class="fd-sub-header">
          <button class="fd-back" type="button" data-menu-back>‹ 返回</button>
          <div><span>GUIDE</span><h1>教程</h1></div>
        </header>
        <section class="fd-tutorial-grid">
          ${tutorialCard("beginner", "新手教程", "通过引导对局学习移动、出牌、技能、战斗与结算。", 1)}
          ${tutorialCard("manual", "详细教程", "查阅回合流程、地点、关键词、令咒、败北、3X等完整规则。", 2)}
        </section>
      </main>`;
  }

  renderSettings() {
    this.root.innerHTML = `
      <main class="fd-front fd-front--subscreen">
        ${this.backdrop()}
        <header class="fd-sub-header">
          <button class="fd-back" type="button" data-menu-back>‹ 返回</button>
          <div><span>OPTIONS</span><h1>设置</h1></div>
        </header>
        <section class="fd-settings-placeholder">
          <span class="fd-settings-placeholder__icon">⚙</span>
          <h2>设置页面已预留</h2>
          <p>具体项目确定后再接入，不提前放置无效开关。</p>
        </section>
      </main>`;
  }
}
