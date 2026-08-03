// ---------------------------------------------------------------------
// Communauté : abonnés, abonnements, amis (mutuels)
// Remplace l'ancien useFollowers. Utilise les vrais noms de colonnes
// (following_id, status, is_friend) et évite les jointures imbriquées
// fragiles : on récupère les ids via follows, puis les profils en un
// seul appel .in(), ce qui marche quel que soit le nom des contraintes
// de clé étrangère.
// ---------------------------------------------------------------------
export function useCommunity(userId) {
  const [abonnes, setAbonnes] = useState([]);
  const [abonnements, setAbonnements] = useState([]);
  const [amis, setAmis] = useState([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0, friends: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setAbonnes([]);
      setAbonnements([]);
      setAmis([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const [{ data: abonnesRows }, { data: abonnementsRows }] = await Promise.all([
      supabase
        .from("follows")
        .select("follower_id, created_at")
        .eq("following_id", userId)
        .eq("status", "succès")
        .order("created_at", { ascending: false }),
      supabase
        .from("follows")
        .select("following_id, created_at, is_friend")
        .eq("follower_id", userId)
        .eq("status", "succès")
        .order("created_at", { ascending: false }),
    ]);

    const abonnesMeta = abonnesRows || [];
    const abonnementsMeta = abonnementsRows || [];

    const abonnesIds = abonnesMeta.map((r) => r.follower_id);
    const abonnementsIds = abonnementsMeta.map((r) => r.following_id);
    const amisIds = abonnementsMeta.filter((r) => r.is_friend === true).map((r) => r.following_id);

    const allIds = Array.from(new Set([...abonnesIds, ...abonnementsIds]));
    let profilesById = {};

    if (allIds.length > 0) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, display_name, flag, handle")
        .in("user_id", allIds);
      profilesById = (profilesData || []).reduce((acc, p) => {
        acc[p.user_id] = p;
        return acc;
      }, {});
    }

    const toCard = (id, meta) => {
      const p = profilesById[id];
      if (!p) return null;
      return {
        id,
        name: p.display_name || "Membre BAARO",
        flag: p.flag || "🌍",
        handle: p.handle || "",
        since: meta?.created_at ? formatTs(meta.created_at) : "",
      };
    };

    setAbonnes(abonnesMeta.map((r) => toCard(r.follower_id, r)).filter(Boolean));
    setAbonnements(abonnementsMeta.map((r) => toCard(r.following_id, r)).filter(Boolean));
    setAmis(amisIds.map((id) => toCard(id, abonnementsMeta.find((r) => r.following_id === id))).filter(Boolean));
    setCounts({ followers: abonnesIds.length, following: abonnementsIds.length, friends: amisIds.length });
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFollow = useCallback(
    async (targetId) => {
      if (!userId || !targetId || targetId === userId) return;

      const { data: existing } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", userId)
        .eq("following_id", targetId)
        .eq("status", "succès")
        .maybeSingle();

      if (existing) {
        // Désabonnement : on retire la ligne, et on retire aussi is_friend
        // côté relation inverse puisque la mutualité est cassée.
        await supabase.from("follows").delete().eq("id", existing.id);
        await supabase
          .from("follows")
          .update({ is_friend: false })
          .eq("follower_id", targetId)
          .eq("following_id", userId);
      } else {
        // Abonnement
        await supabase.from("follows").insert({ follower_id: userId, following_id: targetId, status: "succès" });

        // Si l'autre personne me suit déjà, la relation devient mutuelle -> amis
        const { data: reverse } = await supabase
          .from("follows")
          .select("id")
          .eq("follower_id", targetId)
          .eq("following_id", userId)
          .eq("status", "succès")
          .maybeSingle();

        if (reverse) {
          await Promise.all([
            supabase.from("follows").update({ is_friend: true }).eq("id", reverse.id),
            supabase.from("follows").update({ is_friend: true }).eq("follower_id", userId).eq("following_id", targetId),
          ]);
        }
      }

      await load();
    },
    [userId, load]
  );

  return { abonnes, abonnements, amis, counts, loading, toggleFollow, refresh: load };
}
