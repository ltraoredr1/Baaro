/**
 * Guide BAARO — contenu 100 % local (fonctionne sans IA, sans réseau).
 *
 * - STEPS : étapes de la visite guidée (une par espace de l'application).
 * - answerLocally() : réponse de secours par mots-clés, utilisée quand l'IA est
 *   indisponible ou quand l'utilisateur a choisi de ne pas utiliser l'IA.
 *
 * Langues : fr (défaut) et en. Les autres langues retombent sur le français.
 */

export const GUIDE_TAB_IDS = [
  "feed",
  "stories",
  "videos",
  "messages",
  "debates",
  "shop",
  "community",
  "economy",
  "discover",
  "companies",
  "offline",
  "assistant",
  "innovation",
  "settings",
];

export const isGuideTab = (id) => GUIDE_TAB_IDS.includes(id);

export function guideLang(code) {
  const l = String(code || "fr").toLowerCase().split("-")[0];
  return l === "en" ? "en" : "fr";
}

export const STEPS = [
  {
    id: "welcome",
    tab: null,
    keywords: ["baaro", "application", "app", "commencer", "start", "begin", "welcome", "bienvenue", "quoi"],
    fr: {
      title: "Bienvenue sur BAARO",
      body: "BAARO est un réseau social où tu publies, discutes en privé, débats en live et peux générer des revenus. Cette visite te montre chaque espace en moins de 2 minutes.",
      tip: "Tu peux quitter à tout moment et reprendre avec le bouton « ? ».",
    },
    en: {
      title: "Welcome to BAARO",
      body: "BAARO is a social network where you post, chat privately, debate live and can earn revenue. This tour shows you every area in under 2 minutes.",
      tip: "You can quit anytime and resume with the “?” button.",
    },
  },
  {
    id: "feed",
    tab: "feed",
    keywords: ["fil", "feed", "publier", "poster", "publication", "post", "sondage", "poll", "liker", "commenter"],
    fr: {
      title: "Le Fil",
      body: "Ton fil d'actualité : publications, sondages et médias de la communauté. Like, commente et partage pour interagir.",
      tip: "Pour publier, utilise le bouton de création en haut. Double-appui sur « Fil » pour le recharger.",
    },
    en: {
      title: "The Feed",
      body: "Your news feed: posts, polls and media from the community. Like, comment and share to interact.",
      tip: "To post, use the create button at the top. Double-tap “Feed” to reload it.",
    },
  },
  {
    id: "stories",
    tab: "stories",
    keywords: ["story", "stories", "histoire courte", "éphémère", "ephemeral"],
    fr: {
      title: "Stories",
      body: "Des contenus courts à partager avec ta communauté, pour montrer ce que tu vis sans écrire un long post.",
      tip: "Regarde celles de tes contacts, puis crée la tienne.",
    },
    en: {
      title: "Stories",
      body: "Short content to share with your community, to show what you're up to without writing a long post.",
      tip: "Watch your contacts' stories, then create your own.",
    },
  },
  {
    id: "videos",
    tab: "videos",
    keywords: ["vidéo", "video", "videos", "vidéos", "plein écran", "fullscreen", "reel"],
    fr: {
      title: "Vidéos",
      body: "Des vidéos en plein écran à faire défiler. L'écran est immersif : la navigation est masquée pour te laisser regarder.",
      tip: "Touche « ☰ Menus » en haut à gauche pour réafficher la navigation.",
    },
    en: {
      title: "Videos",
      body: "Full-screen videos to scroll through. The screen is immersive: navigation is hidden so you can just watch.",
      tip: "Tap “☰ Menus” at the top left to bring the navigation back.",
    },
  },
  {
    id: "messages",
    tab: "messages",
    keywords: ["chat", "message", "messages", "messagerie", "discuter", "appel", "call", "chiffré", "chiffrement", "encrypted", "privé", "private"],
    fr: {
      title: "Chat",
      body: "Ta messagerie privée, chiffrée de bout en bout : le serveur ne lit pas tes messages. Tu peux aussi passer des appels.",
      tip: "La messagerie est réservée aux comptes : crée un compte gratuit si tu es en mode invité.",
    },
    en: {
      title: "Chat",
      body: "Your private, end-to-end encrypted messaging: the server can't read your messages. You can also make calls.",
      tip: "Messaging is for accounts only: create a free account if you're browsing as a guest.",
    },
  },
  {
    id: "debates",
    tab: "debates",
    keywords: ["débat", "debat", "debate", "debates", "débats", "live", "direct", "diffusion", "stream"],
    fr: {
      title: "Débats & Lives",
      body: "Lance ou rejoins un live pour débattre en direct. L'assistant IA peut co-animer avec toi.",
      tip: "Rejoins un live en cours pour voir comment ça se passe avant d'en lancer un.",
    },
    en: {
      title: "Debates & Lives",
      body: "Start or join a live to debate in real time. The AI assistant can co-host with you.",
      tip: "Join a live in progress to see how it works before starting your own.",
    },
  },
  {
    id: "shop",
    tab: "shop",
    keywords: ["shop", "boutique", "vendre", "acheter", "produit", "sell", "buy", "product", "marketplace", "vendeur", "seller"],
    fr: {
      title: "Shop",
      body: "La vitrine de BAARO : achète des produits ou vends les tiens, avec des avis d'acheteurs.",
      tip: "Pour vendre, ajoute un produit avec photos, prix et description.",
    },
    en: {
      title: "Shop",
      body: "BAARO's storefront: buy products or sell your own, with buyer reviews.",
      tip: "To sell, add a product with photos, a price and a description.",
    },
  },
  {
    id: "economy",
    tab: "economy",
    target: "more",
    keywords: ["revenu", "revenus", "gagner", "gain", "gains", "argent", "points", "retrait", "retirer", "pourboire", "tip", "money", "earn", "earnings", "payout", "withdraw", "abonnement", "parrainage", "referral"],
    fr: {
      title: "Revenus",
      body: "Suis ce que tu gagnes : pourboires, abonnements, ventes, publicité, parrainage. Les montants sont gérés côté serveur, personne ne peut les modifier depuis son téléphone.",
      tip: "Les retraits passent par des contrôles de sécurité (et parfois une vérification d'identité).",
    },
    en: {
      title: "Earnings",
      body: "Track what you earn: tips, subscriptions, sales, ads, referrals. Amounts are managed server-side; nobody can change them from their phone.",
      tip: "Withdrawals go through security checks (and sometimes identity verification).",
    },
  },
  {
    id: "community",
    tab: "community",
    target: "more",
    keywords: ["communauté", "communaute", "community", "groupe", "group", "salon", "channel", "vocal", "voice", "modération", "moderation"],
    fr: {
      title: "Communauté",
      body: "Des groupes avec salons de discussion (texte et vocal) et des outils de modération pour garder un espace sain.",
      tip: "Rejoins un groupe qui te ressemble ou crées-en un.",
    },
    en: {
      title: "Community",
      body: "Groups with chat channels (text and voice) and moderation tools to keep spaces healthy.",
      tip: "Join a group that fits you, or create one.",
    },
  },
  {
    id: "discover",
    tab: "discover",
    target: "more",
    keywords: ["découvrir", "decouvrir", "discover", "explorer", "explore", "recherche", "rechercher", "search", "trouver", "find"],
    fr: {
      title: "Découvrir",
      body: "Explore des publications, des lives et des profils que tu ne suivais pas encore.",
      tip: "La loupe en haut permet aussi de chercher des personnes, des boutiques et des espaces.",
    },
    en: {
      title: "Discover",
      body: "Explore posts, lives and profiles you weren't following yet.",
      tip: "The magnifier at the top also lets you search people, shops and areas.",
    },
  },
  {
    id: "companies",
    tab: "companies",
    target: "more",
    keywords: ["entreprise", "entreprises", "company", "companies", "business", "société", "societe", "avis", "reviews"],
    fr: {
      title: "Entreprises",
      body: "Présente ton entreprise, reçois des avis et gère ta page. Tu peux aussi découvrir celles des autres.",
      tip: "Inscris ton entreprise depuis cet onglet.",
    },
    en: {
      title: "Companies",
      body: "Showcase your company, collect reviews and manage your page. You can also discover other companies.",
      tip: "Register your company from this tab.",
    },
  },
  {
    id: "offline",
    tab: "offline",
    target: "more",
    keywords: ["hors-ligne", "hors ligne", "offline", "sans internet", "no internet", "bluetooth", "wifi", "wi-fi", "proximité", "proximite", "nearby", "p2p"],
    fr: {
      title: "Hors-ligne (P2P)",
      body: "Discute avec des téléphones Android proches de toi, sans Internet, via Bluetooth / Wi-Fi.",
      tip: "Utile quand le réseau est coupé. Cette fonction demande l'application Android.",
    },
    en: {
      title: "Offline (P2P)",
      body: "Chat with Android phones near you, without Internet, over Bluetooth / Wi-Fi.",
      tip: "Handy when the network is down. This feature needs the Android app.",
    },
  },
  {
    id: "assistant",
    tab: "assistant",
    target: "more",
    keywords: ["ia", "ai", "assistant", "griot", "fa-baaro", "intelligence", "idée", "idee", "idea", "image"],
    fr: {
      title: "Assistant IA",
      body: "Demande des idées de publications, des sujets de débat ou des images. Il existe aussi un mode Griot : Fa-Baaro, un sage malien qui répond par proverbes.",
      tip: "Le bouton rond doré, en bas, ouvre l'assistant depuis n'importe quel écran.",
    },
    en: {
      title: "AI Assistant",
      body: "Ask for post ideas, debate topics or images. There's also a Griot mode: Fa-Baaro, a Malian sage who answers with proverbs.",
      tip: "The round gold button at the bottom opens the assistant from any screen.",
    },
  },
  {
    id: "innovation",
    tab: "innovation",
    target: "more",
    keywords: ["innovation", "laboratoire", "lab", "nouveau", "new", "expérience", "experience", "beta"],
    fr: {
      title: "Innovation",
      body: "Le laboratoire de BAARO : de nouvelles fonctions à tester en avant-première.",
      tip: "Ton avis aide à décider ce qui devient une vraie fonction.",
    },
    en: {
      title: "Innovation",
      body: "BAARO's lab: new features to try early.",
      tip: "Your feedback helps decide what becomes a real feature.",
    },
  },
  {
    id: "settings",
    tab: "settings",
    target: "more",
    keywords: ["réglage", "reglage", "réglages", "settings", "langue", "language", "thème", "theme", "confidentialité", "privacy", "notification", "notifications", "compte", "account", "supprimer", "delete", "export"],
    fr: {
      title: "Réglages",
      body: "Change la langue (14 disponibles), le thème, les notifications et la confidentialité. Tu peux aussi relancer l'introduction.",
      tip: "Crée ton compte ici si tu es en mode invité.",
    },
    en: {
      title: "Settings",
      body: "Change the language (14 available), theme, notifications and privacy. You can also replay the intro.",
      tip: "Create your account here if you're browsing as a guest.",
    },
  },
  {
    id: "done",
    tab: null,
    keywords: [],
    fr: {
      title: "Tu es prêt !",
      body: "Tu connais maintenant les espaces de BAARO. Un doute plus tard ? Le bouton « ? » relance la visite ou ouvre le Guide IA.",
      tip: "Astuce : demande au Guide IA « emmène-moi aux Revenus » et il t'y conduit.",
    },
    en: {
      title: "You're all set!",
      body: "You now know BAARO's areas. Questions later? The “?” button restarts the tour or opens the AI Guide.",
      tip: "Tip: ask the AI Guide “take me to Earnings” and it will take you there.",
    },
  },
];

