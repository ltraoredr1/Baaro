import { Plus, X, Image as ImageIcon, HelpCircle, ShoppingBag } from 'lucide-react';
import { COLORS as C } from '../../../theme.js';
import { AudioPicker } from '../../../components/AudioPicker.jsx';
import { MediaCarousel } from '../../../components/MediaCarousel.jsx';
import { PollComposer } from '../../../components/PollComposer.jsx';
import ProductCard from '../../../components/ProductCard.jsx';
import RichTextComposer from '../../../components/RichTextComposer.jsx';
import { ProductPicker } from './ProductPicker.jsx';

/** `composer` = valeur retournée par useStoryComposer. */
export function StoryComposer({ composer: c, products, cart }) {
  return (
    <div className="rounded-2xl p-4 border shadow-xl backdrop-blur-md space-y-4 animate-in fade-in slide-in-from-top-3 duration-200" style={{ background: C.surface, borderColor: C.border }}>
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-xs font-bold" style={{ color: C.gold }}>Nouvelle Story éphémère</span>
        <button onClick={() => c.setIsOpen(false)} className="text-zinc-400 hover:text-white"><X size={16} /></button>
      </div>

      <RichTextComposer value={c.caption} onChange={c.setCaption} placeholder="Créer une story..." rows={3} />

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
          <button onClick={() => c.setProduct(null)} className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white z-10">
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

      {c.showPoll && <PollComposer value={c.pollData} onChange={c.setPollData} onClose={c.closePoll} />}

      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer active:opacity-70 transition-all hover:bg-white/5" style={{ borderColor: C.border, color: C.ivory }}>
          <ImageIcon size={16} />
          <span className="text-sm">Ajouter média</span>
          <input type="file" accept="image/*,video/*" multiple onChange={c.addFiles} className="hidden" />
        </label>

        <button type="button" onClick={() => c.setShowPoll(!c.showPoll)} className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all hover:bg-white/5" style={{ borderColor: C.border, color: C.teal || '#2dd4bf' }}>
          <HelpCircle size={16} />
          <span className="text-sm">{c.showPoll ? 'Masquer le sondage' : 'Créer un sondage'}</span>
        </button>

        <button type="button" onClick={() => c.setShowProductPicker(!c.showProductPicker)} className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all hover:bg-white/5" style={{ borderColor: C.border, color: C.gold || '#f59e0b' }}>
          <ShoppingBag size={16} />
          <span className="text-sm">Produit</span>
        </button>
      </div>

      <AudioPicker selectedAudio={c.audio} onSelectAudio={c.setAudio} onRemoveAudio={() => c.setAudio(null)} />

      <div className="flex justify-end pt-2">
        <button
          disabled={c.creating || c.isEmpty}
          onClick={c.submit}
          className="px-4 py-2 rounded-xl font-semibold flex items-center disabled:opacity-50 active:opacity-80 transition-all shadow-md"
          style={{ background: C.gold, color: '#000' }}
        >
          {c.creating ? 'Publication...' : <><Plus size={16} className="inline mr-1" />Publier la story</>}
        </button>
      </div>
    </div>
  );
}
