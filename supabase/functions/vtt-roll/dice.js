/* Bounded dice grammar; shared byte-for-byte with the trusted roll gateway. No eval. */
(() => {
  "use strict";
  function roll(source, options = {}) {
    let text = String(source).trim(),
      pos = 0,
      spent = 0,
      ops = 0;
    const groups = [],
      refs = options.refs || {},
      random =
        options.random ||
        (() => {
          const n = new Uint32Array(1);
          crypto.getRandomValues(n);
          return n[0] / 4294967296;
        });
    if (!text || text.length > 500)
      throw Error("Enter a formula up to 500 characters.");
    text = text.replace(/\[([A-Za-z0-9_@.]+)\]/g, (_, key) => {
      const value = refs[key.toUpperCase()];
      if (!Number.isFinite(value))
        throw Error("Unknown or unavailable stat [" + key + "].");
      return "(" + value + ")";
    });
    function ws() {
      while (/\s/.test(text[pos] || "\0")) pos++;
    }
    function number() {
      ws();
      const m = text.slice(pos).match(/^\d+(?:\.\d+)?/);
      if (!m) throw Error("Expected a number at " + (pos + 1));
      pos += m[0].length;
      return +m[0];
    }
    function face(sides) {
      if (++spent > 400)
        throw Error(
          "Roll limit reached (400 dice, including rerolls and explosions).",
        );
      if (!options.random) {
        const n = new Uint32Array(1),
          limit = Math.floor(4294967296 / sides) * sides;
        do {
          crypto.getRandomValues(n);
        } while (n[0] >= limit);
        return (n[0] % sides) + 1;
      }
      const r = random();
      if (!(r >= 0 && r < 1)) throw Error("Invalid randomness");
      return 1 + Math.floor(r * sides);
    }
    function compare() {
      const m = text.slice(pos).match(/^(<=|>=|!=|=|<|>)(\d+)/);
      if (!m) return null;
      pos += m[0].length;
      const n = +m[2],
        op = m[1];
      return {
        op,
        n,
        test: (v) =>
          op === "<"
            ? v < n
            : op === ">"
              ? v > n
              : op === "<="
                ? v <= n
                : op === ">="
                  ? v >= n
                  : op === "!="
                    ? v !== n
                    : v === n,
      };
    }
    function dice(count) {
      pos++;
      const sides = number();
      if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > 100 ||
        !Number.isInteger(sides) ||
        sides < 1 ||
        sides > 100000
      )
        throw Error("Use 1–100 dice with 1–100000 sides.");
      let keep = null,
        explode = null,
        reroll = null;
      for (let mods = 0; mods < 6; mods++) {
        ws();
        const keepMatch = text.slice(pos).match(/^(kh|kl|dh|dl)(\d+)/i);
        if (keepMatch) {
          if (keep) throw Error("Only one keep/drop modifier per group.");
          pos += keepMatch[0].length;
          keep = { kind: keepMatch[1].toLowerCase(), n: +keepMatch[2] };
          if (keep.n > count)
            throw Error("Cannot keep/drop more dice than rolled.");
          continue;
        }
        if (text[pos] === "!") {
          if (explode) throw Error("Duplicate explosion modifier.");
          pos++;
          const compound = text[pos] === "!";
          if (compound) pos++;
          explode = {
            compound,
            condition: compare() || { test: (v) => v === sides },
          };
          continue;
        }
        if (text[pos]?.toLowerCase() === "r") {
          if (reroll) throw Error("Duplicate reroll modifier.");
          pos++;
          const once = text[pos]?.toLowerCase() === "o";
          if (once) pos++;
          reroll = { once, condition: compare() };
          if (!reroll.condition) throw Error("Use r<2, r=1, or ro<2.");
          continue;
        }
        break;
      }
      if (
        options.advantage &&
        sides === 20 &&
        count === 1 &&
        !keep &&
        !groups.some((g) => g.advantage)
      ) {
        count = 2;
        keep = { kind: options.advantage === "dis" ? "kl" : "kh", n: 1 };
      }
      const values = [];
      for (let i = 0; i < count; i++) {
        let value = face(sides),
          history = [];
        while (reroll?.condition.test(value)) {
          history.push(value);
          value = face(sides);
          if (reroll.once) break;
        }
        const die = {
          value,
          faces: [value],
          rerolled: history,
          dropped: false,
        };
        let last = value;
        while (explode?.condition.test(last)) {
          last = face(sides);
          die.faces.push(last);
          die.value += last;
        }
        values.push(die);
      }
      if (keep) {
        const sorted = values
            .map((d, i) => ({ d, i }))
            .sort((a, b) => a.d.value - b.d.value || a.i - b.i),
          high = keep.kind.endsWith("h"),
          pick = high
            ? sorted.slice(-keep.n || sorted.length)
            : sorted.slice(0, keep.n),
          ids = new Set(pick.map((x) => x.i)),
          keeping = keep.kind.startsWith("k");
        values.forEach(
          (d, i) => (d.dropped = keeping ? !ids.has(i) : ids.has(i)),
        );
      }
      const total = values.reduce((n, d) => n + (d.dropped ? 0 : d.value), 0),
        group = {
          count,
          sides,
          modifier: keep ? keep.kind + keep.n : "",
          dice: values,
          total,
          advantage:
            !!options.advantage && count === 2 && sides === 20 && !!keep,
        };
      if (groups.length >= 50) throw Error("Too many dice groups.");
      groups.push(group);
      return total;
    }
    function primary(depth) {
      if (depth > 16) throw Error("Too many parentheses.");
      ws();
      if (text[pos] === "(") {
        pos++;
        const n = expression(depth + 1);
        ws();
        if (text[pos++] !== ")") throw Error("Missing closing parenthesis.");
        return n;
      }
      if (text[pos]?.toLowerCase() === "d") return dice(1);
      const n = number();
      ws();
      return text[pos]?.toLowerCase() === "d" ? dice(n) : n;
    }
    function unary(depth) {
      ws();
      if (text[pos] === "+") {
        pos++;
        return unary(depth + 1);
      }
      if (text[pos] === "-") {
        pos++;
        return -unary(depth + 1);
      }
      return primary(depth);
    }
    function term(depth) {
      let n = unary(depth);
      ws();
      while (["*", "/", "%"].includes(text[pos])) {
        if (++ops > 200) throw Error("Expression too complex.");
        const op = text[pos++],
          v = unary(depth);
        if ((op === "/" || op === "%") && !v) throw Error("Division by zero.");
        n = op === "*" ? n * v : op === "/" ? n / v : n % v;
        ws();
      }
      return n;
    }
    function expression(depth) {
      let n = term(depth);
      ws();
      while (["+", "-"].includes(text[pos])) {
        if (++ops > 200) throw Error("Expression too complex.");
        const op = text[pos++],
          v = term(depth);
        n += op === "+" ? v : -v;
        ws();
      }
      return n;
    }
    const total = expression(0);
    ws();
    if (pos !== text.length) throw Error("Unexpected notation at " + (pos + 1));
    if (!Number.isFinite(total) || Math.abs(total) > 1e9)
      throw Error("Result out of range.");
    return {
      formula: String(source),
      total,
      groups,
      natural20: groups.some(
        (g) =>
          g.sides === 20 && g.dice.some((d) => !d.dropped && d.faces[0] === 20),
      ),
      natural1: groups.some(
        (g) =>
          g.sides === 20 && g.dice.some((d) => !d.dropped && d.faces[0] === 1),
      ),
    };
  }
  function bundle(source, options = {}) {
    const formulas = String(source)
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!formulas.length || formulas.length > 8)
      throw Error("Use 1–8 formulas separated by semicolons.");
    return formulas.map((part, i) => {
      const m = part.match(/^([A-Za-z][A-Za-z0-9 _-]{0,39}):\s*(.+)$/);
      return {
        label: m ? m[1] : "Roll " + (i + 1),
        ...roll(m ? m[2] : part, options),
      };
    });
  }
  function formatTemplate(text, rolls) {
    const values = Object.fromEntries(
      rolls.map((r) => [r.label.toLowerCase(), r.total]),
    );
    let i = 0;
    return String(text)
      .replace(/\{\{([^}]+)\}\}/g, (match, key) =>
        key.toLowerCase() === "total"
          ? rolls.map((r) => r.total).join(" / ")
          : (values[key.toLowerCase()] ?? match),
      )
      .replace(/\[\[([^\]]+(?:\][^\]]*)?)\]\]/g, () =>
        String(rolls[i++]?.total ?? ""),
      );
  }
  const api = { roll, bundle, formatTemplate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else if (typeof window !== "undefined") window.ForgeVTTDice = api;
  else globalThis.ForgeVTTDice = api;
})();
