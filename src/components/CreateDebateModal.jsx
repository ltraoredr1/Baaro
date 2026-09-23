const handleCreate = async (e) => {
    e?.preventDefault?.();
    const titleVal = title.trim();
    const topicVal = topic.trim();
    if (!titleVal || !topicVal) {
      setError("Titre et thème requis.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        throw new Error("Tu dois être connecté pour créer un live. Reconnecte-toi.");
      }

      const finalMode = mode === "hybrid" ? "video" : mode;
      const inviteCode = randomCode(6).toLowerCase();
      const finalTopic =
        mode === "hybrid" ? `${topicVal} · ⚡ Tout-en-un` : topicVal;

      // 1. Création directe en base (ne dépend pas de /api)
      const { data: room, error: roomErr } = await supabase
        .from("debate_rooms")
        .insert({
          title: titleVal,
          topic: finalTopic,
          mode: finalMode,
          invite_code: inviteCode,
          host_id: userId,
          status: "active",
          max_participants: 12,
        })
        .select("*")
        .single();

      if (roomErr) {
        // Messages plus clairs que "Failed to fetch"
        const msg = roomErr.message || "";
        if (/fetch|network|Failed to fetch/i.test(msg)) {
          throw new Error(
            "Connexion impossible au serveur. Vérifie ton réseau ou réessaie."
          );
        }
        if (/permission|policy|RLS/i.test(msg)) {
          throw new Error("Permission refusée. Reconnecte-toi puis réessaie.");
        }
        throw new Error(msg || "Impossible de créer la salle.");
      }

      // 2. Participant host
      const { error: partErr } = await supabase
        .from("debate_participants")
        .insert({ room_id: room.id, user_id: userId, role: "host" });
      if (partErr) console.warn("participant warn:", partErr.message);

      // 3. Room Daily (optionnel — ne bloque pas si échec)
      if (finalMode !== "text" && API_BASE) {
        try {
          const res = await fetch(`${API_BASE}/api/create-room`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              action: "create-room",
              userName: "Hôte",
              title: titleVal,
              topic: finalTopic,
              mode: finalMode,
              inviteCode,
            }),
          });
          const dailyData = await res.json().catch(() => ({}));
          if (dailyData?.roomName || dailyData?.daily_room_name) {
            const name = dailyData.roomName || dailyData.daily_room_name;
            await supabase
              .from("debate_rooms")
              .update({ daily_room_name: name })
              .eq("id", room.id);
            room.daily_room_name = name;
          }
        } catch (dailyErr) {
          console.warn(
            "Daily API non dispo, salle chat créée quand même:",
            dailyErr?.message
          );
        }
      }

      onSuccess?.(room);
      onClose?.();
      setTitle("");
      setTopic("");
      setMode("hybrid");
    } catch (err) {
      console.error(err);
      const raw = err?.message || String(err);
      if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) {
        setError(
          "Connexion impossible. Vérifie ta connexion internet et réessaie."
        );
      } else {
        setError(raw);
      }
    } finally {
      setLoading(false);
    }
  };
