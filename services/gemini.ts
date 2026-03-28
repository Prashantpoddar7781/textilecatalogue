import { GoogleGenAI, Type } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export async function analyzeTextileImage(base64Image: string) {
  if (!ai) {
    throw new Error("Missing VITE_GEMINI_API_KEY");
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(",")[1] || base64Image,
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
              description: "The identified fabric type.",
            },
            description: {
              type: Type.STRING,
              description: "A professional marketing description for the design.",
            },
          },
          required: ["fabric", "description"],
        },
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("AI Analysis failed:", error);
    return null;
  }
}

async function fetchImageAsBase64Parts(url: string): Promise<{ mime: string; b64: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`Failed to load model image: ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (m) {
          resolve({ mime: m[1], b64: m[2] });
        } else {
          reject(new Error("Could not read model image"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

function dataUrlMimeAndB64(dataUrl: string): { mime: string; b64: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { mime: m[1], b64: m[2] };
  return { mime: "image/jpeg", b64: dataUrl.split(",")[1] || dataUrl };
}

/** Max dimension (px) for product images sent to Gemini — smaller payloads = faster requests. */
const PRODUCT_MAX_SIDE_PX = 1536;

/**
 * Load a model image URL/path once into a data URL so it can be reused for many generations
 * without refetching the network on every API call.
 */
export async function ensureModelImageDataUrl(modelImage: string): Promise<string | null> {
  if (modelImage.startsWith("data:")) {
    return modelImage;
  }
  const url = modelImage.startsWith("http")
    ? modelImage
    : `${typeof window !== "undefined" ? window.location.origin : ""}${modelImage}`;
  try {
    const parts = await fetchImageAsBase64Parts(url);
    return `data:${parts.mime};base64,${parts.b64}`;
  } catch (e) {
    console.error("ensureModelImageDataUrl failed:", e);
    return null;
  }
}

/**
 * Downscale very large product/variant photos before sending to the image model (faster uploads & generation).
 */
export async function resizeProductImageForGemini(productImage: string): Promise<string> {
  if (typeof document === "undefined") return productImage;

  const src = productImage.startsWith("data:")
    ? productImage
    : productImage.startsWith("http") || productImage.startsWith("/")
      ? productImage.startsWith("http")
        ? productImage
        : `${typeof window !== "undefined" ? window.location.origin : ""}${productImage}`
      : `data:image/jpeg;base64,${productImage}`;

  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (!w || !h) {
          resolve(src);
          return;
        }
        if (Math.max(w, h) <= PRODUCT_MAX_SIDE_PX) {
          resolve(src);
          return;
        }
        const scale = PRODUCT_MAX_SIDE_PX / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

/** AI modelling: model wears the product (from textilehub---smart-category-manager (2)). */
export async function generateAIModelling(
  productImage: string,
  modelImage: string,
  color?: string
): Promise<string | null> {
  if (!ai) {
    console.error("Gemini API Key is missing. Set VITE_GEMINI_API_KEY.");
    return null;
  }

  try {
    let modelMime = "image/jpeg";
    let modelData: string;

    if (modelImage.startsWith("data:")) {
      const m = modelImage.match(/^data:([^;]+);base64,(.+)$/);
      if (m) {
        modelMime = m[1];
        modelData = m[2];
      } else {
        modelData = modelImage.split(",")[1] || modelImage;
      }
    } else if (modelImage.startsWith("http") || modelImage.startsWith("/")) {
      const url = modelImage.startsWith("http")
        ? modelImage
        : `${typeof window !== "undefined" ? window.location.origin : ""}${modelImage}`;
      try {
        const parts = await fetchImageAsBase64Parts(url);
        modelMime = parts.mime;
        modelData = parts.b64;
      } catch (e) {
        console.error("Failed to fetch model image:", e);
        return null;
      }
    } else {
      modelData = modelImage.split(",")[1] || modelImage;
    }

    const product = dataUrlMimeAndB64(
      productImage.startsWith("data:") ? productImage : `data:image/jpeg;base64,${productImage}`
    );

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: product.mime,
              data: product.b64,
            },
          },
          {
            inlineData: {
              mimeType: modelMime,
              data: modelData,
            },
          },
          {
            text: `Generate an image where the model in the second image is wearing the product from the first image. ${color ? `The product MUST be in ${color} color, but the pattern and design must remain EXACTLY the same as the first image.` : ""} 
            
            CRITICAL INSTRUCTIONS:
            1. The model's identity MUST be identical to the woman in the second image. Her face, features, hair, and skin tone must not change.
            2. MAINTAIN THE EXACT PATTERN, TEXTURE, AND DESIGN: The intricate details, prints, or embroidery from the product in the first image must be perfectly preserved, only the base color should change if a color is specified.
            3. The model should be in a professional studio setting with lighting and pose similar to the second image.
            4. The final image must be high quality, realistic, and look like a professional fashion photograph.`,
          },
        ],
      },
      // seed + modalities match reference app; cast for SDK typing
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        seed: 42,
      } as any,
    });

    if (!response.candidates?.[0]?.content?.parts) {
      console.error("No candidates returned from AI modelling");
      return null;
    }

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || "image/png";
        return `data:${mime};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("AI Modelling failed:", error);
    return null;
  }
}
