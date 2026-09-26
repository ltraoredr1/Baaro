import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // Sécurité : seul le cron Supabase peut appeler
  // Tu peux aussi ajouter un secret si tu veux l'appeler manuellement
  
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const DAYS = 7
  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000)
  
  console.log(`[Baaro cleanup] Suppression anonymes < ${cutoff.toISOString()}`)

  const { data: list } = await supabaseAdmin.auth.admin.listUsers({
    perPage: 1000,
    page: 1
  })

  const ghosts = list.users.filter(u => 
    u.is_anonymous === true && 
    u.last_sign_in_at && new Date(u.last_sign_in_at) < cutoff
  )

  let deleted = 0
  let skipped = 0

  for (const u of ghosts) {
    // GARDE-FOU BAARO : ne supprime pas si solde > 0
    const { data: wallet } = await supabaseAdmin
      .from('wallets')
      .select('balance')
      .eq('id', u.id)
      .single()
    
    if (wallet && wallet.balance > 0) { skipped++; continue }

    // GARDE-FOU : ne supprime pas si il a posté
    const { count: postCount } = await supabaseAdmin
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', u.id)

    if (postCount && postCount > 0) { skipped++; continue }

    // Nettoyage tables liées (à cause de ta règle FK = auth.users.id)
    await supabaseAdmin.from('push_tokens').delete().eq('user_id', u.id)
    await supabaseAdmin.from('profiles').delete().eq('id', u.id)
    await supabaseAdmin.from('wallets').delete().eq('id', u.id).eq('balance', 0)
    await supabaseAdmin.from('crypto_holdings').delete().eq('id', u.id)
    await supabaseAdmin.from('device_accounts').delete().eq('id', u.id)

    // Suppression finale auth
    const { error } = await supabaseAdmin.auth.admin.deleteUser(u.id)
    if (!error) deleted++
  }

  return new Response(
    JSON.stringify({ 
      date: new Date().toISOString(),
      scanned: ghosts.length,
      deleted,
      skipped,
      cutoff: cutoff.toISOString()
    }),
    { headers: { "Content-Type": "application/json" } }
  )
})
