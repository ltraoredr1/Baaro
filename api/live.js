import { createClient } from "@supabase/supabase-js";

function getUserClient(req) {
  const auth = req.headers.authorization?.replace("Bearer ", "");
  if (!auth) throw Object.assign(new Error("No auth"), { status: 401 });
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${auth}` } } }
  );
}

async function requireUser(req) {
  const supabase = getUserClient(req);
  const { data } = await supabase.auth.getUser();
  if (!data?.user) throw Object.assign(new Error("Invalid user"), { status: 401 });
  return data.user;
}

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function handleCreateRoom(req, res) {
  const user = await requireUser(req);
  const { title, maxCoHosts = 3 } = req.body || {};

  const dailyRes = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
    },
    body: JSON.stringify({
      name: `baaro-\( {Date.now()}- \){user.id.slice(0, 6)}`,
      privacy: "private",
      properties: {
        enable_chat: false,
        enable_screenshare: true,
        max_participants: 100,
        exp: Math.floor(Date.now() / 1000) + 3600 * 3,
      },
    }),
  });
  const dailyRoom = await dailyRes.json();
  if (!dailyRes.ok) throw new Error(dailyRoom.error || "Daily error");

  const tokenRes = await fetch("https://api.daily.co/v1/meeting-tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
    },
    body: JSON.stringify({
      properties: {
        room_name: dailyRoom.name,
        user_id: user.id,
        is_owner: true,
        enable_screenshare: true,
      },
    }),
  });
  const tokenData = await tokenRes.json();

  const supabaseAdmin = admin();
  const code = Math.random().toString(36).substring(2, 10).toUpperCase();
  const { data: debate } = await supabaseAdmin
    .from("debates")
    .insert({
      title,
      host_id: user.id,
      invite_code: code,
      daily_room_name: dailyRoom.name,
      max_co_hosts: maxCoHosts,
      is_live: true,
    })
    .select()
    .single();

  await supabaseAdmin.from("debate_participants").insert({
    debate_id: debate.id,
    user_id: user.id,
    role: "host",
  });

  return res.json({
    debate,
    dailyRoomName: dailyRoom.name,
    dailyRoomUrl: dailyRoom.url,
    token: tokenData.token,
    inviteCode: code,
  });
}

async function handleRoles(req, res) {
  const user = await requireUser(req);
  const supabaseAdmin = admin();
  const { action, roomId, dailyRoomName, targetUserId } = req.body || {};

  const { data: debate } = await supabaseAdmin
    .from("debates")
    .select("host_id, max_co_hosts")
    .eq("id", roomId)
    .single();
  if (!debate) return res.status(404).json({ error: "Live not found" });
  if (debate.host_id !== user.id)
    return res.status(403).json({ error: "Seul le host peut gérer les rôles" });

  if (action === "promote") {
    const { count } = await supabaseAdmin
      .from("debate_participants")
      .select("*", { count: "exact", head: true })
      .eq("debate_id", roomId)
      .eq("role", "co_host");
    if (count >= debate.max_co_hosts)
      return res.status(400).json({ error: `Max ${debate.max_co_hosts} co-hôtes` });

    await supabaseAdmin
      .from("debate_participants")
      .upsert({ debate_id: roomId, user_id: targetUserId, role: "co_host" });

    let token = null;
    if (process.env.DAILY_API_KEY && dailyRoomName) {
      const tokenRes = await fetch("https://api.daily.co/v1/meeting-tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
        },
        body: JSON.stringify({
          properties: {
            room_name: dailyRoomName,
            user_id: targetUserId,
            is_owner: false,
            enable_screenshare: true,
          },
        }),
      });
      const t = await tokenRes.json();
      token = t.token;
    }
    return res.json({ success: true, role: "co_host", token });
  }

  if (action === "demote") {
    await supabaseAdmin
      .from("debate_participants")
      .update({ role: "viewer" })
      .eq("debate_id", roomId)
      .eq("user_id", targetUserId);
    return res.json({ success: true, role: "viewer" });
  }

  return res.status(400).json({ error: "Invalid action" });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const path = (req.url || "").split("?")[0];
    const body = req.body || {};
    // live-roles a action promote/demote ; create-room a title
    if (body.action === "promote" || body.action === "demote" || path.includes("live-roles")) {
      return await handleRoles(req, res);
    }
    return await handleCreateRoom(req, res);
  } catch (e) {
    console.error(e);
    return res.status(e.status || 400).json({ error: e.message });
  }
    }
