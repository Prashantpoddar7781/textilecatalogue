
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function analyzeTextileImage(base64Image: string) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image.split(',')[1] || base64Image,
            },
          },
          {
            text: "Analyze this textile design. Identify the fabric type (e.g., Cotton, Silk, Linen, Polyester, etc.) and provide a professional product description suitable for a wholesale catalogue.",
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fabric: {
              type: Type.STRING,
              description: 'The identified fabric type.',
            },
            description: {
              type: Type.STRING,
              description: 'A professional marketing description for the design.',
            },
          },
          required: ['fabric', 'description'],
        },
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("AI Analysis failed:", error);
    return null;
  }
}
