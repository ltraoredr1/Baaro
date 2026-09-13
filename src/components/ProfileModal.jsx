import { useEffect } from "react";
import {
  X,
  User,
  MapPin,
  Calendar,
  Users,
  MessageCircle,
  Loader2,
} from "lucide-react";

import { useProfile, useProfileStats } from "../hooks/useProfile.js";
import ProfileContactLinksView from "./ProfileContactLinksView.jsx";
import FollowButton from "../features/friends/FollowButton.jsx";
import { useToast } from "./ToastContext.jsx";
import { COLORS } from "../theme.js";

function formatDate(value) {
  if (!value) return null;

  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

function getInitials(profile) {
  const name =
    profile?.display_name?.trim() ||
    profile?.handle?.trim() ||
    "Membre";

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function ProfileModal({
  authorId,
  currentUserId,
  onClose,
  onNavigateToMessages,
}) {
  const { showToast } = useToast();

  const {
    profile,
    contacts,
    links,
    socials,
    loading,
    reload,
  } = useProfile(authorId, showToast);

  const stats = useProfileStats(authorId);

  useEffect(() => {
    if (!authorId) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [authorId, onClose]);

  if (!authorId) return null;

  const isOwnProfile = currentUserId === authorId;
  const initials = getInitials(profile);

  const handleMessage = () => {
    onClose?.();

    if (onNavigateToMessages) {
      onNavigateToMessages();
      return;
    }

    showToast?.("Messagerie ouverte", "info");
  };

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose?.();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Profil utilisateur"
      onMouseDown={handleBackdropClick}
    >
      <div
        className="relative w-full sm:max-w-xl max-h-[94vh] overflow-hidden rounded-t-3xl sm:rounded-3xl border shadow-2xl"
        style={{
          background: COLORS.background || "#0B1220",
          borderColor: COLORS.border,
          color: COLORS.ivory,
        }}
      >
        {/* Bouton fermer */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le profil"
          className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-md transition hover:scale-105"
          style={{
            background: "rgba(0,0,0,.45)",
            borderColor: "rgba(255,255,255,.15)",
            color: COLORS.ivory,
          }}
        >
          <X size={20} />
        </button>

        {loading ? (
          <div className="flex min-h-[420px] items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2
                size={32}
                className="animate-spin"
                style={{ color: COLORS.gold }}
              />
              <span
                className="text-sm"
                style={{ color: COLORS.muted }}
              >
                Chargement du profil…
              </span>
            </div>
          </div>
        ) : (
          <div className="max-h-[94vh] overflow-y-auto">
            {/* Couverture */}
            <div
              className="relative h-36 sm:h-44 overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, #151D2E 0%, #202B43 50%, #0B1220 100%)",
              }}
            >
              {profile?.cover_url && (
                <img
                  src={profile.cover_url}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}

              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(11,18,32,.85), transparent 70%)",
                }}
              />
            </div>

            {/* Informations principales */}
            <div className="relative px-4 pb-5 sm:px-6">
              {/* Avatar */}
              <div className="-mt-14 mb-3 flex items-end justify-between">
                <div
                  className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 shadow-xl"
                  style={{
                    background: COLORS.surface,
                    borderColor: COLORS.background || "#0B1220",
                  }}
                >
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile?.display_name || "Photo de profil"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                        const parent = event.currentTarget.parentElement;

                        if (parent) {
                          parent.innerHTML = `
                            <span style="
                              display:flex;
                              align-items:center;
                              justify-content:center;
                              width:100%;
                              height:100%;
                              font-size:28px;
                              font-weight:700;
                              color:${COLORS.gold};
                            ">
                              ${initials}
                            </span>
                          `;
                        }
                      }}
                    />
                  ) : (
                    <span
                      className="text-3xl font-bold"
                      style={{ color: COLORS.gold }}
                    >
                      {initials}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 pb-1">
                  {!isOwnProfile && (
                    <>
                      <FollowButton
                        targetUserId={authorId}
                        currentUserId={currentUserId}
                      />

                      <button
                        type="button"
                        onClick={handleMessage}
                        className="flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition hover:scale-[1.02]"
                        style={{
                          background: COLORS.surface,
                          borderColor: COLORS.border,
                          color: COLORS.ivory,
                        }}
                      >
                        <MessageCircle size={16} />
                        <span className="hidden xs:inline">Message</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Nom / identifiant */}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-bold">
                    {profile?.display_name || "Nouveau membre"}
                  </h2>

                  {profile?.flag && (
                    <span
                      className="text-xl"
                      title="Pays"
                      aria-label="Pays"
                    >
                      {profile.flag}
                    </span>
                  )}
                </div>

                <p
                  className="mt-1 text-sm"
                  style={{ color: COLORS.muted }}
                >
                  {profile?.handle
                    ? profile.handle.startsWith("@")
                      ? profile.handle
                      : `@${profile.handle}`
                    : "@membre"}
                </p>
              </div>

              {/* Bio */}
              {profile?.bio && (
                <div className="mt-4">
                  <p
                    className="whitespace-pre-wrap text-sm leading-6"
                    style={{ color: COLORS.ivory }}
                  >
                    {profile.bio}
                  </p>
                </div>
              )}

              {/* Informations complémentaires */}
              <div className="mt-4 flex flex-wrap gap-2">
                {profile?.location && (
                  <div
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs"
                    style={{
                      borderColor: COLORS.border,
                      background: COLORS.surface,
                      color: COLORS.muted,
                    }}
                  >
                    <MapPin size={14} />
                    <span>{profile.location}</span>
                  </div>
                )}

                {profile?.created_at && (
                  <div
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs"
                    style={{
                      borderColor: COLORS.border,
                      background: COLORS.surface,
                      color: COLORS.muted,
                    }}
                  >
                    <Calendar size={14} />
                    <span>
                      Membre depuis {formatDate(profile.created_at)}
                    </span>
                  </div>
                )}
              </div>

              {/* Statistiques */}
              <div
                className="mt-5 grid grid-cols-3 overflow-hidden rounded-2xl border"
                style={{
                  borderColor: COLORS.border,
                  background: COLORS.surface,
                }}
              >
                <div className="flex flex-col items-center px-2 py-4">
                  <strong className="text-lg">
                    {stats.posts}
                  </strong>
                  <span
                    className="text-xs"
                    style={{ color: COLORS.muted }}
                  >
                    Publications
                  </span>
                </div>

                <div
                  className="flex flex-col items-center border-x px-2 py-4"
                  style={{ borderColor: COLORS.border }}
                >
                  <strong className="text-lg">
                    {stats.followers}
                  </strong>
                  <span
                    className="text-xs"
                    style={{ color: COLORS.muted }}
                  >
                    Abonnés
                  </span>
                </div>

                <div className="flex flex-col items-center px-2 py-4">
                  <strong className="text-lg">
                    {stats.following}
                  </strong>
                  <span
                    className="text-xs"
                    style={{ color: COLORS.muted }}
                  >
                    Abonnements
                  </span>
                </div>
              </div>

              {/* Coordonnées, liens et réseaux */}
              <div className="mt-5">
                <ProfileContactLinksView
                  contacts={contacts}
                  links={links}
                  socials={socials}
                />
              </div>

              {/* État vide */}
              {!profile?.bio &&
                !profile?.location &&
                contacts.phones.length === 0 &&
                contacts.emails.length === 0 &&
                links.length === 0 &&
                socials.length === 0 && (
                  <div
                    className="mt-5 rounded-2xl border p-5 text-center"
                    style={{
                      borderColor: COLORS.border,
                      background: COLORS.surface,
                    }}
                  >
                    <User
                      size={24}
                      className="mx-auto mb-2"
                      style={{ color: COLORS.muted }}
                    />

                    <p
                      className="text-sm"
                      style={{ color: COLORS.muted }}
                    >
                      Ce membre n’a pas encore ajouté d’informations
                      publiques supplémentaires.
                    </p>
                  </div>
                )}

              {/* Actualisation */}
              <div className="mt-5 flex justify-center pb-2">
                <button
                  type="button"
                  onClick={reload}
                  className="text-xs transition hover:underline"
                  style={{ color: COLORS.muted }}
                >
                  Actualiser le profil
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProfileModal;
