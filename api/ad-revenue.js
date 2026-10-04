import { applyCors, getAdminClient, rateLimitAsync } from './_shared.js';
const SECRET = process.env.BAARO_AD_REVENUE_SECRET || '';

export default async function handler(req,res){
  if(applyCors(req,res)) return;
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Méthode non autorisée.'});
  const limit=await rateLimitAsync(req,{key:'ad-revenue',max:60,windowMs:60000});
  if(!limit.ok) return res.status(limit.status).json(limit.body);
  if(!SECRET || req.headers['x-baaro-ad-secret']!==SECRET) return res.status(401).json({ok:false,error:'Non autorisé.'});
  try{
    const b=req.body||{};
    const creatorId=String(b.creator_id||'');
    const grossMinor=Number(b.gross_minor);
    const feeMinor=Number(b.provider_fee_minor||0);
    const idempotency=String(b.idempotency_key||'');
    if(!creatorId||!idempotency||!Number.isSafeInteger(grossMinor)||grossMinor<=0||!Number.isSafeInteger(feeMinor)||feeMinor<0||feeMinor>grossMinor) return res.status(400).json({ok:false,error:'Données de revenu publicitaire invalides.'});
    const admin=getAdminClient();
    const {data,error}=await admin.rpc('record_ad_creator_revenue',{p_idempotency_key:idempotency,p_creator_id:creatorId,p_gross_minor:grossMinor,p_provider_fee_minor:feeMinor,p_reference_id:b.reference_id||null,p_metadata:b.metadata||{}});
    if(error) throw error;
    return res.status(200).json({ok:true,ledger_id:data});
  }catch(e){return res.status(500).json({ok:false,error:e.message||'Revenu publicitaire impossible.'});}
}
