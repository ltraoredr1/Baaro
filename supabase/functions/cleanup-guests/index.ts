
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAYS = 7;
const PAGE_SIZE = 1000;

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function isOldEnough(user: {
  last_sign_in_at?: string | null;
  created_at?: string | null;
}, cutoff: Date): boolean {
  const timestamp = user.last_sign_in_at || user.created_at;

  if (!timestamp) return false;

  const date = new Date(timestamp);

  return !Number.isNaN(date.getTime()) && date < cutoff;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const cronSecret = Deno.env.get("CLEANUP_CRON_SECRET") || "";
  const authorization = req.headers.get("Authorization") || "";

  if (!cronSecret) {
    console.error("[Baaro cleanup] Cron secret is not configured.");
    return jsonResponse({ error: "Service unavailable" }, 503);
  }

  if (authorization !== `Bearer ${cronSecret}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[Baaro cleanup] Server configuration missing.");
    return jsonResponse({ error: "Service unavailable" }, 503);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

  console.log(
    `[Baaro cleanup] Starting cleanup. Cutoff: ${cutoff.toISOString()}`,
  );

  try {
    // Collect every page before deleting users. Otherwise, deleting users
    // while paging can shift page boundaries and cause users to be skipped.
    const users: Array<{
      id: string;
      is_anonymous?: boolean;
      last_sign_in_at?: string | null;
      created_at?: string;
    }> = [];

    for (let page = 1; ; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        perPage: PAGE_SIZE,
        page,
      });

      if (error || !data?.users) {
        console.error("[Baaro cleanup] Failed to list users.");
        return jsonResponse({ error: "Could not list users" }, 500);
      }

      users.push(...data.users);

      if (data.users.length < PAGE_SIZE) break;
    }

    const ghosts = users.filter(
      (user) =>
        user.is_anonymous === true &&
        isOldEnough(user, cutoff),
    );

    let deleted = 0;
    let skipped = 0;

    for (const user of ghosts) {
      try {
        // Read the wallet. An error must never be interpreted as an
        // empty wallet.
        const { data: wallet, error: walletError } = await supabaseAdmin
          .from("wallets")
          .select("balance")
          .eq("id", user.id)
          .maybeSingle();

        if (walletError) {
          skipped++;
          console.error("[Baaro cleanup] Wallet check failed.");
          continue;
        }

        if (wallet) {
          const balance = Number(wallet.balance);

          // Protect all non-zero and invalid balances.
          if (!Number.isFinite(balance) || balance !== 0) {
            skipped++;
            continue;
          }
        }

        // Do not delete an account with posts, or when the check fails.
        const { count: postCount, error: postsError } = await supabaseAdmin
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("author_id", user.id);

        if (postsError || postCount === null) {
          skipped++;
          console.error("[Baaro cleanup] Post check failed.");
          continue;
        }

        if (postCount > 0) {
          skipped++;
          continue;
        }

        // Conservatively protect accounts that have any crypto holdings.
        const {
          count: holdingCount,
          error: holdingsError,
        } = await supabaseAdmin
          .from("crypto_holdings")
          .select("id", { count: "exact", head: true })
          .eq("id", user.id);

        if (holdingsError || holdingCount === null) {
          skipped++;
          console.error("[Baaro cleanup] Crypto holdings check failed.");
          continue;
        }

        if (holdingCount > 0) {
          skipped++;
          continue;
        }

        // Delete related rows sequentially and check every result.
        // If a step fails, do not delete the Auth user.
        const deletions = [
          () =>
            supabaseAdmin
              .from("push_tokens")
              .delete()
              .eq("user_id", user.id),

          () =>
            supabaseAdmin
              .from("profiles")
              .delete()
              .eq("id", user.id),

          () =>
            supabaseAdmin
              .from("wallets")
              .delete()
              .eq("id", user.id)
              .eq("balance", 0),

          () =>
            supabaseAdmin
              .from("crypto_holdings")
              .delete()
              .eq("id", user.id),

          () =>
            supabaseAdmin
              .from("device_accounts")
              .delete()
              .eq("id", user.id),
        ];

        let cleanupFailed = false;

        for (const deleteRelated of deletions) {
          const { error } = await deleteRelated();

          if (error) {
            cleanupFailed = true;
            console.error(
              "[Baaro cleanup] Related data cleanup failed.",
            );
            break;
          }
        }

        if (cleanupFailed) {
          skipped++;
          continue;
        }

        const { error: deleteUserError } =
          await supabaseAdmin.auth.admin.deleteUser(user.id);

        if (deleteUserError) {
          skipped++;
          console.error("[Baaro cleanup] Auth user deletion failed.");
          continue;
        }

        deleted++;
      } catch {
        skipped++;
        console.error("[Baaro cleanup] Unexpected error processing user.");
      }
    }

    console.log(
      JSON.stringify({
        service: "baaro-cleanup",
        scanned: ghosts.length,
        deleted,
        skipped,
        cutoff: cutoff.toISOString(),
      }),
    );

    return jsonResponse({
      date: new Date().toISOString(),
      scanned: ghosts.length,
      deleted,
      skipped,
      cutoff: cutoff.toISOString(),
    });
  } catch {
    console.error("[Baaro cleanup] Cleanup job failed.");
    return jsonResponse({ error: "Cleanup failed" }, 500);
  }
});
