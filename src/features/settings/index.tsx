import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  User, AtSign, Mail, Phone, Lock, Languages, BadgeCheck,
  Palette, Type, Sparkles, Eye, EyeOff, ShieldAlert, MonitorSmartphone,
  Bell, Volume2, Moon, Download, Wallet, CreditCard, FileDown,
  Repeat, KeyRound, HardDrive, Video, WifiOff,
  HelpCircle, Bug, FileText, Shield, LogOut, Trash2, Search,
  ChevronRight, Check, Globe, Smartphone, Laptop, Tablet,
  AlertTriangle, Zap, Droplets, Sun, MoonStar, Settings2,
  MessageCircle, Heart, MessageSquare, DollarSign, Radio, Scale,
  Fingerprint, ScanEye
} from 'lucide-react';

// --- BAARO Brand ---
const BRAND = {
  emerald: '#0f7b5a',
  emeraldDark: '#0c6147',
  gold: '#d4a017',
  goldLight: '#f6d55c',
};

type ThemeMode = 'clair' | 'sombre' | 'auto';
type Lang = 'FR' | 'BM' | 'EN';
type Accent = { name: string; color: string; id: string };

const accents: Accent[] = [
  { id: 'emerald', name: 'Baaro', color: '#0f7b5a' },
  { id: 'gold', name: 'Sahel', color: '#d4a017' },
  { id: 'terracotta', name: 'Bogolan', color: '#c75b39' },
  { id: 'indigo', name: 'Indigo', color: '#4f46e5' },
  { id: 'rose', name: 'Hibiscus', color: '#e11d48' },
];

type SettingItem = {
  id: string;
  label: string;
  desc?: string;
  icon: React.ReactNode;
  type: 'nav' | 'toggle' | 'select' | 'action';
  value?: any;
  badge?: string;
};

type Section = {
  id: string;
  title: string;
  icon: React.ReactNode;
  count?: string;
  items: SettingItem[];
};

function Toggle({ enabled, onChange, accentColor }: { enabled: boolean; onChange: (v: boolean) => void; accentColor: string }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className="relative inline-flex h-[30px] w-[52px] shrink-0 cursor-pointer items-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{
        backgroundColor: enabled ? accentColor : 'rgba(0,0,0,0.12)',
        boxShadow: enabled ? `0 0 0 1px ${accentColor}20 inset, 0 2px 8px ${accentColor}40` : 'inset 0 1px 3px rgba(0,0,0,0.12)',
      }}
    >
      <span
        className="pointer-events-none inline-block h-[24px] w-[24px] transform rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.1)] ring-0 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        style={{ transform: enabled ? 'translateX(25px)' : 'translateX(3px)' }}
      />
    </button>
  );
}

