-- Conserver la provenance des sons utilisés dans les vidéos BAARO.
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS sound_artist text,
  ADD COLUMN IF NOT EXISTS sound_license text,
  ADD COLUMN IF NOT EXISTS sound_source_url text;

COMMENT ON COLUMN public.videos.sound_artist IS
  'Auteur ou interprète du son utilisé dans la vidéo.';
COMMENT ON COLUMN public.videos.sound_license IS
  'Licence déclarée pour le son utilisé dans la vidéo.';
COMMENT ON COLUMN public.videos.sound_source_url IS
  'Page source du son, notamment pour les médias Wikimedia Commons.';
