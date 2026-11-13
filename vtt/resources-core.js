/* Campaign resources share IDs and permissions with the tabletop, not a second compendium. */
(() => {
  "use strict";
  const escape = (s) =>
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
    );
  const https = (s) => {
    try {
      const u = new URL(s);
      return u.protocol === "https:" && !u.username && !u.password
        ? u.href
        : "";
    } catch {
      return "";
    }
  };
  function youtube(value) {
    try {
      const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return '';
      const host=u.hostname.toLowerCase();let id='';
      if(host==='youtu.be')id=u.pathname.slice(1);
      else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)){
        if(u.pathname==='/watch')id=u.searchParams.get('v')||'';
        else id=u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)\/?$/)?.[1]||'';
      }
      return /^[A-Za-z0-9_-]{11}$/.test(id)?id:'';
    }catch{return '';}
  }
  function inline(text) {
    return escape(text)
      .replace(
        /\[([^\]\n]{1,160})\]\((https:\/\/[^\s)]+)\)/g,
        (m, label, url) =>
          https(url)
            ? '<a href="' +
              url +
              '" target="_blank" rel="noopener noreferrer">' +
              label +
              "</a>"
            : m,
      )
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  }
  function markdown(text) {
    return String(text || "")
      .slice(0, 20000)
      .split("\n")
      .map((line) =>
        line.startsWith("### ")
          ? "<h4>" + inline(line.slice(4)) + "</h4>"
          : line.startsWith("## ")
            ? "<h3>" + inline(line.slice(3)) + "</h3>"
            : line.startsWith("# ")
              ? "<h2>" + inline(line.slice(2)) + "</h2>"
              : line.startsWith("- ")
                ? '<p class="vtt-resource-bullet">• ' +
                  inline(line.slice(2)) +
                  "</p>"
                : "<p>" + (inline(line) || "<br>") + "</p>",
      )
      .join("");
  }
  function preferences(raw = {}) {
    const n = (key, def, min, max) =>
      Number.isFinite(Number(raw[key]))
        ? Math.max(min, Math.min(max, Number(raw[key])))
        : def;
    return {
      theme: raw.theme === "light" ? "light" : "dark",
      scale: n("scale", 1, 0.8, 1.4),
      volume: n("volume", 0.7, 0, 1),
      muted: raw.muted === true,
      animations: raw.animations !== false,
      sound: raw.sound !== false,
      zoom: n("zoom", 0.65, 0.2, 2),
      snap: raw.snap !== false,
    };
  }
  function position(p, now = Date.now(), duration = Infinity) {
    let t = Math.max(0, Number(p.position) || 0);
    if (p.status === "playing")
      t += Math.max(0, (now - Number(p.startedAt || now)) / 1000);
    if (Number.isFinite(duration) && duration > 0)
      return p.loop ? t % duration : Math.min(t, duration);
    return t;
  }
  function localSnapshot(game) {
    const r = game.resources || {};
    return {
      records: (r.records || []).filter((x) => !x.deleted_at),
      trash: (r.records || []).filter((x) => x.deleted_at),
      assets: r.assets || [],
      preferences: {},
      serverTime: Date.now(),
      campaignBytes: (r.assets || []).reduce((a, x) => a + x.byte_size, 0),
      accountBytes: 0,
    };
  }
  const api = { escape, https, youtube, markdown, preferences, position, localSnapshot };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.ForgeVTTResourcesCore = api;
})();
