import { useRef, useState } from "react";
import { GripVertical, Trash2, Image as ImageIcon, Video } from "lucide-react";

/**
 * MediaCarousel - Affiche les thumbnails des médias et permet de les réorganiser
 * Features:
 * - Drag & drop pour réorganiser
 * - Click pour sélectionner
 * - Delete individual items
 * - Visual feedback (selected, dragging)
 */
export function MediaCarousel({
  mediaItems,
  selectedIndex,
  onSelectIndex,
  onMove,
  onRemove,
}) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const draggableRef = useRef(null);

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropIndex(index);
  };

  const handleDragLeave = () => {
    setDropIndex(null);
  };

  const handleDrop = (e, toIndex) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== toIndex) {
      onMove(draggedIndex, toIndex);
    }
    setDraggedIndex(null);
    setDropIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDropIndex(null);
  };

  if (mediaItems.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Médias ({mediaItems.length})</h3>

      <div
        className="flex gap-2 overflow-x-auto pb-2"
        role="region"
        aria-label="Carrousel médias"
      >
        {mediaItems.map((media, index) => (
          <div
            key={media.id}
            className="relative flex-shrink-0"
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            ref={draggedIndex === index ? draggableRef : null}
          >
            {/* Thumbnail */}
            <button
              onClick={() => onSelectIndex(index)}
              className={`w-24 h-24 rounded-lg overflow-hidden flex items-center justify-center transition-all border-2 ${
                selectedIndex === index
                  ? "border-blue-500 ring-2 ring-blue-200"
                  : "border-gray-300 hover:border-gray-400"
              } ${draggedIndex === index ? "opacity-50" : ""} ${
                dropIndex === index ? "ring-2 ring-blue-300" : ""
              }`}
              aria-label={`Sélectionner média ${index + 1}`}
              aria-pressed={selectedIndex === index}
            >
              {media.type === "image" ? (
                <img
                  src={media.previewUrl}
                  alt={`Média ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gray-900 flex items-center justify-center relative">
                  <video
                    src={media.previewUrl}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="w-8 h-8 border-3 border-white border-r-transparent rounded-full" />
                  </div>
                </div>
              )}
            </button>

            {/* Index badge */}
            <div className="absolute top-1 left-1 w-6 h-6 bg-black/60 text-white text-xs rounded-full flex items-center justify-center font-bold">
              {index + 1}
            </div>

            {/* Media type badge */}
            <div className="absolute top-1 right-1 bg-gray-900/80 text-white p-1 rounded">
              {media.type === "image" ? (
                <ImageIcon size={12} />
              ) : (
                <Video size={12} />
              )}
            </div>

            {/* Drag handle & delete (hover) */}
            <div className="absolute inset-0 bg-black/0 hover:bg-black/20 rounded-lg transition-colors flex items-center justify-center gap-1 opacity-0 hover:opacity-100">
              <button
                className="p-1 bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors"
                title="Réorganiser"
                aria-label={`Réorganiser média ${index + 1}`}
              >
                <GripVertical size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(media.id);
                }}
                className="p-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                title="Supprimer"
                aria-label={`Supprimer média ${index + 1}`}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Duration badge (for videos) */}
            {media.type === "video" && (
              <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-2 py-1 rounded">
                {media.duration}s
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Info text */}
      <p className="text-xs text-gray-500 mt-2">
        {mediaItems.length === 1
          ? "Ajoute plus de médias pour créer un carousel"
          : `Drag & drop pour réorganiser. ${mediaItems.length}/10 médias`}
      </p>
    </div>
  );
}
