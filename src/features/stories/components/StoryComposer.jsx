import { useState } from 'react';
import { Plus, X, Image as ImageIcon, Camera, Video, HelpCircle, ShoppingBag, Sticker, ChevronDown, ChevronUp } from 'lucide-react';
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

// Boutons compacts (plus petits qu'avant)
const btn = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border cursor-pointer transition-all hover:bg-white/5 active:opacity-70 text-xs';

/** `composer` = valeur retournée par useStoryComposer. */
export function StoryComposer({ composer: c, products, cart }) {
  const scheduled = c.publishAt !== '';
  // Musique + programmation : repliées par défaut, ouvertes si déjà utilisées.
  const [moreOpen, setMoreOpen] = useState(false);
  const showMore = moreOpen || Boolean(c.audio) || scheduled;

  return (
    <div
      className="rounded-2xl p-3 border shadow-xl backdrop-blur-md space-y-2.5 animate-in fade-in slide-in-from-top-3 duration-200 max-h-[75vh] overflow-y-auto"
      style={{ background: C.surface, borderColor: C.border }}
    >
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-xs font-bold" style={{ color: C.gold }}>Nouvelle Story éphémère</span>
        <button onClick={() => c.setIsOpen(false)} aria-label="Fermer" className="text-zinc-400 hover:text-white"><X size={16} /></button>
      </div>

      {c.hasDraft && <DraftBanner onRestore={c.restoreDraft} onDiscard={c.discardDraft} />}

      {/* Les outils de texte sont repliés par défaut (bouton « Outils de texte ») */}
      <RichTextComposer value={c.caption} onChange={c.setCaption} placeholder="Créer une story..." rows={2} />

      {c.mediaItems.length === 0 && <BackgroundPicker value={c.background} onChange={c.setBackground} />}

      {c.mediaItems.length > 0 && (
        <MediaCarousel
          mediaItems={c.mediaItems}
          selectedIndex={c.selectedMediaIndex}
          onSelectIndex={c.setSelectedMediaIndex}
          onMove={c.moveMedia}
          onRemove={c.removeMedia}
        />
      )}

      {c.product && (
        <div className="relative border rounded-xl p-2 bg-white/5">
          <button onClick={() => c.setProduct(null)} aria-label="Retirer le produit" className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white z-10">
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
        <StickerComposer stickers={c.stickers} onAdd={c.addSticker} onRemove={c.removeSticker} onClose={() => c.setShowStickers(false)} />
      )}

      {c.showPoll && <PollComposer value={c.pollData} onChange={c.setPollData} onClose={c.closePoll} />}

      <div className="flex items-center gap-1.5 flex-wrap">
        {/* `capture` ouvre directement l'appareil photo / caméra sur mobile */}
        <label className={btn} style={{ borderColor: C.border, color: C.ivory }}>
          <Camera size={14} /><span>Photo</span>
          <input type="file" accept="image/*" capture="environment" onChange={c.addFiles} className="hidden" />
        </label>
        <label className={btn} style={{ borderColor: C.border, color: C.ivory }}>
          <Video size={14} /><span>Vidéo</span>
          <input type="file" accept="video/*" capture="environment" onChange={c.addFiles} className="hidden" />
        </label>
        <label className={btn} style={{ borderColor: C.border, color: C.ivory }}>
          <ImageIcon size={14} /><span>Galerie</span>
          <input type="file" accept="image/*,video/*" multiple onChange={c.addFiles} className="hidden" />
        </label>

        <button type="button" onClick={() => c.setShowStickers(!c.showStickers)} className={btn} style={{ borderColor: C.border, color: C.ivory }}>
          <Sticker size={14} /><span>Stickers{c.stickers.length ? ` (${c.stickers.length})` : ''}</span>
        </button>

        <button type="button" onClick={() => c.setShowPoll(!c.showPoll)} className={btn} style={{ borderColor: C.border, color: C.teal || '#2dd4bf' }}>
          <HelpCircle size={14} /><span>{c.showPoll ? 'Masquer le sondage' : 'Sondage'}</span>
        </button>

        <button type="button" onClick={() => c.setShowProductPicker(!c.showProductPicker)} className={btn} style={{ borderColor: C.border, color: C.gold || '#f59e0b' }}>
          <ShoppingBag size={14} /><span>Produit</span>
        </button>
      </div>

      {/* Musique + programmation : section repliable */}
      <button
        type="button"
        onClick={() => setMoreOpen((v) => !v)}
        aria-expanded={showMore}
        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-xl border hover:bg-white/5"
        style={{ borderColor: C.border, color: C.ivory }}
      >
        <span>Musique et programmation</span>
        {showMore ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {showMore && (
        <div className="space-y-2.5">
          <AudioPicker selectedAudio={c.audio} onSelectAudio={c.setAudio} onRemoveAudio={() => c.setAudio(null)} />
          <ScheduleField value={c.publishAt} onChange={c.setPublishAt} />
        </div>
      )}

      <div className="flex justify-end pt-1">
        <button
          disabled={c.creating || c.isEmpty}
          onClick={c.submit}
          className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center disabled:opacity-50 active:opacity-80 transition-all shadow-md"
          style={{ background: C.gold, color: '#000' }}
        >
          {c.creating ? 'Publication...' : <><Plus size={16} className="inline mr-1" />{scheduled ? 'Programmer la story' : 'Publier la story'}</>}
        </button>
      </div>
    </div>
  );
}