export const stepText = (step, lang) => step[guideLang(lang)] || step.fr;

export const stepForTab = (tabId) => STEPS.find((s) => s.tab === tabId) || null;

/** Libellé court d'un onglet (pour les boutons d'action). */
export function tabLabel(tabId, lang) {
  const step = stepForTab(tabId);
  return step ? stepText(step, lang).title : tabId;
}

/* ---------------- Textes d'interface ---------------- */

const UI = {
  fr: {
    chooseTitle: "Comment veux-tu découvrir BAARO ?",
    chooseSub: "Tu choisis : avec l'IA ou sans. Tu pourras changer à tout moment.",
    tourName: "Visite guidée",
    tourDesc: "Pas à pas, écran par écran. Sans IA, sans réseau, même en mode invité.",
    aiName: "Guide IA",
    aiDesc: "Pose tes questions. L'IA t'explique et t'emmène directement sur le bon écran.",
    later: "Plus tard",
    laterDesc: "Je me débrouille. Le bouton « ? » reste disponible.",
    prev: "Précédent",
    next: "Suivant",
    finish: "Terminer",
    quit: "Quitter",
    askAi: "Demander à l'IA",
    switchToTour: "Passer à la visite guidée",
    switchToAi: "Passer au Guide IA",
    changeMode: "Changer de mode",
    step: "Étape",
    help: "Aide et guide",
    aiTitle: "Guide IA",
    aiHello: "Salut ! Je t'explique comment fonctionne BAARO. Pose-moi une question, ou touche une suggestion.",
    placeholder: "Pose ta question…",
    send: "Envoyer",
    thinking: "Je réfléchis…",
    goTo: "Aller à",
    fallbackNote: "L'IA est indisponible, voici la réponse du guide intégré :",
    explainScreen: "Explique-moi cet écran",
    howEarn: "Comment gagner de l'argent ?",
    whereStart: "Par où commencer ?",
    offlineQ: "Comment marche le hors-ligne ?",
    unknownLocal: "Je n'ai pas trouvé de réponse précise. Voici l'aperçu général :",
    guestHint: "Tu es en mode invité : la visite guidée marche sans compte.",
    close: "Fermer",
  },
  en: {
    chooseTitle: "How do you want to discover BAARO?",
    chooseSub: "Your call: with AI or without. You can switch anytime.",
    tourName: "Guided tour",
    tourDesc: "Step by step, screen by screen. No AI, no network, even as a guest.",
    aiName: "AI Guide",
    aiDesc: "Ask questions. The AI explains and takes you straight to the right screen.",
    later: "Later",
    laterDesc: "I'll figure it out. The “?” button stays available.",
    prev: "Previous",
    next: "Next",
    finish: "Finish",
    quit: "Quit",
    askAi: "Ask the AI",
    switchToTour: "Switch to the guided tour",
    switchToAi: "Switch to the AI Guide",
    changeMode: "Change mode",
    step: "Step",
    help: "Help and guide",
    aiTitle: "AI Guide",
    aiHello: "Hi! I explain how BAARO works. Ask me a question, or tap a suggestion.",
    placeholder: "Ask your question…",
    send: "Send",
    thinking: "Thinking…",
    goTo: "Go to",
    fallbackNote: "The AI is unavailable, here is the built-in guide's answer:",
    explainScreen: "Explain this screen",
    howEarn: "How do I earn money?",
    whereStart: "Where do I start?",
    offlineQ: "How does offline work?",
    unknownLocal: "I couldn't find a precise answer. Here's the general overview:",
    guestHint: "You're browsing as a guest: the guided tour works without an account.",
    close: "Close",
  },
};

