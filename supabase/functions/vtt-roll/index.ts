import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import "./dice.js";
const origins = new Set([
  "https://lucas-character-forge.lucaazevedo.chatgpt.site", "https://characterforge5e.com", "https://lucaazevedo2.github.io",
  ...(Deno.env.get("FORGE_ALLOWED_ORIGINS") || "").split(",").map(x=>x.trim()).filter(Boolean),
]);
Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "",
    headers = {
      "Access-Control-Allow-Origin": origins.has(origin) ? origin : "null",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      Vary: "Origin",
      "Content-Type": "application/json",
    };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers, status });
  if (!origins.has(origin)) return reply({ error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { headers, status: 204 });
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);
  try {
    const token = (req.headers.get("authorization") || "").replace(
      /^Bearer /i,
      "",
    );
    if (!token) return reply({ error: "Sign in first" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!,
      secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      admin = createClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    const {
      data: { user },
      error,
    } = await admin.auth.getUser(token);
    if (error || !user || user.is_anonymous)
      return reply({ error: "Use a regular account" }, 401);
    const reader = req.body?.getReader();
    if (!reader) throw Error("Request body required");
    let bytes = 0,
      text = "";
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 32768) {
        await reader.cancel();
        return reply({ error: "Request too large" }, 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const p = JSON.parse(text);
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const context = async (tokenId: string | null) => {
      const { data, error } = await client.rpc("forge_vtt_play", {
        p_action: "context",
        p_payload: { campaignId: p.campaignId, tokenId },
      });
      if (error) throw Error("Token/campaign permission denied");
      return data;
    };
    // Uniform cryptographic faces; the browser never supplies a total or die value.
    const dice = (globalThis as any).ForgeVTTDice;
    let rolls: any;
    if (p.action === "initiative") {
      if (
        !Array.isArray(p.entries) ||
        !p.entries.length ||
        p.entries.length > 100
      )
        throw Error("Choose 1–100 tokens");
      rolls = {};
      for (const entry of p.entries) {
        const c = await context(entry.tokenId),
          alert = entry.alert === true || c.alert === true,
          formula = "1d20+" + (Number(c.initiative) || 0) + (alert ? "+5" : "");
        rolls[entry.tokenId] = dice.roll(formula, {
          advantage: entry.advantage ? "adv" : undefined,
          refs: c.refs,
        });
      }
    } else {
      const c = await context(p.tokenId || null);
      let formula = String(p.formula || "");
      if (!formula || formula.length > 2000)
        throw Error("Formula is required (max 2000 characters)");
      rolls = dice.bundle(formula, {
        refs: c.refs,
        advantage: ["adv", "dis"].includes(p.advantage)
          ? p.advantage
          : undefined,
      });
    }
    if (Array.isArray(rolls))
      p.body = dice.formatTemplate(p.body || p.formula, rolls);
    const { data, error: failure } = await admin.rpc("forge_vtt_roll_gateway", {
      p_actor: user.id,
      p_payload: {
        ...p,
        avatar:
          typeof user.user_metadata?.avatar_url === "string"
            ? user.user_metadata.avatar_url
            : null,
      },
      p_rolls: rolls,
    });
    if (failure)
      return reply(
        {
          error:
            failure.code === "42501" ? "Permission denied" : failure.message,
        },
        failure.code === "42501" ? 403 : 400,
      );
    return reply(data);
  } catch (error) {
    return reply(
      { error: error instanceof Error ? error.message : "Roll failed" },
      400,
    );
  }
});
