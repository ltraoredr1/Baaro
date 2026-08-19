const key = process.env.VITE_VAPID_PUBLIC_KEY || "";
if (key && !/^[A-Za-z0-9_-]{20,}$/.test(key)) {
  console.error("Invalid VITE_VAPID_PUBLIC_KEY format");
  process.exit(1);
}
console.log(key ? "Notification config: VAPID public key present." : "Notification config: VAPID public key not configured (push disabled until configured).");
