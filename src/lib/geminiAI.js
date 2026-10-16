import { GoogleGenAI } from "@google/genai";

// Initialisation avec votre clé API (idéalement stockée dans une variable d'environnement VITE_GEMINI_API_KEY)
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

/**
 * Générer du texte intelligent ou des descriptions pour les stories/vidéos
 */
export async function generateAIText(prompt, systemInstruction = "") {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction || "Tu es l'assistant créatif de BAARO, une application vidéo innovante.",
      },
    });
    return response.text;
  } catch (error) {
    console.error("Erreur Gemini Text:", error);
    return null;
  }
}

/**
 * Générer une image via Gemini / Imagen (si pris en charge par votre configuration)
 */
export async function generateAIImage(prompt) {
  try {
    // Utilisation du modèle de génération d'image Imagen ou équivalent via le SDK
    const response = await ai.models.generateImages({
      model: 'imagen-3.0-generate-002',
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '9:16', // Format vertical idéal pour les vidéos/stories BAARO
      },
    });

    const base64Image = response.generatedImages[0].image.imageBytes;
    // Conversion du base64 en objet File exploitable par votre application
    const byteCharacters = atob(base64Image);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });
    
    return new File([blob], `gemini-ai-${Date.now()}.jpg`, { type: 'image/jpeg' });
  } catch (error) {
    console.error("Erreur Gemini Image:", error);
    throw new Error("Impossible de générer l'image par IA.");
  }
}
