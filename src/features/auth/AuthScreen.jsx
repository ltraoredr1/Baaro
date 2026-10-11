// Connexion / Inscription par Email
  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();
    setError(null);
    setSuccess(null);

    if (!cleanEmail) {
      setError("Veuillez indiquer une adresse email valide.");
      return;
    }
    if (!password) {
      setError("Veuillez saisir votre mot de passe.");
      return;
    }
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (!isLogin && !legalAccepted) {
      setError(
        "Vous devez accepter les conditions d'utilisation et les règles de la communauté."
      );
      return;
    }

    setLoading(true);

    try {
      // ========== CONNEXION ==========
      if (isLogin) {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (authError) {
          const msg = (authError.message || "").toLowerCase();
          if (
            msg.includes("invalid login credentials") ||
            msg.includes("invalid_credentials")
          ) {
            throw new Error(
              "E-mail ou mot de passe incorrect. Vérifie tes identifiants ou crée un compte."
            );
          }
          if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
            throw new Error(
              "Ton e-mail n’est pas encore confirmé. Regarde ta boîte de réception (et les spams)."
            );
          }
          throw authError;
        }

        if (!data?.session) {
          throw new Error("Session non créée. Réessaie dans quelques secondes.");
        }

        setSuccess("Ravi de vous revoir ! Connexion réussie.");
        return;
      }

      // ========== INSCRIPTION ==========
      const { data, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });

      if (authError) {
        const msg = (authError.message || "").toLowerCase();
        if (
          msg.includes("already registered") ||
          msg.includes("user already") ||
          msg.includes("already been registered")
        ) {
          throw new Error(
            "Cet e-mail est déjà utilisé. Clique sur « Déjà inscrit ? » pour te connecter."
          );
        }
        throw authError;
      }

      const user = data?.user;
      const session = data?.session;

      // Cas 1 : compte déjà existant (Supabase renvoie parfois un user sans session ni identities)
      if (user && (!user.identities || user.identities.length === 0) && !session) {
        throw new Error(
          "Cet e-mail est déjà utilisé. Clique sur « Déjà inscrit ? » pour te connecter."
        );
      }

      // Cas 2 : inscription OK + session immédiate (confirmation e-mail désactivée)
      if (session && user?.id) {
        try {
          await supabase.from("profiles").upsert(
            {
              id: user.id,
              display_name: cleanEmail.split("@")[0] || "Membre BAARO",
              handle: `@user_${String(user.id).replace(/-/g, "").slice(0, 10)}`,
              flag: "🌍",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
        } catch (e) {
          console.error("[BAARO] Profil inscription:", e);
        }
        try {
          await recordConsents();
        } catch (e) {
          console.error("[BAARO] Consents:", e);
        }
        setSuccess("Votre compte a été créé avec succès !");
        return;
      }

      // Cas 3 : inscription OK mais confirmation e-mail requise
      if (user?.id) {
        try {
          await recordConsents();
        } catch (e) {
          console.error("[BAARO] Consents:", e);
        }
        setSuccess(
          "Un e-mail de vérification a été envoyé. Ouvre ta boîte (et les spams), clique sur le lien, puis reconnecte-toi."
        );
        return;
      }

      // Fallback
      setSuccess(
        "Inscription enregistrée. Si tu ne reçois pas d’e-mail, vérifie les spams ou réessaie dans 1 minute."
      );
    } catch (err) {
      console.error("Erreur authentification email :", err);
      setError(
        err?.message || "Une erreur s'est produite lors de l'authentification."
      );
    } finally {
      setLoading(false);
    }
  };
