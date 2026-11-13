const assert = require("node:assert/strict");
module.exports = async (db) => {
  const [dm, p, p2, out, c, scene, doc, journal, pin, audio, asset] =
    Array.from({ length: 11 }, () => crypto.randomUUID());
  const as = async (id) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const api = async (a, payload) =>
    (
      await db.query("select public.forge_vtt_api($1,$2::jsonb) v", [
        a,
        JSON.stringify(payload),
      ])
    ).rows[0].v;
  const call = async (a, data = {}) =>
    (
      await db.query("select public.forge_vtt_resources_api($1,$2::jsonb) v", [
        a,
        JSON.stringify({ campaignId: c, ...data }),
      ])
    ).rows[0].v;
  const save = (id, kind, payload = {}, extra = {}) =>
    call("save", {
      id,
      kind,
      title: "Test " + kind,
      expected: 0,
      payload,
      ...extra,
    });
  await db.exec("reset role");
  for (const id of [dm, p, p2, out])
    await db.query("insert into auth.users(id) values($1)", [id]);
  await as(dm);
  await api("create", {
    campaignId: c,
    name: "Resources QA",
    operationId: crypto.randomUUID(),
  });
  await db.exec("reset role");
  for (const id of [p, p2])
    await db.query(
      "insert into public.forge_vtt_campaign_members(campaign_id,user_id,role,display_name) values($1,$2,'player','QA')",
      [c, id],
    );
  await as(dm);
  await api("apply", {
    campaignId: c,
    operationId: crypto.randomUUID(),
    changes: [
      {
        op: "upsert",
        kind: "scene",
        id: scene,
        expected: 0,
        data: { name: "Published", published: true },
      },
      {
        op: "upsert",
        kind: "campaign",
        id: c,
        expected: 1,
        data: { activeSceneId: scene },
      },
    ],
  });
  await db.exec("reset role");
  await db.query(
    "insert into public.forge_vtt_assets(id,campaign_id,uploaded_by,object_path,mime_type,byte_size,width_px,height_px,sha256) values($1,$2,$3,'qa/image','image/png',500,20,20,repeat('a',64))",
    [asset, c, dm],
  );
  await as(dm);
  await save(doc, "handout", { text: "SECRET", imageAssetId: asset });
  await save(
    journal,
    "journal",
    { text: "Shared", shared: true },
    { audience: "all" },
  );
  await save(
    pin,
    "pin",
    { sceneId: scene, x: 50, y: 50, documentId: doc },
    { audience: "all" },
  );
  await as(p);
  let v = await call("list");
  assert.deepEqual(
    v.records.map((r) => r.id),
    [journal],
  );
  assert.equal(
    (await db.query("select id from public.forge_vtt_assets")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select id from public.forge_vtt_resources")).rows.length,
    1,
  );
  await assert.rejects(() => save(crypto.randomUUID(), "handout"), /DM/);
  await assert.rejects(
    () => call("reserve", { bytes: 100, mime: "audio/mpeg" }),
    /DM/,
  );
  await call("journal", {
    id: journal,
    text: "Player contribution",
    expected: 1,
  });
  await assert.rejects(
    () =>
      call("journal", { id: journal, text: "Stale overwrite", expected: 1 }),
    /changed/,
  );
  await as(dm);
  await save(
    doc,
    "handout",
    { text: "Selected", imageAssetId: asset },
    { expected: 1, audience: "selected", recipients: [p] },
  );
  await as(p);
  v = await call("list");
  assert.equal(v.records.length, 3);
  assert.equal(
    (await db.query("select id from public.forge_vtt_assets")).rows.length,
    1,
  );
  await as(p2);
  assert.equal((await call("list")).records.length, 1);
  assert.equal(
    (await db.query("select id from public.forge_vtt_assets")).rows.length,
    0,
  );
  await as(dm);
  await save(
    doc,
    "handout",
    { text: "Revoked", imageAssetId: asset },
    { expected: 2 },
  );
  await as(p);
  assert.equal((await call("list")).records.length, 1);
  assert.equal(
    (await db.query("select id from public.forge_vtt_assets")).rows.length,
    0,
  );
  await as(dm);
  await assert.rejects(
    () =>
      save(audio, "audio", {
        tracks: null,
        status: null,
        position: 0,
        volume: 1,
        crossfade: 0,
      }),
    /Invalid playlist/,
  );
  await assert.rejects(
    () =>
      save(audio, "audio", {
        tracks: [
          {
            id: crypto.randomUUID(),
            title: "unsafe",
            url: "javascript:alert(1)",
          },
        ],
        status: "stopped",
        position: 0,
        volume: 1,
        crossfade: 0,
      }),
    /HTTPS/,
  );
  const track = crypto.randomUUID();
  await save(
    audio,
    "audio",
    {
      tracks: [
        { id: track, title: "Music", url: "https://example.com/music.mp3" },
      ],
      currentId: track,
      status: "playing",
      position: 10,
      volume: 0.5,
      crossfade: 2,
    },
    { audience: "all" },
  );
  v = await call("list");
  assert(v.records.find((r) => r.id === audio).payload.startedAt > 0);
  await call("trash", { id: audio, expected: 1 });
  v = await call("list");
  assert(v.trash.some((r) => r.id === audio));
  await call("restore", { id: audio, expected: 2 });
  assert((await call("list")).records.some((r) => r.id === audio));
  await as(p);
  await call("preferences", {
    payload: { theme: "light", volume: 0.3, muted: true },
  });
  await as(p2);
  assert.deepEqual((await call("list")).preferences, {});
  await assert.rejects(
    () => call("preferences", { payload: { muted: "false" } }),
    /switch/,
  );
  await as(out);
  await assert.rejects(() => call("list"), /unavailable/);
  assert.equal(
    (await db.query("select * from public.forge_vtt_resources")).rows.length,
    0,
  );
  await as(dm);
  let reserved = await call("reserve", { bytes: 1000, mime: "audio/mpeg" });
  assert(reserved.assetId);
  await assert.rejects(
    () => call("reserve", { bytes: 20971521, mime: "audio/mpeg" }),
    /20 MB/,
  );
  await assert.rejects(
    () => call("reserve", { bytes: 100, mime: "image/svg+xml" }),
    /PNG/,
  );
  await assert.rejects(
    () =>
      db.query(
        "select public.forge_vtt_finalize_media($1,$2,$3,$4,null,null)",
        [dm, reserved.reservationId, "audio/mpeg", "a".repeat(64)],
      ),
    /permission denied/,
  );
  console.log(
    "PASS Phase 7: document/pin/asset privacy and revocation, selected recipients, shared journal revisions, DM mutations, playlist validation, preferences isolation, trash restore, quotas/type gates, service-only finalization.",
  );
};
