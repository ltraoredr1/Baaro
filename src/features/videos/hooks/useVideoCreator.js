  const handleUpload = async () => {
    if (!selectedFile) {
      showToast("Sélectionne une vidéo.", "error");
      return;
    }

    if (!user) {
      showToast("Connecte-toi pour publier.", "error");
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    try {
      setUploadProgress(30);
      // Utilisation du service Cloudflare R2 via l'API partagée
      const uploaded = await uploadExternalMedia(selectedFile, "videos");
      const publicUrl = uploaded.publicUrl || uploaded.url;
      setUploadProgress(65);

      const duration = generated
        ? formatTime(generatedSeconds)
        : await readDuration(selectedFile);

      // Son séparé (vidéo importée/filmée) si besoin
      let soundUrl = null;
      if (selectedSound?.audio_url && !bakedAudio) {
        soundUrl = selectedSound.audio_url;
        if (selectedSound.file) {
          const uploadedAudio = await uploadExternalMedia(selectedSound.file, "videos");
          soundUrl = uploadedAudio.publicUrl || uploadedAudio.url;
        }
      }
      setUploadProgress(80);

      const {
        data: created,
        error: dbError,
        degraded,
      } = await insertVideo(
        {
          author_id: user.id,
          video_url: publicUrl,
          title: uploadTitle.trim() || "Vidéo BAARO",
          description: uploadDescription.trim() || null,
          duration,
          views: 0,
          likes: 0,
          sound_id: selectedSound?.id ? String(selectedSound.id) : null,
        },
        selectedSound
          ? {
              sound_title: selectedSound.title || null,
              ...(soundUrl
                ? { sound_url: soundUrl, mute_original: !!muteOriginal }
                : {}),
            }
          : {},
      );

      if (dbError) throw dbError;

      setUploadProgress(100);
      onRewardPoints?.("publish_video", "Vidéo publiée", created?.id);
      showPointsReward?.(25, "Vidéo publiée");
      showToast("Vidéo publiée avec succès 🎉", "success");

      setShowUpload(false);
      resetUpload();
      await loadVideos();
    } catch (error) {
      console.error(error);
      showToast(
        `Erreur : ${error.message || "publication impossible"}`,
        "error",
      );
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };
