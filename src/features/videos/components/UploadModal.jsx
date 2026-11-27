import { useEffect, useRef, useState } from "react";
import { Leaf, X, BarChart3, ShoppingBag, Plus } from "lucide-react";
import { supabase } from "../../../supabaseClient.js";
import { COLORS } from "../../../theme.js";
import CameraOverlay from "./CameraOverlay.jsx";
import CreatorPanel from "./CreatorPanel.jsx";
import SoundPicker from "./SoundPicker.jsx";
import UploadPreview from "./UploadPreview.jsx";
import { generateAIEditPlan } from "../../../lib/geminiAI.js";

// Fenêtre « Nouvelle vidéo » : médias, titre, description, son, publication.
// compression : { compressing, progress, cancel, abort } (useVideoCompression)
export default function UploadModal({
  creator,
  soundPicker,
  camera,
  compression,
  filter = null,
  compressUploads = false,
  onCompressChange,
  studioFeatures = [],
}) {
  const {
    showUpload,
    setShowUpload,
    selectedFile,
    selectedFiles = [],
    uploadTitle,
    setUploadTitle,
    uploadDescription,
    setUploadDescription,
    pendingPoll,
    setPendingPoll,
    pendingProductIds,
    setPendingProductIds,
    uploading,
    uploadProgress,
    bakedAudio,
    fileInputRef,
    handleFileSelected,
    handleUpload,
    resetUpload,
  } = creator;

  const [showPollForm, setShowPollForm] = useState(false);
  const studioPollAutoOpened = useRef(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [ownProducts, setOwnProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [aiPlanLoading, setAiPlanLoading] = useState(false);
  const [aiPlan, setAiPlan] = useState(null);
  const [aiPlanError, setAiPlanError] = useState("");

  const runAiPlan = async () => {
    if (aiPlanLoading) return;

    const prompt = [
      uploadTitle.trim(),
      uploadDescription.trim(),
      "Propose un montage vidéo engageant pour BAARO, un hook fort, des titres et des idées de couverture."
    ].filter(Boolean).join("\\n");

    setAiPlanLoading(true);
    setAiPlanError("");
    setAiPlan(null);

    try {
      const plan = await generateAIEditPlan(prompt, "");
      if (!plan || typeof plan !== "object" || plan.raw) {
        throw new Error("Le moteur IA n'a pas retourné un plan exploitable.");
      }
      setAiPlan(plan);
    } catch (error) {
      setAiPlanError(error?.message || "Impossible de générer le plan IA.");
    } finally {
      setAiPlanLoading(false);
    }
  };


  useEffect(() => {
    if (!showUpload) {
      studioPollAutoOpened.current = false;
      return;
    }

    if (
      studioFeatures.includes("poll") &&
      !studioPollAutoOpened.current
    ) {
      studioPollAutoOpened.current = true;
      setShowPollForm(true);
      setShowProductForm(false);
    }
  }, [showUpload, studioFeatures]);

  useEffect(() => {
    if (!showPollForm) return;
    if (pendingPoll) {
      setPollQuestion(pendingPoll.question || "");
      setPollOptions(
        Array.isArray(pendingPoll.options) && pendingPoll.options.length
          ? pendingPoll.options
          : ["", ""],
      );
    }
  }, [showPollForm, pendingPoll]);

  useEffect(() => {
    if (!showProductForm) return;
    let active = true;
    (async () => {
      setProductsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id || !active) { setProductsLoading(false); return; }
      const { data } = await supabase
        .from("shop_products")
        .select("id,name,price,currency,stock,type,is_available,shops(owner_id,name,is_active)")
        .eq("is_available", true)
        .order("created_at", { ascending: false })
        .limit(40);
      if (!active) return;
      setOwnProducts((data || []).filter((p) => p.shops?.owner_id === user.id));
      setProductsLoading(false);
    })();
    return () => { active = false; };
  }, [showProductForm]);

  const savePollDraft = () => {
    const opts = pollOptions.map((x) => x.trim()).filter(Boolean);
    if (!pollQuestion.trim() || opts.length < 2) {
      setPendingPoll(null);
      setShowPollForm(false);
      return;
    }
    setPendingPoll({ question: pollQuestion.trim(), options: opts.slice(0, 4) });
    setShowPollForm(false);
  };

  const clearPoll = () => {
    setPendingPoll(null);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setShowPollForm(false);
  };

  const toggleProduct = (id) => {
    setPendingProductIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 3) return cur;
      return [...cur, id];
    });
  };
  const { cameraOpen, closeCamera } = camera;

  if (!showUpload) return null;

  const compressing = !!compression?.compressing;
  const busy = uploading || compressing;

  const handleClose = () => {
    if (uploading) return;

    // Fermer pendant l'optimisation : on abandonne aussi le fichier.
    compression?.abort?.();
    filter?.reset();
    closeCamera();
    setShowUpload(false);
    resetUpload();
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      {cameraOpen && <CameraOverlay camera={camera} filter={filter} />}
      <div className="w-full max-w-xl max-h-[92dvh] overflow-y-auto bg-zinc-950 rounded-t-3xl sm:rounded-3xl border border-white/10">
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-zinc-950/95 backdrop-blur border-b border-white/10">
          <div>
            <h3 className="font-black text-lg">Nouvelle vidéo</h3>
            <p className="text-[10px] text-white/40">
              Publie ton contenu sur BAARO
            </p>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={handleClose}
            className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {compressing && (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-bold text-emerald-300">
                  <Leaf size={14} /> Optimisation de la vidéo…
                </span>
                <span>{compression.progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-emerald-400 transition-all duration-300"
                  style={{ width: `${compression.progress}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[11px] text-white/45">
                  Gardez l'application ouverte. Plus léger = envoi plus rapide
                  et moins de data pour vos abonnés.
                </p>
                <button
                  type="button"
                  onClick={compression.cancel}
                  className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold"
                >
                  Ignorer
                </button>
              </div>
            </div>
          )}

          {!selectedFile ? (
            <CreatorPanel creator={creator} camera={camera} filter={filter} />
          ) : (
            <UploadPreview creator={creator} soundPicker={soundPicker} filter={filter} />
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(event) => {
              handleFileSelected(event.target.files);
              // permet de re-choisir les mêmes fichiers après une annulation
              event.target.value = "";
            }}
          />

          {onCompressChange && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-4 py-3">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <Leaf size={14} className="text-emerald-400" />
                  Alléger la vidéo avant l'envoi
                </div>
                <div className="text-[11px] text-white/40">
                  Fichiers de plus de 8 Mo : jusqu'à 75 s sur mobile et 120 s sur ordinateur. Si l'appareil ne le permet pas, l'original est conservé.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={compressUploads}
                aria-label="Alléger la vidéo avant l'envoi"
                disabled={busy}
                onClick={() => onCompressChange(!compressUploads)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
                  compressUploads ? "bg-yellow-400" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    compressUploads ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          )}

          <input
            value={uploadTitle}
            onChange={(event) => setUploadTitle(event.target.value)}
            placeholder="Titre de la vidéo"
            maxLength={120}
            className="w-full rounded-2xl bg-white/10 px-4 py-3 outline-none text-sm"
          />

          <textarea
            value={uploadDescription}
            onChange={(event) => setUploadDescription(event.target.value)}
            placeholder="Description…"
            rows={3}
            maxLength={500}
            className="w-full rounded-2xl bg-white/10 px-4 py-3 outline-none text-sm resize-none"
          />


          {studioFeatures.includes("ai") && (
            <section className="space-y-3 rounded-2xl border border-violet-400/25 bg-violet-400/[0.06] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-violet-200">BAARO AI Cut</div>
                  <p className="text-[11px] text-white/50">
                    Génère un plan de montage, un hook et des idées de couverture.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={aiPlanLoading || busy}
                  onClick={runAiPlan}
                  className="shrink-0 rounded-xl bg-violet-400 px-3 py-2 text-xs font-black text-black disabled:opacity-50"
                >
                  {aiPlanLoading ? "Analyse…" : "Générer le plan"}
                </button>
              </div>

              {aiPlanError && (
                <p role="alert" className="text-xs text-red-300">{aiPlanError}</p>
              )}

              {aiPlan && (
                <div className="space-y-3 text-xs">
                  {aiPlan.hook && (
                    <div>
                      <div className="mb-1 font-bold text-violet-200">Hook proposé</div>
                      <p className="text-white/80">{aiPlan.hook}</p>
                    </div>
                  )}

                  {!!aiPlan.title_variants?.length && (
                    <div>
                      <div className="mb-2 font-bold text-violet-200">Titres proposés</div>
                      <div className="space-y-2">
                        {aiPlan.title_variants.map((title, index) => (
                          <button
                            key={`${index}-${title}`}
                            type="button"
                            onClick={() => setUploadTitle(String(title).slice(0, 120))}
                            className="w-full rounded-xl border border-white/10 bg-white/5 p-2 text-left text-white/80"
                          >
                            {title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!!aiPlan.thumbnail_ideas?.length && (
                    <div>
                      <div className="mb-1 font-bold text-violet-200">Idées de couverture</div>
                      <ul className="list-disc space-y-1 pl-5 text-white/70">
                        {aiPlan.thumbnail_ideas.map((idea, index) => (
                          <li key={index}>{idea}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!!aiPlan.cuts?.length && (
                    <div>
                      <div className="mb-1 font-bold text-violet-200">Coupes suggérées</div>
                      {aiPlan.cuts.map((cut, index) => (
                        <p key={index} className="text-white/70">
                          {Math.round(Number(cut.start_ms) / 1000)}s – {Math.round(Number(cut.end_ms) / 1000)}s : {cut.reason}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-white/40">
                    Suggestions IA uniquement : rien n'est modifié dans ta vidéo sans ton action.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Sondage & produit à la publication */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setShowPollForm((v) => !v); setShowProductForm(false); }}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${
                pendingPoll || showPollForm
                  ? "border-yellow-400/50 bg-yellow-400/15 text-yellow-200"
                  : "border-white/15 bg-white/5 text-white/80"
              }`}
            >
              <BarChart3 size={14} /> {pendingPoll ? "Sondage prêt" : "Créer un sondage"}
            </button>
            <button
              type="button"
              onClick={() => { setShowProductForm((v) => !v); setShowPollForm(false); }}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${
                (pendingProductIds?.length || showProductForm)
                  ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200"
                  : "border-white/15 bg-white/5 text-white/80"
              }`}
            >
              <ShoppingBag size={14} />{" "}
              {pendingProductIds?.length
                ? `${pendingProductIds.length} produit(s)`
                : "Ajouter un produit"}
            </button>
          </div>

          {showPollForm && (
            <div className="space-y-2 rounded-2xl border border-yellow-400/25 bg-yellow-400/[0.06] p-3">
              <input
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                maxLength={240}
                placeholder="Pose ta question…"
                className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm outline-none"
              />
              {pollOptions.map((v, i) => (
                <input
                  key={i}
                  value={v}
                  maxLength={80}
                  onChange={(e) =>
                    setPollOptions((old) => old.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  placeholder={`Choix ${i + 1}`}
                  className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm outline-none"
                />
              ))}
              {pollOptions.length < 4 && (
                <button
                  type="button"
                  onClick={() => setPollOptions((x) => [...x, ""])}
                  className="flex items-center gap-1 text-xs text-yellow-200"
                >
                  <Plus size={14} /> Ajouter un choix
                </button>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={savePollDraft}
                  className="flex-1 rounded-xl bg-yellow-400 px-3 py-2 text-sm font-black text-black"
                >
                  Enregistrer le sondage
                </button>
                <button
                  type="button"
                  onClick={clearPoll}
                  className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold"
                >
                  Effacer
                </button>
              </div>
            </div>
          )}

          {showProductForm && (
            <div className="space-y-2 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-3">
              {productsLoading ? (
                <p className="text-xs text-white/50">Chargement de tes produits…</p>
              ) : ownProducts.length === 0 ? (
                <p className="text-xs text-white/50">
                  Aucun produit disponible. Crée-en un dans Shop d’abord.
                </p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {ownProducts.map((p) => {
                    const selected = pendingProductIds?.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleProduct(p.id)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs ${
                          selected
                            ? "border-emerald-400/50 bg-emerald-400/15"
                            : "border-white/10 bg-white/5"
                        }`}
                      >
                        <span className="font-bold">{p.name}</span>
                        <span className="text-white/60">
                          {p.price} {p.currency || ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-white/40">Max 3 produits. Ils seront liés après publication.</p>
              <button
                type="button"
                onClick={() => setShowProductForm(false)}
                className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-bold"
              >
                OK
              </button>
            </div>
          )}

          <SoundPicker
            soundPicker={soundPicker}
            hasFile={!!selectedFile}
            bakedAudio={bakedAudio}
          />

          {uploading && (
            <div>
              <div className="flex justify-between text-xs mb-2">
                <span>{creator.filterRendering ? "Application du filtre…" : "Publication…"}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${uploadProgress}%`,
                    background: COLORS.gold,
                  }}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={busy || !selectedFile}
            onClick={handleUpload}
            className="w-full py-3.5 rounded-2xl font-black disabled:opacity-40"
            style={{ background: COLORS.gold, color: "#000" }}
          >
            {uploading
              ? `Publication… ${uploadProgress}%`
              : compressing
              ? "Optimisation en cours…"
              : selectedFiles?.length > 1
              ? `Publier ${selectedFiles.length} vidéos`
              : filter?.anyActive && !creator.generated && !selectedFile?._filterBaked
              ? "Appliquer le filtre et publier"
              : "Publier la vidéo"}
          </button>
        </div>
      </div>
    </div>
  );
}
