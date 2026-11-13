/* Phase 7: private media, documents, map pins, shared sound and account preferences. */
(() => {
  "use strict";
  const C = window.ForgeVTTResourcesCore,
    E = C.escape,
    api = () => window.ForgeTabletop,
    q = () => api()?.state(),
    clone = (x) => JSON.parse(JSON.stringify(x)),
    uuid = () => crypto.randomUUID();
  const account = () =>
    window.ForgeCloud?.partyConnection()?.user?.id || "guest";
  let key = "",
    epoch = 0,
    snapshot = { records: [], assets: [], trash: [] },
    watcher = null,
    dialog = null,
    tab = "handout",
    editing = null,
    loadError = "",
    busy = false,
    armed = null,
    prefs = C.preferences(),
    offset = 0,
    enabled = false,
    audioRecord = null,
    sfxSeen = "",
    currentTrack = "",
    fading = null,
    mediaEpoch = 0,
    appliedZoom = "",
    refreshPending = false;
  const blobs = new Map(),
    pendingBlobs = new Map(),
    players = new Set();
  let main = new Audio(),
    timer = null,
    prefTimer;
  main.preload = "metadata";
  const uid = () => q()?.game?.id,
    cloud = () => !!q()?.game?._cloud,
    dm = () => q()?.dm;
  const records = (kind) =>
      snapshot.records.filter((r) => !kind || r.kind === kind),
    assets = (type) =>
      snapshot.assets.filter(
        (a) => !a.deleted_at && (!type || a.mime_type.startsWith(type + "/")),
      );
  const btn = (label, action, cls = "") =>
    '<button type="button" class="btn ' +
    cls +
    '" data-resource-action="' +
    action +
    '">' +
    E(label) +
    "</button>";
  const field = (label, html) => "<label>" + E(label) + html + "</label>";
  const input = (name, value = "", extra = "") =>
    '<input name="' + name + '" value="' + E(value) + '" ' + extra + ">";
  const select = (name, values, value) =>
    '<select name="' +
    name +
    '">' +
    values
      .map(
        ([v, t]) =>
          '<option value="' +
          E(v) +
          '" ' +
          (String(v) === String(value) ? "selected" : "") +
          ">" +
          E(t) +
          "</option>",
      )
      .join("") +
    "</select>";
  const bytes = (n) =>
    n >= 1073741824 ? (n / 1073741824).toFixed(0) + " GB" :
    n >= 1048576
      ? (n / 1048576).toFixed(1) + " MB"
      : Math.ceil(n / 1024) + " KB";
  const fail = (e) => {
    loadError = e?.message || String(e);
    api()?.notify(loadError);
    const status = dialog?.querySelector("[data-resource-status]");
    if (status) {
      status.textContent = loadError;
      status.setAttribute("role", "alert");
    }
  };
  function setStatus(text) {
    const el = dialog?.querySelector("[data-resource-status]");
    if (el) el.textContent = text;
  }
  async function gateway(assetId, body) {
    const generation = epoch,
      client = window.ForgeVTTCloud?.client(),
      session = (await client?.auth.getSession())?.data?.session;
    if (!session) throw Error("Sign in again to use campaign media.");
    const cfg = window.FORGE_CLOUD_CONFIG,
      url =
        cfg.supabaseUrl +
        "/functions/v1/vtt-media?" +
        (body
          ? "campaignId=" + encodeURIComponent(uid())
          : "assetId=" + encodeURIComponent(assetId));
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + session.access_token,
        apikey: cfg.publishableKey,
        ...(body ? { "Content-Type": body.type } : {}),
      },
      ...(body ? { body } : {}),
      cache: "no-store",
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw Error(error.error || "Media unavailable (" + res.status + ").");
    }
    const result = body ? await res.json() : await res.blob();
    if (generation !== epoch) throw Error("Campaign changed.");
    return result;
  }
  async function assetURL(id) {
    if (!id) return "";
    if (!cloud())
      return (
        snapshot.assets.find((a) => a.id === id && !a.deleted_at)?.data || ""
      );
    if (blobs.has(id)) return blobs.get(id);
    if (pendingBlobs.has(id)) return pendingBlobs.get(id);
    const gen = epoch,
      p = gateway(id)
        .then((b) => {
          if (gen !== epoch) throw Error("Campaign changed.");
          const url = URL.createObjectURL(b);
          blobs.set(id, url);
          return url;
        })
        .finally(() => {
          if (gen === epoch) pendingBlobs.delete(id);
        });
    pendingBlobs.set(id, p);
    return p;
  }
  async function dataURL(url) {
    const b = await (await fetch(url)).blob();
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(b);
    });
  }
  function applyPreferences() {
    const root = q()?.root;
    if (!root) return;
    root.classList.toggle("vtt-resource-light", prefs.theme === "light");
    document.body.classList.toggle(
      "vtt-resource-light",
      prefs.theme === "light",
    );
    root.classList.toggle("vtt-resource-still", !prefs.animations);
    root.style.setProperty("--vtt-ui-scale", prefs.scale);
    applyVolume();
  }
  function receive(data) {
    const changed =
      JSON.stringify([
        snapshot.records,
        snapshot.assets,
        snapshot.trash,
        snapshot.preferences,
      ]) !==
      JSON.stringify([data.records, data.assets, data.trash, data.preferences]);
    snapshot = data;
    offset = (Number(data.serverTime) || Date.now()) - Date.now();
    if (data.preferences && Object.keys(data.preferences).length) {
      prefs = C.preferences(data.preferences);
      try {
        localStorage.setItem(
          "forge-vtt-prefs:" + account(),
          JSON.stringify(prefs),
        );
      } catch {}
    }
    // Revoke document/media bytes as soon as their reference is no longer authorized.
    const allowed = new Set(
      (data.assets || []).filter((a) => !a.deleted_at).map((a) => a.id),
    );
    for (const r of data.records || []) {
      if (r.payload.imageAssetId) allowed.add(r.payload.imageAssetId);
      for (const t of r.payload.tracks || [])
        if (t.assetId) allowed.add(t.assetId);
    }
    for (const [id, url] of blobs)
      if (!allowed.has(id)) {
        URL.revokeObjectURL(url);
        blobs.delete(id);
      }
    applyPreferences();
    pins();
    syncAudio();
    if (dialog && changed && !(editing?.kind || editing?.asset)) {
      const scroll = dialog.querySelector(".vtt-resource-body")?.scrollTop || 0;
      render();
      const b = dialog.querySelector(".vtt-resource-body");
      if (b) b.scrollTop = scroll;
    } else if (dialog && changed && editing) {
      refreshPending = true;
      setStatus(
        "Updates available. Your draft is kept until you save or cancel.",
      );
    }
  }
  async function pull(id = uid()) {
    if (!id || !cloud()) return;
    const gen = epoch,
      client = window.ForgeVTTCloud?.client();
    const { data, error } = await client.rpc("forge_vtt_resources_api", {
      p_action: "list",
      p_payload: { campaignId: id },
    });
    if (gen !== epoch) return;
    if (error) {
      if (error.code === "42501") {
        reset();
        close();
      }
      throw Error(error.message);
    }
    receive(data);
  }
  async function mutate(action, data = {}) {
    const gen = epoch,
      g = q()?.game;
    if (!g) throw Error("Open a tabletop first.");
    if (cloud()) {
      const { data: result, error } = await window.ForgeVTTCloud.client().rpc(
        "forge_vtt_resources_api",
        { p_action: action, p_payload: { campaignId: g.id, ...data } },
      );
      if (error)
        throw Error(
          error.code === "40001"
            ? "This resource changed on another device. Copy your draft, cancel, and reopen it before saving."
            : error.message,
        );
      if (gen !== epoch) throw Error("Campaign changed.");
      receive(result);
      return result;
    }
    g.resources ||= { records: [], assets: [] };
    const all = g.resources.records,
      old = all.find((r) => r.id === data.id);
    if (action === "save") {
      const row = {
        ...old,
        ...data,
        campaign_id: g.id,
        revision: (old?.revision || 0) + 1,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      };
      if (data.kind === "audio")
        row.payload = { ...data.payload, startedAt: Date.now() };
      if (old) all[all.indexOf(old)] = row;
      else all.push(row);
    } else if (action === "trash" || action === "restore") {
      if (old) {
        old.deleted_at = action === "trash" ? new Date().toISOString() : null;
        old.revision++;
      }
    } else if (action === "journal") {
      if (old) {
        old.payload.text = data.text;
        old.revision++;
      }
    } else if (action === "asset") {
      Object.assign(
        g.resources.assets.find((a) => a.id === data.id) || {},
        data,
      );
    } else if (action === "asset_trash") {
      const a = g.resources.assets.find((a) => a.id === data.id);
      if (a) a.deleted_at = data.restore ? null : new Date().toISOString();
    }
    api().saveVisionMemory();
    receive(C.localSnapshot(g));
    return snapshot;
  }
  function reset() {
    epoch++;
    watcher?.stop();
    watcher = null;
    armed = null;
    close();
    stopAudio();
    enabled = false;
    audioRecord = null;
    currentTrack = "";
    sfxSeen = "";
    appliedZoom = "";
    clearTimeout(prefTimer);
    for (const url of blobs.values()) URL.revokeObjectURL(url);
    blobs.clear();
    pendingBlobs.clear();
    snapshot = { records: [], assets: [], trash: [] };
    document.body.classList.remove("vtt-resource-light");
  }
  function mount(root) {
    const state = q();
    if (!state?.game || !state.scene) return;
    const next = account() + ":" + state.game.id;
    if (next !== key) {
      reset();
      key = next;
      try {
        prefs = C.preferences(
          JSON.parse(
            localStorage.getItem("forge-vtt-prefs:" + account()) || "{}",
          ),
        );
      } catch {
        prefs = C.preferences();
      }
      if (cloud()) {
        pull().catch(fail);
        const client = window.ForgeVTTCloud?.client();
        if (client && window.ForgeVTTLive)
          watcher = window.ForgeVTTLive.create({
            client,
            pull,
            table: "forge_vtt_play_events",
            prefix: "vtt-resources",
            pollMs: 7000,
          });
        watcher?.watch(uid());
      } else receive(C.localSnapshot(state.game));
    }
    const tools = root.querySelector(".vtt-stage-tools");
    if (tools && !tools.querySelector("[data-resource-open]")) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn ghost vtt-resource-open";
      b.dataset.resourceOpen = "";
      b.textContent = state.dm ? "Campaign tools" : "Handouts & audio";
      b.onclick = () => open();
      tools.append(b);
    }
    applyPreferences();
    pins();
    const vp = root.querySelector(".vtt-viewport");
    if (vp && !vp.dataset.resourceBound) {
      vp.dataset.resourceBound = "1";
      vp.addEventListener("pointerdown", placePin, { capture: true });
      vp.addEventListener(
        "dragover",
        (e) => {
          if (e.dataTransfer.types.includes("application/x-forge-asset"))
            e.preventDefault();
        },
        { capture: true },
      );
      vp.addEventListener("drop", dropAsset, { capture: true });
    }
    if (appliedZoom !== key + ":" + state.scene.id) {
      appliedZoom = key + ":" + state.scene.id;
      requestAnimationFrame(() => {
        if (q()?.root === root && q()?.scene.id === state.scene.id)
          api().zoomAt?.(prefs.zoom);
      });
    }
  }
  function close() {
    if (dialog) {
      dialog.close();
      dialog.remove();
      dialog = null;
    }
    editing = null;
    refreshPending = false;
  }
  function open(kind = "handout", id = null) {
    close();
    tab = kind;
    editing = null;
    dialog = document.createElement("dialog");
    dialog.className = "vtt-resource-dialog";
    dialog.setAttribute("aria-label", "Campaign tools");
    document.body.append(dialog);
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      close();
    });
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) close();
    });
    if (id) editing = { view: id };
    render();
    dialog.showModal();
  }
  function render() {
    if (!dialog) return;
    const focusedTab = dialog.contains(document.activeElement) ? document.activeElement?.dataset?.tab : null;
    const tabs = [
      ...(dm() ? [["assets", "Assets"]] : []),
      ["handout", "Handouts"],
      ...(dm() ? [["creature", "Monsters & NPCs"]] : []),
      ["audio", "Audio"],
      ["settings", "Preferences"],
      ...(dm() ? [["trash", "Trash"]] : []),
    ];
    dialog.innerHTML =
      '<header><div><span class="vtt-resource-kicker">' +
      (dm() ? "DM WORKSPACE" : "CAMPAIGN") +
      '</span><h2>Campaign tools</h2></div><button type="button" class="btn ghost vtt-resource-close" data-resource-action="close" aria-label="Close campaign tools">×</button></header><nav aria-label="Campaign tools">' +
      tabs
        .map(
          ([id, label]) =>
            '<button type="button" data-tab="' +
            id +
            '" aria-current="' +
            (tab === id ? "page" : "false") +
            '">' +
            label +
            "</button>",
        )
        .join("") +
      '</nav><div class="vtt-resource-body">' +
      (editing?.view
        ? documentView(editing.view)
        : editing?.kind
          ? documentEditor(editing)
          : tab === "assets"
            ? assetPanel()
            : tab === "audio"
              ? audioPanel()
              : tab === "creature"
                ? window.ForgeVTTMonsters.list(monsterContext())
              : tab === "settings"
                ? settingsPanel()
                : tab === "trash"
                  ? trashPanel()
                  : documentList()) +
      '</div><p data-resource-status class="vtt-resource-status" role="status">' +
      E(loadError) +
      "</p>";
    dialog.querySelectorAll("[data-tab]").forEach(
      (b) =>
        (b.onclick = () => {
          if (editing?.kind && !confirm("Discard this unsaved draft?")) return;
          editing = null;
          tab = b.dataset.tab;
          render();
        }),
    );
    dialog.querySelectorAll("[data-resource-action]").forEach(
      (b) =>
        (b.onclick = (e) => {
          e.preventDefault();
          action(b.dataset.resourceAction, b).catch(fail);
        }),
    );
    dialog.querySelectorAll("[data-open-doc]").forEach(
      (b) =>
        (b.onclick = () => {
          editing = { view: b.dataset.openDoc };
          render();
        }),
    );
    dialog.querySelectorAll("[data-resource-image]").forEach((img) => {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer.disconnect();
            const gen = epoch;
            assetURL(img.dataset.resourceImage)
              .then((url) => {
                if (gen === epoch && img.isConnected) img.src = url;
              })
              .catch(() => {
                img.alt = "Image unavailable";
              });
          }
        },
        {
          root: dialog.querySelector(".vtt-resource-body"),
          rootMargin: "100px",
        },
      );
      observer.observe(img);
    });
    bindPanel();
    if (focusedTab) dialog.querySelector('[data-tab="' + tab + '"]')?.focus({preventScroll:true});
  }
  function documentList() {
    const rows = tab === "handout" ? records().filter(r => ["handout","journal"].includes(r.kind)) : records(tab);
    return (
      '<div class="vtt-resource-heading"><div><h3>' +
      (tab === "journal" ? "Campaign journal" : "Handouts") +
      '</h3><p class="hint">' +
      (dm()
        ? "Create notes privately, then choose who can read them."
        : "Your DM’s shared documents appear here.") +
      "</p></div>" +
      (dm()
        ? btn(
            "＋ " + (tab === "journal" ? "New entry" : "New handout"),
            "new-doc",
          )
        : "") +
      "</div>" +
      (rows.length
        ? '<div class="vtt-resource-list">' +
          rows
            .map(
              (r) =>
                '<button type="button" class="vtt-resource-doc" data-open-doc="' +
                r.id +
                '"><span class="vtt-resource-doc-icon">' +
                (r.kind === "journal" ? "▤" : "▧") +
                "</span><span><strong>" +
                E(r.title) +
                "</strong><small>" +
                E(
                  r.payload.shared
                    ? "Shared journal"
                    : r.audience === "dm"
                      ? "DM only"
                      : r.audience === "selected"
                        ? "Selected members"
                        : "Everyone",
                ) +
                '</small></span><span aria-hidden="true">›</span></button>',
            )
            .join("") +
          "</div>"
        : '<div class="vtt-resource-empty"><h3>No ' +
          (tab === "journal" ? "journal entries" : "handouts") +
          " yet</h3><p>" +
          (dm()
            ? "Add your first document above."
            : "There are no documents shared with you yet.") +
          "</p></div>")
    );
  }
  function documentView(id) {
    const r = records().find((r) => r.id === id);
    if (r?.kind === "creature") return window.ForgeVTTMonsters.view(r, monsterContext());
    if (!r)
      return (
        "<p>This document is no longer shared with you.</p>" +
        btn("Back", "back")
      );
    return (
      '<div class="vtt-resource-heading"><h3>' +
      E(r.title) +
      '</h3><div class="vtt-resource-actions">' +
      btn("Back", "back") +
      (dm() || (r.kind === "journal" && r.payload.shared)
        ? btn("Edit", "edit-doc")
        : "") +
      "</div></div>" +
      (r.payload.imageAssetId
        ? '<img class="vtt-resource-hero" data-resource-image="' +
          E(r.payload.imageAssetId) +
          '" alt="Handout image">'
        : "") +
      '<article class="vtt-resource-prose">' +
      C.markdown(r.payload.text) +
      "</article>" +
      (dm()
        ? '<div class="vtt-resource-actions">' +
          btn("Place map pin", "pin-doc") +
          btn("Share with everyone", "reveal-doc", "ghost") +
          btn("Move to trash", "trash-doc", "ghost") +
          "</div>"
        : "")
    );
  }
  function documentEditor(r) {
    if (r.kind === "creature") return window.ForgeVTTMonsters.editor(r, monsterContext());
    const data = r.payload || {},
      members = q()?.game?.members || [],
      membersList = Array.isArray(members) ? members : Object.values(members),
      isDM = dm();
    return (
      '<form data-resource-form class="vtt-resource-form"><div class="vtt-resource-heading"><h3>' +
      E(r.id ? "Edit " + r.kind : "New " + r.kind) +
      '</h3><div class="vtt-resource-actions">' +
      btn("Cancel", "cancel-edit", "ghost") +
      '<button class="btn" type="submit">Save</button></div></div>' +
      (isDM
        ? field(
            "Title",
            input("title", r.title || "", 'maxlength="120" required'),
          )
        : "<h4>" + E(r.title) + "</h4>") +
      '<div class="vtt-resource-format">' +
      [
        ["bold", "Bold"],
        ["italic", "Italic"],
        ["heading", "Heading"],
        ["list", "List"],
        ["link", "Link"],
      ]
        .map(
          ([id, t]) =>
            '<button type="button" class="btn ghost" data-format="' +
            id +
            '">' +
            t +
            "</button>",
        )
        .join("") +
      "</div>" +
      field(
        "Text · simple Markdown supported",
        '<textarea name="text" rows="12" maxlength="20000">' +
          E(data.text || "") +
          "</textarea>",
      ) +
      (isDM
        ? '<div class="vtt-resource-form-grid">' +
          field(
            "Visibility",
            select(
              "audience",
              [
                ["dm", "DM only"],
                ["all", "Everyone"],
                ["selected", "Selected members"],
              ],
              r.audience || "dm",
            ),
          ) +
          pictureControl(data.imageAssetId) +
          '</div><fieldset class="vtt-resource-recipients"><legend>Selected members</legend>' +
          membersList
            .map(
              (m) =>
                '<label class="vtt-resource-check"><input type="checkbox" name="recipients" value="' +
                E(m.user_id || m.userId || m.id) +
                '" ' +
                ((r.recipients || []).includes(m.user_id || m.userId || m.id)
                  ? "checked"
                  : "") +
                ">" +
                E(
                  m.display_name ||
                    m.displayName ||
                    m.name ||
                    m.role ||
                    "Member",
                ) +
                "</label>",
            )
            .join("") +
          "</fieldset>" +
          (r.kind === "journal"
            ? '<label class="vtt-resource-check"><input type="checkbox" name="shared" ' +
              (data.shared ? "checked" : "") +
              ">Let players edit this entry when shared with everyone</label>"
            : "") +
          field(
            "Link to tokens (optional)",
            '<select multiple name="tokenIds" size="3">' +
              q()
                .scene.tokens.map(
                  (t) =>
                    '<option value="' +
                    E(t.id) +
                    '" ' +
                    ((data.tokenIds || []).includes(t.id) ? "selected" : "") +
                    ">" +
                    E(t.name) +
                    "</option>",
                )
                .join("") +
              "</select>",
          )
        : "") +
      "</form>"
    );
  }
  function assetPanel() {
    return (
      '<div class="vtt-resource-heading"><div><h3>Asset library</h3><p class="hint">Images and audio · PNG, JPEG, WebP, MP3, Ogg, WAV · 20 MB per file</p></div><label class="btn vtt-resource-upload">Upload<input type="file" multiple data-asset-upload accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav"></label></div><div class="vtt-resource-usage"><span>Campaign <strong>' +
      bytes(snapshot.campaignBytes || 0) +
      " / " + bytes(snapshot.campaignLimit || 262144000) + "</strong></span>" +
      (cloud()
        ? "<span>Owner account <strong>" +
          bytes(snapshot.accountBytes || 0) +
          " / " + bytes(snapshot.accountLimit || 524288000) + "</strong></span>"
        : "<span>Saved on this device</span>") +
      '</div><div class="vtt-resource-filters">' +
      input(
        "search",
        "",
        'type="search" placeholder="Search names, tags, folders" aria-label="Search assets"',
      ) +
      select(
        "assetType",
        [
          ["", "All assets"],
          ["image", "Images"],
          ["audio", "Audio"],
        ],
        "",
      ) +
      select(
        "folder",
        [
          ["", "All folders"],
          ...[
            ...new Set(
              assets()
                .map((a) => a.folder)
                .filter(Boolean),
            ),
          ]
            .sort()
            .map((f) => [f, f]),
        ],
        "",
      ) +
      '</div><div class="vtt-resource-assets" data-asset-grid>' +
      assetCards(assets()) +
      '</div><p class="hint">Drag an image onto the map to create a token. Open an asset to use it as a map or portrait.</p>'
    );
  }
  function assetCards(rows) {
    return rows.length
      ? rows
          .map(
            (a) =>
              '<button type="button" class="vtt-resource-asset" data-asset="' +
              E(a.id) +
              '" draggable="' +
              a.mime_type.startsWith("image/") +
              '">' +
              (a.mime_type.startsWith("image/")
                ? '<img data-resource-image="' +
                  E(a.id) +
                  '" loading="lazy" alt="">'
                : '<span class="vtt-resource-wave" aria-hidden="true">♫</span>') +
              "<strong>" +
              E(a.label || "Untitled asset") +
              "</strong><small>" +
              E(a.folder || "Unfiled") +
              " · " +
              bytes(a.byte_size) +
              "</small></button>",
          )
          .join("")
      : '<p class="vtt-resource-empty">No matching assets.</p>';
  }
  function monsterContext() {
    return {records:records("creature"),editing,viewing:records("creature").find(r=>r.id===editing?.view),trash:r=>mutate("trash",{id:r.id,expected:r.revision}),state:q(),dm:dm(),E,markdown:C.markdown,pictureControl,bindPicture,
      save:saveRecord,assetURL,notify:api()?.notify,change:fn=>api().change(fn),
      edit:r=>{editing=r;render();},view:id=>{editing={view:id};render();},error:fail,status:setStatus};
  }
  function pictureControl(id = "") {
    return '<div class="vtt-picture"><span class="vtt-picture-label">Picture</span><input type="hidden" name="imageAssetId" value="'+E(id)+'">'+
      '<div class="vtt-picture-drop" data-picture-drop><img '+(id?'data-resource-image="'+E(id)+'"':'hidden')+' alt="Selected picture" data-picture-preview><div><strong>Drop a picture here</strong><p>PNG, JPEG or WebP · up to 20 MB</p><button type="button" class="btn" data-picture-choose>Choose image</button><input data-picture-file type="file" accept="image/png,image/jpeg,image/webp" aria-label="Picture file" hidden><button type="button" class="btn ghost" data-picture-remove>Remove picture</button></div></div><p data-picture-status role="status"></p>'+
      (assets("image").length?'<details><summary>Use a library image</summary><div class="vtt-picture-library">'+assets("image").slice(0,100).map(a=>'<button type="button" data-picture-existing="'+E(a.id)+'" title="'+E(a.label)+'"><img loading="lazy" data-resource-image="'+E(a.id)+'" alt=""><span>'+E(a.label||"Untitled image")+'</span></button>').join('')+'</div></details>':'')+'</div>';
  }
  function bindPicture(form) {
    const box=form.querySelector(".vtt-picture");if(!box)return;
    const preview=box.querySelector("[data-picture-preview]"),value=box.querySelector('[name="imageAssetId"]'),status=box.querySelector("[data-picture-status]"),drop=box.querySelector("[data-picture-drop]");
    let request=0;
    const set=async id=>{value.value=id;preview.hidden=!id;if(!id){preview.removeAttribute("src");return;}const n=++request;const url=await assetURL(id);if(n===request&&box.isConnected)preview.src=url;};
    const take=async file=>{
      if(!file||busy)return;
      if(!/^image\/(png|jpeg|webp)$/.test(file.type)){status.textContent="Choose a PNG, JPEG or WebP image.";return;}
      busy=true;status.textContent="Uploading picture…";
      try {const id=await uploadOne(file);await set(id);status.textContent="Picture ready. Save to attach it.";}catch(e){status.textContent=e.message;}finally{busy=false;}
    };
    box.querySelector('[data-picture-choose]').onclick=()=>box.querySelector('[data-picture-file]').click();
    box.querySelector('[data-picture-file]').onchange=e=>take(e.target.files[0]);
    box.querySelector('[data-picture-remove]').onclick=()=>{request++;set("");status.textContent="Picture removed. Save to apply.";};
    box.querySelectorAll('[data-picture-existing]').forEach(b=>b.onclick=()=>set(b.dataset.pictureExisting).catch(fail));
    drop.ondragover=e=>{e.preventDefault();drop.classList.add("is-dragging");};
    drop.ondragleave=()=>drop.classList.remove("is-dragging");
    drop.ondrop=e=>{e.preventDefault();e.stopPropagation();drop.classList.remove("is-dragging");take(e.dataTransfer.files[0]);};
    if(value.value)set(value.value).catch(fail);
  }
  async function uploadOne(file) {
    const generation=epoch;
    if(file.size>20971520||!file.size)throw Error("Choose a nonempty file up to 20 MB.");
    let id;
    if(cloud())id=(await gateway(null,file)).assetId;
    else {
      if((snapshot.campaignBytes||0)+file.size>262144000)throw Error("Campaign quota: 250 MB");
      const temp=URL.createObjectURL(file);let data;
      try{data=await dataURL(temp);}finally{URL.revokeObjectURL(temp);}
      id=uuid();q().game.resources||={records:[],assets:[]};
      q().game.resources.assets.push({id,campaign_id:uid(),data,mime_type:file.type||(/\.ogg$/i.test(file.name)?"audio/ogg":/\.wav$/i.test(file.name)?"audio/wav":"audio/mpeg"),byte_size:file.size,label:file.name,folder:"",tags:[]});
    }
    if(generation!==epoch)throw Error("Campaign changed.");
    await mutate("asset",{id,label:file.name.slice(0,200),folder:"",tags:[]});
    return id;
  }
  async function upload(files) {
    if (busy) return;
    busy = true;
    const generation = epoch;
    try {
      for (const file of [...files].slice(0, 10)) {
        if (
          !/^(image\/(png|jpeg|webp)|audio\/(mpeg|ogg|wav|x-wav))$/.test(
            file.type,
          ) &&
          !/\.(mp3|ogg|wav)$/i.test(file.name)
        )
          throw Error("Choose PNG, JPEG, WebP, MP3, Ogg, or WAV.");
        if (file.size > 20971520)
          throw Error("Each file must be 20 MB or smaller.");
        setStatus("Uploading " + file.name + "…");
        let id;
        if (cloud()) id = (await gateway(null, file)).assetId;
        else {
          const total = snapshot.campaignBytes || 0;
          if (total + file.size > 262144000)
            throw Error("Campaign quota: 250 MB");
          const temp = URL.createObjectURL(file);
          let data;
          try {
            data = await dataURL(temp);
          } finally {
            URL.revokeObjectURL(temp);
          }
          id = uuid();
          q().game.resources ||= { records: [], assets: [] };
          q().game.resources.assets.push({
            id,
            campaign_id: uid(),
            data,
            mime_type:
              file.type ||
              (/\.ogg$/i.test(file.name)
                ? "audio/ogg"
                : /\.wav$/i.test(file.name)
                  ? "audio/wav"
                  : "audio/mpeg"),
            byte_size: file.size,
            label: file.name,
            folder: "",
            tags: [],
          });
        }
        if (generation !== epoch) return;
        await mutate("asset", {
          id,
          label: file.name.slice(0, 200),
          folder: "",
          tags: [],
        });
      }
      setStatus("Uploads complete.");
    } finally {
      busy = false;
    }
  }
  function audioPanel() {
    const r = records("audio")[0],
      p = r?.payload || {
        tracks: [],
        status: "stopped",
        volume: 0.7,
        crossfade: 2,
        position: 0,
        loop: false,
      },
      current = p.tracks.find((t) => t.id === p.currentId);
    return (
      '<div class="vtt-resource-heading"><div><h3>Campaign audio</h3><p class="hint">' +
      E(current?.title || "No track playing") +
      "</p></div>" +
      btn(enabled ? "Audio enabled" : "Enable audio", "enable-audio") +
      (C.youtube(current?.url) ? btn("Open separate player", "popout-audio", "ghost") : "") +
      '</div><div class="vtt-resource-listen">' +
      field(
        "Your volume",
        '<input data-personal-volume type="range" min="0" max="1" step=".05" value="' +
          prefs.volume +
          '">',
      ) +
      '<label class="vtt-resource-check"><input data-personal-mute type="checkbox" ' +
      (prefs.muted ? "checked" : "") +
      ">Mute on this device</label><small data-audio-status>" +
      E(
        enabled
          ? p.status === "playing"
            ? "Playing · " + (current?.title || "")
            : "Ready"
          : "Tap Enable audio to allow playback on this device.",
      ) +
      "</small></div>" +
      (dm()
        ? '<div class="vtt-resource-actions">' +
          btn(
            p.status === "playing" ? "Pause" : "Play",
            p.status === "playing" ? "pause" : "play",
          ) +
          btn("Stop", "stop", "ghost") +
          btn("Next track", "next", "ghost") +
          '</div><div class="vtt-resource-form-grid">' +
          field(
            "Playlist volume",
            '<input data-shared-volume type="range" min="0" max="1" step=".05" value="' +
              p.volume +
              '">',
          ) +
          field(
            "Crossfade (seconds)",
            '<input data-crossfade type="number" min="0" max="10" step="1" value="' +
              p.crossfade +
              '">',
          ) +
          '</div><label class="vtt-resource-check"><input data-loop type="checkbox" ' +
          (p.loop ? "checked" : "") +
          ">Loop current track</label>"
        : "") +
      '<ol class="vtt-resource-tracks">' +
      p.tracks
        .map(
          (t) =>
            '<li class="' +
            (p.currentId === t.id ? "active" : "") +
            '"><span>' +
            E(t.title) +
            "</span>" +
            (dm()
              ? '<div class="vtt-resource-actions">' +
                btn("Play", "track:" + t.id, "ghost") +
                (C.youtube(t.url) ? "" : btn("SFX", "sfx:" + t.id, "ghost")) +
                btn("↑", "up:" + t.id, "ghost") +
                btn("Remove", "remove-track:" + t.id, "ghost") +
                "</div>"
              : "") +
            "</li>",
        )
        .join("") +
      "</ol>" +
      (dm()
        ? '<form data-audio-add class="vtt-resource-form"><h4>Add a track or sound effect</h4>' +
          field("Title", input("title", "", 'required maxlength="120"')) +
          field(
            "Library audio",
            select(
              "assetId",
              [
                ["", "Use a link instead"],
                ...assets("audio").map((a) => [a.id, a.label || "Audio"]),
              ],
              "",
            ),
          ) +
          field(
            "YouTube link or direct HTTPS audio URL",
            input("url", "", 'type="url" placeholder="https://youtube.com/watch?v=… or https://…/track.mp3"'),
          ) +
          '<button type="submit" class="btn">Add track</button><p class="hint">YouTube videos open in a visible player beside the map. Use Open separate player to keep listening while using settings or other tabs in the main window; allow pop-ups if asked. Other links must point directly to playable audio. Crossfade and SFX apply to audio files only. Some videos cannot be embedded; each listener may need to press Play.</p></form>'
        : '<p class="hint">Your DM controls the playlist. Your volume and mute affect only this device.</p>')
    );
  }
  function settingsPanel() {
    return (
      '<h3>Your preferences</h3><p class="hint">' +
      (cloud() ? "Saved to your account." : "Saved on this device.") +
      '</p><form data-preferences class="vtt-resource-form"><div class="vtt-resource-form-grid">' +
      field(
        "Theme",
        select(
          "theme",
          [
            ["dark", "Dark"],
            ["light", "Light"],
          ],
          prefs.theme,
        ),
      ) +
      field(
        "Interface size",
        select(
          "scale",
          [
            [0.85, "Compact"],
            [1, "Default"],
            [1.2, "Large"],
          ],
          prefs.scale,
        ),
      ) +
      field(
        "Default map zoom",
        select(
          "zoom",
          [
            [0.5, "50%"],
            [0.65, "65%"],
            [1, "100%"],
            [1.5, "150%"],
          ],
          prefs.zoom,
        ),
      ) +
      "</div>" +
      [
        ["animations", "Animations"],
        ["sound", "Sound effects"],
        ["snap", "Snap token movement to the grid"],
      ]
        .map(
          ([k, t]) =>
            '<label class="vtt-resource-check"><input type="checkbox" name="' +
            k +
            '" ' +
            (prefs[k] ? "checked" : "") +
            ">" +
            t +
            "</label>",
        )
        .join("") +
      '<button class="btn" type="submit">Save preferences</button><p class="hint">Ruler measurements always snap. Map visibility and scene settings remain under DM control.</p></form>'
    );
  }
  function trashPanel() {
    const rows = snapshot.trash || [],
      old = snapshot.assets.filter((a) => a.deleted_at);
    return (
      '<h3>Recently deleted</h3><p class="hint">Restore documents, pins, playlists, and assets for 30 days. Trashed files still count toward storage usage.</p><div class="vtt-resource-list">' +
      rows
        .map(
          (r) =>
            '<div class="vtt-resource-trash"><span>' +
            E(r.title) +
            "<small>" +
            E(r.kind) +
            "</small></span>" +
            btn("Restore", "restore:" + r.id) +
            "</div>",
        )
        .join("") +
      old
        .map(
          (a) =>
            '<div class="vtt-resource-trash"><span>' +
            E(a.label || "Asset") +
            "<small>" +
            bytes(a.byte_size) +
            "</small></span>" +
            btn("Restore", "restore-asset:" + a.id) +
            "</div>",
        )
        .join("") +
      "</div>" +
      (rows.length || old.length
        ? ""
        : '<p class="vtt-resource-empty">Trash is empty.</p>')
    );
  }
  async function action(a) {
    if (a === "close") {
      close();
      return;
    }
    if (a === "back" || a === "cancel-edit") {
      editing = null;
      refreshPending = false;
      render();
      return;
    }
    if (a === "new-doc") {
      editing = { kind: tab, payload: {}, audience: "dm" };
      render();
      return;
    }
    const r = editing?.view
      ? records().find((x) => x.id === editing.view)
      : null;
    if (a === "edit-doc" && r) {
      editing = clone(r);
      render();
      return;
    }
    if (a === "trash-doc" && r) {
      if (confirm("Move “" + r.title + "” to trash?")) {
        await mutate("trash", { id: r.id, expected: r.revision });
        editing = null;
        render();
      }
      return;
    }
    if (a === "reveal-doc" && r) {
      await saveRecord({ ...r, audience: "all", recipients: [] });
      editing = { view: r.id };
      render();
      return;
    }
    if (a === "pin-doc" && r) {
      armed = {
        title: r.title,
        documentId: r.id,
        audience: r.audience,
        recipients: r.recipients,
      };
      close();
      api().notify(
        "Tap the map to place “" + r.title + "”. Press Escape to cancel.",
      );
      return;
    }
    if (a.startsWith("restore:")) {
      const r = snapshot.trash.find((x) => x.id === a.slice(8));
      await mutate("restore", { id: r.id, expected: r.revision });
      return;
    }
    if (a.startsWith("restore-asset:")) {
      await mutate("asset_trash", { id: a.slice(14), restore: true });
      return;
    }
    if (a === "popout-audio") {
      if (!window.ForgeVTTYouTube.openSeparate()) {setStatus("Allow pop-ups for this site, then click Open separate player again.");return;}
      enabled=true;close();await syncAudio(true);return;
    }
    if (a === "enable-audio") {
      enabled = true;
      if (C.youtube(records("audio")[0]?.payload.tracks.find(t=>t.id===records("audio")[0]?.payload.currentId)?.url)) close();
      await syncAudio(true);
      render();
      return;
    }
    if (
      ["play", "pause", "stop", "next"].includes(a) ||
      /^(track|sfx|up|remove-track):/.test(a)
    ) {
      await audioAction(a);
      return;
    }
  }
  function saveRecord(r) {
    return mutate("save", {
      id: r.id || uuid(),
      kind: r.kind,
      title: r.title,
      audience: r.audience || "dm",
      recipients: r.recipients || [],
      expected: r.revision || 0,
      payload: r.payload,
    });
  }
  function bindPanel() {
    window.ForgeVTTMonsters?.bind(dialog, monsterContext());
    const form = dialog.querySelector("[data-resource-form]");
    if (form) {
      bindPicture(form);
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (busy) return;
        busy = true;
        try {
          const f = new FormData(form),
            r = editing;
          if (!dm())
            await mutate("journal", {
              id: r.id,
              expected: r.revision,
              text: f.get("text"),
            });
          else {
            const payload = {
              text: f.get("text"),
              shared: r.kind === "journal" && f.get("shared") === "on",
              tokenIds: f.getAll("tokenIds"),
            };
            if (f.get("imageAssetId"))
              payload.imageAssetId = f.get("imageAssetId");
            await saveRecord({
              ...r,
              title: f.get("title"),
              audience: f.get("audience"),
              recipients: f.getAll("recipients"),
              payload,
            });
          }
          editing = null;
          refreshPending = false;
          render();
          setStatus("Saved.");
        } catch (e) {
          fail(e);
        } finally {
          busy = false;
        }
      };
      form.querySelectorAll("[data-format]").forEach(
        (b) =>
          (b.onclick = () => {
            const el = form.elements.text,
              a = el.selectionStart,
              z = el.selectionEnd,
              text = el.value.slice(a, z) || "text",
              mark = b.dataset.format,
              insert =
                mark === "bold"
                  ? "**" + text + "**"
                  : mark === "italic"
                    ? "*" + text + "*"
                    : mark === "heading"
                      ? "\n## " + text
                      : mark === "list"
                        ? "\n- " + text
                        : "[" + text + "](https://example.com)";
            el.setRangeText(insert, a, z, "select");
            el.focus();
          }),
      );
    }
    const uploadEl = dialog.querySelector("[data-asset-upload]");
    if (uploadEl) uploadEl.onchange = (e) => upload(e.target.files).catch(fail);
    const filters = dialog.querySelector(".vtt-resource-filters");
    if (filters) {
      const filter = () => {
        const term = filters.querySelector("[name=search]").value.toLowerCase(),
          type = filters.querySelector("[name=assetType]").value,
          folder = filters.querySelector("[name=folder]").value,
          rows = assets(type).filter(
            (a) =>
              (!folder || folder === a.folder) &&
              [a.label, a.folder, ...(a.tags || [])]
                .join(" ")
                .toLowerCase()
                .includes(term),
          );
        dialog.querySelector("[data-asset-grid]").innerHTML = assetCards(rows);
        bindAssetCards();
        loadImages();
      };
      filters.oninput = filter;
      filters.onchange = filter;
      bindAssetCards();
    }
    const add = dialog.querySelector("[data-audio-add]");
    if (add)
      add.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const f = new FormData(add),
            rawURL = C.https(f.get("url")),
            videoId = C.youtube(rawURL),
            url = videoId ? "https://www.youtube.com/watch?v=" + videoId : rawURL,
            assetId = f.get("assetId");
          if (!assetId && !url)
            throw Error("Choose library audio or enter a YouTube/direct HTTPS link.");
          if (!assetId && /(?:youtube\.com|youtu\.be)/i.test(rawURL) && !videoId) throw Error("Paste a YouTube video link, not a channel or playlist link.");
          const r = audioState();
          r.payload.tracks.push({
            id: uuid(),
            title: f.get("title"),
            ...(assetId ? { assetId } : { url }),
          });
          await saveRecord(r);
          setStatus("Track added.");
        } catch (e) {
          fail(e);
        }
      };
    const pref = dialog.querySelector("[data-preferences]");
    if (pref)
      pref.onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(pref);
        setPrefs({
          theme: f.get("theme"),
          scale: Number(f.get("scale")),
          zoom: Number(f.get("zoom")),
          animations: f.has("animations"),
          sound: f.has("sound"),
          snap: f.has("snap"),
        });
        setStatus("Preferences saved.");
      };
    const volume = dialog.querySelector("[data-personal-volume]");
    if (volume)
      volume.oninput = (e) => setPrefs({ volume: Number(e.target.value) });
    const mute = dialog.querySelector("[data-personal-mute]");
    if (mute) mute.onchange = (e) => setPrefs({ muted: e.target.checked });
    for (const [selector, key] of [
      ["[data-shared-volume]", "volume"],
      ["[data-crossfade]", "crossfade"],
      ["[data-loop]", "loop"],
    ]) {
      const el = dialog.querySelector(selector);
      if (el)
        el.onchange = async () => {
          try {
            const r = audioState();
            r.payload[key] = key === "loop" ? el.checked : Number(el.value);
            await saveRecord(r);
          } catch (e) {
            fail(e);
          }
        };
    }
  }
  function loadImages() {
    dialog?.querySelectorAll("[data-resource-image]").forEach((img) => {
      const gen = epoch;
      assetURL(img.dataset.resourceImage)
        .then((url) => {
          if (gen === epoch && img.isConnected) img.src = url;
        })
        .catch(() => {});
    });
  }
  function bindAssetCards() {
    dialog.querySelectorAll("[data-asset]").forEach((b) => {
      b.onclick = () => editAsset(b.dataset.asset);
      b.ondragstart = (e) => {
        e.dataTransfer.setData("application/x-forge-asset", b.dataset.asset);
        e.dataTransfer.effectAllowed = "copy";
        dialog.close();
      };
      b.ondragend = () => {
        if (dialog && !dialog.open) dialog.showModal();
      };
    });
  }
  function editAsset(id) {
    const a = snapshot.assets.find((x) => x.id === id);
    if (!a) return;
    editing = { asset: id };
    dialog.querySelector(".vtt-resource-body").innerHTML =
      '<form data-asset-form class="vtt-resource-form"><div class="vtt-resource-heading"><h3>Asset details</h3>' +
      btn("Back", "back") +
      "</div>" +
      field("Name", input("label", a.label, 'maxlength="200"')) +
      '<div class="vtt-resource-form-grid">' +
      field(
        "Folder",
        input(
          "folder",
          a.folder,
          'maxlength="120" placeholder="Maps / Dungeon"',
        ),
      ) +
      field(
        "Tags · comma separated",
        input("tags", (a.tags || []).join(", "), 'maxlength="800"'),
      ) +
      '</div><button type="submit" class="btn">Save details</button><div class="vtt-resource-actions">' +
      (a.mime_type.startsWith("image/")
        ? btn("Use as map", "use-map") +
          btn("Use for selected token", "use-token", "ghost")
        : "") +
      btn("Move to trash", "trash-asset", "ghost") +
      "</div></form>";
    dialog.querySelector("[data-resource-action=back]").onclick = () => {
      editing = null;
      render();
    };
    dialog.querySelector("[data-asset-form]").onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await mutate("asset", {
          id,
          label: f.get("label"),
          folder: f.get("folder"),
          tags: String(f.get("tags"))
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 20),
        });
        editing = null;
        render();
      } catch (e) {
        fail(e);
      }
    };
    dialog.querySelectorAll("[data-resource-action]").forEach((b) => {
      if (b.dataset.resourceAction === "back") return;
      b.onclick = async () => {
        try {
          if (b.dataset.resourceAction === "trash-asset") {
            if (
              !confirm(
                "Move this file to trash? Maps, portraits, or documents using it will lose the image until it is restored.",
              )
            )
              return;
            await mutate("asset_trash", { id });
            editing = null;
            render();
          } else {
            await useAsset(a, b.dataset.resourceAction === "use-map");
            close();
          }
        } catch (e) {
          fail(e);
        }
      };
    });
  }
  async function useAsset(a, map = false, point = null) {
    const state = q();
    if (!state?.dm) return;
    const gen = epoch,
      sceneId = state.scene.id,
      token = state.scene.tokens.find((t) => state.selection.has(t.id));
    if (!map && !point && !token) throw Error("Select a token first.");
    const url = await dataURL(await assetURL(a.id));
    if (
      gen !== epoch ||
      q()?.scene.id !== sceneId ||
      (!map &&
        !point &&
        q()?.scene.tokens.find((t) => q().selection.has(t.id))?.id !==
          token?.id)
    )
      throw Error("Scene changed. Try again.");
    window.ForgeVTTCloud?.rememberAsset?.(a.id, url);
    api().change(() => {
      if (map) {
        state.scene.map = url;
        state.scene._mapAssetId = a.id;
      } else if (point) {
        state.scene.tokens.push({
          id: uuid(),
          name: (a.label || "Token").slice(0, 60),
          x: Math.max(
            0,
            Math.min(
              state.scene.width - state.scene.grid,
              Math.round(point.x / state.scene.grid) * state.scene.grid,
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              state.scene.height - state.scene.grid,
              Math.round(point.y / state.scene.grid) * state.scene.grid,
            ),
          ),
          size: 1,
          image: url,
          _imageAssetId: a.id,
          color: "#b7a4ff",
          hp: 10,
          maxHp: 10,
          rotation: 0,
          hidden: false,
          meta: { layer: "tokens" },
        });
      } else {
        token.image = url;
        token._imageAssetId = a.id;
      }
    });
  }
  function dropAsset(e) {
    const id = e.dataTransfer.getData("application/x-forge-asset");
    if (!id) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const a = snapshot.assets.find((a) => a.id === id),
      r = q().root.querySelector(".vtt-world").getBoundingClientRect();
    if (a && dm())
      useAsset(a, false, {
        x: (e.clientX - r.left) / q().zoom,
        y: (e.clientY - r.top) / q().zoom,
      }).catch(fail);
  }
  function pins() {
    const state = q(),
      world = state?.root?.querySelector(".vtt-world");
    if (!world) return;
    let layer = world.querySelector(".vtt-resource-pins");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "vtt-resource-pins";
      world.append(layer);
    }
    layer.innerHTML = records("pin")
      .filter((r) => r.payload.sceneId === state.scene.id)
      .map(
        (r) =>
          '<button type="button" class="vtt-resource-pin" data-pin="' +
          r.id +
          '" style="left:' +
          Number(r.payload.x) * state.zoom +
          "px;top:" +
          Number(r.payload.y) * state.zoom +
          'px" aria-label="' +
          E(r.title) +
          '" title="' +
          E(r.title) +
          '">◆<span>' +
          E(r.title) +
          "</span></button>",
      )
      .join("");
    layer.querySelectorAll("[data-pin]").forEach((b) => {
      b.onpointerdown = (e) => e.stopPropagation();
      b.onclick = (e) => {
        e.stopPropagation();
        const r = records("pin").find((x) => x.id === b.dataset.pin);
        if (!r) return;
        if (r.payload.documentId) open("handout", r.payload.documentId);
        else api().notify(r.title);
        if (dm()) {
          const old = dialog?.querySelector(".vtt-resource-pin-tools");
          old?.remove();
          if (!dialog) open("handout");
          const d = document.createElement("div");
          d.className = "vtt-resource-pin-tools";
          d.innerHTML =
            "<span>Map pin: " +
            E(r.title) +
            "</span>" +
            btn("Delete pin", "delete-pin", "ghost");
          d.querySelector("button").onclick = async () => {
            try {
              if (confirm("Delete this map pin?")) {
                await mutate("trash", { id: r.id, expected: r.revision });
                d.remove();
              }
            } catch (e) {
              fail(e);
            }
          };
          dialog.querySelector(".vtt-resource-body").append(d);
        }
      };
    });
  }
  async function placePin(e) {
    if (!armed || e.button !== 0 || !dm()) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const state = q(),
      r = state.root.querySelector(".vtt-world").getBoundingClientRect(),
      data = armed;
    armed = null;
    try {
      await saveRecord({
        kind: "pin",
        title: data.title,
        audience: data.audience,
        recipients: data.recipients,
        payload: {
          sceneId: state.scene.id,
          x: Math.max(
            0,
            Math.min(state.scene.width, (e.clientX - r.left) / state.zoom),
          ),
          y: Math.max(
            0,
            Math.min(state.scene.height, (e.clientY - r.top) / state.zoom),
          ),
          documentId: data.documentId,
        },
      });
      api().notify("Map pin placed.");
    } catch (e) {
      fail(e);
    }
  }
  function audioState() {
    const old = records("audio")[0];
    const r = old
      ? clone(old)
      : {
          id: uuid(),
          kind: "audio",
          title: "Campaign playlist",
          audience: "all",
          payload: {
            tracks: [],
            status: "stopped",
            position: 0,
            volume: 0.7,
            crossfade: 2,
            loop: false,
          },
        };
    r.payload.position = C.position(
      r.payload,
      Date.now() + offset,
      C.youtube(r.payload.tracks.find(t=>t.id===r.payload.currentId)?.url) ? window.ForgeVTTYouTube?.duration() : main.duration,
    );
    return r;
  }
  async function audioAction(a) {
    if (!dm()) return;
    const r = audioState(),
      p = r.payload,
      tracks = p.tracks;
    if (a === "play") {
      if (!tracks.length) throw Error("Add a track first.");
      p.currentId ||= tracks[0].id;
      p.status = "playing";
    } else if (a === "pause") p.status = "paused";
    else if (a === "stop") {
      p.status = "stopped";
      p.position = 0;
    } else if (a === "next") {
      p.currentId =
        tracks[
          (Math.max(
            0,
            tracks.findIndex((t) => t.id === p.currentId),
          ) +
            1) %
            tracks.length
        ]?.id;
      p.position = 0;
      if (p.currentId) p.status = "playing";
    } else {
      const [kind, id] = a.split(":"),
        index = tracks.findIndex((t) => t.id === id);
      if (index < 0) return;
      if (kind === "track") {
        p.currentId = id;
        p.position = 0;
        p.status = "playing";
      }
      if (kind === "sfx")
        p.sfx = { trackId: id, nonce: uuid(), at: Date.now() + offset };
      if (kind === "up" && index > 0)
        [tracks[index - 1], tracks[index]] = [tracks[index], tracks[index - 1]];
      if (kind === "remove-track") {
        tracks.splice(index, 1);
        if (p.currentId === id) {
          p.currentId = tracks[0]?.id || null;
          p.position = 0;
          p.status = "stopped";
        }
        if (p.sfx?.trackId === id) delete p.sfx;
      }
    }
    if (p.status === "playing" && C.youtube(p.tracks.find(t=>t.id===p.currentId)?.url)) close();
    await saveRecord(r);
  }
  function playSfx(p, generation) {
    const fx = p.sfx;
    if (!enabled || !fx || fx.nonce === sfxSeen) return;
    sfxSeen = fx.nonce;
    if (!prefs.sound || Math.abs(Date.now() + offset - fx.at) >= 5000) return;
    const t = p.tracks.find((t) => t.id === fx.trackId);
    if (!t || C.youtube(t.url)) return;
    Promise.resolve(t.assetId ? assetURL(t.assetId) : C.https(t.url))
      .then(async (url) => {
        if (generation !== epoch || !url) return;
        const a = new Audio(url);
        a.volume = prefs.muted ? 0 : prefs.volume;
        players.add(a);
        a.onended = a.onerror = () => players.delete(a);
        await a.play();
      })
      .catch(() => setStatus("Tap Enable audio to allow sound effects."));
  }
  function applyVolume() {
    const v =
      enabled && !prefs.muted
        ? prefs.volume * (audioRecord?.payload.volume ?? 0.7)
        : 0;
    window.ForgeVTTYouTube?.volume(v, prefs.muted);
    main.volume = v;
    if (fading) fading.volume = v;
    for (const a of players)
      a.volume = prefs.muted || !prefs.sound ? 0 : prefs.volume;
  }
  function stopAudio() {
    window.ForgeVTTYouTube?.stop();
    mediaEpoch++;
    clearInterval(timer);
    timer = null;
    main.pause();
    main.removeAttribute("src");
    main.load();
    if (fading) {
      fading.pause();
      fading.removeAttribute("src");
      fading.load();
      fading = null;
    }
    for (const a of players) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    players.clear();
  }
  async function syncAudio(force = false) {
    const r = records("audio")[0];
    audioRecord = r;
    if (!r) {
      stopAudio();
      currentTrack = "";
      return;
    }
    const p = r.payload,
      track = p.tracks.find((t) => t.id === p.currentId);
    if (!enabled) return;
    const youtubeId=C.youtube(track?.url);
    if(youtubeId){
      if(timer&&currentTrack){clearInterval(timer);timer=null;}
      mediaEpoch++;main.pause();if(fading){fading.pause();fading=null;}currentTrack='';
      for(const a of players)a.pause();players.clear();
      await window.ForgeVTTYouTube.sync({id:youtubeId,key:track.id,revision:p.startedAt,title:track.title,status:p.status,loop:!!p.loop,volume:prefs.volume*p.volume,muted:prefs.muted,
        position:()=>C.position(audioRecord.payload,Date.now()+offset,window.ForgeVTTYouTube.duration()),
        controls:()=>open('audio'),dismiss:()=>{enabled=false;api()?.notify('YouTube stopped on this device. Open Audio and enable it to listen again.');},
        ended:()=>{if(dm()&&audioRecord?.payload.status==='playing')audioAction('next').catch(fail);}
      },force);
      if(!timer)timer=setInterval(()=>{if(enabled&&C.youtube(audioRecord?.payload.tracks.find(t=>t.id===audioRecord.payload.currentId)?.url))syncAudio().catch(fail);},2000);
      return;
    }
    window.ForgeVTTYouTube?.stop();
    if(timer){clearInterval(timer);timer=null;}
    playSfx(p, epoch);
    if (!track || p.status === "stopped") {
      main.pause();
      if (p.status === "stopped" && Number.isFinite(main.duration))
        main.currentTime = 0;
      return;
    }
    const id = track.id + ":" + (track.assetId || track.url),
      generation = epoch;
    if (id !== currentTrack || (force && !main.src)) {
      const gen = ++mediaEpoch;
      try {
        const url = track.assetId
          ? await assetURL(track.assetId)
          : C.https(track.url);
        if (!url || gen !== mediaEpoch || generation !== epoch) return;
        const old = main;
        main = new Audio(url);
        main.preload = "auto";
        currentTrack = id;
        main.loop = !!p.loop;
        main.onloadedmetadata = () => {
          if (generation === epoch && main.src === url) {
            main.currentTime = C.position(
              audioRecord.payload,
              Date.now() + offset,
              main.duration,
            );
          }
        };
        main.onended = () => {
          if (
            dm() &&
            !audioRecord?.payload.loop &&
            audioRecord?.payload.status === "playing"
          )
            audioAction("next").catch(fail);
        };
        main.onerror = () => {
          const el = dialog?.querySelector("[data-audio-status]");
          if (el)
            el.textContent =
              "This track could not play. Check its format or direct URL.";
        };
        const duration = Number(p.crossfade) || 0;
        if (duration && p.status === "playing" && !old.paused) {
          fading = old;
          main.volume = 0;
          await main.play();
          const start = performance.now();
          const fade = () => {
            if (gen !== mediaEpoch) {
              old.pause();
              return;
            }
            const ratio = Math.min(
                1,
                (performance.now() - start) / (duration * 1000),
              ),
              v = prefs.muted
                ? 0
                : prefs.volume * (audioRecord.payload.volume ?? 0.7);
            main.volume = v * ratio;
            old.volume = v * (1 - ratio);
            if (ratio < 1) requestAnimationFrame(fade);
            else {
              old.pause();
              old.removeAttribute("src");
              old.load();
              if (fading === old) fading = null;
            }
          };
          requestAnimationFrame(fade);
        } else {
          old.pause();
          old.removeAttribute("src");
          old.load();
        }
      } catch (e) {
        currentTrack = "";
        fail(Error("Audio needs a tap to play, or the file could not load."));
        return;
      }
    }
    main.loop = !!p.loop;
    applyVolume();
    if (p.status === "playing") {
      try {
        await main.play();
      } catch {
        setStatus("Tap Enable audio to allow playback.");
      }
    } else main.pause();
    if (!timer)
      timer = setInterval(() => {
        const p = audioRecord?.payload;
        if (!p || !enabled) return;
        if (Number.isFinite(main.duration) && main.readyState >= 1) {
          const target = C.position(p, Date.now() + offset, main.duration);
          if (Math.abs(main.currentTime - target) > 1.5)
            try {
              main.currentTime = target;
            } catch {}
        }
      }, 2000);
  }
  function setPrefs(patch) {
    prefs = C.preferences({ ...prefs, ...patch });
    try {
      localStorage.setItem(
        "forge-vtt-prefs:" + account(),
        JSON.stringify(prefs),
      );
    } catch {}
    applyPreferences();
    clearTimeout(prefTimer);
    if (cloud()) {
      const saved = clone(prefs);
      prefTimer = setTimeout(
        () => mutate("preferences", { payload: saved }).catch(fail),
        500,
      );
    }
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && armed) {
      armed = null;
      api()?.notify("Pin placement canceled.");
    }
  });
  const observer = new MutationObserver(() => {
    if (key && !q()?.game) {
      reset();
      key = "";
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  async function backup(game) {
    if (!game?._cloud) return game;
    const generation=epoch;
    await pull(game.id);
    const out=clone(game), rows=clone(snapshot.records), ids=new Set();
    for(const r of rows){if(r.payload.imageAssetId)ids.add(r.payload.imageAssetId);for(const t of r.payload.tracks||[])if(t.assetId)ids.add(t.assetId)}
    // The DM can back up the whole library; players export only resources currently shared with them.
    const files=clone(snapshot.assets.filter(a=>!a.deleted_at));for(const id of ids)if(!files.some(a=>a.id===id))files.push({id,label:'Shared media',folder:'',tags:[]});
    for(const a of files){const blob=await(await fetch(await assetURL(a.id))).blob();a.data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)});a.mime_type=blob.type;a.byte_size=blob.size;if(generation!==epoch)throw Error('Campaign changed during backup.')}
    out.resources={records:rows,assets:files};return out;
  }
  window.ForgeVTTResources = {
    async importCopy(resources, campaignId) {
      const client = window.ForgeVTTCloud.client(), user = account(), cfg = window.FORGE_CLOUD_CONFIG;
      const session = (await client.auth.getSession()).data.session;
      if (!session) throw Error("Sign in before copying campaign resources.");
      const check = () => { if (account() !== user) throw Error("Account changed during resource import."); };
      const call = async (action, payload) => {
        check();
        const result = await client.rpc("forge_vtt_resources_api", {p_action:action,p_payload:{campaignId,...payload}});
        if (result.error) throw Error(result.error.message);
        check();
      };
      const ids = new Map();
      for (const a of resources.assets) {
        check();
        if (a.deleted_at) continue;
        if (!a.data) throw Error("A backup asset is missing its file. The original tabletop is kept.");
        const blob = await (await fetch(a.data)).blob();
        const response = await fetch(cfg.supabaseUrl+"/functions/v1/vtt-media?campaignId="+encodeURIComponent(campaignId), {
          method:"POST",headers:{Authorization:"Bearer "+session.access_token,apikey:cfg.publishableKey,"Content-Type":blob.type},body:blob,cache:"no-store"
        });
        const result = await response.json();
        if (!response.ok || !result.assetId) throw Error(result.error || "Resource upload failed. The original tabletop is kept.");
        ids.set(a.id,result.assetId);
        await call("asset",{id:result.assetId,label:a.label||"Imported asset",folder:a.folder||"",tags:a.tags||[]});
      }
      // Documents precede their map pins, which reference the document IDs.
      for (const r of [...resources.records].sort((a,b)=>Number(a.kind==="pin")-Number(b.kind==="pin"))) {
        if (r.deleted_at) continue;
        const payload = clone(r.payload);
        if (payload.imageAssetId) payload.imageAssetId=ids.get(payload.imageAssetId)||null;
        for (const t of payload.tracks||[]) if(t.assetId)t.assetId=ids.get(t.assetId)||null;
        await call("save",{id:r.id,kind:r.kind,title:r.title,expected:0,audience:"dm",recipients:[],payload});
      }
    },
    backup,
    mount,
    open,
    pins,
    tokenMenu(menu, tokens) {
      if (tokens.length !== 1) return;
      const rows = records().filter(
        (r) =>
          ["handout", "journal"].includes(r.kind) &&
          r.payload.tokenIds?.includes(tokens[0].id),
      );
      if (!rows.length) return;
      const b = document.createElement("button");
      b.textContent = "Linked handouts (" + rows.length + ")";
      b.onclick = () => open(rows[0].kind, rows[0].id);
      menu.querySelector("div")?.append(b);
    },
    preference: (k) => prefs[k],
    stop: () => {
      reset();
      key = "";
    },
    linked(tokenId) {
      const rows = records().filter(
        (r) =>
          ["handout", "journal"].includes(r.kind) &&
          r.payload.tokenIds?.includes(tokenId),
      );
      if (rows.length) open(rows[0].kind, rows[0].id);
    },
  };
  const state = q();
  if (state?.root && state.game) mount(state.root);
})();
