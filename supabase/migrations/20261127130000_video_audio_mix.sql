-- Réglages de mixage audio des vidéos BAARO (0.000 à 1.000).
-- Le baseline 20261113000000 ne contient pas ces deux colonnes.
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS sound_volume numeric(4,3) NOT NULL DEFAULT 1.000,
  ADD COLUMN IF NOT EXISTS original_volume numeric(4,3) NOT NULL DEFAULT 1.000;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'videos_sound_volume_range'
      AND conrelid = 'public.videos'::regclass
  ) THEN
    ALTER TABLE public.videos ADD CONSTRAINT videos_sound_volume_range
      CHECK (sound_volume >= 0 AND sound_volume <= 1);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'videos_original_volume_range'
      AND conrelid = 'public.videos'::regclass
  ) THEN
    ALTER TABLE public.videos ADD CONSTRAINT videos_original_volume_range
      CHECK (original_volume >= 0 AND original_volume <= 1);
  END IF;
END $$;
