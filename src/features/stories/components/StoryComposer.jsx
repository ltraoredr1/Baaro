import { useState } from 'react';
import {
  Plus, X, Image as ImageIcon, Camera, Video, HelpCircle, ShoppingBag,
  Sticker, Music, CalendarClock,
} from 'lucide-react';
import { COLORS as C } from '../../../theme.js';
import { AudioPicker } from '../../../components/AudioPicker.jsx';
import { MediaCarousel } from '../../../components/MediaCarousel.jsx';
import { PollComposer } from '../../../components/PollComposer.jsx';
import ProductCard from '../../../components/ProductCard.jsx';
import RichTextComposer from '../../../components/RichTextComposer.jsx';
import { ProductPicker } from './ProductPicker.jsx';
import { BackgroundPicker } from './BackgroundPicker.jsx';
import { ScheduleField } from './ScheduleField.jsx';
import { DraftBanner } from './DraftBanner.jsx';
import { StickerComposer } from './StickerComposer.jsx';

const GOLD = C.gold || '#f59e0b';
const ACTIVE_BG = 'rgba(245, 158, 11, 0.12)';

const tileBase =
  'relative flex flex-col items-center justify-center gap-1 rounded-xl border py-2 text-[11px] font-medium cursor-pointer select-none transition-all hover:bg-white/5 active:scale-95';

/** Petite tuile d'outil (bouton ou label pour les champs fichier). */
function Tile({ icon: Icon, label, active = false, badge = 0, onClick, as = 'button', children }) {
  const Comp = as;
  return (
    <Comp
      {...(as === 'button' ? { type: 'button', onClick } : {})}
      className={tileBase}
      style={{
        borderColor: active ? GOLD : C.border,
        background: active ? ACTIVE_BG : 'transparent',
        color: active ? GOLD : C.ivory,
      }}
    >
      <Icon size={18} />
      <span>{label}</span>
      {badge > 0 && (
        <span
          className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
          style={{ background: GOLD, color: '#000' }}
        >
          {badge}
        </span>
      )}
      {children}
    </Comp>
  );
}

/** `composer` = valeur retournée par useStoryComposer. */
export function StoryComposer({ composer: c, products, cart }) {
  const scheduled = c.publishAt !== '';

  // Musique / programmation : dépliées seulement si demandées ou déjà utilisées
  const [musicOpen, setMusicOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const showMusic = musicOpen || Boolean(c.audio);
  const showSchedule = scheduleOpen || scheduled;

  return (
    <div
      className="rounded-2xl border shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-200 flex flex-col max-h-[80vh] overflow-hidden"
      style={{ background: C.surface, borderColor: C.border }}
    >
      {/* En-tête */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderColor: C.border }}>
        <span className="text-sm font-bold" style={{ color: GOLD }}>Nouvelle story</span>
        <button
          onClick={() => c.setIsOpen(false)}
          aria-label="Fermer"
          className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Contenu défilant */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {c.hasDraft && <DraftBanner onRestore={c.restoreDraft} onDiscard={c.discardDraft} />}

        {/* Texte : outils repliés par défaut (bouton « Outils de texte ») */}
        <RichTextComposer
          value={c.caption}
          onChange={c.setCaption}
          placeholder="Écris quelque chose..."
          rows={2}
          collapsibleTools
          enablePoll={false}
          compact
        />

        {/* Fond (seulement sans média) */}
        {c.mediaItems.length === 0 && <BackgroundPicker value={c.background} onChange={c.setBackground} />}

        {/* Médias */}
        {c.mediaItems.length > 0 && (
          <MediaCarousel
            mediaItems={c.mediaItems}
            selectedIndex={c.selectedMediaIndex}
            onSelectIndex={c.setSelectedMediaIndex}
            onMove={c.moveMedia}
            onRemove={c.removeMedia}
          />
        )}

        {/* Produit choisi */}
        {c.product && (
          <div className="relative border rounded-xl p-2 bg-white/5" style={{ borderColor: C.border }}>
            <button
              onClick={() => c.setProduct(null)}
              aria-label="Retirer le produit"
              className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white z-10"
            >
              <X size={14} />
            </button>
            <ProductCard
              product={c.product}
              quantity={cart.quantities[c.product.id] || 0}
              onAdd={() => cart.add(c.product.id)}
              onRemove={() => cart.remove(c.product.id)}
            />
          </div>
        )}

        {c.showProductPicker && (
          <ProductPicker
            products={products}
            onClose={() => c.setShowProductPicker(false)}
            onPick={(p) => { c.setProduct(p); c.setShowProductPicker(false); }}
          />
        )}

        {c.showStickers && (
          <StickerComposer
            stickers={c.stickers}
            onAdd={c.addSticker}
            onRemove={c.removeSticker}
            onClose={() => c.setShowStickers(false)}
          />
        )}

        {c.showPoll && <PollComposer value={c.pollData} onChange={c.setPollData} onClose={c.closePoll} />}

        {/* Grille d'outils : 4 colonnes, compacte */}
        <div className="grid grid-cols-4 gap-2">
          {/* `capture` ouvre directement l'appareil photo / caméra sur mobile */}
          <Tile as="label" icon={Camera} label="Photo">
            <input type="file" accept="image/*" capture="environment" onChange={c.addFiles} className="hidden" />
          </Tile>
          <Tile as="label" icon={Video} label="Vidéo">
            <input type="file" accept="video/*" capture="environment" onChange={c.addFiles} className="hidden" />
          </Tile>
          <Tile as="label" icon={ImageIcon} label="Galerie">
            <input type="file" accept="image/*,video/*" multiple onChange={c.addFiles} className="hidden" />
          </Tile>
          <Tile
            icon={Sticker}
            label="Stickers"
            active={c.showStickers || c.stickers.length > 0}
            badge={c.stickers.length}
            onClick={() => c.setShowStickers(!c.showStickers)}
          />
          <Tile
            icon={HelpCircle}
            label="Sondage"
            active={c.showPoll}
            onClick={() => c.setShowPoll(!c.showPoll)}
          />
          <Tile
            icon={ShoppingBag}
            label="Produit"
            active={c.showProductPicker || Boolean(c.product)}
            onClick={() => c.setShowProductPicker(!c.showProductPicker)}
          />
          <Tile
            icon={Music}
            label="Musique"
            active={showMusic}
            onClick={() => setMusicOpen((v) => !v)}
          />
          <Tile
            icon={CalendarClock}
            label="Planifier"
            active={showSchedule}
            onClick={() => setScheduleOpen((v) => !v)}
          />
        </div>

        {showMusic && (
          <AudioPicker selectedAudio={c.audio} onSelectAudio={c.setAudio} onRemoveAudio={() => c.setAudio(null)} />
        )}
        {showSchedule && <ScheduleField value={c.publishAt} onChange={c.setPublishAt} />}
      </div>

      {/* Pied fixe : bouton de publication */}
      <div className="px-3 py-2.5 border-t" style={{ borderColor: C.border }}>
        <button
          disabled={c.creating || c.isEmpty}
          onClick={c.submit}
          className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98] transition-all shadow-md"
          style={{ background: GOLD, color: '#000' }}
        >
          {c.creating ? (
            'Publication...'
          ) : (
            <>
              <Plus size={16} />
              {scheduled ? 'Programmer la story' : 'Publier la story'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
