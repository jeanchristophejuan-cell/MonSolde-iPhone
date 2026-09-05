(() => {
  const KEY = "mon-solde-v1";
  const $ = (id) => document.getElementById(id);
  const state = loadState();

  const onboarding = $("onboarding");
  const dashboard = $("dashboard");
  const availableEl = $("available-balance");
  const pendingEl = $("pending-total");
  const debitedEl = $("debited-total");
  const countEl = $("operation-count");
  const listEl = $("operations-list");
  const toastEl = $("toast");
  const purchaseDialog = $("purchase-dialog");
  const moneyDialog = $("money-dialog");
  const settingsDialog = $("settings-dialog");
  const confirmDialog = $("confirm-dialog");

  function freshState() {
    return { initialized: false, baseBalance: 0, operations: [] };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return freshState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return freshState();
      return {
        initialized: Boolean(parsed.initialized),
        baseBalance: Number(parsed.baseBalance) || 0,
        operations: Array.isArray(parsed.operations) ? parsed.operations : []
      };
    } catch {
      return freshState();
    }
  }

  function saveState() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function parseMoney(value, allowZero = false) {
    const cleaned = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) return null;
    return Math.round(n * 100) / 100;
  }

  function formatMoney(n) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
  }

  function formatDate(iso) {
    if (!iso) return "";
    const parts = iso.split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function totals() {
    let expenses = 0, pending = 0, debited = 0, credits = 0;
    for (const op of state.operations) {
      const amount = Number(op.amount) || 0;
      if (op.type === "credit") credits += amount;
      else {
        expenses += amount;
        if (op.status === "debited") debited += amount;
        else pending += amount;
      }
    }
    return { expenses, pending, debited, credits, available: state.baseBalance + credits - expenses };
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  function makeId() {
    return (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  }

  function render() {
    onboarding.classList.toggle("hidden", state.initialized);
    dashboard.classList.toggle("hidden", !state.initialized);
    if (!state.initialized) return;

    const t = totals();
    availableEl.textContent = formatMoney(t.available);
    pendingEl.textContent = formatMoney(t.pending);
    debitedEl.textContent = formatMoney(t.debited);
    countEl.textContent = String(state.operations.length);
    listEl.innerHTML = "";

    if (state.operations.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML = "<strong>Aucune opération</strong><br>Ajoute ton premier achat pour commencer.";
      listEl.appendChild(empty);
      return;
    }

    const sorted = [...state.operations].sort((a, b) => {
      if (a.date === b.date) return (b.createdAt || 0) - (a.createdAt || 0);
      return a.date < b.date ? 1 : -1;
    });

    for (const op of sorted) {
      const card = document.createElement("article");
      card.className = "operation" + (op.type === "credit" ? " credit" : "");

      const main = document.createElement("div");
      main.className = "op-main";
      const left = document.createElement("div");
      const label = document.createElement("p");
      label.className = "op-label";
      label.textContent = op.label || (op.type === "credit" ? "Argent reçu" : "Achat");
      const meta = document.createElement("div");
      meta.className = "op-meta";
      meta.textContent = formatDate(op.date);
      left.append(label, meta);
      const amount = document.createElement("div");
      amount.className = "op-amount";
      amount.textContent = (op.type === "credit" ? "+ " : "− ") + formatMoney(op.amount);
      main.append(left, amount);
      card.appendChild(main);

      const badge = document.createElement("div");
      if (op.type === "credit") {
        badge.className = "badge credit";
        badge.textContent = "Argent ajouté";
      } else if (op.status === "debited") {
        badge.className = "badge debited";
        badge.textContent = "Débité";
      } else {
        badge.className = "badge pending";
        badge.textContent = "En attente";
      }
      card.appendChild(badge);

      const actions = document.createElement("div");
      actions.className = "op-actions";
      if (op.type !== "credit" && op.status !== "debited") {
        const debitBtn = document.createElement("button");
        debitBtn.type = "button";
        debitBtn.className = "small-btn debit";
        debitBtn.textContent = "✓ Passer en débité";
        debitBtn.addEventListener("click", () => {
          op.status = "debited";
          saveState();
          render();
          showToast("Passé en débité — la date ne change pas.");
        });
        actions.appendChild(debitBtn);
      }

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "small-btn delete";
      deleteBtn.textContent = "Supprimer";
      deleteBtn.addEventListener("click", () => {
        confirmAction("Supprimer cette opération ?", `${op.label} — ${formatMoney(op.amount)}`, () => {
          state.operations = state.operations.filter((x) => x.id !== op.id);
          saveState();
          render();
          showToast("Opération supprimée.");
        });
      });
      actions.appendChild(deleteBtn);
      card.appendChild(actions);
      listEl.appendChild(card);
    }
  }

  function confirmAction(title, text, onConfirm) {
    $("confirm-title").textContent = title;
    $("confirm-text").textContent = text;
    confirmDialog.showModal();

    const oldOk = $("confirm-ok");
    const oldCancel = $("confirm-cancel");
    const ok = oldOk.cloneNode(true);
    const cancel = oldCancel.cloneNode(true);
    oldOk.replaceWith(ok);
    oldCancel.replaceWith(cancel);

    ok.addEventListener("click", () => {
      onConfirm();
      confirmDialog.close();
    });
    cancel.addEventListener("click", () => confirmDialog.close());
  }

  $("onboarding-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseMoney($("start-balance").value, true);
    if (amount === null) return showToast("Entre un solde valide.");
    state.baseBalance = amount;
    state.initialized = true;
    saveState();
    render();
  });

  $("add-purchase-btn").addEventListener("click", () => {
    $("purchase-date").value = todayISO();
    $("purchase-label").value = "";
    $("purchase-amount").value = "";
    purchaseDialog.showModal();
    setTimeout(() => $("purchase-label").focus(), 60);
  });

  $("purchase-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const label = $("purchase-label").value.trim();
    const amount = parseMoney($("purchase-amount").value);
    const date = $("purchase-date").value || todayISO();
    if (!label || amount === null) return showToast("Complète le libellé et le montant.");

    state.operations.push({ id: makeId(), type: "expense", label, amount, date, status: "pending", createdAt: Date.now() });
    saveState();
    purchaseDialog.close();
    render();
    showToast("Achat ajouté en attente.");
  });

  $("add-money-btn").addEventListener("click", () => {
    $("money-label").value = "Argent reçu";
    $("money-amount").value = "";
    moneyDialog.showModal();
    setTimeout(() => $("money-amount").focus(), 60);
  });

  $("money-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const label = $("money-label").value.trim() || "Argent reçu";
    const amount = parseMoney($("money-amount").value);
    if (amount === null) return showToast("Entre un montant valide.");

    state.operations.push({ id: makeId(), type: "credit", label, amount, date: todayISO(), createdAt: Date.now() });
    saveState();
    moneyDialog.close();
    render();
    showToast("Argent ajouté au solde.");
  });

  $("settings-btn").addEventListener("click", () => {
    $("adjust-balance").value = totals().available.toFixed(2).replace(".", ",");
    settingsDialog.showModal();
  });

  $("settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const desired = parseMoney($("adjust-balance").value, true);
    if (desired === null) return showToast("Entre un solde valide.");
    const current = totals().available;
    state.baseBalance += desired - current;
    saveState();
    settingsDialog.close();
    render();
    showToast("Solde ajusté.");
  });

  $("reset-btn").addEventListener("click", () => {
    settingsDialog.close();
    confirmAction("Tout effacer ?", "Le solde et toutes les opérations seront supprimés de cet iPhone.", () => {
      const next = freshState();
      state.initialized = next.initialized;
      state.baseBalance = next.baseBalance;
      state.operations = next.operations;
      saveState();
      render();
      showToast("Toutes les données ont été effacées.");
    });
  });

  document.querySelectorAll(".close-dialog").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dialog = btn.closest("dialog");
      if (dialog) dialog.close();
    });
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
  }

  render();
})();
