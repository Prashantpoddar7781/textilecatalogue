import { GoogleGenAI, Type } from "@google/genai";
import { TextileDesign, OrderDraft } from "../types";
import { Order } from "../types";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export async function processWhatsAppOrder(
  message: string,
  catalog: TextileDesign[],
  pastOrders: Order[] = []
): Promise<OrderDraft | null> {
  if (!ai) {
    throw new Error("Missing VITE_GEMINI_API_KEY");
  }

  const fallbackDraft = buildFallbackDraft(message, catalog, pastOrders);
  if (fallbackDraft) {
    return fallbackDraft;
  }

  const catalogSummary = catalog.map(d => ({
    id: d.id,
    design_code: d.designCode || d.name || d.id.slice(-4),
    fabric_type: d.fabric,
    color: d.color,
    price: d.basePrice || d.retailPrice,
    stock_quantity: d.stockQuantity,
    description: d.description
  }));

  const pastOrdersSummary = pastOrders.slice(0, 5).map(o => ({
    design_id: o.designId,
    design_name: o.design?.name,
    fabric: o.design?.fabric,
    quantity: o.quantity,
    buyer_name: o.buyerName
  }));

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [
        {
          text: `You are a WhatsApp Order Intelligence Engine for the Indian textile trade.
Analyze the following unstructured WhatsApp message and convert it into a structured draft order.

Context:
- The seller's catalog includes designs with specific codes, fabrics, colors, prices, and stock.
- Buyers often use Hinglish (Hindi + English), abbreviations, or attributes ("blue cotton").
- Orders may span multiple messages; treat this as one combined message.
- If the buyer says "same as before", use past orders as hints if available.

CATALOG DATA:
${JSON.stringify(catalogSummary)}

PAST ORDERS (if any):
${JSON.stringify(pastOrdersSummary)}

WHATSAPP MESSAGE:
"${message}"

RULES:
1. Match design codes first. If no exact code, match attributes (color, fabric, price).
2. Flag missing quantities or ambiguous items.
3. Calculate a confidence score (0-100).
4. Never auto-confirm orders. Produce a draft only.
5. If info is ambiguous, make reasonable assumptions but flag them in missing_information.
6. If an item is out of stock, flag it and suggest alternatives.
`
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            buyer_intent_summary: { type: Type.STRING },
            confidence_score: { type: Type.NUMBER },
            detected_designs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  design_code: { type: Type.STRING },
                  matched_design_id: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  color: { type: Type.STRING },
                  notes: { type: Type.STRING },
                  is_out_of_stock: { type: Type.BOOLEAN }
                }
              }
            },
            missing_information: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            delivery_notes: { type: Type.STRING },
            price_constraints: { type: Type.STRING },
            suggested_alternatives: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  design_id: { type: Type.STRING },
                  reason: { type: Type.STRING }
                }
              }
            }
          },
          required: ["buyer_intent_summary", "confidence_score", "detected_designs"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Order extraction failed:", error);
    return fallbackDraft || null;
  }
}

function buildFallbackDraft(message: string, catalog: TextileDesign[], pastOrders: Order[]): OrderDraft | null {
  const text = message.toLowerCase();
  const detected: OrderDraft["detected_designs"] = [];

  const qtyMatch = text.match(/(\d+)\s*(pcs|pieces|pc|piece|qty|quantity)?/);
  const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : undefined;

  // Try exact design code or name match
  const exactMatch = catalog.find(d => {
    const code = d.designCode?.toLowerCase();
    const name = d.name?.toLowerCase();
    return (code && text.includes(code)) || (name && text.includes(name));
  });

  if (exactMatch) {
    detected.push({
      design_code: exactMatch.designCode || exactMatch.name,
      matched_design_id: exactMatch.id,
      quantity: quantity || 1,
      color: exactMatch.color,
      notes: "Fallback rule-based match"
    });
  }

  if (detected.length === 0) {
    // Try “same as before”
    if (text.includes("same as before") || text.includes("same as last time")) {
      const last = pastOrders[0];
      if (last?.designId) {
        detected.push({
          design_code: last.design?.designCode || last.design?.name,
          matched_design_id: last.designId,
          quantity: quantity || last.quantity || 1,
          color: last.design?.color,
          notes: "Fallback based on past order"
        });
      }
    }
  }

  if (detected.length === 0) return null;

  return {
    buyer_intent_summary: "Fallback draft generated from simple message.",
    confidence_score: 55,
    detected_designs: detected,
    missing_information: quantity ? [] : ["Quantity not specified"],
    delivery_notes: "",
    price_constraints: ""
  };
}
