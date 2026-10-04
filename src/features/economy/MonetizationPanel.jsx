import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../supabaseClient.js";
import { createPayment, formatAmount } from "../../lib/paymentProvider.js";
import { BadgeCheck, Bot, BriefcaseBusiness, Coins, Gift, Megaphone, Radio, Rocket, ShieldCheck, Sparkles, Store, Ticket, Users } from "lucide-react";

const ICONS={premium_monthly:BadgeCheck,vip_group_monthly:Users,pro_merchant_monthly:Store,ai_pack_10:Bot,cosmetics_pack_6:Sparkles,job_boost_7d:BriefcaseBusiness,live_ticket:Radio,training_ticket:Ticket,training_replay:Ticket,api_starter_monthly:Rocket,boost_post_24h:Rocket,sponsored_poll_1000:Megaphone,local_ad_2000:Megaphone,credits_120:Coins};
const money=(minor,c="XOF")=>formatAmount(Number(minor||0)/100,c);
const labels={premium_monthly:"Premium",vip_group_monthly:"Groupe VIP",pro_merchant_monthly:"BAARO Pro",ai_pack_10:"IA Pro",cosmetics_pack_6:"Cosmétiques",job_boost_7d:"Boost emploi",live_ticket:"Billet Live",training_ticket:"Formation Live",training_replay:"Replay formation",api_starter_monthly:"API / White-label",boost_post_24h:"Boost publication",sponsored_poll_1000:"Sondage sponsorisé",local_ad_2000:"Publicité locale",credits_120:"BAARO Credits"};

export function MonetizationPanel(){
 const { t } = useTranslation();
 const [data,setData]=useState(null),[busy,setBusy]=useState(null),[notice,setNotice]=useState(""),[provider,setProvider]=useState("cinetpay");
 const load=async()=>{const {data:d,error}=await supabase.rpc("get_monetization_dashboard");if(error)setNotice("Le catalogue de monétisation est temporairement indisponible.");else setData(d)};
 useEffect(()=>{load()},[]);
 const start=async(code)=>{setBusy(code);setNotice("");try{const {data:d,error}=await supabase.rpc("start_monetization_checkout",{p_product_code:code,p_metadata:{source:"economy"}});if(error)throw error;const payment=await createPayment({provider,checkoutIntentId:d.id});if(payment?.payment_url){window.location.href=payment.payment_url;return}throw new Error("URL de paiement manquante.")}catch(error){setNotice(error.message?.includes("PRODUCT_NOT_FOUND")?"Produit indisponible.":error.message||"Impossible de préparer le paiement.")}finally{setBusy(null);load()}};
 const products=(data?.products||[]);
 return <section className="space-y-4">
  <div className="rounded-3xl border border-orange-300/15 bg-gradient-to-br from-orange-300/[.10] via-white/[.03] to-transparent p-5">
   <div className="flex items-start gap-3"><ShieldCheck className="mt-1 text-orange-300"/><div><div className="text-xs font-black uppercase tracking-[.18em] text-orange-300">{t("economy.title")}</div><h2 className="mt-1 text-xl font-black text-white">Une économie où BAARO et ses utilisateurs gagnent ensemble.</h2><p className="mt-2 text-sm leading-6 text-white/55">Paiements en monnaie fiduciaire, registre serveur et contrôle anti-fraude. Les BAARO Credits restent des unités fermées utilisables uniquement dans BAARO.</p></div></div>
  </div>
  {notice&&<div className="rounded-xl border border-orange-300/20 bg-orange-300/5 px-3 py-2 text-xs text-orange-100">{notice}</div>}
  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[.025] p-3"><span className="text-xs font-bold text-white/55">Paiement :</span><select value={provider} onChange={e=>setProvider(e.target.value)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-white"><option value="cinetpay">CinetPay — Mobile Money / Carte</option><option value="stripe">Stripe — Carte internationale</option></select><span className="text-[11px] text-white/35">Le serveur vérifie toujours le prix et la propriété avant de créer le paiement.</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
   {products.map(p=>{const I=ICONS[p.code]||Coins;return <article key={p.code} className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-start justify-between gap-3"><span className="rounded-xl bg-orange-300/10 p-2 text-orange-300"><I size={18}/></span><span className="text-sm font-black text-white">{money(p.price_minor,p.currency)}</span></div><h3 className="mt-3 font-bold text-white">{labels[p.code]||p.name}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-white/45">{p.description}</p><button onClick={()=>start(p.code)} disabled={busy===p.code} className="mt-4 w-full rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white/15 disabled:opacity-50">{busy===p.code?"Préparation…":"Préparer le paiement"}</button></article>})}
  </div>
  <div className="grid gap-3 md:grid-cols-3">
   <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-center gap-2 text-white"><Coins size={17}/><b>BAARO Credits</b></div><div className="mt-2 text-2xl font-black text-white">{Number(data?.credits?.balance||0).toLocaleString("fr-FR")}</div><p className="text-xs text-white/40">Pas de retrait ni conversion cash.</p></div>
   <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-center gap-2 text-white"><Bot size={17}/><b>IA aujourd’hui</b></div><div className="mt-2 text-2xl font-black text-white">{Number(data?.ai_today?.units_used||0)}</div><p className="text-xs text-white/40">Unités consommées. Quota gratuit séparé du payant.</p></div>
   <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-center gap-2 text-white"><Megaphone size={17}/><b>Publicité</b></div><p className="mt-2 text-xs leading-5 text-white/45">Boost, campagnes locales et sondages sponsorisés vendent une portée mesurable, pas des votes garantis.</p></div>
  </div>
  <div className="rounded-2xl border border-emerald-300/10 bg-emerald-300/[.03] p-4"><div className="flex items-center gap-2 text-emerald-300"><Gift size={17}/><b>Règle de confiance</b></div><p className="mt-2 text-xs leading-5 text-white/50">Les abonnements, pourboires, marketplace, campagnes, affiliation et billets alimentent le registre économique serveur. Les remboursements et annulations doivent inverser l’écriture d’origine, jamais éditer un solde côté client.</p></div>
 </section>;
}