export default function App() {
  // --- Theme & Appearance States ---
  const [themeMode, setThemeMode] = useState<ThemeMode>('auto');
  const [isDark, setIsDark] = useState(false);
  const [accent, setAccent] = useState<Accent>(accents[0]);
  const [textSize, setTextSize] = useState(2); // 1-3
  const [reduceMotion, setReduceMotion] = useState(false);
  const [lang, setLang] = useState<Lang>('FR');
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState('compte');
  const contentRef = useRef<HTMLDivElement>(null);

  // --- Account ---
  const [email] = useState('ibrahim.traore@baaro.ml');
  const [phone] = useState('+223 70 12 34 56');

  // --- Privacy ---
  const [privateProfile, setPrivateProfile] = useState(false);
  const [hideWallet, setHideWallet] = useState(false);
  const [blockScreenshots, setBlockScreenshots] = useState(true);

  // --- Notifications ---
  const [notifSettings, setNotifSettings] = useState({
    likes: true,
    commentaires: true,
    messages: true,
    wallet: true,
    live: false,
    debates: true,
    silencieux: false,
    sons: true,
    offlineQueue: true,
  });

  // --- Wallet ---
  const [autoConvert, setAutoConvert] = useState(false);
  const [paymentMethods] = useState([
    { id: 'stripe', name: 'Stripe', active: true },
    { id: 'cinetpay', name: 'CinetPay', active: true },
    { id: 'om', name: 'Orange Money', active: true },
  ]);

  // --- Data ---
  const [videoQuality, setVideoQuality] = useState('auto');
  const [autoDownload, setAutoDownload] = useState('wifi');
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);
  const [cacheSize] = useState('342 Mo');

  // Theme detection
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      if (themeMode === 'auto') setIsDark(media.matches);
      else setIsDark(themeMode === 'sombre');
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [themeMode]);

  useEffect(() => {
    if (themeMode !== 'auto') setIsDark(themeMode === 'sombre');
  }, [themeMode]);

  // Scroll spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveSection(e.target.id);
        });
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );
    const sections = contentRef.current?.querySelectorAll('section[id]');
    sections?.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  const filteredSections = useMemo(() => {
    if (!search) return null;
    const q = search.toLowerCase();
    // simple filter logic
    return q;
  }, [search]);

  const sections: Section[] = [
    {
      id: 'compte',
      title: 'Compte',
      icon: <User size={16} />,
      items: [
        { id: 'edit-profil', label: 'Modifier profil', desc: 'Avatar, bio, liens sociaux', icon: <User size={18} />, type: 'nav' },
        { id: 'username', label: "Nom d'utilisateur", desc: '@ibrahim_traore', icon: <AtSign size={18} />, type: 'nav' },
        { id: 'email', label: 'Email', desc: email, icon: <Mail size={18} />, type: 'nav', badge: 'Vérifié' },
        { id: 'phone', label: 'Numéro', desc: phone, icon: <Phone size={18} />, type: 'nav', badge: 'Vérifié' },
        { id: 'password', label: 'Mot de passe & 2FA', desc: 'Sécurisé • 2FA activé', icon: <Fingerprint size={18} />, type: 'nav' },
        { id: 'lang', label: 'Langue', desc: `${lang} • Bamanankan, Français, English`, icon: <Languages size={18} />, type: 'select' },
        { id: 'kyc', label: 'Vérification KYC', desc: 'Niveau 2 • Limites augmentées', icon: <ScanEye size={18} />, type: 'nav', badge: 'Niveau 2' },
      ],
    },
    {
      id: 'apparence',
      title: 'Apparence',
      icon: <Palette size={16} />,
      items: [
        { id: 'theme', label: 'Thème', desc: 'Clair / Sombre / Auto', icon: <Sparkles size={18} />, type: 'select' },
        { id: 'accent', label: 'Couleur accent', desc: `${accent.name}`, icon: <Droplets size={18} />, type: 'select' },
        { id: 'textsize', label: 'Taille du texte', desc: textSize === 1 ? 'Petit' : textSize === 2 ? 'Standard' : 'Grand', icon: <Type size={18} />, type: 'select' },
        { id: 'reduce', label: 'Réduire les animations', desc: 'Pour économiser batterie', icon: <Zap size={18} />, type: 'toggle', value: reduceMotion },
      ],
    },
    {
      id: 'confidentialite',
      title: 'Confidentialité & Sécurité',
      icon: <Shield size={16} />,
      count: '3 actifs',
      items: [
        { id: 'private', label: 'Profil privé', desc: 'Seuls abonnés approuvés', icon: <EyeOff size={18} />, type: 'toggle', value: privateProfile },
        { id: 'hideWallet', label: 'Masquer wallet', desc: 'Cache solde sur profil public', icon: <Eye size={18} />, type: 'toggle', value: hideWallet },
        { id: 'blockScreen', label: 'Bloquer captures d’écran', desc: 'Contenus sensibles', icon: <MonitorSmartphone size={18} />, type: 'toggle', value: blockScreenshots },
        { id: 'sessions', label: 'Sessions actives', desc: '3 sessions • Bamako, Paris', icon: <Laptop size={18} />, type: 'nav', badge: '3' },
        { id: 'devices', label: 'Appareils connectés', desc: 'iPhone 15 • Galaxy S24', icon: <Smartphone size={18} />, type: 'nav' },
        { id: 'service-role', label: 'Alerte service-role', desc: 'Clés API côté client interdites', icon: <ShieldAlert size={18} />, type: 'action' },
      ],
    },
    {
      id: 'notifications',
      title: 'Notifications',
      icon: <Bell size={16} />,
      items: [
        { id: 'n-likes', label: 'Likes', icon: <Heart size={18} />, type: 'toggle', value: notifSettings.likes },
        { id: 'n-comments', label: 'Commentaires', icon: <MessageSquare size={18} />, type: 'toggle', value: notifSettings.commentaires },
        { id: 'n-messages', label: 'Messages', icon: <MessageCircle size={18} />, type: 'toggle', value: notifSettings.messages },
        { id: 'n-wallet', label: 'Wallet & Paiements', icon: <DollarSign size={18} />, type: 'toggle', value: notifSettings.wallet },
        { id: 'n-live', label: 'Lives', icon: <Radio size={18} />, type: 'toggle', value: notifSettings.live },
        { id: 'n-debates', label: 'Débats', icon: <Scale size={18} />, type: 'toggle', value: notifSettings.debates },
        { id: 'n-silent', label: 'Mode silencieux', desc: '22h - 7h', icon: <Moon size={18} />, type: 'toggle', value: notifSettings.silencieux },
        { id: 'n-sounds', label: 'Sons', icon: <Volume2 size={18} />, type: 'toggle', value: notifSettings.sons },
        { id: 'n-queue', label: 'File d’attente offline', desc: 'Envoie à la reconnexion', icon: <Download size={18} />, type: 'toggle', value: notifSettings.offlineQueue },
      ],
    },
    {
      id: 'wallet',
      title: 'Wallet & Paiements',
      icon: <Wallet size={16} />,
      items: [
        { id: 'methods', label: 'Méthodes de paiement', desc: 'Stripe • CinetPay • Orange Money', icon: <CreditCard size={18} />, type: 'nav' },
        { id: 'limits', label: 'Limites', desc: '5 000 BARO / jour • KYC L2', icon: <Scale size={18} />, type: 'nav' },
        { id: 'export', label: 'Exporter transactions', desc: 'CSV, PDF', icon: <FileDown size={18} />, type: 'nav' },
        { id: 'autoconvert', label: 'Auto-convert FCFA → BARO', icon: <Repeat size={18} />, type: 'toggle', value: autoConvert },
        { id: 'seed', label: 'Phrase de récupération', desc: '12 mots • Ne jamais partager', icon: <KeyRound size={18} />, type: 'nav', badge: 'Sécurisé' },
      ],
    },
    {
      id: 'donnees',
      title: 'Données & Stockage',
      icon: <HardDrive size={16} />,
      items: [
        { id: 'cache', label: 'Cache média', desc: cacheSize + ' • Vider', icon: <HardDrive size={18} />, type: 'nav' },
        { id: 'video', label: 'Qualité vidéo', desc: videoQuality.toUpperCase(), icon: <Video size={18} />, type: 'select' },
        { id: 'autodl', label: 'Auto-download', desc: autoDownload === 'wifi' ? 'Wi-Fi uniquement' : autoDownload, icon: <Download size={18} />, type: 'select' },
        { id: 'autotrans', label: 'Traduction auto', desc: 'FR ↔ BM', icon: <Languages size={18} />, type: 'toggle', value: autoTranslate },
        { id: 'offline', label: 'Mode offline', desc: 'Contenu sauvegardé disponible', icon: <WifiOff size={18} />, type: 'toggle', value: offlineMode },
      ],
    },
    {
      id: 'support',
      title: 'Support',
      icon: <HelpCircle size={16} />,
      items: [
        { id: 'help', label: "Centre d'aide", icon: <HelpCircle size={18} />, type: 'nav' },
        { id: 'bug', label: 'Signaler un bug', icon: <Bug size={18} />, type: 'nav' },
        { id: 'terms', label: 'Conditions', icon: <FileText size={18} />, type: 'nav' },
        { id: 'privacy', label: 'Confidentialité', icon: <Shield size={18} />, type: 'nav' },
        { id: 'version', label: 'Version', desc: '2.0.0-v20+ • À jour', icon: <Settings2 size={18} />, type: 'action', badge: 'À jour' },
        { id: 'logout', label: 'Déconnexion', icon: <LogOut size={18} />, type: 'action' },
        { id: 'delete', label: 'Supprimer le compte', desc: 'Action irréversible', icon: <Trash2 size={18} />, type: 'action' },
      ],
    },
  ];

  const visibleSections = useMemo(() => {
    if (!search) return sections;
    const q = search.toLowerCase();
    return sections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter(
          (it) => it.label.toLowerCase().includes(q) || (it.desc && it.desc.toLowerCase().includes(q)) || sec.title.toLowerCase().includes(q)
        ),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [search]);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    setActiveSection(id);
  };

  // --- Render helpers ---
  const handleToggle = (sectionId: string, itemId: string, current: boolean) => {
    // Example Supabase integration:
    // const { data } = await supabase.from('profiles').update({ [itemId]: !current }).eq('id', user.id)
    // walletApi.updatePrefs({ hide_balance: !current })
    if (sectionId === 'confidentialite') {
      if (itemId === 'private') setPrivateProfile(!current);
      if (itemId === 'hideWallet') setHideWallet(!current);
      if (itemId === 'blockScreen') setBlockScreenshots(!current);
    }
    if (sectionId === 'notifications') {
      const key = itemId.replace('n-', '') as keyof typeof notifSettings;
      // supabase.from('notification_prefs').upsert({ user_id, [key]: !current })
      if (key in notifSettings) setNotifSettings((s) => ({ ...s, [key]: !current } as any));
      if (itemId === 'n-likes') setNotifSettings((s) => ({ ...s, likes: !s.likes }));
      if (itemId === 'n-comments') setNotifSettings((s) => ({ ...s, commentaires: !s.commentaires }));
      if (itemId === 'n-messages') setNotifSettings((s) => ({ ...s, messages: !s.messages }));
      if (itemId === 'n-wallet') setNotifSettings((s) => ({ ...s, wallet: !s.wallet }));
      if (itemId === 'n-live') setNotifSettings((s) => ({ ...s, live: !s.live }));
      if (itemId === 'n-debates') setNotifSettings((s) => ({ ...s, debates: !s.debates }));
      if (itemId === 'n-silent') setNotifSettings((s) => ({ ...s, silencieux: !s.silencieux }));
      if (itemId === 'n-sounds') setNotifSettings((s) => ({ ...s, sons: !s.sons }));
      if (itemId === 'n-queue') setNotifSettings((s) => ({ ...s, offlineQueue: !s.offlineQueue }));
    }
    if (sectionId === 'wallet' && itemId === 'autoconvert') setAutoConvert(!current);
    if (sectionId === 'donnees') {
      if (itemId === 'autotrans') setAutoTranslate(!current);
      if (itemId === 'offline') setOfflineMode(!current);
    }
    if (sectionId === 'apparence' && itemId === 'reduce') setReduceMotion(!current);
  };

  return (
    <div
      className={`min-h-screen w-full antialiased selection:bg-[${BRAND.emerald}]/20 ${isDark ? 'dark' : ''}`}
      style={{
        fontFamily: `'General Sans', 'Inter', system-ui, -apple-system, sans-serif`,
        backgroundColor: isDark ? '#0a0f0d' : '#f6f7f4',
        color: isDark ? '#e8ebe6' : '#121412',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap');
        .font-display { font-family: 'Fraunces', serif; }
        .font-body { font-family: 'Inter', sans-serif; }
        * { -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { display: none; }
        .glass {
          backdrop-filter: blur(20px) saturate(1.4);
          -webkit-backdrop-filter: blur(20px) saturate(1.4);
        }
        .glass-strong {
          backdrop-filter: blur(28px) saturate(1.6);
          -webkit-backdrop-filter: blur(28px) saturate(1.6);
        }
      `}</style>

      {/* Mobile-first container - super-app shell */}
      <div className="mx-auto min-h-screen w-full max-w-[520px] relative bg-transparent">
        {/* Top gradient mesh */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden">
          <div className="absolute -top-[120px] left-1/2 h-[380px] w-[120%] -translate-x-1/2 rounded-[100%] opacity-[0.18]" style={{ background: `radial-gradient(60% 60% at 50% 40%, ${BRAND.emerald} 0%, transparent 70%)` }} />
          <div className="absolute -top-[60px] -right-[80px] h-[260px] w-[260px] rounded-full blur-[40px] opacity-[0.15]" style={{ background: BRAND.gold }} />
        </div>

        {/* Header */}
        <header className="sticky top-0 z-30 glass-strong border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4" style={{ backgroundColor: isDark ? 'rgba(16,24,20,0.82)' : 'rgba(255,255,255,0.78)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-black text-white dark:bg-white dark:text-black">
                <Settings2 size={18} />
              </div>
              <div>
                <h1 className="font-display text-[20px] font-bold tracking-[-0.02em] leading-none">Réglages</h1>
                <p className="font-body mt-0.5 text-[11px] font-medium uppercase tracking-widest opacity-60">Baaro 2.0 • Super-app</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] px-3 py-1.5 text-[11px] font-medium">
                <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> En ligne
              </div>
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 grid place-items-center text-[13px] font-semibold">🇲🇱</div>
            </div>
          </div>

          {/* Search */}
          <div className="mt-4 relative group">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40 group-focus-within:opacity-70 transition-opacity" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher: wallet, thème, 2FA, langue..."
              className="h-[44px] w-full rounded-2xl border border-black/[0.06] bg-black/[0.04] dark:bg-white/[0.06] dark:border-white/[0.08] pl-10 pr-4 text-[14px] font-medium placeholder:text-black/40 dark:placeholder:text-white/40 outline-none focus:ring-2 transition-all"
              style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)', ...(search ? { ['--tw-ring-color' as any]: accent.color } : {}) }}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/10 dark:bg-white/10 px-2.5 py-1 text-[11px] font-semibold">Effacer</button>
            )}
          </div>
        </header>

        {/* Profile Card */}
        <div className="px-5 pt-5">
          <div
            className="relative overflow-hidden rounded-[24px] p-[1px]"
            style={{
              background: `linear-gradient(135deg, ${accent.color}30, transparent 40%, ${BRAND.gold}30)`,
              boxShadow: `0 12px 32px -12px ${accent.color}40, 0 0 0 1px ${accent.color}10 inset`,
            }}
          >
            <div className="relative rounded-[23px] glass p-4" style={{ backgroundColor: isDark ? 'rgba(18,28,24,0.92)' : 'rgba(255,255,255,0.88)' }}>
              {/* supabase.auth.getUser() -> profile */}
              <div className="flex items-start gap-4">
                <div className="relative shrink-0">
                  <img
                    src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop&crop=face"
                    alt="avatar"
                    className="h-[64px] w-[64px] rounded-[18px] object-cover"
                    style={{ boxShadow: `0 0 0 2px white, 0 0 0 4px ${accent.color}30` }}
                  />
                  <div className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] ring-2 ring-white">
                    <BadgeCheck size={14} className="text-emerald-600" fill="currentColor" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-display text-[18px] font-bold leading-tight tracking-[-0.01em]">Ibrahim Traoré</h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm">
                      <Check size={10} strokeWidth={3} /> Vérifié
                    </span>
                  </div>
                  <p className="font-body mt-0.5 text-[13px] font-medium opacity-60">@ibrahim_traore • Bamako</p>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-full bg-black text-white dark:bg-white dark:text-black px-3 py-1.5 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
                      <div className="grid h-5 w-5 place-items-center rounded-full bg-white/15 dark:bg-black/10 text-[11px] font-bold">B</div>
                      <span className="text-[13px] font-bold tracking-tight">2,450 BARO</span>
                      <span className="text-[11px] opacity-70 font-medium">≈ 367 500 FCFA</span>
                    </div>
                    <button className="grid h-7 w-7 place-items-center rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 transition-colors">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* KYC progress */}
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] p-3">
                <div className="flex -space-x-1">
                  <div className="h-6 w-6 rounded-full bg-emerald-500 grid place-items-center ring-2 ring-white dark:ring-[#18211c]"><Check size={12} className="text-white" /></div>
                  <div className="h-6 w-6 rounded-full bg-emerald-500 grid place-items-center ring-2 ring-white dark:ring-[#18211c]"><Check size={12} className="text-white" /></div>
                  <div className="h-6 w-6 rounded-full bg-amber-400 grid place-items-center ring-2 ring-white dark:ring-[#18211c] text-[11px] font-bold">3</div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold leading-tight">KYC Niveau 2 • 80%</p>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div className="h-full rounded-full transition-all" style={{ width: '80%', background: accent.color }} />
                  </div>
                </div>
                <ChevronRight size={16} className="opacity-40" />
              </div>

              {/* supabase.from('profiles').select('kyc_status') */}
              <p className="mt-3 text-[10px] font-medium leading-relaxed opacity-50">💡 Astuce Baaro: Finalise KYC Niveau 3 pour débloquer retraits illimités Orange Money & virements instantanés.</p>
            </div>
          </div>
        </div>

        {/* Sticky Sub-nav */}
        <nav className="sticky top-[101px] z-20 -mx-px mt-5 border-y border-black/[0.06] dark:border-white/[0.06] glass-strong px-2 py-2.5" style={{ backgroundColor: isDark ? 'rgba(16,24,20,0.84)' : 'rgba(246,247,244,0.9)' }}>
          <div className="flex gap-2 overflow-x-auto px-3 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={`group inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold tracking-[-0.01em] transition-all duration-200 ${activeSection === s.id ? 'text-white shadow-[0_4px_12px_rgba(0,0,0,0.12)]' : 'bg-black/[0.06] dark:bg-white/[0.07] hover:bg-black/[0.08] dark:hover:bg-white/[0.10] opacity-80 hover:opacity-100'}`}
                style={activeSection === s.id ? { backgroundColor: accent.color } : {}}
              >
                <span className={`${activeSection === s.id ? 'opacity-90' : 'opacity-70'}`}>{s.icon}</span>
                {s.title}
                {s.count && <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{s.count}</span>}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div ref={contentRef} className="px-5 pb-28 pt-6 space-y-8">
          {visibleSections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-[150px]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-0.01em]">
                  <span className="grid h-7 w-7 place-items-center rounded-full text-white" style={{ backgroundColor: accent.color }}>{section.icon}</span>
                  {section.title}
                </h3>
                <span className="text-[11px] font-medium opacity-50">{section.items.length} éléments</span>
              </div>

              {/* Special handling for Appearance section to show previews */}
              {section.id === 'apparence' ? (
                <div className="space-y-3">
                  {/* Theme selector with preview */}
                  <div className="rounded-[20px] border border-black/[0.06] dark:border-white/[0.08] glass p-4" style={{ backgroundColor: isDark ? 'rgba(22,32,27,0.9)' : 'rgba(255,255,255,0.85)' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10"><Sparkles size={18} /></div>
                        <div>
                          <p className="text-[13.5px] font-semibold">Thème</p>
                          <p className="text-[11.5px] opacity-60">Clair / Sombre / Auto</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.06] p-1">
                        {(['clair', 'sombre', 'auto'] as ThemeMode[]).map((m) => (
                          <button
                            key={m}
                            onClick={() => setThemeMode(m)}
                            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold capitalize transition-all ${themeMode === m ? 'bg-black text-white dark:bg-white dark:text-black shadow' : 'opacity-70 hover:opacity-100'}`}
                          >
                            <span className="inline-flex items-center gap-1">
                              {m === 'clair' && <Sun size={12} />}
                              {m === 'sombre' && <MoonStar size={12} />}
                              {m === 'auto' && <Settings2 size={12} />}
                              {m}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Preview */}
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {[
                        { id: 'clair', label: 'Clair', bg: '#ffffff', text: '#121412' },
                        { id: 'sombre', label: 'Sombre', bg: '#121814', text: '#e8ebe6' },
                        { id: 'auto', label: 'Auto', bg: isDark ? '#121814' : '#ffffff', text: isDark ? '#e8ebe6' : '#121412' },
                      ].map((p) => (
                        <div
                          key={p.id}
                          onClick={() => setThemeMode(p.id as ThemeMode)}
                          className={`cursor-pointer rounded-2xl border p-2.5 transition-all ${themeMode === p.id ? 'ring-2 ring-offset-2' : 'opacity-80 hover:opacity-100'}`}
                          style={{ background: p.bg, color: p.text, borderColor: themeMode === p.id ? accent.color : 'rgba(0,0,0,0.08)', ['--tw-ring-color' as any]: accent.color } as any}
                        >
                          <div className="h-8 rounded-lg" style={{ background: `${accent.color}18` }} />
                          <div className="mt-2 space-y-1">
                            <div className="h-1.5 w-3/4 rounded-full bg-current opacity-20" />
                            <div className="h-1.5 w-1/2 rounded-full bg-current opacity-10" />
                          </div>
                          <p className="mt-2 text-[11px] font-semibold">{p.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Accent color */}
                  <div className="rounded-[20px] border border-black/[0.06] dark:border-white/[0.08] glass p-4" style={{ backgroundColor: isDark ? 'rgba(22,32,27,0.9)' : 'rgba(255,255,255,0.85)' }}>
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10"><Droplets size={18} /></div>
                      <div className="flex-1">
                        <p className="text-[13.5px] font-semibold">Couleur accent</p>
                        <p className="text-[11.5px] opacity-60">Inspirée du bogolan & du Sahel</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2.5">
                      {accents.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => setAccent(a)}
                          className={`group relative grid h-11 w-11 place-items-center rounded-full transition-all duration-300 ${accent.id === a.id ? 'scale-110 shadow-[0_6px_18px_rgba(0,0,0,0.18)] ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#161d1a]' : 'hover:scale-105'}`}
                          style={{ backgroundColor: a.color, ['--tw-ring-color' as any]: a.color } as any}
                          aria-label={a.name}
                        >
                          {accent.id === a.id && <Check size={16} className="text-white drop-shadow" strokeWidth={3} />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Text size & reduce motion */}
                  <div className="rounded-[20px] border border-black/[0.06] dark:border-white/[0.08] glass divide-y divide-black/[0.06] dark:divide-white/[0.06] overflow-hidden" style={{ backgroundColor: isDark ? 'rgba(22,32,27,0.9)' : 'rgba(255,255,255,0.85)' }}>
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10"><Type size={18} /></div>
                        <div>
                          <p className="text-[13.5px] font-semibold">Taille du texte</p>
                          <p className="text-[11.5px] opacity-60">{textSize === 1 ? 'Petit' : textSize === 2 ? 'Standard • Recommandé' : 'Grand • Accessibilité'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 rounded-full bg-black/[0.06] dark:bg-white/[0.08] p-1">
                        {[
                          { v: 1, l: 'A' },
                          { v: 2, l: 'A' },
                          { v: 3, l: 'A' },
                        ].map((s) => (
                          <button key={s.v} onClick={() => setTextSize(s.v)} className={`h-8 w-8 rounded-full text-[12px] font-bold transition-all ${textSize === s.v ? 'bg-black text-white dark:bg-white dark:text-black' : 'opacity-60'}`} style={{ fontSize: s.v === 1 ? 11 : s.v === 2 ? 13 : 15 }}>
                            {s.l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10"><Zap size={18} /></div>
                        <div>
                          <p className="text-[13.5px] font-semibold">Réduire les animations</p>
                          <p className="text-[11.5px] opacity-60">Mode éco • Batterie</p>
                        </div>
                      </div>
                      <Toggle enabled={reduceMotion} onChange={setReduceMotion} accentColor={accent.color} />
                    </div>
                  </div>
                </div>
              ) : section.id === 'compte' ? (
                <div className="space-y-3">
                  {/* Language special */}
                  <div className="rounded-[20px] border border-black/[0.06] dark:border-white/[0.08] glass overflow-hidden" style={{ backgroundColor: isDark ? 'rgba(22,32,27,0.9)' : 'rgba(255,255,255,0.85)' }}>
                    {section.items.map((item) => {
                      if (item.id === 'lang') {
                        return (
                          <div key={item.id} className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10">{item.icon}</div>
                              <div className="flex-1">
                                <p className="text-[13.5px] font-semibold">{item.label}</p>
                                <p className="text-[11.5px] opacity-60">{item.desc}</p>
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              {(['FR', 'BM', 'EN'] as Lang[]).map((l) => (
                                <button
                                  key={l}
                                  onClick={() => setLang(l)}
                                  className={`rounded-xl border px-3 py-2.5 text-left transition-all ${lang === l ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black shadow' : 'border-black/10 dark:border-white/10 hover:border-black/20'}`}
                                >
                                  <p className="text-[12px] font-bold">{l}</p>
                                  <p className="text-[10px] opacity-70">{l === 'FR' ? 'Français' : l === 'BM' ? 'Bamanankan' : 'English'}</p>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={item.id} className="group flex items-center gap-3 border-b border-black/[0.06] dark:border-white/[0.06] p-4 last:border-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors cursor-pointer">
                          <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10 group-hover:bg-black/10 dark:group-hover:bg-white/15 transition-colors">{item.icon}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-[13.5px] font-semibold">{item.label}</p>
                              {item.badge && <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">{item.badge}</span>}
                            </div>
                            <p className="truncate text-[11.5px] opacity-60">{item.desc}</p>
                          </div>
                          <ChevronRight size={16} className="opacity-30 group-hover:opacity-70 transition-opacity" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : section.id === 'confidentialite' ? (
                <div className="space-y-3">
                  <div className="rounded-[20px] border border-black/[0.06] dark:border-white/[0.08] glass overflow-hidden divide-y divide-black/[0.06] dark:divide-white/[0.06]" style={{ backgroundColor: isDark ? 'rgba(22,32,27,0.9)' : 'rgba(255,255,255,0.85)' }}>
                    {section.items.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 p-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10 shrink-0">{item.icon}</div>
                          <div className="min-w-0">
                            <p className="text-[13.5px] font-semibold">{item.label}</p>
                            <p className="truncate text-[11.5px] opacity-60">{item.desc}</p>
                          </div>
                        </div>
                        <Toggle enabled={item.value} onChange={(v) => handleToggle(section.id, item.id, item.value)} accentColor={accent.color} />
                      </div>
                    ))}
                  </div>

                  <div className="rounded-[20px] border border-black/[0.06] dark:border-white/[0.08] glass overflow-hidden divide-y divide-black/[0.06] dark:divide-white/[0.06]" style={{ backgroundColor: isDark ? 'rgba(22,32,27,0.9)' : 'rgba(255,255,255,0.85)' }}>
                    {section.items.slice(3, 5).map((item) => (
                      <div key={item.id} className="group flex items-center gap-3 p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors cursor-pointer">
                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10">{item.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[13.5px] font-semibold">{item.label}</p>
                            {item.badge && <span className="rounded-full bg-black text-white dark:bg-white dark:text-black px-2 py-0.5 text-[10px] font-bold">{item.badge}</span>}
                          </div>
                          <p className="truncate text-[11.5px] opacity-60">{item.desc}</p>
                        </div>
                        <ChevronRight size={16} className="opacity-30 group-hover:opacity-70" />
                      </div>
                    ))}
                  </div>

                  {/* Service-role warning card */}
                  <div className="rounded-[20px] border border-amber-500/20 bg-amber-500/[0.08] p-4">
                    <div className="flex gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-amber-500 text-white shrink-0"><AlertTriangle size={16} /></div>
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5"><ShieldAlert size={14} /> Service-role warning</p>
                        <p className="mt-1 text-[11.5px] leading-relaxed opacity-80">
                          Ne jamais exposer <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[10px]">SUPABASE_SERVICE_ROLE_KEY</code> côté client (Capacitor). Utilise RLS + <code className="font-mono text-[10px]">supabase.auth</code> uniquement.
                        </p>
                        <p className="mt-2 font-mono text-[10px] opacity-60">/* supabase.from('profiles').select() with RLS */</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : section.id === 'notifications' ? (
                <div className="rounded-[20px] border border-black/[0.06] dark:border-white/[0.08] glass overflow-hidden" style={{ backgroundColor: isDark ? 'rgba(22,32,27,0.9)' : 'rgba(255,255,255,0.85)' }}>
                  <div className="grid grid-cols-1 divide-y divide-black/[0.06] dark:divide-white/[0.06]">
                    {section.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 p-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10 shrink-0">{item.icon}</div>
                          <div className="min-w-0">
                            <p className="text-[13.5px] font-semibold">{item.label}</p>
                            {item.desc && <p className="text-[11.5px] opacity-60">{item.desc}</p>}
                          </div>
                        </div>
                        <Toggle enabled={item.value} onChange={(v) => handleToggle(section.id, item.id, item.value)} accentColor={accent.color} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : section.id === 'wallet' ? (
                <div className="space-y-3">
                  <div className="rounded-[20px] border border-black/[0.06] dark:border-white/[0.08] glass p-4" style={{ backgroundColor: isDark ? 'rgba(22,32,27,0.9)' : 'rgba(255,255,255,0.85)' }}>
                    <p className="text-[11px] font-bold uppercase tracking-widest opacity-60">Méthodes actives</p>
                    <div className="mt-3 flex gap-2">
                      {paymentMethods.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 rounded-full border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.06] px-3 py-2">
                          <div className="h-2 w-2 rounded-full bg-emerald-500" />
                          <span className="text-[12px] font-semibold">{m.name}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 font-mono text-[10px] opacity-50">// walletApi.listMethods() → Stripe, CinetPay, Orange Money</p>
                  </div>

                  <div className="rounded-[20px] border border-black/[0.06] dark:border-white/[0.08] glass overflow-hidden divide-y divide-black/[0.06] dark:divide-white/[0.06]" style={{ backgroundColor: isDark ? 'rgba(22,32,27,0.9)' : 'rgba(255,255,255,0.85)' }}>
                    {section.items.slice(1).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 p-4 group hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors cursor-pointer">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10">{item.icon}</div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-[13.5px] font-semibold">{item.label}</p>
                              {item.badge && <span className="rounded-full bg-black text-white dark:bg-white dark:text-black px-2 py-0.5 text-[10px] font-bold">{item.badge}</span>}
                            </div>
                            {item.desc && <p className="text-[11.5px] opacity-60 truncate">{item.desc}</p>}
                          </div>
                        </div>
                        {item.type === 'toggle' ? (
                          <Toggle enabled={item.value} onChange={(v) => handleToggle(section.id, item.id, item.value)} accentColor={accent.color} />
                        ) : (
                          <ChevronRight size={16} className="opacity-30 group-hover:opacity-70" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : section.id === 'donnees' ? (
                <div className="rounded-[20px] border border-black/[0.06] dark:border-white/[0.08] glass overflow-hidden divide-y divide-black/[0.06] dark:divide-white/[0.06]" style={{ backgroundColor: isDark ? 'rgba(22,32,27,0.9)' : 'rgba(255,255,255,0.85)' }}>
                  {section.items.map((item) => {
                    if (item.id === 'video' || item.id === 'autodl') {
                      return (
                        <div key={item.id} className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10">{item.icon}</div>
                            <div className="flex-1">
                              <p className="text-[13.5px] font-semibold">{item.label}</p>
                              <p className="text-[11.5px] opacity-60">{item.desc}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex gap-1.5">
                            {(item.id === 'video' ? ['auto', '720p', '1080p'] : ['jamais', 'wifi', 'toujours']).map((opt) => {
                              const active = item.id === 'video' ? videoQuality === opt : autoDownload === opt;
                              return (
                                <button
                                  key={opt}
                                  onClick={() => (item.id === 'video' ? setVideoQuality(opt) : setAutoDownload(opt))}
                                  className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold capitalize transition-all ${active ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/5 dark:bg-white/10 opacity-70 hover:opacity-100'}`}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-3 p-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10 shrink-0">{item.icon}</div>
                          <div className="min-w-0">
                            <p className="text-[13.5px] font-semibold">{item.label}</p>
                            {item.desc && <p className="text-[11.5px] opacity-60">{item.desc}</p>}
                          </div>
                        </div>
                        {item.type === 'toggle' ? (
                          <Toggle enabled={item.value} onChange={(v) => handleToggle(section.id, item.id, item.value)} accentColor={accent.color} />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-medium opacity-60">{item.desc}</span>
                            <ChevronRight size={16} className="opacity-30" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : section.id === 'support' ? (
                <div className="space-y-3">
                  <div className="rounded-[20px] border border-black/[0.06] dark:border-white/[0.08] glass overflow-hidden divide-y divide-black/[0.06] dark:divide-white/[0.06]" style={{ backgroundColor: isDark ? 'rgba(22,32,27,0.9)' : 'rgba(255,255,255,0.85)' }}>
                    {section.items.slice(0, 4).map((item) => (
                      <div key={item.id} className="group flex items-center gap-3 p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] cursor-pointer transition-colors">
                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10">{item.icon}</div>
                        <p className="flex-1 text-[13.5px] font-semibold">{item.label}</p>
                        <ChevronRight size={16} className="opacity-30 group-hover:opacity-70" />
                      </div>
                    ))}
                    <div className="flex items-center justify-between p-4 group hover:bg-black/[0.02] dark:hover:bg-white/[0.03] cursor-pointer transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10"><Settings2 size={18} /></div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-[13.5px] font-semibold">Version</p>
                            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">À jour</span>
                          </div>
                          <p className="text-[11.5px] opacity-60">2.0.0-v20+ • Build 2140 • Bamako</p>
                        </div>
                      </div>
                      <button className="rounded-full bg-black text-white dark:bg-white dark:text-black px-3.5 py-1.5 text-[11px] font-bold">Vérifier</button>
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-black/[0.06] dark:border-white/[0.08] glass overflow-hidden" style={{ backgroundColor: isDark ? 'rgba(22,32,27,0.9)' : 'rgba(255,255,255,0.85)' }}>
                    <button className="flex w-full items-center gap-3 p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors text-left">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10"><LogOut size={18} /></div>
                      <p className="text-[13.5px] font-semibold">Déconnexion</p>
                    </button>
                  </div>

                  {/* Danger zone */}
                  <div className="rounded-[20px] border border-red-500/20 bg-red-500/[0.06] p-[1px]">
                    <div className="rounded-[19px] bg-red-50/80 dark:bg-red-950/20 p-1">
                      <div className="flex items-center gap-3 rounded-[14px] bg-white dark:bg-black/20 p-4">
                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-red-500 text-white"><Trash2 size={18} /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13.5px] font-bold text-red-600 dark:text-red-400">Supprimer le compte</p>
                          <p className="text-[11.5px] opacity-70">Action irréversible • 30j de grâce • Wallet gelé</p>
                        </div>
                        <ChevronRight size={16} className="text-red-500/60" />
                      </div>
                      <p className="px-4 py-2.5 text-[10px] font-medium leading-relaxed text-red-700/70 dark:text-red-300/60">
                        {/* supabase.auth.signOut() + supabase.from('profiles').delete() with RLS check */}
                        Danger zone: supprime profil, BARO non réclamés brûlés après 30j. Contacter support@baaro.ml avant.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[20px] border border-black/[0.06] dark:border-white/[0.08] glass overflow-hidden divide-y divide-black/[0.06] dark:divide-white/[0.06]" style={{ backgroundColor: isDark ? 'rgba(22,32,27,0.9)' : 'rgba(255,255,255,0.85)' }}>
                  {section.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10">{item.icon}</div>
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-semibold">{item.label}</p>
                          {item.desc && <p className="text-[11.5px] opacity-60 truncate">{item.desc}</p>}
                        </div>
                      </div>
                      {item.type === 'toggle' ? (
                        <Toggle enabled={item.value} onChange={(v) => handleToggle(section.id, item.id, item.value)} accentColor={accent.color} />
                      ) : (
                        <ChevronRight size={16} className="opacity-30" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}

          {/* Code integration footer */}
          <div className="rounded-[20px] border border-dashed border-black/15 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.03] p-4">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest opacity-60"><Globe size={12} /> Intégration Supabase • BAARO 2.0</p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-black text-[11px] leading-relaxed text-emerald-300 p-3.5 font-mono">
{`// src/features/settings/index.tsx
// Auth
const { data: { user } } = await supabase.auth.getUser()

// Profil
const { data: profile } = await supabase
  .from('profiles')
  .select('username, kyc_level, lang')
  .eq('id', user.id).single()

// Wallet — jamais côté client avec service-role
// walletApi.getBalance() -> supabase.functions.invoke('wallet-balance')
// RLS: auth.uid() = user_id

// Préférences
await supabase.from('user_settings').upsert({
  user_id: user.id,
  theme: '${themeMode}',
  accent: '${accent.id}',
  private_profile: ${privateProfile},
  hide_wallet: ${hideWallet}
})`}
            </pre>
          </div>

          {/* Footer */}
          <footer className="pt-2 pb-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 px-4 py-2 glass">
              <div className="h-5 w-5 rounded-full grid place-items-center text-[10px] font-bold text-white" style={{ backgroundColor: BRAND.emerald }}>B</div>
              <p className="text-[11px] font-medium tracking-[-0.01em] opacity-70">Baaro - Super-app communautaire • Bamako</p>
              <span className="h-1 w-1 rounded-full bg-black/20 dark:bg-white/20" />
              <p className="text-[10px] font-bold opacity-50">v2.0.0-v20+</p>
            </div>
            <p className="mt-4 text-[10px] leading-relaxed opacity-40 max-w-[320px] mx-auto">
              Made with ♥ in Bamako. Bogolan, terracotta & Sahel gold. Propulsé par Supabase • Capacitor • BARO Chain
            </p>
          </footer>
        </div>

        {/* Bottom safe area for Capacitor */}
        <div className="h-[env(safe-area-inset-bottom)] bg-transparent" />
      </div>

      {/* Global accent style */}
      <style>{`
        :root { --accent: ${accent.color}; }
        button:focus-visible, input:focus-visible { outline: 2px solid ${accent.color}; outline-offset: 2px; }
      `}</style>
    </div>
  );
}
