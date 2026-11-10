export function isTransientOfflineError(error) {
  const hasStatus = error?.status != null || error?.statusCode != null;
  const status = Number(error?.status ?? error?.statusCode ?? -1);
  if ([408, 425, 429].includes(status)) return true;
  if (status >= 400 && status < 500) return false;
  if (status >= 500) return true;
  const message = `${error?.message || ""} ${error?.code || ""}`.toLowerCase();
  return /network|fetch|timeout|timed out|connection|offline|temporar|abort|too many requests|retry after/.test(message) ||
    (!hasStatus && error?.name === "TypeError");
}
