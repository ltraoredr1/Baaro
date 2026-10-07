import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

export default function AdminSchemaGuard({ children }){
  const [ok,setOk]=useState(false);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    (async()=>{
      const { data:{user} } = await supabase.auth.getUser();
      if(!user){ setLoading(false); return; }
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      setOk(data?.role==='admin');
      setLoading(false);
    })();
  },[]);
  if(loading) return <div className="p-4">Vérification...</div>;
  if(!ok) return <div className="p-4 text-red-500">Accès admin requis</div>;
  return children;
}
