/**
 * Service Front-End sécurisé pour les fonctionnalités IA de BAARO.
 * Toutes les requêtes passent par le backend pour protéger la clé API Gemini.
 */

/**
 * Générer du texte intelligent ou des descriptions pour les stories/vidéos
 * @param {string} prompt - Instruction ou texte fourni par l'utilisateur
 * @param {string} systemInstruction - Instructions de comportement du modèle
 */
export async function generateAIText(prompt, systemInstruction = "") {
  try {
    const response = await fetch("/api/ai/video-engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "text", 
        prompt, 
        systemInstruction 
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Erreur lors de la génération de texte par l'IA");
    }

    return data.reply || data.text || null;
  } catch (error) {
    console.error("Erreur Gemini Text (Frontend):", error);
    return null;
  }
}

/**
 * Obtenir un plan de montage intelligent structuré en JSON via le backend sécurisé
 * @param {string} prompt - Objectif du montage
 * @param {string} transcript - Transcription de la vidéo
 */
export async function generateAIEditPlan(prompt, transcript) {
  try {
    const response = await fetch("/api/ai/video-engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "edit_plan", 
        prompt, 
        transcript 
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Erreur lors de la génération du plan de montage");
    }

    return data.plan;
  } catch (error) {
    console.error("Erreur Plan de montage IA (Frontend):", error);
    throw error;
  }
}

/**
 * Générer une image ou un contenu visuel via le backend
 * (Passe par une action dédiée sur votre routeur serveur sécurisé)
 */
export async function generateAIImage(prompt) {
  try {
    const response = await fetch("/api/ai/video-engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "image", 
        prompt 
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Impossible de générer l'image par IA.");
    }

    // Si le serveur renvoie l'image sous forme de base64, on la convertit en objet File exploitable
    if (data.imageBase64) {
      const byteCharacters = atob(data.imageBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: data.mimeType || "image/jpeg" });
      
      return new File([blob], `gemini-ai-${Date.now()}.jpg`, { type: data.mimeType || "image/jpeg" });
    }

    throw new Error("Format de réponse d'image invalide.");
  } catch (error) {
    console.error("Erreur Gemini Image (Frontend):", error);
    throw error;
  }
}
