import { Send, X } from "lucide-react";
import { COLORS } from "../../../theme.js";
import { baaroLogo } from "../constants.js";

// comments : liste des commentaires de la vidéo ouverte.
export default function CommentsSheet({
  comments,
  newComment,
  setNewComment,
  onSend,
  onClose,
}) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end justify-center">
      <div className="w-full max-w-xl max-h-[78dvh] bg-zinc-950 rounded-t-3xl border border-white/10 flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <div>
            <h3 className="font-black">Commentaires</h3>
            <p className="text-[10px] text-white/40">
              {comments.length} commentaire(s)
            </p>
          </div>
          <button
            onClick={() => onClose()}
            className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {comments.length === 0 ? (
            <div className="py-12 text-center text-white/40 text-sm">
              Aucun commentaire. Sois le premier !
            </div>
          ) : (
            comments.map((comment) => {
              const commentHandle =
                comment.profiles?.handle?.replace(/^@/, "") || "membre";
              return (
                <div key={comment.id} className="flex gap-2">
                  <div className="h-8 w-8 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                    {comment.profiles?.avatar_url ? (
                      <img
                        src={comment.profiles.avatar_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <img
                        src={baaroLogo}
                        alt="BAARO"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-black">@{commentHandle}</div>
                    <p className="text-sm text-white/75">{comment.content}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-3 border-t border-white/10 flex gap-2">
          <input
            value={newComment}
            onChange={(event) => setNewComment(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSend();
            }}
            placeholder="Ajouter un commentaire…"
            className="flex-1 rounded-2xl bg-white/10 px-4 py-3 text-sm outline-none"
          />
          <button
            onClick={onSend}
            className="h-12 w-12 rounded-2xl flex items-center justify-center"
            style={{ background: COLORS.gold, color: "#000" }}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
