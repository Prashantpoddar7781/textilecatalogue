import React, { useState } from "react";
import { MessageSquare, Sparkles, Loader2, Clipboard, AlertCircle, CheckCircle2, Package } from "lucide-react";
import { processWhatsAppOrder } from "../services/orderIntelligence";
import { TextileDesign, Order, OrderDraft } from "../types";

interface Props {
  catalog: TextileDesign[];
  pastOrders: Order[];
  onDraftCreated?: (draft: OrderDraft) => void;
}

export const OrderProcessor: React.FC<Props> = ({ catalog, pastOrders, onDraftCreated }) => {
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleProcess = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await processWhatsAppOrder(inputText, catalog, pastOrders);
      if (result) {
        setDraft(result);
        onDraftCreated?.(result);
      } else {
        setDraft(null);
        setError("No draft generated. Please try a more detailed message.");
      }
    } catch (e: any) {
      setDraft(null);
      setError(e?.message || "AI processing failed. Check API key and try again.");
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score > 80) return "text-green-600 bg-green-50 border-green-200";
    if (score > 50) return "text-amber-600 bg-amber-50 border-amber-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const handleCopyJson = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(draft, null, 2));
      alert("Draft JSON copied to clipboard.");
    } catch {
      alert("Failed to copy draft JSON.");
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom duration-500">
      <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-100">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 leading-tight">Order Extraction</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
              Paste WhatsApp Chat
            </p>
          </div>
        </div>

        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="e.g. Bhai, design 405 ka 20 piece blue and cotton wala design ka 10 piece same as last time send kar do urgent..."
          className="w-full h-40 p-6 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none transition-all resize-none text-sm font-medium"
        />

        <button
          onClick={handleProcess}
          disabled={loading || !inputText}
          className="w-full mt-4 bg-gray-900 hover:bg-black text-white py-5 rounded-2xl font-black flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6 text-indigo-400" />}
          <span>{loading ? "Analyzing Conversation..." : "Extract Draft Order"}</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold p-4 rounded-2xl">
          {error}
        </div>
      )}

      {draft && (
        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border-2 border-indigo-50 animate-in zoom-in duration-300">
          <div className="flex items-center justify-between mb-8">
            <div className={`px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest ${getConfidenceColor(draft.confidence_score)}`}>
              AI Confidence: {draft.confidence_score}%
            </div>
            <button
              onClick={handleCopyJson}
              className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest"
            >
              <Clipboard className="w-3.5 h-3.5" />
              Copy JSON
            </button>
          </div>

          <div className="mb-8">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">Intent Summary</h3>
            <p className="text-lg font-black text-gray-900 leading-snug">{draft.buyer_intent_summary}</p>
          </div>

          <div className="space-y-4 mb-8">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Detected Items</h3>
            {draft.detected_designs.map((item, idx) => (
              <div key={idx} className="flex items-center gap-4 p-5 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="bg-white p-3 rounded-xl shadow-sm">
                  <Package className="w-6 h-6 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-gray-900 uppercase">Design: {item.design_code || "Attribute Match"}</span>
                    <span className="font-black text-indigo-600">Qty: {item.quantity || "??"}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] font-bold text-gray-500">
                    <span className="uppercase">{item.color || "Mixed Colors"}</span>
                    {item.notes && <span className="bg-gray-200 px-2 py-0.5 rounded text-gray-600">{item.notes}</span>}
                    {item.is_out_of_stock && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded">Out of Stock</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {draft.missing_information?.length > 0 && (
            <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 mb-8">
              <div className="flex items-center gap-2 text-amber-800 mb-2">
                <AlertCircle className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Missing Information</span>
              </div>
              <ul className="space-y-1">
                {draft.missing_information.map((info, idx) => (
                  <li key={idx} className="text-xs text-amber-700 font-bold">• {info}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => setDraft(null)}
              className="flex-1 py-4 border-2 border-gray-100 text-gray-500 font-black rounded-2xl hover:bg-gray-50 transition-all uppercase tracking-widest text-xs"
            >
              Discard
            </button>
            <button className="flex-[2] py-4 bg-green-600 hover:bg-green-700 text-white font-black rounded-2xl shadow-xl shadow-green-100 flex items-center justify-center gap-3 transition-all active:scale-95">
              <CheckCircle2 className="w-5 h-5" />
              Save Draft (Manual)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
