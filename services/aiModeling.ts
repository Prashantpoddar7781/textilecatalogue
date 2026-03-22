import { GoogleGenAI, Type, PersonGeneration } from '@google/genai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Match services/gemini.ts (vision + JSON)
const VISION_MODEL = 'gemini-3-flash-preview';
const IMAGEN_MODEL = 'imagen-4.0-fast-generate-001';

function stripDataUrl(dataUrl: string): { mime: string; base64: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { mime: m[1], base64: m[2] };
  return { mime: 'image/jpeg', base64: dataUrl.split(',')[1] || dataUrl };
}

/** Load reference model from /model.png (place file in public/model.png) */
export async function loadReferenceModelImage(): Promise<string> {
  const res = await fetch('/model.png', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(
      'Reference model not found. Add model.png to the project public folder (public/model.png).'
    );
  }
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Failed to read model image'));
    r.readAsDataURL(blob);
  });
}

export type ModelingPrompts = {
  frontPrompt: string;
  backPrompt: string;
  sidePrompt: string;
};

/**
 * Uses Gemini vision on reference model + product fabric to build 3 Imagen prompts
 * (front / back / side catalogue shots).
 */
export async function buildModelingPrompts(
  productImageDataUrl: string,
  modelImageDataUrl: string
): Promise<ModelingPrompts> {
  if (!ai) throw new Error('Missing VITE_GEMINI_API_KEY');

  const product = stripDataUrl(productImageDataUrl);
  const model = stripDataUrl(modelImageDataUrl);

  const response = await ai.models.generateContent({
    model: VISION_MODEL,
    contents: {
      parts: [
        {
          inlineData: { mimeType: model.mime, data: model.base64 },
        },
        {
          inlineData: { mimeType: product.mime, data: product.base64 },
        },
        {
          text: `You help create textile catalogue photography prompts.

Image 1: REFERENCE MODEL — use this person's general appearance (age, gender presentation, body type) as inspiration for consistency across shots.

Image 2: PRODUCT — textile/fabric/design swatch. The garment in generated photos must clearly showcase this pattern, colors, and texture.

Output JSON only with three fields. Each value must be ONE English prompt for Imagen 4 (max 450 characters each), describing:
- Professional full-body fashion catalogue photo, clean white or light grey studio background, soft even lighting, photorealistic, high detail.
- The model wears appropriate Indian textile apparel (saree with blouse, salwar suit, or kurta as fits the fabric) that prominently displays the fabric from image 2.
- frontPrompt: camera facing the model, front view.
- backPrompt: model facing away, full back visible.
- sidePrompt: strict side profile, full body.

Do not include markdown or code fences.`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          frontPrompt: { type: Type.STRING },
          backPrompt: { type: Type.STRING },
          sidePrompt: { type: Type.STRING },
        },
        required: ['frontPrompt', 'backPrompt', 'sidePrompt'],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error('No response from vision model');
  return JSON.parse(text) as ModelingPrompts;
}

function imageBytesToDataUrl(imageBytes: string): string {
  return `data:image/png;base64,${imageBytes}`;
}

/**
 * Generate one catalogue image from an Imagen prompt.
 */
export async function generateModelingImage(prompt: string): Promise<string> {
  if (!ai) throw new Error('Missing VITE_GEMINI_API_KEY');

  const response = await ai.models.generateImages({
    model: IMAGEN_MODEL,
    prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: '3:4',
      personGeneration: PersonGeneration.ALLOW_ADULT,
    },
  });

  const img = response.generatedImages?.[0]?.image?.imageBytes;
  if (!img) {
    const msg =
      (response as unknown as { error?: { message?: string } }).error?.message ||
      'Image generation returned no image (safety filter or quota).';
    throw new Error(msg);
  }
  return imageBytesToDataUrl(img);
}

export type AngleKey = 'front' | 'back' | 'side';

export async function generateAllModelingAngles(
  prompts: ModelingPrompts,
  onProgress?: (angle: AngleKey, index: 1 | 2 | 3) => void
): Promise<Record<AngleKey, string>> {
  const entries: [AngleKey, string][] = [
    ['front', prompts.frontPrompt],
    ['back', prompts.backPrompt],
    ['side', prompts.sidePrompt],
  ];

  const out: Partial<Record<AngleKey, string>> = {};
  let i = 1 as 1 | 2 | 3;
  for (const [key, prompt] of entries) {
    onProgress?.(key, i);
    out[key] = await generateModelingImage(prompt);
    i = (i + 1) as 1 | 2 | 3;
  }
  return out as Record<AngleKey, string>;
}
