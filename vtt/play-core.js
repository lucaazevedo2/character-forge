/* Shared command parsing and local combat transitions. All cloud authorization stays on the server. */
(() => {
  "use strict";
  function named(rest, items) {
    const quote = rest.match(/^"([^"]+)"\s+([\s\S]+)$/);
    if (quote) {
      const found = items.filter(
        (x) => x.name.toLowerCase() === quote[1].toLowerCase(),
      );
      if (found.length !== 1) throw Error("Choose an unambiguous name.");
      return { item: found[0], body: quote[2] };
    }
    const full = items
      .filter((x) => rest.toLowerCase().startsWith(x.name.toLowerCase() + " "))
      .sort((a, b) => b.name.length - a.name.length);
    if (full.length && !(full[1]?.name.length === full[0].name.length))
      return { item: full[0], body: rest.slice(full[0].name.length + 1) };
    const first = rest.split(/\s/)[0],
      matches = items.filter(
        (x) => x.name.split(/\s/)[0].toLowerCase() === first.toLowerCase(),
      );
    if (matches.length !== 1)
      throw Error(
        'Use a full name in quotes, such as /w "Player Name" message.',
      );
    return { item: matches[0], body: rest.slice(first.length).trim() };
  }
  function command(text, { members = [], tokens = [], speaker = null } = {}) {
    let p = {
      kind: "text",
      body: text.trim(),
      scope: "public",
      tokenId: speaker || null,
    };
    if (!p.body) throw Error("Enter a message or roll.");
    const m = p.body.match(/^\/(\w+)\s*([\s\S]*)$/);
    if (m) {
      const cmd = m[1].toLowerCase(),
        rest = m[2];
      if (["r", "roll", "gmroll", "adv", "dis"].includes(cmd))
        p = {
          ...p,
          kind: "roll",
          formula: rest || "1d20",
          body: rest || "1d20",
          scope: cmd === "gmroll" ? "gm" : p.scope,
          advantage: ["adv", "dis"].includes(cmd) ? cmd : undefined,
        };
      else if (cmd === "w") {
        const found = named(rest, members);
        p = {
          ...command(found.body, { members, tokens, speaker }),
          scope: "whisper",
          recipientId: found.item.userId,
        };
      } else if (cmd === "me") p = { ...p, kind: "emote", body: rest };
      else if (cmd === "as") {
        const found = named(rest, tokens);
        p = command(found.body, { members, tokens, speaker: found.item.id });
      } else if (cmd === "image") p = { ...p, kind: "image", body: rest };
      else
        throw Error("Commands: /r /roll /gmroll /adv /dis /w /me /as /image.");
    }
    if (p.kind === "text") {
      const inline = [...p.body.matchAll(/\[\[([^\]]+(?:\][^\]]*)?)\]\]/g)].map(
        (x) => x[1],
      );
      if (inline.length) {
        p.kind = "roll";
        p.formula = inline.join(";");
      }
    }
    return p;
  }
  function advance(combat, action) {
    const c = JSON.parse(JSON.stringify(combat)),
      entries = c.entries || [],
      size = entries.length;
    c.history ||= [];
    if (action === "previous") {
      const old = c.history.pop();
      return old ? { ...old, history: c.history, revision: c.revision + 1 } : c;
    }
    const before = JSON.parse(JSON.stringify({ ...c, history: undefined }));
    if (action === "end") c.activeTokenId = null;
    else if (size) {
      let i = entries.findIndex((e) => e.tokenId === c.activeTokenId);
      if (action === "start") {
        i = 0;
        c.round = 1;
      } else if (action === "delay") {
        const entry = entries.splice(i, 1)[0];
        entries.push({ ...entry, delayed: true });
        if (i >= size - 1) {
          i = 0;
          c.round++;
        }
      } else {
        i = (i + 1) % size;
        if (i === 0) c.round++;
      }
      c.activeTokenId = entries[i].tokenId;
      if (c.round > before.round)
        for (const e of entries)
          e.durations = (e.durations || [])
            .map((x) => ({ ...x, remaining: x.remaining - 1 }))
            .filter((x) => x.remaining > 0);
    }
    c.startedAt = Date.now();
    c.revision = (c.revision || 0) + 1;
    c.history.push(before);
    if (c.history.length > 30) c.history.shift();
    return c;
  }
  // Character speakers use only the portrait from the permission-filtered model.
  // Never fall back to their owner's unrelated account picture.
  function portraitSource(message, tokens) {
    const id=message.token_id||message.tokenId;
    const source=id?tokens.find(t=>t.id===id)?.image:message.avatar;
    if(typeof source!=='string')return '';
    if(/^https:\/\//i.test(source))return source;
    if(id&&/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(source))return source;
    return '';
  }
  const api = { command, named, advance, portraitSource };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.ForgeVTTPlayCore = api;
})();
