/* Campaign chat, trusted rolls, personal macros and combat UI. Model rendering is independent. */
(() => {
  "use strict";
  const Core = window.ForgeVTTPlayCore,
    Dice = window.ForgeVTTDice,
    esc = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      ),
    api = () => window.ForgeTabletop,
    q = () => api()?.state(),
    cloud = () => window.ForgeVTTCloud,
    uid = () => window.ForgeCloud?.partyConnection()?.user?.id || "local";
  const labels = {
    chat: "Chat & dice",
    combat: "Combat",
    send: "Send",
    placeholder: 'Message, /r 1d20+5, /w "Name" message…',
    unavailable: "Play connection unavailable. Your draft is preserved.",
    local: "Local rolls · unverified",
    verified: "Server roll",
    macros: "Macros",
  };
  let sessionUser = null,
    turnNoticeText = "",
    turnNoticeUntil = 0;
  let campaign = null,
    epoch = 0,
    data = null,
    root = null,
    open = false,
    pane = "chat",
    draft = "",
    speaker = "",
    advantage = "",
    filter = "all",
    search = "",
    busy = false,
    live = null,
    lastTurn = "",
    lastSeen = 0,
    dragging = false,
    unread = 0,
    lastStats = new Map(),
    prefs = { animation: true, sound: false };
  let viewScroll = 0,
    follow = true,
    timer,
    flashTimer,
    historyLoading = false;
  const empty = () => ({
    messages: [],
    macros: [],
    combat: {
      entries: [],
      round: 1,
      activeTokenId: null,
      timerSeconds: 0,
      revision: 0,
    },
  });
  const game = () => q()?.game,
    local = () => !game()?._cloud,
    tokens = () => game()?.scenes?.flatMap((s) => s.tokens) || [],
    owned = (t) => q().dm || t.ownerIds?.includes(uid()) || t._canEdit;
  const speakers = () =>
    tokens().filter((t) => owned(t) && (!t.hidden || q().dm));
  const settingsKey = () => "forge.vtt.play.preferences:" + uid();
  function savePrefs() {
    try {
      localStorage.setItem(settingsKey(), JSON.stringify(prefs));
    } catch {}
  }
  function turnNotice(text) {
    turnNoticeText = text;
    turnNoticeUntil = Date.now() + 6500;
    showTurnNotice();
  }
  function showTurnNotice() {
    const center = root?.querySelector(".vtt-center");
    if (!center) return;
    center.querySelector(".vtt-turn-notice")?.remove();
    if (Date.now() >= turnNoticeUntil) return;
    const el = document.createElement("div");
    el.className = "vtt-turn-notice";
    el.setAttribute("role", "alert");
    el.textContent = turnNoticeText;
    center.append(el);
    setTimeout(() => el.remove(), Math.max(0, turnNoticeUntil - Date.now()));
  }
  function notice(error) {
    api().notify(error?.message || String(error));
  }
  async function rpc(action, p = {}) {
    const context = { epoch, user: uid(), campaign: game().id };
    const { data: result, error } = await cloud()
      .client()
      .rpc("forge_vtt_play", {
        p_action: action,
        p_payload: { campaignId: game().id, ...p },
      });
    if (error) throw error;
    return { ...result, _clientContext: context };
  }
  function persist() {
    if (local()) {
      game().play = data;
      api().saveVisionMemory?.();
    }
  }
  async function accept(next, older = false) {
    const tag = next?._clientContext;
    if (
      tag &&
      (tag.epoch !== epoch || tag.user !== uid() || tag.campaign !== game()?.id)
    )
      return;
    const previous = data,
      seen = new Set((previous?.messages || []).map((m) => m.id));
    if (older) {
      const merged = new Map(
        [...(next.messages || []), ...(previous.messages || [])].map((m) => [
          m.id,
          m,
        ]),
      );
      next.messages = [...merged.values()].sort(
        (a, b) => Number(a.id) - Number(b.id),
      );
    }
    data = next;
    data.macros = (data.macros || []).map((m) => ({
      ...m,
      tokenId: m.token_id || m.tokenId || null,
    }));
    const fresh = (next.messages || []).filter((m) => !seen.has(m.id));
    if (previous && fresh.length) {
      if (!open) unread += fresh.length;
      if (prefs.animation && fresh.some((m) => m.kind === "roll")) animate();
      if (prefs.sound) beep();
    }
    lastSeen = Math.max(lastSeen, ...(next.messages || []).map((m) => +m.id));
    const turn = next.combat?.activeTokenId + ":" + next.combat?.startedAt;
    if (
      lastTurn &&
      turn !== lastTurn &&
      next.combat?.entries.some(
        (e) => e.tokenId === next.combat.activeTokenId && e.owned,
      )
    )
      turnNotice(
        "Your turn · " +
          next.combat.entries.find(
            (e) => e.tokenId === next.combat.activeTokenId,
          ).name,
      );
    lastTurn = turn;
    render();
    window.ForgeVTTStage?.invalidate();
  }
  async function load(before) {
    if (!game()?._cloud) return;
    const gen = epoch,
      id = game().id;
    try {
      const next = await rpc("get", before ? { before } : {});
      if (gen !== epoch || game()?.id !== id) return;
      await accept(next, !!before);
    } catch (e) {
      if (gen === epoch) {
        if (e.code === "42501") {
          data = empty();
          render();
        } else notice(e);
      }
    }
  }
  async function send(p) {
    const context = { epoch, user: uid(), campaign: game()?.id },
      current = () =>
        context.epoch === epoch &&
        context.user === uid() &&
        context.campaign === game()?.id;
    if (busy) return;
    if (p.kind === "image" && !safeURL(p.body)) {
      notice("Use an HTTPS image URL.");
      return;
    }
    busy = true;
    render();
    const request = {
      requestId: crypto.randomUUID(),
      avatar:
        window.ForgeCloud?.partyConnection()?.user?.user_metadata?.avatar_url ||
        null,
      ...p,
    };
    try {
      let next;
      if (local()) {
        const message = {
          ...request,
          id: Date.now() + Math.random(),
          actor_id: uid(),
          speaker:
            speakers().find((t) => t.id === p.tokenId)?.name ||
            "Dungeon Master",
          token_id: p.tokenId || null,
          created_at: new Date().toISOString(),
          color: "#b4a7ff",
          scope: p.scope || "public",
          payload: p.card || {},
          verified: false,
        };
        if (p.kind === "roll") {
          const t = tokens().find((t) => t.id === p.tokenId),
            refs = references(t);
          message.payload = {
            rolls: Dice.bundle(p.formula, { refs, advantage: p.advantage }),
          };
          message.body = Dice.formatTemplate(
            message.body,
            message.payload.rolls,
          );
        }
        next = { ...data, messages: [...(data.messages || []), message] };
        await accept(next);
        persist();
      } else if (p.kind === "roll") {
        await cloud().flush();
        if (!current()) return;
        if (cloud().record(game().id)?.dirty)
          throw Error("Wait for token edits to save before rolling.");
        const result = await cloud()
          .client()
          .functions.invoke("vtt-roll", {
            body: { campaignId: game().id, ...request },
          });
        if (result.error || result.data?.error)
          throw Error(
            result.data?.error ||
              "Roll service unavailable. Retry with the same formula.",
          );
        next = result.data;
        if (!current()) return;
        await accept(next);
      } else await accept(await rpc("send", request));
      if (!current()) return;
      draft = "";
      follow = true;
      unread = 0;
    } catch (e) {
      notice(e);
    } finally {
      busy = false;
      render();
    }
  }
  function references(t) {
    const v = {
      STR: 0,
      DEX: 0,
      CON: 0,
      INT: 0,
      WIS: 0,
      CHA: 0,
      PROF: 0,
      ...Object.fromEntries(
        Object.entries(t?.details?.stats || {})
          .filter(([, v]) => Number.isFinite(v))
          .map(([k, v]) => [k.toUpperCase(), v]),
      ),
    };
    return {
      ...v,
      "@TOKEN.HP": t?.hp || 0,
      "@TOKEN.MAXHP": t?.maxHp || 0,
      "@TOKEN.AC": t?.details?.ac || 0,
      "@TOKEN.SPEED": t?.details?.speed || 0,
    };
  }
  function inputCommand() {
    if (game()?._cloud?.role === "spectator")
      return notice("Spectator access is read-only.");
    try {
      const p = Core.command(draft, {
        members: (game().members || []).map((m) => ({
          ...m,
          name: m.name || "Adventurer",
        })),
        tokens: speakers(),
        speaker,
      });
      if (p.kind === "roll" && !p.advantage) p.advantage = advantage;
      send(p);
    } catch (e) {
      notice(e);
    }
  }
  function links(body) {
    return String(body)
      .split(/(https?:\/\/[^\s<>"']+)/g)
      .map((part) =>
        /^https?:\/\//.test(part)
          ? '<a href="' +
            esc(part) +
            '" target="_blank" rel="noopener noreferrer">' +
            esc(part) +
            "</a>"
          : esc(part),
      )
      .join("");
  }
  function rollCard(roll) {
    return `<div class="vtt-roll-card ${roll.natural20 ? "natural-20" : roll.natural1 ? "natural-1" : ""}"><div><span>${esc(roll.label || "Roll")}</span><b>${esc(roll.total)}</b></div><code>${esc(roll.formula)}</code><p>${(roll.groups || []).map((g) => `${g.count}d${g.sides}${esc(g.modifier || "")}: ${(g.dice || []).map((d) => `<span class="${d.dropped ? "dropped" : ""}" title="${esc(d.rerolled?.length ? "Rerolled: " + d.rerolled.join(", ") : "")}">${esc(d.faces?.join("+") || d.value)}</span>`).join(", ")}`).join(" · ")}</p>${roll.natural20 ? "<small>Natural 20</small>" : roll.natural1 ? "<small>Natural 1</small>" : ""}</div>`;
  }
  function safeURL(value) {
    return typeof value === "string" && /^https:\/\//i.test(value) ? value : "";
  }
  function chatAvatar(m) {
    const image=Core.portraitSource(m,tokens());
    if(image)return `<img src="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
    const initials=(m.token_id||m.tokenId)?String(m.speaker||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase():'';
    return `<i aria-hidden="true" style="background:${esc(m.color||'#b4a7ff')}">${esc(initials)}</i>`;
  }
  function messageCard(m) {
    return `<article class="vtt-chat-message ${m.kind === "emote" ? "emote" : ""}" data-message="${esc(m.id)}"><header>${chatAvatar(m)}<strong style="color:${esc(m.color || "#b4a7ff")}">${esc(m.speaker)}</strong><time datetime="${esc(m.created_at)}">${new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>${m.scope !== "public" ? "<small>" + esc(m.scope === "gm" ? "DM only" : m.scope === "controllers" ? "Controllers & DM" : "Whisper") + "</small>" : ""}</header>${m.kind === "image" ? `<a href="${esc(safeURL(m.body))}" target="_blank" rel="noopener noreferrer"><img class="vtt-chat-image" src="${esc(safeURL(m.body))}" alt="Shared image" loading="lazy" referrerpolicy="no-referrer"></a>` : m.kind === "card" ? `<div class="vtt-shared-card"><small>${esc(m.payload.type || "note")}</small><h4>${esc(m.payload.title)}</h4><p>${links(m.payload.text || "")}</p>${m.payload.url ? '<a href="' + esc(safeURL(m.payload.url)) + '" target="_blank" rel="noopener noreferrer">Open source ↗</a>' : ""}</div>` : `<p>${links(m.body || "")}</p>`}${m.kind === "roll" ? `<small class="vtt-roll-proof">${m.verified ? labels.verified : labels.local}</small>${(m.payload.rolls || []).map(rollCard).join("")}` : ""}${m.payload?.concentrationDC ? `<div class="vtt-concentration-prompt">Concentration save · DC ${m.payload.concentrationDC}<button class="btn ghost" data-con-save="${esc(m.token_id)}">Roll CON save</button></div>` : ""}</article>`;
  }
  function chatBody() {
    const messages = (data?.messages || [])
      .filter((m) =>
        filter === "roll"
          ? m.kind === "roll"
          : filter === "private"
            ? m.scope !== "public"
            : filter === "combat"
              ? m.kind === "combat"
              : true,
      )
      .filter(
        (m) =>
          !search ||
          JSON.stringify(m).toLowerCase().includes(search.toLowerCase()),
      );
    return `<div class="vtt-chat-filters"><select aria-label="Message filter" data-chat-filter><option value="all">All messages</option><option value="roll">Roll log</option><option value="private">Private</option><option value="combat">Combat log</option></select><input aria-label="Search messages" data-chat-search placeholder="Search" maxlength="100" value="${esc(search)}"><button class="btn ghost" data-log-export>Export loaded</button></div><div class="vtt-chat-history" role="log" aria-label="Campaign messages"><button class="btn ghost vtt-history-older" data-history-older ${historyLoading ? "disabled" : ""}>Load older messages</button>${messages.map(messageCard).join("") || '<p class="vtt-play-empty">Your campaign conversation starts here.</p>'}</div><div class="vtt-dice-quick">${[4, 6, 8, 10, 12, 20, 100].map((n) => `<button data-quick-die="${n}">d${n}</button>`).join("")}</div><div class="vtt-chat-speaker"><select data-chat-speaker aria-label="Speak as"><option value="">Myself</option>${speakers()
      .map((t) => `<option value="${t.id}">${esc(t.name)}</option>`)
      .join(
        "",
      )}</select><select data-advantage aria-label="Roll mode"><option value="">Normal</option><option value="adv">Advantage</option><option value="dis">Disadvantage</option></select><button class="btn ghost" data-macros>${labels.macros}</button><button class="btn ghost" data-share-card>Card</button></div><form class="vtt-chat-compose"><textarea aria-label="Chat message" data-chat-draft maxlength="2000" placeholder="${esc(labels.placeholder)}">${esc(draft)}</textarea><button class="btn primary" ${busy ? "disabled" : ""}>${busy ? "Sending…" : labels.send}</button></form><details class="vtt-play-options"><summary>Commands & effects</summary><p>/r · /roll · /gmroll · /adv · /dis · /w "Name" · /me · /as "Token" · /image URL. Inline: [[1d20+5]]. Multiple formulas: Hit:1d20+5;Damage:1d8+3. Stat references use the selected token’s numeric custom stats, e.g. [STR], [PROF], [@token.hp].</p><label><input type="checkbox" data-dice-animation ${prefs.animation ? "checked" : ""}> Dice animation</label><label><input type="checkbox" data-dice-sound ${prefs.sound ? "checked" : ""}> Dice sound</label></details>`;
  }
  function combatBody() {
    const a = q(),
      c = data?.combat || empty().combat,
      entries = c.entries || [],
      active = entries.find((e) => e.tokenId === c.activeTokenId);
    return `<div class="vtt-combat-heading"><div><small>INITIATIVE</small><h3>Round ${c.round || 1}</h3><p>${active ? esc(active.name) + "’s turn" : c.activeTokenId ? "Hidden combatant" : "Combat not started"}</p></div><strong data-turn-timer aria-label="Turn timer"></strong></div>${
      a.dm
        ? `<div class="vtt-combat-navigation"><button class="btn ghost" data-combat-action="previous">Previous</button><button class="btn primary" data-combat-action="${c.activeTokenId ? "next" : "start"}">${c.activeTokenId ? "Next turn" : "Start combat"}</button><button class="btn ghost" data-combat-action="end">End</button></div><div class="vtt-combat-add"><select data-single-combat aria-label="Add combatant">${q()
            .scene.tokens.map(
              (t) => `<option value="${t.id}">${esc(t.name)}</option>`,
            )
            .join(
              "",
            )}</select><input type="number" data-manual-initiative aria-label="Manual initiative" min="-1000" max="1000" value="10"><button class="btn ghost" data-add-single>Add</button><button class="btn ghost" data-add-selected>Roll selected</button><button class="btn ghost" data-add-all>Roll all</button><label><input type="checkbox" data-init-adv> Advantage</label><label><input type="checkbox" data-init-alert> Alert +5</label></div>`
        : ""
    }<ol class="vtt-combat-entries">${entries.map((e) => `<li ${a.dm ? 'draggable="true"' : ""} data-combat-token="${e.tokenId}" class="${e.tokenId === c.activeTokenId ? "active" : ""}"><b>${e.initiative}</b><div><strong>${esc(e.name)}</strong><small>${e.hp !== undefined ? e.hp + " / " + e.maxHp + " HP" : esc(e.health || "HP hidden")}${e.ac !== undefined && e.ac !== null ? " · AC " + e.ac : ""}${e.ready ? " · Ready" : ""}${e.delayed ? " · Delayed" : ""}</small>${e.hp !== undefined ? `<meter min="0" max="${e.maxHp || 1}" value="${e.hp}" aria-label="${esc(e.name)} hit points"></meter>` : ""}<div class="vtt-combat-conditions">${(e.conditions || []).map((name) => "<span>" + esc(name) + "</span>").join("")}${(e.durations || []).map((d) => "<span>" + esc(d.name) + " · " + d.remaining + " rounds</span>").join("")}</div></div><div>${a.dm ? `<button data-combat-edit="${e.tokenId}" aria-label="Edit ${esc(e.name)}">⚙</button><button data-combat-remove="${e.tokenId}" aria-label="Remove ${esc(e.name)}">×</button>` : ""}${a.dm || e.owned ? `<button data-combat-hp="${e.tokenId}" aria-label="Damage or heal ${esc(e.name)}">± HP</button>` : ""}</div></li>`).join("") || '<li class="vtt-play-empty">Add tokens to begin tracking initiative.</li>'}</ol>${active && (a.dm || active.owned) ? `<div class="vtt-play-row"><button class="btn ghost" data-ready="${active.tokenId}">Ready action</button><button class="btn ghost" data-delay="${active.tokenId}">Delay turn</button></div>` : ""}${a.dm ? `<details class="vtt-combat-settings"><summary>Combat options</summary><label>Turn timer (seconds, 0 = off)<input data-timer-seconds type="number" min="0" max="3600" value="${c.timerSeconds || 0}"></label><button class="btn ghost" data-save-timer>Save timer</button><button class="btn ghost" data-sort-combat>Sort initiative / Dexterity</button><p>Drag rows to break ties or set a manual turn order.</p></details>` : ""}`;
  }
  function render() {
    if (
      root
        ?.querySelector(".vtt-play-drawer")
        ?.contains(document.activeElement) &&
      document.activeElement.matches("input,select") &&
      document.activeElement.tagName !== "SELECT"
    ) {
      document.activeElement.addEventListener(
        "blur",
        () => setTimeout(render, 0),
        { once: true },
      );
      return;
    }
    if (!root?.isConnected || !data) return;
    const toggle = root.querySelector("[data-play-open]");
    if (toggle)
      toggle.textContent = "Chat & combat" + (unread ? " · " + unread : "");
    const drawer = root.querySelector(".vtt-play-drawer");
    if (!drawer) return;
    drawer.hidden = !open;
    if (!open) return;
    const history = drawer.querySelector(".vtt-chat-history");
    if (history) {
      viewScroll = history.scrollTop;
      follow =
        history.scrollHeight - history.clientHeight - history.scrollTop < 40;
    }
    const focus =
        drawer.querySelector("[data-chat-draft]") === document.activeElement,
      selection = focus ? document.activeElement.selectionStart : null;
    if (dragging) return;
    const oldScroll = drawer.querySelector(".vtt-play-content")?.scrollTop || 0,
      folds = [...drawer.querySelectorAll("details")].map((d) => ({
        name: d.className,
        open: d.open,
      }));
    drawer.innerHTML = `<header class="vtt-play-header"><div role="tablist" aria-label="Campaign play"><button role="tab" aria-selected="${pane === "chat"}" data-play-tab="chat">${labels.chat}</button><button role="tab" aria-selected="${pane === "combat"}" data-play-tab="combat">Combat</button></div><button aria-label="Close chat and combat" data-play-close>×</button></header><div class="vtt-play-content ${pane === "chat" ? "chat" : "combat"}">${pane === "chat" ? chatBody() : combatBody()}</div>`;
    drawer.querySelector("[data-play-close]").onclick = () => {
      open = false;
      render();
    };
    drawer.querySelectorAll("[data-play-tab]").forEach(
      (b) =>
        (b.onclick = () => {
          pane = b.dataset.playTab;
          unread = 0;
          render();
        }),
    );
    if (pane === "chat") bindChat(drawer);
    else bindCombat(drawer);
    if (pane === "chat") {
      const list = drawer.querySelector(".vtt-chat-history");
      list.scrollTop = follow ? list.scrollHeight : viewScroll;
      list.onscroll = () => {
        viewScroll = list.scrollTop;
        follow = list.scrollHeight - list.clientHeight - list.scrollTop < 40;
      };
      if (focus) {
        const input = drawer.querySelector("[data-chat-draft]");
        input.focus({ preventScroll: true });
        if (selection !== null) input.setSelectionRange(selection, selection);
      }
    }
    for (const f of folds) {
      const d = [...drawer.querySelectorAll("details")].find(
        (d) => d.className === f.name,
      );
      if (d) d.open = f.open;
    }
    if (pane === "combat")
      drawer.querySelector(".vtt-play-content").scrollTop = oldScroll;
    updateTimer();
    hotbar();
  }
  function bindChat(el) {
    const draftInput = el.querySelector("[data-chat-draft]");
    draftInput.oninput = () => (draft = draftInput.value);
    draftInput.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        inputCommand();
      }
    };
    el.querySelector(".vtt-chat-compose").onsubmit = (e) => {
      e.preventDefault();
      inputCommand();
    };
    const s = el.querySelector("[data-chat-speaker]");
    s.value = speaker;
    s.onchange = () => (speaker = s.value);
    const adv = el.querySelector("[data-advantage]");
    adv.value = advantage;
    adv.onchange = () => (advantage = adv.value);
    const f = el.querySelector("[data-chat-filter]");
    f.value = filter;
    f.onchange = () => {
      filter = f.value;
      render();
    };
    el.querySelector("[data-chat-search]").onchange = (e) => {
      search = e.target.value;
      render();
    };
    el.querySelectorAll("[data-quick-die]").forEach(
      (b) =>
        (b.onclick = () =>
          send({
            kind: "roll",
            scope: "public",
            body: "Quick roll",
            formula: "1d" + b.dataset.quickDie,
            tokenId: speaker || null,
            advantage,
          })),
    );
    el.querySelector("[data-macros]").onclick = macroDialog;
    el.querySelector("[data-share-card]").onclick = shareCard;
    el.querySelector("[data-dice-animation]").onchange = (e) => {
      prefs.animation = e.target.checked;
      savePrefs();
    };
    el.querySelector("[data-dice-sound]").onchange = (e) => {
      prefs.sound = e.target.checked;
      savePrefs();
      if (prefs.sound) beep();
    };
    el.querySelector("[data-history-older]").onclick = async () => {
      if (local()) return notice("All local history is already loaded.");
      historyLoading = true;
      try {
        await load(Math.min(...data.messages.map((m) => +m.id)));
      } finally {
        historyLoading = false;
        render();
      }
    };
    el.querySelector("[data-log-export]").onclick = () =>
      download(
        "tabletop-" + (filter === "roll" ? "roll-log" : "chat") + ".json",
        data.messages.filter((m) => filter !== "roll" || m.kind === "roll"),
      );
    el.querySelectorAll("[data-con-save]").forEach(
      (b) =>
        (b.onclick = () =>
          send({
            kind: "roll",
            scope: "public",
            tokenId: b.dataset.conSave,
            body: "Concentration save",
            formula: "1d20+[CON]",
          })),
    );
  }
  function download(name, value) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function dialog(title, body) {
    const d = document.createElement("dialog");
    d.className = "vtt-play-dialog";
    d.innerHTML = `<header><h3>${esc(title)}</h3><button type="button" data-close>×</button></header><div>${body}</div>`;
    document.body.append(d);
    d.querySelector("[data-close]").onclick = () => d.close();
    d.onclose = () => d.remove();
    d.showModal();
    return d;
  }
  async function saveMacro(m) {
    if (local()) {
      data.macros = data.macros.filter((x) => x.id !== m.id).concat(m);
      persist();
      render();
    } else await accept(await rpc("macro_save", m));
    hotbar();
  }
  function macroDialog() {
    const d = dialog(
      "Macros",
      `<p>Separate labeled rolls with semicolons. Templates can include {{total}} or {{Hit}} / {{Damage}} labels. Assign a token to show an action when it is selected.</p><form data-macro-form><input type="hidden" name="id" value="${crypto.randomUUID()}"><label>Name<input name="name" maxlength="80" required></label><label>Formula<input name="formula" maxlength="2000" placeholder="Hit:1d20+[STR]+[PROF];Damage:1d8+[STR]" required></label><label>Chat template<textarea name="template" maxlength="2000"></textarea></label><label>Token action<select name="tokenId"><option value="">General macro</option>${speakers()
        .map((t) => `<option value="${t.id}">${esc(t.name)}</option>`)
        .join(
          "",
        )}</select></label><label>Hotbar slot<select name="slot"><option value="">None</option>${Array.from({ length: 9 }, (_, i) => `<option>${i + 1}</option>`).join("")}</select></label><button class="btn primary">Save macro</button></form><div class="vtt-macro-list">${data.macros.map((m) => `<div draggable="true" data-macro-drag="${m.id}"><strong>${esc(m.name)}</strong><code>${esc(m.formula)}</code><button data-macro-edit="${m.id}">Edit</button><button data-macro-delete="${m.id}">Delete</button></div>`).join("")}</div>`,
    );
    d.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target.elements;
      try {
        await saveMacro({
          id: f.id.value,
          name: f.name.value,
          formula: f.formula.value,
          template: f.template.value,
          tokenId: f.tokenId.value || null,
          slot: f.slot.value ? +f.slot.value : null,
        });
        d.close();
      } catch (e) {
        notice(e);
      }
    };
    d.querySelectorAll("[data-macro-edit]").forEach(
      (b) =>
        (b.onclick = () => {
          const m = data.macros.find((x) => x.id === b.dataset.macroEdit),
            f = d.querySelector("form").elements;
          for (const k of [
            "id",
            "name",
            "formula",
            "template",
            "tokenId",
            "slot",
          ])
            f[k].value = m[k] ?? "";
        }),
    );
    d.querySelectorAll("[data-macro-delete]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (local()) {
            data.macros = data.macros.filter(
              (x) => x.id !== b.dataset.macroDelete,
            );
            persist();
            render();
          } else
            await accept(
              await rpc("macro_delete", { id: b.dataset.macroDelete }),
            );
          d.close();
          hotbar();
        }),
    );
    d.querySelectorAll("[data-macro-drag]").forEach(
      (n) =>
        (n.ondragstart = (e) => {
          e.dataTransfer.setData(
            "application/x-forge-macro",
            n.dataset.macroDrag,
          );
          setTimeout(() => d.close(), 0);
        }),
    );
  }
  async function runMacro(m) {
    const text = m.template || m.name;
    await send({
      kind: "roll",
      scope: "public",
      formula: m.formula,
      body: text,
      tokenId: m.tokenId || speaker || null,
      advantage,
    });
  }
  function hotbar() {
    if (!root?.isConnected || !data) return;
    root.querySelector(".vtt-macro-hotbar")?.remove();
    root.querySelector(".vtt-token-macros")?.remove();
    if (!data.macros.length) return;
    const bar = document.createElement("div");
    bar.className = "vtt-macro-hotbar";
    bar.innerHTML = Array.from({ length: 9 }, (_, i) => {
      const m = data.macros.find((m) => m.slot === i + 1);
      return `<button data-hotbar-slot="${i + 1}" ${m ? 'draggable="true"' : ""} title="${esc(m?.name || "Drop a macro here")}"><small>${i + 1}</small>${esc(m?.name || "—")}</button>`;
    }).join("");
    for (const b of bar.querySelectorAll("button")) {
      const m = data.macros.find((m) => m.slot === +b.dataset.hotbarSlot);
      b.onclick = () => m && runMacro(m);
      b.ondragstart = (e) => {
        if (m) e.dataTransfer.setData("application/x-forge-macro", m.id);
      };
      b.ondragover = (e) => e.preventDefault();
      b.ondrop = async (e) => {
        e.preventDefault();
        const wanted = data.macros.find(
          (m) => m.id === e.dataTransfer.getData("application/x-forge-macro"),
        );
        if (!wanted) return;
        try {
          for (const other of data.macros.filter(
            (x) => x.slot === +b.dataset.hotbarSlot && x.id !== wanted.id,
          ))
            await saveMacro({
              ...other,
              tokenId: other.token_id || other.tokenId || null,
              slot: null,
            });
          await saveMacro({
            ...wanted,
            tokenId: wanted.token_id || wanted.tokenId || null,
            slot: +b.dataset.hotbarSlot,
          });
        } catch (e) {
          notice(e);
        }
      };
    }
    root.querySelector(".vtt-center").append(bar);
    const actions = data.macros.filter((m) =>
      q().selection.has(m.token_id || m.tokenId),
    );
    if (actions.length) {
      const el = document.createElement("div");
      el.className = "vtt-token-macros";
      for (const m of actions) {
        const b = document.createElement("button");
        b.textContent = m.name;
        b.onclick = () => runMacro({ ...m, tokenId: m.token_id || m.tokenId });
        el.append(b);
      }
      root.querySelector(".vtt-center").append(el);
    }
  }
  function shareCard() {
    const d = dialog(
      "Share a card or image",
      '<form><label>Type<select name="type"><option>spell</option><option>item</option><option>note</option><option>image</option></select></label><label>Title<input name="title" maxlength="120" required></label><label>Description<textarea name="text" maxlength="8000"></textarea></label><label>HTTPS source / image URL<input name="url" type="url"></label><button class="btn primary">Share</button></form>',
    );
    d.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target.elements;
      if (f.url.value && !f.url.value.startsWith("https://"))
        return notice("Use an HTTPS URL.");
      send(
        f.type.value === "image"
          ? { kind: "image", scope: "public", body: f.url.value }
          : {
              kind: "card",
              scope: "public",
              body: f.title.value,
              card: {
                type: f.type.value,
                title: f.title.value,
                text: f.text.value,
                ...(f.url.value ? { url: f.url.value } : {}),
              },
            },
      );
      d.close();
    };
  }
  async function combat(action, p = {}) {
    if (busy) return;
    try {
      busy = true;
      if (local()) {
        const previousTurn = data.combat.activeTokenId;
        localCombat(action, p);
        if (
          previousTurn !== data.combat.activeTokenId &&
          data.combat.activeTokenId
        ) {
          const active = tokens().find(
            (t) => t.id === data.combat.activeTokenId,
          );
          notice(active.name + "’s turn");
          data.messages.push({
            id: Date.now() + Math.random(),
            created_at: new Date().toISOString(),
            speaker: "Combat",
            scope: "public",
            kind: "combat",
            body:
              "Round " + data.combat.round + " · " + active.name + "’s turn",
            payload: {},
          });
        }
        persist();
        render();
        window.ForgeVTTStage?.invalidate();
      } else {
        await accept(
          await rpc("combat", {
            action,
            requestId: crypto.randomUUID(),
            expected: data.combat.revision,
            ...p,
          }),
        );
        await cloud().pull(game().id);
      }
    } catch (e) {
      notice(e);
      if (!local()) await load();
    } finally {
      busy = false;
    }
  }
  function localCombat(action, p) {
    let c = data.combat;
    if (action === "add") {
      for (const item of p.entries) {
        const t = tokens().find((t) => t.id === item.tokenId);
        c.entries = c.entries.filter((e) => e.tokenId !== item.tokenId);
        c.entries.push({
          tokenId: t.id,
          initiative: item.initiative || 0,
          dex: t.details?.stats?.DEX || 0,
          name: t.name,
          hp: t.hp,
          maxHp: t.maxHp,
          ac: t.details?.ac,
          conditions: t.meta?.conditions || [],
          durations: [],
          owned: true,
          hpDisplay: "status",
        });
      }
      c.entries.sort((a, b) => b.initiative - a.initiative || b.dex - a.dex);
    } else if (action === "remove")
      c.entries = c.entries.filter((e) => e.tokenId !== p.tokenId);
    else if (action === "settings") c.timerSeconds = p.timerSeconds;
    else if (action === "entry")
      Object.assign(
        c.entries.find((e) => e.tokenId === p.tokenId),
        p,
      );
    else if (action === "order")
      c.entries = p.ids.map((id) => c.entries.find((e) => e.tokenId === id));
    else if (action === "duration") {
      const e = c.entries.find((e) => e.tokenId === p.tokenId);
      e.durations = (e.durations || [])
        .filter((d) => d.name !== p.name)
        .concat({ name: p.name, remaining: p.rounds });
      const t = tokens().find((t) => t.id === p.tokenId);
      t.meta = {
        ...t.meta,
        conditions: [...new Set([...(t.meta?.conditions || []), p.name])],
      };
    } else if (action === "ready")
      c.entries.find((e) => e.tokenId === p.tokenId).ready = true;
    else data.combat = Core.advance(c, action);
    if (!["next", "start", "previous", "end", "delay"].includes(action))
      data.combat.revision++;
    for (const e of data.combat.entries) {
      const t = tokens().find((t) => t.id === e.tokenId);
      if (t) {
        const durationNames = new Set((e.durations || []).map((d) => d.name));
        const prior = (
          c.entries.find((x) => x.tokenId === e.tokenId)?.durations || []
        ).map((d) => d.name);
        t.meta = {
          ...t.meta,
          conditions: [
            ...(t.meta?.conditions || []).filter(
              (x) => !prior.includes(x) || durationNames.has(x),
            ),
            ...durationNames,
          ].filter((x, i, a) => a.indexOf(x) === i),
        };
      }
    }
  }
  async function rollInitiative(list, options = {}) {
    const context = { epoch, user: uid(), campaign: game()?.id };
    const ids = list.map((t) => (typeof t === "string" ? t : t.id));
    if (!q().dm) {
      const t = tokens().find((t) => t.id === ids[0]);
      if (t)
        return send({
          kind: "roll",
          scope: "public",
          tokenId: t.id,
          body: "Initiative",
          formula: "1d20+" + (t.details?.initiative || 0),
        });
      return;
    }
    if (!ids.length) return notice("Select tokens first.");
    try {
      if (local()) {
        const entries = ids.map((id) => {
          const t = tokens().find((t) => t.id === id),
            r = Dice.roll(
              "1d20+" +
                (t.details?.initiative || 0) +
                (options.alert ? "+5" : ""),
              { advantage: options.advantage ? "adv" : undefined },
            );
          return { tokenId: id, initiative: r.total };
        });
        await combat("add", { entries });
      } else {
        const response = await cloud()
          .client()
          .functions.invoke("vtt-roll", {
            body: {
              campaignId: game().id,
              action: "initiative",
              requestId: crypto.randomUUID(),
              expected: data.combat.revision,
              entries: ids.map((tokenId) => ({ tokenId, ...options })),
            },
          });
        if (response.error || response.data?.error)
          throw Error(response.data?.error || "Initiative roll failed");
        await accept({ ...response.data, _clientContext: context });
      }
      openPane("combat");
    } catch (e) {
      notice(e);
    }
  }
  function bindCombat(el) {
    el.querySelectorAll("[data-combat-action]").forEach(
      (b) => (b.onclick = () => combat(b.dataset.combatAction)),
    );
    const options = () => ({
      advantage: !!el.querySelector("[data-init-adv]")?.checked,
      alert: !!el.querySelector("[data-init-alert]")?.checked,
    });
    el.querySelector("[data-add-single]")?.addEventListener("click", () =>
      combat("add", {
        entries: [
          {
            tokenId: el.querySelector("[data-single-combat]").value,
            initiative: +el.querySelector("[data-manual-initiative]").value,
          },
        ],
      }),
    );
    el.querySelector("[data-add-selected]")?.addEventListener("click", () =>
      rollInitiative([...q().selection], options()),
    );
    el.querySelector("[data-add-all]")?.addEventListener("click", () =>
      rollInitiative(
        q().scene.tokens.filter((t) => !["objects"].includes(t.meta?.layer)),
        options(),
      ),
    );
    el.querySelector("[data-save-timer]")?.addEventListener("click", () =>
      combat("settings", {
        timerSeconds: +el.querySelector("[data-timer-seconds]").value,
      }),
    );
    el.querySelector("[data-sort-combat]")?.addEventListener("click", () =>
      combat("order", {
        ids: [...data.combat.entries]
          .sort((a, b) => b.initiative - a.initiative || b.dex - a.dex)
          .map((e) => e.tokenId),
      }),
    );
    el.querySelectorAll("[data-combat-remove]").forEach(
      (b) =>
        (b.onclick = () =>
          combat("remove", { tokenId: b.dataset.combatRemove })),
    );
    el.querySelectorAll("[data-ready]").forEach(
      (b) => (b.onclick = () => combat("ready", { tokenId: b.dataset.ready })),
    );
    el.querySelectorAll("[data-delay]").forEach(
      (b) => (b.onclick = () => combat("delay", { tokenId: b.dataset.delay })),
    );
    el.querySelectorAll("[data-combat-edit]").forEach(
      (b) => (b.onclick = () => combatEditor(b.dataset.combatEdit)),
    );
    el.querySelectorAll("[data-combat-hp]").forEach(
      (b) => (b.onclick = () => hpDialog(b.dataset.combatHp)),
    );
    el.querySelectorAll("[data-combat-token]").forEach((row) => {
      row.ondragstart = (e) => {
        dragging = true;
        e.dataTransfer.setData(
          "application/x-forge-combat",
          row.dataset.combatToken,
        );
      };
      row.ondragend = () => {
        dragging = false;
        render();
      };
      row.ondragover = (e) => {
        if (q().dm) e.preventDefault();
      };
      row.ondrop = (e) => {
        e.preventDefault();
        dragging = false;
        const id = e.dataTransfer.getData("application/x-forge-combat"),
          ids = data.combat.entries
            .map((e) => e.tokenId)
            .filter((x) => x !== id);
        if (!data.combat.entries.some((e) => e.tokenId === id)) return;
        ids.splice(ids.indexOf(row.dataset.combatToken), 0, id);
        combat("order", { ids });
      };
    });
  }
  function combatEditor(id) {
    const entry = data.combat.entries.find((e) => e.tokenId === id),
      d = dialog(
        entry.name + " · combat",
        '<form data-combat-entry><label>Initiative<input name="initiative" type="number" min="-1000" max="1000" value="' +
          entry.initiative +
          '"></label><label>HP shown to other players<select name="hpDisplay"><option value="hidden">Hidden</option><option value="status">Healthy / Bloodied / Near death</option><option value="numbers">Exact HP</option></select></label><label><input name="showAc" type="checkbox" ' +
          (entry.showAc ? "checked" : "") +
          '> Show AC</label><label><input name="showConditions" type="checkbox" ' +
          (entry.showConditions !== false ? "checked" : "") +
          '> Show conditions to other players</label><button class="btn primary">Save combatant</button></form><hr><form data-duration><label>Condition<input name="name" maxlength="60" required placeholder="Poisoned"></label><label>Duration (rounds)<input name="rounds" type="number" min="1" max="1000" value="1" required></label><button class="btn ghost">Add timed condition</button></form>',
      );
    d.querySelector("[name=hpDisplay]").value = entry.hpDisplay || "status";
    d.querySelector("[data-combat-entry]").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target.elements;
      combat("entry", {
        tokenId: id,
        initiative: +f.initiative.value,
        hpDisplay: f.hpDisplay.value,
        showAc: f.showAc.checked,
        showConditions: f.showConditions.checked,
      });
      d.close();
    };
    d.querySelector("[data-duration]").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target.elements;
      combat("duration", {
        tokenId: id,
        name: f.name.value,
        rounds: +f.rounds.value,
      });
      d.close();
    };
  }
  function hpDialog(id) {
    const t = tokens().find((t) => t.id === id);
    if (!t) return notice("Open this combatant’s scene to change HP.");
    const d = dialog(
      t.name + " · hit points",
      '<form><label>Amount<input name="amount" type="number" min="0" max="100000" value="1" required></label><label>Action<select name="action"><option value="damage">Damage</option><option value="heal">Healing</option></select></label><button class="btn primary">Apply</button></form>',
    );
    d.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target.elements,
        amount = +f.amount.value;
      api().change(() => {
        let n = amount;
        if (f.action.value === "damage") {
          const temp = t.details?.tempHp || 0;
          t.details = { ...t.details, tempHp: Math.max(0, temp - n) };
          n = Math.max(0, n - temp);
        }
        t.hp = Math.max(
          0,
          Math.min(t.maxHp, t.hp + (f.action.value === "heal" ? n : -n)),
        );
      });
      d.close();
    };
  }
  function updateTimer() {
    if (!root || !data) return;
    const output = root.querySelector("[data-turn-timer]"),
      c = data.combat;
    if (output) {
      const remaining = Math.max(
        0,
        (c.timerSeconds || 0) -
          Math.floor((Date.now() - (c.startedAt || Date.now())) / 1000),
      );
      output.textContent =
        c.activeTokenId && c.timerSeconds
          ? Math.floor(remaining / 60) +
            ":" +
            String(remaining % 60).padStart(2, "0")
          : "";
      output.classList.toggle("expired", !!c.timerSeconds && !remaining);
    }
  }
  function animate() {
    const map = root?.querySelector(".vtt-center");
    if (!map) return;
    map.querySelector(".vtt-dice-animation")?.remove();
    const div = document.createElement("div");
    div.className = "vtt-dice-animation";
    div.setAttribute("aria-hidden", "true");
    div.innerHTML = "<span>⚄</span><span>⚅</span>";
    map.append(div);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => div.remove(), 800);
  }
  let audio;
  function beep() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audio ||= new Audio();
      audio.resume();
      const o = audio.createOscillator(),
        g = audio.createGain();
      o.type = "triangle";
      o.frequency.value = 480;
      g.gain.setValueAtTime(0.04, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
      o.connect(g);
      g.connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.13);
    } catch {}
  }
  function openPane(next = "chat") {
    open = true;
    pane = next;
    unread = 0;
    render();
  }
  function observe(model) {
    if (!model || model._cloud) return;
    const all = model.scenes.flatMap((s) => s.tokens);
    const next = new Map(
      all.map((t) => [
        t.id,
        {
          hp: t.hp,
          tempHp: t.details?.tempHp || 0,
          conditions: [...(t.meta?.conditions || [])],
        },
      ]),
    );
    if (campaign === model.id && data)
      for (const t of all) {
        const old = lastStats.get(t.id),
          entry = data.combat.entries.find((e) => e.tokenId === t.id);
        if (entry)
          Object.assign(entry, {
            hp: t.hp,
            maxHp: t.maxHp,
            ac: t.details?.ac,
            conditions: t.meta?.conditions || [],
          });
        if (!old) continue;
        const damage =
            Math.max(0, old.hp - t.hp) +
            Math.max(0, old.tempHp - (t.details?.tempHp || 0)),
          healing = Math.max(0, t.hp - old.hp),
          changed =
            JSON.stringify(old.conditions) !==
            JSON.stringify(t.meta?.conditions || []);
        if (damage || healing || changed)
          data.messages.push({
            id: Date.now() + Math.random(),
            actor_id: uid(),
            token_id: t.id,
            speaker: "Combat",
            scope: "controllers",
            kind: "combat",
            created_at: new Date().toISOString(),
            body:
              t.name +
              (damage
                ? " takes " +
                  damage +
                  " damage" +
                  (t.hp === 0 ? " and falls to 0 HP." : ".")
                : healing
                  ? " regains " + healing + " HP."
                  : ": conditions updated."),
            payload: {
              concentrationDC:
                damage && old.conditions.includes("Concentrating")
                  ? Math.max(10, Math.floor(damage / 2))
                  : null,
            },
          });
      }
    lastStats = next;
  }
  function mount(el) {
    root = el;
    const a = q();
    if (!a?.game) return;
    const next = a.game.id;
    if (campaign !== next || sessionUser !== uid()) {
      sessionUser = uid();
      turnNoticeText = "";
      turnNoticeUntil = 0;
      busy = false;
      speaker = "";
      draft = "";
      epoch++;
      live?.stop();
      campaign = next;
      data = local() ? a.game.play || empty() : empty();
      lastStats = new Map();
      lastTurn = "";
      lastSeen = 0;
      unread = 0;
      try {
        prefs = {
          ...prefs,
          ...JSON.parse(localStorage.getItem(settingsKey()) || "{}"),
        };
      } catch {}
      if (!local()) {
        live = window.ForgeVTTLive.create({
          client: cloud().client(),
          pull: () => load(),
          table: "forge_vtt_play_events",
          prefix: "vtt-play",
          pollMs: 5000,
        });
        live.watch(next);
        load();
      } else {
        a.game.play = data;
        observe(a.game);
      }
    }
    const toggle = document.createElement("button");
    toggle.className = "btn ghost vtt-play-toggle";
    toggle.dataset.playOpen = "";
    toggle.textContent = "Chat & combat";
    toggle.onclick = () => {
      open = !open;
      unread = 0;
      render();
    };
    const drawer = document.createElement("section");
    drawer.className = "vtt-play-drawer";
    drawer.setAttribute("aria-label", "Campaign chat and combat");
    drawer.hidden = !open;
    root.querySelector(".vtt-center").append(toggle, drawer);
    hotbar();
    render();
    showTurnNotice();
    clearInterval(timer);
    timer = setInterval(() => {
      if (!q()?.game || q().game.id !== campaign || uid() !== sessionUser) {
        live?.stop();
        clearInterval(timer);
        campaign = null;
        epoch++;
        data = null;
        return;
      }
      updateTimer();
    }, 1000);
  }
  function paint(cx, scene, a) {
    const id = data?.combat?.activeTokenId,
      t = scene.tokens.find((t) => t.id === id);
    if (!t || (t.hidden && !a.dm)) return;
    cx.save();
    cx.strokeStyle = "#f8db85";
    cx.shadowColor = "#f8db85";
    cx.shadowBlur = 12;
    cx.lineWidth = 4 / a.zoom;
    cx.beginPath();
    cx.ellipse(
      t.x + (t.size * scene.grid) / 2,
      t.y + ((t.meta?.height || t.size) * scene.grid) / 2,
      (t.size * scene.grid) / 2 + 6 / a.zoom,
      ((t.meta?.height || t.size) * scene.grid) / 2 + 6 / a.zoom,
      0,
      0,
      Math.PI * 2,
    );
    cx.stroke();
    cx.restore();
  }
  document.addEventListener("keydown", (e) => {
    if (
      !q()?.game ||
      e.target.closest("input,textarea,select,[contenteditable=true]") ||
      document.querySelector("dialog[open]") ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey
    )
      return;
    if (/^[1-9]$/.test(e.key)) {
      const m = data?.macros.find((m) => m.slot === +e.key);
      if (m) {
        e.preventDefault();
        runMacro({ ...m, tokenId: m.token_id || m.tokenId });
      }
    }
  });
  window.ForgeVTTPlay = {
    roll:(tokenId,formula,body,mode)=>send({kind:'roll',scope:'public',tokenId,formula,body,advantage:mode||advantage}),
    share:card=>send({kind:'card',scope:'public',body:card.title,card}),
    macro:saveMacro,
    mount,
    open: openPane,
    rollInitiative,
    addTokens: (tokens) => rollInitiative(tokens),
    selected: hotbar,
    paint,
    observe,
  };
})();
