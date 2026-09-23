// CHANGEMENTS CLÉS
const id = user?.id || null; // = auth.users.id = profiles.id = wallets.id

// loadProfile : id = auth.users.id OBLIGATOIRE
const fallback = {
  id: userId, // ← ton modèle définitif
  display_name: "Membre BAARO",
  handle: `@user_${String(userId).slice(0,8)}`,
  flag: "🌍",
};

// callWallet → /api/wallet (fusion payments+payout+wallet)
fetch(`${API_BASE}/api/wallet`, { action, ...payload })

// Guest fix conservé
const GUEST_OK_KEY = "baaro_guest_ok"; // localStorage pour APK
function isGuestOkThisSession() {
  return safeGet(GUEST_OK_KEY) === "1" || sessionStorage.getItem(GUEST_OK_KEY) === "1";
}

// init : ne signOut anonymous que si pas GuestOK
if (currentSession?.user?.is_anonymous && !isGuestOkThisSession()) {
  await supabase.auth.signOut({ scope: "local" });
}
