import { useCallback, useEffect, useState } from "react";
import { useToast } from "../../../components/ToastContext.jsx";
import {
  addVideoToPlaylist,
  createPlaylist,
  getPlaylistVideos,
  listMyPlaylists,
} from "../../../lib/videoEngagement.js";

export function useVideoPlaylists({ user }) {
  const { showToast } = useToast();
  const [playlists, setPlaylists] = useState([]);
  const [activePlaylistId, setActivePlaylistId] = useState(null);
  const [playlistItems, setPlaylistItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setPlaylists([]);
      return;
    }
    try {
      const rows = await listMyPlaylists();
      setPlaylists(rows);
    } catch {
      setPlaylists([]);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async ({ title, description, isSeries = true }) => {
    if (!title?.trim()) {
      showToast("Donne un titre à la série.", "error");
      return null;
    }
    try {
      const row = await createPlaylist({ title, description, isSeries });
      setPlaylists((prev) => [row, ...prev]);
      showToast("Série créée", "success");
      return row;
    } catch (e) {
      console.error(e);
      showToast("Impossible de créer la série.", "error");
      return null;
    }
  };

  const addVideo = async (playlistId, videoId, position) => {
    try {
      const pos =
        position ??
        (playlistId === activePlaylistId ? playlistItems.length : 0);
      await addVideoToPlaylist(playlistId, videoId, pos);
      showToast("Vidéo ajoutée à la série", "success");
      if (playlistId === activePlaylistId) {
        const items = await getPlaylistVideos(playlistId);
        setPlaylistItems(items);
      }
      await refresh();
    } catch (e) {
      console.error(e);
      showToast("Ajout impossible.", "error");
    }
  };

  const openPlaylist = async (playlistId) => {
    setActivePlaylistId(playlistId);
    setLoading(true);
    try {
      const items = await getPlaylistVideos(playlistId);
      setPlaylistItems(items);
    } catch {
      setPlaylistItems([]);
    } finally {
      setLoading(false);
    }
  };

  const nextInPlaylist = (currentVideoId) => {
    if (!playlistItems.length) return null;
    const idx = playlistItems.findIndex(
      (i) => String(i.video_id) === String(currentVideoId),
    );
    if (idx < 0 || idx >= playlistItems.length - 1) return null;
    return playlistItems[idx + 1];
  };

  const clearActive = () => {
    setActivePlaylistId(null);
    setPlaylistItems([]);
  };

  return {
    playlists,
    activePlaylistId,
    playlistItems,
    loading,
    refresh,
    create,
    addVideo,
    openPlaylist,
    nextInPlaylist,
    clearActive,
  };
}
