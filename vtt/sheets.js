/* Phase 6 adapters use the existing Character Forge schema and catalog, never a second copy. */
(() => {
  "use strict";
  const E = (s) =>
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
    play = () => window.ForgeVTTPlay;
  const characters = () =>
      typeof chars === "undefined"
        ? []
        : chars.filter((c) => !c.deleted_at && !c.buried && !c.inGraveyard),
    ab = ["str", "dex", "con", "int", "wis", "cha"],
    sign = (n) => (n >= 0 ? "+" : "") + n;
  let busy = false,
    session = "",
    base = new Map(),
    conflicts = new Set();
  function projection(c) {
    const cond = sheetConditionState(c);
    return {
      hp: Math.max(0, Math.min(maxHP(c), c.hp ?? maxHP(c))),
      maxHp: maxHP(c),
      tempHp: c.tempHp || 0,
      image: c.avatar || "",
      ac: armorClass(c),
      speed: (raceOf(c)?.speed || 30) + adjustment(c, "speed"),
      conditions: [
        ...cond.active.map(
          (x) => SHEET_CONDITIONS.find((r) => r[0] === x)?.[1] || x,
        ),
        ...(cond.concentrating ? ["Concentrating"] : []),
      ],
      stats: Object.fromEntries([
        ...ab.map((a) => [a.toUpperCase(), mod(c, a)]),
        ["PROF", proficiency(c)],
      ]),
    };
  }
  function tokenProjection(t) {
    return {
      hp: t.hp,
      maxHp: t.maxHp,
      tempHp: t.details?.tempHp || 0,
      image: t.image || "",
      ac: t.details?.ac,
      speed: t.details?.speed,
      conditions: t.meta?.conditions || [],
      stats: Object.fromEntries([
        ...ab.map((a) => [
          a.toUpperCase(),
          t.details?.stats?.[a.toUpperCase()],
        ]),
        ["PROF", t.details?.stats?.PROF],
      ]),
    };
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function toToken(c, t) {
    const p = projection(c);
    Object.assign(t, { hp: p.hp, maxHp: p.maxHp, image: p.image });
    t.meta = { ...t.meta, conditions: p.conditions };
    t.details = {
      ...t.details,
      ac: p.ac,
      tempHp: p.tempHp,
      speed: p.speed,
      initiative: initiative(c),
      stats: { ...t.details?.stats, ...p.stats },
    };
  }
  function toCharacter(t, c) {
    const old = projection(c);
    c.hp = t.hp;
    c.tempHp = t.details?.tempHp || 0;
    if (t.image !== old.image) c.avatar = t.image;
    if (c.manual?.acMode === "manual")
      c.manual.acValue = Number(t.details?.ac ?? old.ac);
    else
      c.acBonus =
        (Number(c.acBonus) || 0) + (Number(t.details?.ac ?? old.ac) - old.ac);
    c.manual = {
      ...c.manual,
      hpMods: [
        ...(c.manual?.hpMods || []).filter((x) => x.id !== "vtt-sync"),
        {
          id: "vtt-sync",
          value:
            (c.manual?.hpMods || []).find((x) => x.id === "vtt-sync")?.value +
              (t.maxHp - old.maxHp) || t.maxHp - old.maxHp,
          perLevel: false,
        },
      ],
      speed:
        (Number(c.manual?.speed) || 0) +
        (Number(t.details?.speed ?? old.speed) - old.speed),
    };
    const cond = sheetConditionState(c);
    cond.active = (t.meta?.conditions || [])
      .filter((x) => x !== "Concentrating")
      .map((x) => SHEET_CONDITIONS.find((r) => r[1] === x)?.[0] || x);
    cond.concentrating = (t.meta?.conditions || []).includes("Concentrating");
  }
  async function saveCharacter(c) {
    c.hp = Math.max(0, Math.min(maxHP(c), c.hp ?? maxHP(c)));
    const i = chars.findIndex((x) => x.id === c.id);
    if (i < 0) throw Error("Character no longer available");
    if(chars[i]!==c)throw Error("This character updated elsewhere. Close and reopen the tabletop sheet before saving.");
    chars[i] = c;
    await storeSet("forge-chars", chars);
  }
  async function synchronize() {
    if (busy || !q()?.game || q().interacting) return;
    const user = window.ForgeCloud?.partyConnection()?.user?.id || "guest",
      key = user + ":" + q().game.id;
    if (key !== session) {
      session = key;
      base.clear();
      conflicts.clear();
    }
    busy = true;
    try {
      for (const t of q().game.scenes.flatMap((s) => s.tokens)) {
        const c = characters().find((c) => c.id === t.details?.characterId);
        if (!c || (q().game._cloud && !t._canEdit && !q().dm)) continue;
        const p = projection(c),
          tp = tokenProjection(t),
          prior = base.get(t.id);
        if (!prior) {
          if (t.details?.ac === undefined) api().change(() => toToken(c, t));
          else if (!same(p, tp)) {
            conflicts.add(t.id);
            api().notify(
              "Linked sheet and token differ. Open Character sheet to choose the current copy.",
            );
          }
          base.set(t.id, { sheet: projection(c), token: tokenProjection(t) });
          continue;
        }
        const sc = !same(p, prior.sheet),
          tc = !same(tp, prior.token);
        if (sc && tc && !same(p, tp)) {
          conflicts.add(t.id);
          api().notify(
            "Linked sheet changed in both places. Open Character sheet to choose which copy to use.",
          );
          continue;
        }
        if (sc) {
          api().change(() => toToken(c, t));
        } else if (tc) {
          toCharacter(t, c);
          await saveCharacter(c);
          if (!same(projection(c), tokenProjection(t)))
            api().change(() => toToken(c, t));
        }
        base.set(t.id, { sheet: projection(c), token: tokenProjection(t) });
      }
    } catch (e) {
      api().notify(e.message);
    } finally {
      busy = false;
    }
  }
  function dialog(title) {
    const d = document.createElement("dialog");
    d.className = "vtt-sheet-dialog";
    d.innerHTML = `<header><h2>${E(title)}</h2><button data-close aria-label="Close character tools">×</button></header><main></main>`;
    document.body.append(d);
    d.querySelector("[data-close]").onclick = () => d.close();
    d.onclose = () => d.remove();
    d.showModal();
    return d;
  }
  function selected() {
    return q().scene.tokens.find((t) => q().selection.has(t.id));
  }
  function openSheet(t = selected()) {
    if (!t) return api().notify("Select a token first.");
    const c = characters().find((c) => c.id === t.details?.characterId);
    if (!c) return link(t);
    const d = dialog(c.name + " · character sheet");
    let tab = "abilities",
      mode = "";
    const refresh = () => {
      const p = projection(c),
        body = d.querySelector("main");
      body.innerHTML = `${conflicts.has(t.id) ? '<section class="vtt-sheet-warning">Both copies changed. <button data-use-sheet>Use sheet</button><button data-use-token>Use token</button></section>' : ""}<div class="vtt-sheet-vitals"><b>Level ${c.level || 1} · ${E(c.klass)} · AC ${p.ac} · Speed ${p.speed} ft</b><label>HP<input data-hp type="number" min="0" max="${p.maxHp}" value="${p.hp}"> / ${p.maxHp}</label><label>Portrait<input data-sheet-portrait type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><label>Roll mode<select data-mode><option value="">Normal</option><option value="adv">Advantage</option><option value="dis">Disadvantage</option></select></label></div><nav>${["abilities", "attacks", "spells", "equipment", "features", "notes", "resources"].map((x) => `<button data-tab="${x}" aria-pressed="${tab === x}">${x}</button>`).join("")}</nav><section data-sheet-body></section><footer><button data-push>Sync sheet → token</button><button data-unlink>Unlink</button></footer>`;
      const set = async (fn) => {
        try {
          t = q()
            .game.scenes.flatMap((s) => s.tokens)
            .find((x) => x.id === t.id);
          if (!t) throw Error("Token is no longer available");
          fn();
          await saveCharacter(c);
          api().change(() => toToken(c, t));
          base.set(t.id, { sheet: projection(c), token: tokenProjection(t) });
          refresh();
        } catch (e) {
          api().notify(e.message);
        }
      };
      body.querySelector("[data-sheet-portrait]").onchange = (e) =>
        api().image(e.target.files[0], (url) => set(() => (c.avatar = url)));
      body.querySelector("[data-mode]").value = mode;
      body.querySelector("[data-mode]").onchange = (e) =>
        (mode = e.target.value);
      body.querySelector("[data-hp]").onchange = (e) =>
        set(
          () => (c.hp = Math.max(0, Math.min(p.maxHp, +e.target.value || 0))),
        );
      body.querySelectorAll("[data-tab]").forEach(
        (b) =>
          (b.onclick = () => {
            tab = b.dataset.tab;
            refresh();
          }),
      );
      body.querySelector("[data-push]").onclick = () => set(() => {});
      body.querySelector("[data-unlink]").onclick = () => {
        api().change(() => {
          delete t.details.characterId;
        });
        base.delete(t.id);
        d.close();
      };
      body.querySelector("[data-use-sheet]")?.addEventListener("click", () => {
        conflicts.delete(t.id);
        set(() => {});
      });
      body.querySelector("[data-use-token]")?.addEventListener("click", () => {
        conflicts.delete(t.id);
        set(() => toCharacter(t, c));
      });
      const el = body.querySelector("[data-sheet-body]");
      const roll = (label, formula) => play().roll(t.id, formula, label, mode);
      if (tab === "abilities") {
        el.innerHTML = `<div class="vtt-sheet-grid">${ab.map((a) => `<article><label>${a.toUpperCase()} base<input data-ability="${a}" type="number" min="1" max="30" value="${c.base?.[a] || 10}"></label><p>Score ${finalScore(c, a)} · ${sign(mod(c, a))}</p><button data-check="${a}">Check</button><button data-save="${a}">Save ${sign(saveBonus(c, a))}</button></article>`).join("")}</div><h3>Skills</h3><div class="vtt-sheet-skills">${SKILLS.map((s) => `<button data-skill="${s.id}">${E(s.name)} ${sign(skillBonus(c, s.id))}</button>`).join("")}</div><button data-init>Roll initiative</button><fieldset><legend>Conditions</legend>${SHEET_CONDITIONS.map((r) => `<label><input type="checkbox" data-condition="${r[0]}" ${sheetConditionState(c).active.includes(r[0]) ? "checked" : ""}>${E(r[1])}</label>`).join("")}<label><input type="checkbox" data-concentration ${sheetConditionState(c).concentrating ? "checked" : ""}>Concentrating</label></fieldset>`;
        el.querySelectorAll("[data-ability]").forEach(
          (n) =>
            (n.onchange = () =>
              set(() => {
                c.base ||= {};
                c.base[n.dataset.ability] = Math.min(
                  30,
                  Math.max(1, +n.value || 10),
                );
              })),
        );
        el.querySelectorAll("[data-check]").forEach(
          (b) =>
            (b.onclick = () =>
              roll(
                b.dataset.check.toUpperCase() + " check",
                "1d20" +
                  sign(
                    mod(c, b.dataset.check) +
                      adjustment(c, "check_" + b.dataset.check) +
                      adjustment(c, "checkAll"),
                  ),
              )),
        );
        el.querySelectorAll("[data-save]").forEach(
          (b) =>
            (b.onclick = () =>
              roll(
                b.dataset.save.toUpperCase() + " save",
                "1d20" + sign(saveBonus(c, b.dataset.save)),
              )),
        );
        el.querySelectorAll("[data-skill]").forEach(
          (b) =>
            (b.onclick = () =>
              roll(
                b.textContent,
                "1d20" + sign(skillBonus(c, b.dataset.skill)),
              )),
        );
        el.querySelector("[data-init]").onclick = () =>
          roll("Initiative", "1d20" + sign(initiative(c)));
        el.querySelectorAll("[data-condition]").forEach(
          (n) =>
            (n.onchange = () =>
              set(() => {
                const s = sheetConditionState(c);
                s.active = n.checked
                  ? [...new Set([...s.active, n.dataset.condition])]
                  : s.active.filter((x) => x !== n.dataset.condition);
              })),
        );
        el.querySelector("[data-concentration]").onchange = (e) =>
          set(() => (sheetConditionState(c).concentrating = e.target.checked));
      }
      if (tab === "attacks") {
        const attacks = [
          ...(c.customAttacks || []),
          ...(c.equipmentItems || [])
            .filter((i) => i.quantity > 0 && i.attack?.enabled)
            .map((i) => equipmentAttackRecord(c, i)),
        ];
        el.innerHTML =
          attacks
            .map(
              (a, i) =>
                `<article><h3>${E(a.name)}</h3><p>${E(a.description || "")} · ${E(a.range || "")}</p><button data-attack="${i}">Attack ${sign(customAttackBonus(c, a))}</button><button data-damage="${i}">Damage ${E(a.damageDice)} ${sign(customAttackDamageBonus(c, a))}</button></article>`,
            )
            .join("") ||
          "<p>Enable attacks on the character’s equipment or add a custom attack on the main sheet.</p>";
        el.querySelectorAll("[data-attack]").forEach(
          (b) =>
            (b.onclick = () => {
              const a = attacks[+b.dataset.attack];
              roll(a.name + " attack", "1d20" + sign(customAttackBonus(c, a)));
            }),
        );
        el.querySelectorAll("[data-damage]").forEach(
          (b) =>
            (b.onclick = () => {
              const a = attacks[+b.dataset.damage];
              roll(
                a.name + " damage",
                a.damageDice +
                  sign(customAttackDamageBonus(c, a)) +
                  (a.damage2Enabled
                    ? ";Extra:" +
                      a.damage2Dice +
                      sign(customAttackDamageBonus(c, a, true))
                    : ""),
              );
            }),
        );
      }
      if (tab === "spells") {
        const entries = [];
        for (const ctx of classContexts(c))
          for (const id of ctx.spells || []) {
            const s = spellById(id);
            if (s) entries.push({ s, ctx });
          }
        if (typeof featSpellGrants === "function")
          for (const grant of featSpellGrants(c)) {
            const s = spellById(grant.spell);
            if (s && !entries.some((e) => e.s.index === s.index))
              entries.push({ s, ctx: c, grant });
          }
        el.innerHTML =
          entries
            .map(({ s, ctx, grant }, i) => {
              const ability = grant?.ability || caster(ctx)?.ability || "int";
              return `<article><h3>${E(s.name)}</h3><p>${E(classOf(ctx)?.name)} · Level ${s.level} · ${E(s.casting_time)} · ${E(s.range)}</p><p>Spell attack ${sign(proficiency(c) + mod(c, ability) + adjustment(c, "magicAttack"))} · Save DC ${8 + proficiency(c) + mod(c, ability) + adjustment(c, "spellDC")}</p><select aria-label="${E(s.name)} casting level" data-spell-level="${i}">${s.level === 0 ? '<option value="0">Cantrip</option>' : ""}${grant ? '<option value="feature">Feature use</option>' : ""}${slots(
                ctx,
              )
                .map((n, lv) =>
                  n && lv + 1 >= s.level
                    ? `<option value="${lv + 1}">Level ${lv + 1} · ${Math.max(0, n - (ctx.spent?.[lv + 1] || 0))} slots</option>`
                    : "",
                )
                .join(
                  "",
                )}</select><button data-cast="${i}">Cast / spend use</button><button data-spell="${i}">Share card</button>${s.attack_type ? `<button data-spell-attack="${i}">Spell attack</button>` : ""}${s.damage ? `<button data-spell-damage="${i}">Damage</button>` : ""}</article>`;
            })
            .join("") ||
          "<p>No learned spells. Manage spell choices on the main sheet.</p>";
        const level = (i) =>
          el.querySelector('[data-spell-level="' + i + '"]').value;
        el.querySelectorAll("[data-spell]").forEach(
          (b) => (b.onclick = () => shareSpell(entries[+b.dataset.spell].s)),
        );
        el.querySelectorAll("[data-cast]").forEach(
          (b) =>
            (b.onclick = () => {
              const i = +b.dataset.cast,
                { s, ctx, grant } = entries[i],
                lv = level(i);
              set(() => {
                if (lv === "feature") {
                  if (!featSpellAvailable(c, grant))
                    throw Error("No feature uses remaining");
                  if (!grant.atWill && !grant.ritual)
                    trackedResourceState(c, grant).current--;
                } else if (s.level > 0) {
                  if (
                    typeof ordinarySpellReady === "function" &&
                    !grant &&
                    !ordinarySpellReady(ctx, s)
                  )
                    throw Error(
                      "Prepare or learn this spell on the character sheet first",
                    );
                  if (!lv || !slotAvailable(ctx, +lv))
                    throw Error("No slots available at that level");
                  ctx.spent ||= {};
                  ctx.spent[lv] = (ctx.spent[lv] || 0) + 1;
                }
                if (s.concentration) {
                  sheetConditionState(c).concentrating = true;
                  sheetConditionState(c).effect = s.name;
                }
              });
            }),
        );
        el.querySelectorAll("[data-spell-attack]").forEach(
          (b) =>
            (b.onclick = () => {
              const { s, ctx, grant } = entries[+b.dataset.spellAttack],
                ability = grant?.ability || caster(ctx)?.ability || "int";
              roll(
                s.name + " attack",
                "1d20" +
                  sign(
                    proficiency(c) +
                      mod(c, ability) +
                      adjustment(c, "magicAttack"),
                  ),
              );
            }),
        );
        el.querySelectorAll("[data-spell-damage]").forEach(
          (b) =>
            (b.onclick = () => {
              const i = +b.dataset.spellDamage,
                { s } = entries[i],
                parts = (Array.isArray(s.damage) ? s.damage : [s.damage])
                  .map((x) => {
                    const table =
                        x.damage_at_character_level ||
                        x.damage_at_slot_level ||
                        {},
                      target = x.damage_at_character_level
                        ? totalLevel(c)
                        : +level(i) || s.level;
                    return Object.entries(table)
                      .filter(([lv]) => +lv <= target)
                      .sort((a, b) => +b[0] - a[0])[0]?.[1];
                  })
                  .filter(Boolean);
              if (parts.length) roll(s.name + " damage", parts.join(";"));
              else
                api().notify(
                  "Share the spell card for its situational damage rules.",
                );
            }),
        );
      }
      if (tab === "equipment") {
        el.innerHTML =
          (c.equipmentItems || [])
            .map(
              (i, n) =>
                `<article><b>${E(i.name)} × ${i.quantity}</b><p>${E(i.notes || "")}</p><label><input data-equipped="${n}" type="checkbox" ${i.equipped ? "checked" : ""}>Equipped</label><label><input data-attack-flag="${n}" type="checkbox" ${i.attack?.enabled ? "checked" : ""}>Attack enabled</label></article>`,
            )
            .join("") || `<p>${E((c.inventory || []).join(", "))}</p>`;
        el.querySelectorAll("[data-equipped]").forEach(
          (n) =>
            (n.onchange = () =>
              set(
                () =>
                  (c.equipmentItems[+n.dataset.equipped].equipped = n.checked),
              )),
        );
        el.querySelectorAll("[data-attack-flag]").forEach(
          (n) =>
            (n.onchange = () =>
              set(() => {
                const i = c.equipmentItems[+n.dataset.attackFlag];
                i.attack = { ...i.attack, enabled: n.checked };
              })),
        );
      }
      if (tab === "features") {
        renderGroupedFeatures(el, c);
        el.querySelectorAll(
          'button[aria-label="Edit character feats"]',
        ).forEach((n) => n.remove());
        el.querySelectorAll("[data-rules-toggle]").forEach(
          (b) =>
            (b.onclick = () => {
              const target = el.querySelector(
                "#" + b.getAttribute("aria-controls"),
              );
              if (target) {
                target.hidden = !target.hidden;
                b.setAttribute("aria-expanded", String(!target.hidden));
              }
            }),
        );
      }
      if (tab === "notes") {
        el.innerHTML = `<label>Notes<textarea data-notes>${E(c.notes || "")}</textarea></label><label>Backstory<textarea data-bio>${E(c.backstory || "")}</textarea></label>`;
        el.querySelector("[data-notes]").onchange = (e) =>
          set(() => (c.notes = e.target.value));
        el.querySelector("[data-bio]").onchange = (e) =>
          set(() => (c.backstory = e.target.value));
      }
      if (tab === "resources") {
        const defs = classResourceDefinitions(c).filter((x) => !x.unlimited);
        el.innerHTML = `<h3>Spell slots</h3>${slots(c)
          .map((n, i) =>
            n
              ? `<label>Level ${i + 1}: ${n} total, spent<input data-slot="${i + 1}" type="number" min="0" max="${n}" value="${c.spent?.[i + 1] || 0}"></label>`
              : "",
          )
          .join(
            "",
          )}<h3>Class resources</h3>${defs.map((r, i) => `<label>${E(r.name)} / ${r.max}<input type="number" min="0" max="${r.max}" data-resource="${i}" value="${trackedResourceState(c, r).current}"></label>`).join("")}<h3>Custom resources</h3>${(c.customResources || []).map((r, i) => `<label>${E(r.name)} / ${r.max}<input type="number" min="0" max="${r.max}" data-custom-resource="${i}" value="${r.current}"></label>`).join("")}<p>Hit dice: ${Math.max(0, (c.level || 1) - (c.hitDiceSpent || 0))} remaining</p><button data-hitdie>Spend a hit die</button><button data-rest="short">Short rest</button><button data-rest="long">Long rest</button>`;
        el.querySelectorAll("[data-slot]").forEach(
          (n) =>
            (n.onchange = () =>
              set(() => {
                c.spent ||= {};
                c.spent[n.dataset.slot] = Math.max(
                  0,
                  Math.min(slots(c)[+n.dataset.slot - 1], +n.value || 0),
                );
              })),
        );
        el.querySelectorAll("[data-resource]").forEach(
          (n) =>
            (n.onchange = () =>
              set(
                () =>
                  (trackedResourceState(c, defs[+n.dataset.resource]).current =
                    Math.max(
                      0,
                      Math.min(defs[+n.dataset.resource].max, +n.value || 0),
                    )),
              )),
        );
        el.querySelectorAll("[data-custom-resource]").forEach(
          (n) =>
            (n.onchange = () =>
              set(() => {
                const r = c.customResources[+n.dataset.customResource];
                r.current = Math.max(0, Math.min(r.max, +n.value || 0));
              })),
        );
        el.querySelector("[data-hitdie]").onclick = () =>
          set(() => {
            if ((c.hitDiceSpent || 0) >= (c.level || 1)) return;
            c.hitDiceSpent = (c.hitDiceSpent || 0) + 1;
            c.hp = Math.min(
              maxHP(c),
              c.hp +
                Math.max(
                  0,
                  window.ForgeVTTDice.roll("1d" + classOf(c).hitDie).total +
                    mod(c, "con"),
                ),
            );
          });
        el.querySelectorAll("[data-rest]").forEach(
          (b) =>
            (b.onclick = () =>
              set(() => {
                const rest = b.dataset.rest;
                resetTrackedResources(c, rest);
                if (rest === "long") {
                  c.hp = maxHP(c);
                  c.deathS = 0;
                  c.deathF = 0;
                  c.spent = {};
                  c.sharedSpent = {};
                  c.arcanumSpent = {};
                  c.hitDiceSpent = Math.max(
                    0,
                    (c.hitDiceSpent || 0) -
                      Math.max(1, Math.floor((c.level || 1) / 2)),
                  );
                }
                if (c.klass === "warlock") c.spent = {};
                for (const mc of c.multiclass || [])
                  if (rest === "long" || mc.klass === "warlock") mc.spent = {};
              })),
        );
      }
    };
    const onFeature = () => {
      if (tab === "features") refresh();
    };
    document.addEventListener("forge-feature-text-saved", onFeature);
    d.addEventListener("close", () =>
      document.removeEventListener("forge-feature-text-saved", onFeature),
    );
    refresh();
  }
  function link(t) {
    if (!q().dm && !t._canEdit)
      return api().notify("You do not control this token.");
    const d = dialog("Link a character");
    d.querySelector("main").innerHTML =
      `<p>Link a character from your account. Its HP, portrait, AC, speed and conditions synchronize while you have the tabletop open.</p><select>${characters()
        .map((c) => `<option value="${E(c.id)}">${E(c.name)}</option>`)
        .join("")}</select><button data-link>Link & sync</button>`;
    d.querySelector("[data-link]").onclick = () => {
      const c = characters().find(
        (c) => c.id === d.querySelector("select").value,
      );
      if (!c) return;
      api().change(() => {
        t.details = { ...t.details, characterId: c.id };
        toToken(c, t);
      });
      base.set(t.id, { sheet: projection(c), token: tokenProjection(t) });
      d.close();
      openSheet(t);
    };
  }
  function shareSpell(s) {
    play().share({
      type: "spell",
      title: s.name,
      text: [s.casting_time, s.range, s.duration, ...(s.desc || [])]
        .join("\n")
        .slice(0, 8000),
      ...(s.source?.startsWith("https://") ? { url: s.source } : {}),
    });
  }
  function catalogText(r) {
    const value = r.desc || r.description || "";
    const lines = [
      r.index ? "Catalog ID: " + r.index : "",
      Array.isArray(value) ? value.join("\n") : String(value),
    ];
    if (r.damage)
      lines.push(
        "Damage: " +
          (r.damage.damage_dice || "") +
          " " +
          (r.damage.damage_type?.name || ""),
      );
    if (r.armor_class)
      lines.push(
        "Armor Class: " + (r.armor_class.base ?? r.armor_class[0]?.value ?? ""),
      );
    if (r.weight !== undefined) lines.push("Weight: " + r.weight + " lb");
    if (r.cost) lines.push("Cost: " + r.cost.quantity + " " + r.cost.unit);
    if (r.properties?.length)
      lines.push(
        "Properties: " + r.properties.map((x) => x.name || x).join(", "),
      );
    if (r.rarity) lines.push("Rarity: " + (r.rarity.name || r.rarity));
    if (r.type && r.hit_points)
      lines.push(r.type + " · HP " + r.hit_points + " · " + r.hit_dice);
    return lines.filter(Boolean).join("\n") || r.name;
  }
  function catalogs() {
    return {
      items:
        typeof allItems === "function"
          ? allItems()
          : [
              ...ITEMS,
              ...(typeof MAGIC_ITEMS === "undefined" ? [] : MAGIC_ITEMS),
            ],
      spells: SPELLS,
      conditions: SHEET_CONDITIONS.map((r) => ({
        index: r[0],
        name: r[1],
        desc: [r[2]],
      })),
      rules: [
        ...(typeof FEATURES === "undefined" ? [] : FEATURES),
        {
          index: "diagonals",
          name: "Diagonal movement",
          desc: [
            "Count diagonal squares 5, 10, 5, 10 feet. Four diagonal squares cost 30 feet. Straight squares cost 5 feet.",
          ],
        },
      ],
      monsters: typeof WILD_SHAPE_FORMS === "undefined" ? [] : WILD_SHAPE_FORMS,
    };
  }
  function compendium() {
    const d = dialog("Compendium");
    let type = "items",
      term = "",
      rollHp = false;
    const paint = () => {
      const rows = catalogs()
          [type].filter((x) =>
            x.name.toLowerCase().includes(term.toLowerCase()),
          )
          .slice(0, 80),
        el = d.querySelector("main");
      el.innerHTML = `<nav>${["items", "spells", "conditions", "rules", ...(q().dm ? ["monsters"] : [])].map((x) => `<button data-type="${x}" aria-pressed="${x === type}">${x}</button>`).join("")}</nav><label>Search imported catalog<input data-search value="${E(term)}" placeholder="Search ${type}"></label>${type === "monsters" ? '<label><input type="checkbox" data-roll-hp ' + (rollHp ? "checked" : "") + "> Roll monster hit dice for HP</label>" : ""}<div class="vtt-compendium-results">${rows.map((r, i) => `<article ${type === "monsters" ? 'draggable="true"' : ""} data-row="${i}"><h3>${E(r.name)}</h3><small>${E(r.index || r.id || "")} ${type === "monsters" ? "· CR " + r.challenge_rating : ""}</small><p>${E(catalogText(r).slice(0, 900))}</p><button data-share="${i}">Share card</button>${type === "monsters" ? `<button data-monster="${i}">Stat block</button><button data-add-monster="${i}">Add to map</button>` : ""}</article>`).join("")}</div><p>Showing up to 80 matches. Items use the existing imported catalog. Monsters use the existing SRD 5.1 creature library (CC BY 4.0).</p>`;
      el.querySelector("[data-roll-hp]")?.addEventListener(
        "change",
        (e) => (rollHp = e.target.checked),
      );
      el.querySelectorAll("[data-type]").forEach(
        (b) =>
          (b.onclick = () => {
            type = b.dataset.type;
            paint();
          }),
      );
      const search = el.querySelector("[data-search]");
      let searchTimer;
      search.oninput = (e) => {
        term = e.target.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          if (!d.isConnected) return;
          const pos = search.selectionStart;
          paint();
          const n = el.querySelector("[data-search]");
          n.focus({ preventScroll: true });
          n.setSelectionRange(pos, pos);
        }, 180);
      };
      search.onchange = (e) => {
        term = e.target.value;
        paint();
      };
      el.querySelectorAll("[data-share]").forEach(
        (b) =>
          (b.onclick = () => {
            const r = rows[+b.dataset.share];
            if (type === "spells") return shareSpell(r);
            play().share({
              type: type === "items" ? "item" : "note",
              title: r.name,
              text: catalogText(r).slice(0, 8000),
              ...(r.source?.startsWith("https://") ? { url: r.source } : {}),
            });
          }),
      );
      el.querySelectorAll("[data-monster]").forEach(
        (b) => (b.onclick = () => monsterBlock(rows[+b.dataset.monster])),
      );
      el.querySelectorAll("[data-add-monster]").forEach(
        (b) =>
          (b.onclick = () =>
            addMonster(rows[+b.dataset.addMonster], null, rollHp)),
      );
      el.querySelectorAll("[draggable]").forEach(
        (n) =>
          (n.ondragstart = (e) => {
            e.dataTransfer.setData(
              "application/x-forge-monster",
              rows[+n.dataset.row].index,
            );
            d.close();
          }),
      );
    };
    paint();
  }
  function monsterBlock(m, t) {
    const d = dialog(m.name + " · SRD stat block");
    d.querySelector("main").innerHTML =
      `<p>${E(m.size)} ${E(m.type)} · AC ${m.armor_class?.[0]?.value || 10} · HP ${m.hit_points} (${E(m.hit_dice)})</p><p>${ab.map((a, i) => a.toUpperCase() + " " + m[["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"][i]]).join(" · ")}</p>${(m.special_abilities || []).map((a) => `<article><b>${E(a.name)}</b><p>${E(a.desc)}</p></article>`).join("")}${(m.actions || []).map((a, i) => `<article><h3>${E(a.name)}</h3><p>${E(a.desc)}</p>${t && a.attack_bonus !== undefined ? `<button data-monster-roll="${i}">Attack</button><button data-monster-macro="${i}">Save token macro</button>` : ""}</article>`).join("")}<small>SRD 5.1 · CC BY 4.0 · dnd5eapi.co</small>`;
    const formula = (a) =>
      "Hit:1d20" +
      sign(a.attack_bonus) +
      (a.damage || [])
        .filter((x) => x.damage_dice)
        .map((x, i) => ";Damage" + (i + 1) + ":" + x.damage_dice)
        .join("");
    d.querySelectorAll("[data-monster-roll]").forEach(
      (b) =>
        (b.onclick = () =>
          play().roll(
            t.id,
            formula(m.actions[+b.dataset.monsterRoll]),
            m.actions[+b.dataset.monsterRoll].name,
          )),
    );
    d.querySelectorAll("[data-monster-macro]").forEach(
      (b) =>
        (b.onclick = () => {
          const a = m.actions[+b.dataset.monsterMacro];
          play()
            .macro({
              id: crypto.randomUUID(),
              name: a.name,
              formula: formula(a),
              tokenId: t.id,
              slot: null,
              template: a.name,
            })
            .then(() => api().notify("Token action saved"))
            .catch((e) => api().notify(e.message));
        }),
    );
  }
  function addMonster(m, point, rollHp = false) {
    if (!q().dm) return;
    const s = q().scene;
    let t;
    api().change(() => {
      const dice =
          m.hit_points_roll ||
          m.hit_dice +
            sign(
              (parseInt(m.hit_dice) || 1) *
                Math.floor((m.constitution - 10) / 2),
            ),
        hp = rollHp
          ? Math.max(1, window.ForgeVTTDice.roll(dice).total)
          : m.hit_points;
      t = {
        id: crypto.randomUUID(),
        name: m.name,
        x: point?.x || s.grid * 2,
        y: point?.y || s.grid * 2,
        size:
          { Tiny: 0.5, Small: 1, Medium: 1, Large: 2, Huge: 3, Gargantuan: 4 }[
            m.size
          ] || 1,
        rotation: 0,
        color: "#dfb886",
        hp,
        maxHp: hp,
        image: "",
        details: {
          ac: m.armor_class?.[0]?.value || 10,
          initiative: Math.floor((m.dexterity - 10) / 2),
          speed: parseInt(m.speed?.walk) || 30,
          notes: JSON.stringify({ srdMonster: m.index }),
          stats: Object.fromEntries(
            ab.map((a, i) => [
              a.toUpperCase(),
              Math.floor(
                (m[
                  [
                    "strength",
                    "dexterity",
                    "constitution",
                    "intelligence",
                    "wisdom",
                    "charisma",
                  ][i]
                ] -
                  10) /
                  2,
              ),
            ]),
          ),
        },
      };
      api().clamp(t);
      s.tokens.push(t);
    });
    for (const a of (m.actions || [])
      .filter((a) => Number.isFinite(a.attack_bonus))
      .slice(0, 8))
      play()
        .macro({
          id: crypto.randomUUID(),
          name: a.name,
          tokenId: t.id,
          slot: null,
          template: a.name,
          formula:
            "Hit:1d20" +
            sign(a.attack_bonus) +
            (a.damage || [])
              .filter((x) => x.damage_dice)
              .map((x, i) => ";Damage" + (i + 1) + ":" + x.damage_dice)
              .join(""),
        })
        .catch((e) => api().notify(e.message));
    return t;
  }
  function mount(root) {
    const bar = root.querySelector(".vtt-stage-tools");
    if (!bar || bar.querySelector("[data-sheet-tools]")) return;
    for (const [name, fn] of [
      [
        "Character sheet",
        () => {
          const t = selected();
          if (t) tokenOpen(t);
          else api().notify("Select a token first.");
        },
      ],
      ["Compendium", compendium],
    ]) {
      const b = document.createElement("button");
      b.className = "btn ghost";
      b.dataset.sheetTools = "";
      b.textContent = name;
      b.onclick = fn;
      bar.append(b);
    }
    const vp = root.querySelector(".vtt-viewport");
    vp.addEventListener("dragover", (e) => {
      if (
        q().dm &&
        [...e.dataTransfer.types].includes("application/x-forge-monster")
      )
        e.preventDefault();
    });
    vp.addEventListener("drop", (e) => {
      const id = e.dataTransfer.getData("application/x-forge-monster"),
        m = catalogs().monsters.find((m) => m.index === id);
      if (!m || !q().dm) return;
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      addMonster(m, {
        x: (e.clientX - r.left + vp.scrollLeft) / q().zoom,
        y: (e.clientY - r.top + vp.scrollTop) / q().zoom,
      });
    });
    synchronize();
  }
  function tokenOpen(t) {
    try {
      const customId = JSON.parse(t.details?.notes || "{}").creatureResource;
      if (customId && q().dm) return window.ForgeVTTResources.open("creature",customId);
      const id = JSON.parse(t.details?.notes || "{}").srdMonster,
        m = catalogs().monsters.find((m) => m.index === id);
      if (m) return monsterBlock(m, t);
    } catch {}
    openSheet(t);
  }
  setInterval(synchronize, 3000);
  window.ForgeVTTSheets = {
    mount,
    open: tokenOpen,
    compendium,
    synchronize,
    catalogs,
    model: { projection, tokenProjection, toToken, toCharacter, catalogText },
  };
  if (q()?.root) mount(q().root);
})();
