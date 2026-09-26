import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 })
const ghosts = data.users.filter(u => u.is_anonymous && new Date(u.last_sign_in_at) < new Date(Date.now() - 30*24*60*60*1000))

console.log(`A supprimer: ${ghosts.length}`)
for (const u of ghosts) {
  await supabase.auth.admin.deleteUser(u.id)
  console.log(`deleted ${u.id}`)
}
console.log('Done - Free tier récupéré')