export const ui = (lang) => UI[guideLang(lang)];

/* ---------------- Réponse locale (sans IA) ---------------- */

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Cherche dans les étapes celle qui correspond le mieux à la question.
 * Retourne { text, tabs } : texte prêt à afficher + onglets à proposer.
 */
export function answerLocally(question, currentTab, lang) {
  const q = normalize(question);
  const words = new Set(q.split(/[^a-z0-9]+/).filter((w) => w.length > 1));
  const strings = ui(lang);

  const scored = STEPS.map((step) => {
    let score = 0;
    for (const kw of step.keywords) {
      const k = normalize(kw);
      if (!k) continue;
      if (k.includes(" ") || k.includes("-")) {
        if (q.includes(k)) score += 3;
      } else if (words.has(k)) {
        score += 3;
      } else if (k.length > 4 && q.includes(k)) {
        score += 1;
      }
    }
    return { step, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  // « Explique cet écran » : on s'appuie sur l'onglet actif.
  const asksCurrent = /(cet ecran|this screen|ici|here|ou suis)/.test(q);
  if (asksCurrent) {
    const cur = stepForTab(currentTab);
    if (cur) {
      const t = stepText(cur, lang);
      return { text: `**${t.title}** — ${t.body}\n- ${t.tip}`, tabs: [] };
    }
  }

  if (scored.length) {
    const top = scored.slice(0, 2);
    const text = top
      .map(({ step }) => {
        const t = stepText(step, lang);
        return `**${t.title}** — ${t.body}\n- ${t.tip}`;
      })
      .join("\n\n");
    const tabs = top.map(({ step }) => step.tab).filter(isGuideTab);
    return { text, tabs };
  }

  const welcome = stepText(STEPS[0], lang);
  return {
    text: `${strings.unknownLocal}\n\n**${welcome.title}** — ${welcome.body}`,
    tabs: GUIDE_TAB_IDS.slice(0, 3),
  };
}

/**
 * Extrait les actions « [[go:tab]] » d'une réponse de l'IA.
 * Seuls les onglets connus sont acceptés (le texte vient d'un modèle).
 */
export function parseGuideReply(raw) {
  const tabs = [];
  const text = String(raw || "")
    .replace(/\[\[go:([a-z]+)\]\]/gi, (_, id) => {
      const tab = id.toLowerCase();
      if (isGuideTab(tab) && !tabs.includes(tab)) tabs.push(tab);
      return "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return { text, tabs: tabs.slice(0, 3) };
}
