(() => {
  "use strict";

  document.documentElement.classList.add("js-ready");

  const consolePanel = document.querySelector(".player-console");
  const consoleToggles = document.querySelectorAll(".console-toggle, .console-identity");
  const playCards = [...document.querySelectorAll(".play-card")];
  const inspectableCards = [...document.querySelectorAll(".inspectable-card")];
  const selectedRegular = new Set(["riding", "mystic-eyes"]);
  const selectedAdditional = new Set(["strength"]);
  const hoverPreview = document.querySelector(".card-hover-preview");
  const cardModal = document.querySelector("#card-inspection-modal");
  const modalActions = document.querySelector("#modal-card-actions");
  let activeCard = null;
  let modalTrigger = null;
  let hoverTimer = null;

  function setConsoleExpanded(expanded) {
    consolePanel.classList.toggle("is-expanded", expanded);
    consolePanel.classList.toggle("is-collapsed", !expanded);
    consoleToggles.forEach((button) => button.setAttribute("aria-expanded", String(expanded)));
    const label = document.querySelector(".console-toggle span");
    if (label) label.textContent = expanded ? "收起玩家操作台" : "展开玩家操作台";
  }

  consoleToggles.forEach((button) => {
    button.addEventListener("click", () => setConsoleExpanded(!consolePanel.classList.contains("is-expanded")));
  });

  function getCardData(card) {
    const image = card.querySelector("img");
    return {
      name: card.dataset.name || "未命名卡牌",
      source: card.dataset.source || "规则区域",
      owner: card.dataset.owner || "公共区域",
      visibility: card.dataset.visibility || "全员公开",
      phase: card.dataset.phase || "依卡牌文本",
      cost: card.dataset.cost ?? "—",
      power: card.dataset.power ?? "—",
      type: card.dataset.cardType || "card",
      description: card.dataset.description || "规则说明待录入，请由房主按正式规则文档裁定。",
      imageUrl: image?.src || "",
      imageAlt: image?.alt || card.dataset.name || "卡牌",
      availableActions: (card.dataset.actions || "").split(",").map((action) => action.trim()).filter(Boolean)
    };
  }

  function formatCardType(type) {
    return ({ situation: "局势牌", event: "事件牌", "location-effect": "地点效果牌", "public-skill": "公开技能牌", "servant-skill": "从者技能牌", "master-skill": "御主技能牌", hand: "手牌", master: "御主卡", servant: "从者卡" })[type] || "卡牌";
  }

  function populateHoverPreview(card) {
    const data = getCardData(card);
    const image = document.querySelector("#hover-card-image");
    image.src = data.imageUrl;
    image.alt = `${data.name}快速预览`;
    document.querySelector("#hover-card-type").textContent = `${formatCardType(data.type)} · ${data.visibility}`;
    document.querySelector("#hover-card-name").textContent = data.name;
    document.querySelector("#hover-card-meta").textContent = `费用 ${data.cost} · 威力 ${data.power} · ${data.phase}`;
    document.querySelector("#hover-card-description").textContent = data.description;
  }

  function positionHoverPreview(card) {
    const rect = card.getBoundingClientRect();
    const previewWidth = hoverPreview.offsetWidth || 390;
    const previewHeight = hoverPreview.offsetHeight || 360;
    const gap = 16;
    const edge = 14;
    const left = rect.left > window.innerWidth / 2 ? rect.left - previewWidth - gap : rect.right + gap;
    const top = rect.top + rect.height / 2 - previewHeight / 2;
    hoverPreview.style.left = `${Math.max(edge, Math.min(left, window.innerWidth - previewWidth - edge))}px`;
    hoverPreview.style.top = `${Math.max(edge, Math.min(top, window.innerHeight - previewHeight - edge))}px`;
  }

  function showHoverPreview(card) {
    window.clearTimeout(hoverTimer);
    if (cardModal.classList.contains("is-open")) return;
    populateHoverPreview(card);
    hoverPreview.classList.add("is-visible");
    hoverPreview.setAttribute("aria-hidden", "false");
    positionHoverPreview(card);
  }

  function hideHoverPreview(immediate = false) {
    window.clearTimeout(hoverTimer);
    const hide = () => {
      hoverPreview.classList.remove("is-visible");
      hoverPreview.setAttribute("aria-hidden", "true");
    };
    if (immediate) hide();
    else hoverTimer = window.setTimeout(hide, 120);
  }

  function populateCardModal(card) {
    const data = getCardData(card);
    const image = document.querySelector("#modal-card-image");
    image.src = data.imageUrl;
    image.alt = `${data.name}完整卡面`;
    document.querySelector("#modal-card-visibility").textContent = data.visibility;
    document.querySelector("#modal-card-type").textContent = formatCardType(data.type);
    document.querySelector("#modal-card-source").textContent = data.source;
    document.querySelector("#modal-card-name").textContent = data.name;
    document.querySelector("#modal-card-owner").textContent = data.owner;
    document.querySelector("#modal-card-phase").textContent = data.phase;
    document.querySelector("#modal-card-cost").textContent = data.cost;
    document.querySelector("#modal-card-power").textContent = data.power;
    document.querySelector("#modal-card-description").textContent = data.description;
  }

  function actionButton(label, action, options = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = options.secondary ? "modal-action is-secondary" : "modal-action";
    button.textContent = label;
    button.disabled = Boolean(options.disabled);
    button.addEventListener("click", action);
    return button;
  }

  function renderInspectionActions(card) {
    const { availableActions } = getCardData(card);
    const buttons = [];
    if (availableActions.includes("toggle-regular")) {
      const selected = selectedRegular.has(card.dataset.cardId);
      const full = selectedRegular.size >= 2 && !selected;
      buttons.push(actionButton(selected ? "移出常规出牌" : full ? "常规牌已选满" : "加入常规出牌", () => {
        if (selected) selectedRegular.delete(card.dataset.cardId);
        else if (!full) selectedRegular.add(card.dataset.cardId);
        renderSelection();
        renderInspectionActions(card);
      }, { disabled: full, secondary: selected }));
    }
    if (availableActions.includes("toggle-additional")) {
      const selected = selectedAdditional.has(card.dataset.cardId);
      const locked = selectedRegular.size < 2 && !selected;
      buttons.push(actionButton(selected ? "移出追加出牌" : locked ? "尚未获得追加权限" : "加入追加出牌", () => {
        if (selected) selectedAdditional.delete(card.dataset.cardId);
        else if (!locked) selectedAdditional.add(card.dataset.cardId);
        renderSelection();
        renderInspectionActions(card);
      }, { disabled: locked, secondary: selected }));
    }
    modalActions.replaceChildren(...buttons);
    modalActions.classList.toggle("is-empty", buttons.length === 0);
    modalActions.setAttribute("aria-label", buttons.length ? "当前可用操作" : "此卡牌仅供检视");
  }

  function openCardInspection(card) {
    activeCard = card;
    modalTrigger = card;
    hideHoverPreview(true);
    populateCardModal(card);
    renderInspectionActions(card);
    cardModal.classList.add("is-open");
    cardModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("has-card-modal");
    document.querySelector(".card-modal__close").focus();
  }

  function closeCardInspection() {
    if (!cardModal.classList.contains("is-open")) return;
    cardModal.classList.remove("is-open");
    cardModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("has-card-modal");
    activeCard = null;
    modalTrigger?.focus();
  }

  function createComposerSlot(card) {
    const slot = document.createElement("span");
    slot.className = "composer-slot";
    slot.title = card.dataset.name;
    const image = card.querySelector("img").cloneNode(true);
    image.alt = "";
    slot.append(image);
    return slot;
  }

  function renderSelection() {
    if (selectedRegular.size < 2) selectedAdditional.clear();
    playCards.forEach((card) => {
      const targetSet = card.dataset.kind === "regular" ? selectedRegular : selectedAdditional;
      const selected = targetSet.has(card.dataset.cardId);
      card.classList.toggle("is-selected", selected);
      card.classList.toggle("is-additional", selected && card.dataset.kind === "additional");
      card.setAttribute("aria-pressed", String(selected));
      let order = card.querySelector(".selection-order");
      if (selected && !order) {
        order = document.createElement("span");
        order.className = "selection-order";
        card.append(order);
      }
      if (order) {
        if (!selected) order.remove();
        else if (card.dataset.kind === "additional") order.textContent = "追加";
        else order.textContent = ["I", "II"][[...selectedRegular].indexOf(card.dataset.cardId)] ?? "";
      }
    });
    const regularCards = playCards.filter((card) => selectedRegular.has(card.dataset.cardId));
    const additionalCards = playCards.filter((card) => selectedAdditional.has(card.dataset.cardId));
    const totalCost = [...regularCards, ...additionalCards].reduce((sum, card) => sum + Number(card.dataset.cost || 0), 0);
    document.querySelector("#regular-slots").replaceChildren(...regularCards.map(createComposerSlot));
    document.querySelector("#additional-slots").replaceChildren(...additionalCards.map(createComposerSlot));
    document.querySelector("#regular-count").textContent = `${regularCards.length} / 2`;
    document.querySelector("#composer-regular-count").textContent = `${regularCards.length} / 2`;
    document.querySelector("#composer-additional-count").textContent = String(additionalCards.length);
    document.querySelector("#selection-progress").style.width = `${regularCards.length * 50}%`;
    document.querySelector("#total-cost").textContent = String(totalCost);
    document.querySelector("#composer-cost").textContent = String(totalCost);
    const complete = regularCards.length === 2;
    document.querySelector("#confirm-play").disabled = !complete;
    document.querySelector("#selection-hint").textContent = complete ? `已满足常规数量；当前选择 ${additionalCards.length} 张追加牌。` : "选择满两张常规牌后，才会开放本次追加权限。";
  }

  inspectableCards.forEach((card) => {
    card.addEventListener("mouseenter", () => showHoverPreview(card));
    card.addEventListener("mouseleave", () => hideHoverPreview());
    card.addEventListener("focus", () => showHoverPreview(card));
    card.addEventListener("blur", () => hideHoverPreview());
    card.addEventListener("click", () => openCardInspection(card));
  });
  hoverPreview.addEventListener("mouseenter", () => window.clearTimeout(hoverTimer));
  hoverPreview.addEventListener("mouseleave", () => hideHoverPreview());
  document.querySelectorAll("[data-close-card-modal]").forEach((element) => element.addEventListener("click", closeCardInspection));

  const confirmButton = document.querySelector("#confirm-play");
  confirmButton.addEventListener("click", () => {
    confirmButton.textContent = "演示批次已锁定";
    confirmButton.disabled = true;
    document.querySelector(".draft-badge").textContent = "已锁定";
  });

  const drawer = document.querySelector(".public-drawer");
  const drawerClose = document.querySelector(".drawer-close");
  let drawerTrigger = null;
  function closeDrawer() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    drawerTrigger?.focus();
  }
  document.querySelectorAll(".seat-card").forEach((seat) => {
    seat.addEventListener("click", () => {
      drawerTrigger = seat;
      const avatar = seat.querySelector("img");
      const stats = [...seat.querySelectorAll(".seat-card__stats b")].map((stat) => stat.textContent.trim());
      document.querySelector("#drawer-avatar").src = avatar.src;
      document.querySelector("#drawer-avatar").alt = seat.dataset.player;
      document.querySelector("#public-drawer-title").textContent = seat.dataset.player;
      document.querySelector("#drawer-location").textContent = seat.querySelector("small").textContent;
      document.querySelector("#drawer-stats").innerHTML = ["战果", "魔力", "令咒"].map((label, index) => `<span><small>${label}</small><strong>${stats[index]}</strong></span>`).join("");
      drawer.classList.add("is-open");
      drawer.setAttribute("aria-hidden", "false");
      drawerClose.focus();
    });
  });
  drawerClose.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (cardModal.classList.contains("is-open")) closeCardInspection();
    else if (drawer.classList.contains("is-open")) closeDrawer();
  });
  window.addEventListener("resize", () => hideHoverPreview(true));
  renderSelection();
})();
