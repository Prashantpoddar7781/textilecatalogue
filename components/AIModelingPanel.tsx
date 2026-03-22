import React, { useState, useCallback } from 'react';
import { Sparkles, Loader2, ImageIcon, Check } from 'lucide-react';
import {
  loadReferenceModelImage,
  buildModelingPrompts,
  generateAllModelingAngles,
  type AngleKey,
} from '../services/aiModeling';

type Props = {
  /** Current product/fabric image (data URL) from the upload area */
  productImage: string | null;
  /** Sets the main design preview to the chosen generated shot */
  onUseAsDesign: (dataUrl: string) => void;
};

const ANGLE_LABELS: Record<AngleKey, string> = {
  front: 'Front',
  back: 'Back',
  side: 'Side',
};

export const AIModelingPanel: React.FC<Props> = ({ productImage, onUseAsDesign }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<AngleKey, string> | null>(null);
  const [selectedAngle, setSelectedAngle] = useState<AngleKey | null>(null);

  const runPipeline = useCallback(async () => {
    if (!productImage) return;
    setError(null);
    setResults(null);
    setSelectedAngle(null);
    setLoading(true);
    setProgress('Loading reference model…');

    try {
      const modelDataUrl = await loadReferenceModelImage();
      setProgress('Creating prompts from your fabric + model…');
      const prompts = await buildModelingPrompts(productImage, modelDataUrl);
      setProgress('Generating catalogue shots (this can take a minute)…');

      const imgs = await generateAllModelingAngles(prompts, (angle, step) => {
        setProgress(`Generating ${ANGLE_LABELS[angle]} (${step}/3)…`);
      });

      setResults(imgs);
      setProgress('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI modelling failed';
      setError(msg);
      setProgress('');
    } finally {
      setLoading(false);
    }
  }, [productImage]);

  const handleUseAsDesign = (angle: AngleKey) => {
    if (!results?.[angle]) return;
    onUseAsDesign(results[angle]);
    setSelectedAngle(angle);
  };

  const hasKey = typeof import.meta.env.VITE_GEMINI_API_KEY === 'string' && !!import.meta.env.VITE_GEMINI_API_KEY;

  return (
    <div className="flex flex-col rounded-xl sm:rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-white p-4 space-y-3 min-h-[200px]">
      <div className="flex items-start gap-2">
        <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700 shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900">AI modelling</h3>
          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
            Uses your reference model (<code className="text-[10px] bg-white/80 px-1 rounded">public/model.png</code>)
            and your uploaded fabric to generate <strong>front</strong>, <strong>back</strong>, and{' '}
            <strong>side</strong> shots. Pick one to use as the design image.
          </p>
        </div>
      </div>

      {!hasKey && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Set <code className="text-[10px]">VITE_GEMINI_API_KEY</code> in <code className="text-[10px]">.env</code> for
          AI modelling.
        </p>
      )}

      {!productImage && (
        <div className="flex flex-1 items-center justify-center gap-2 text-gray-400 text-sm py-6 border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
          <ImageIcon className="w-5 h-5 shrink-0" />
          <span>Upload a product image first</span>
        </div>
      )}

      {productImage && !results && (
        <button
          type="button"
          disabled={loading || !hasKey}
          onClick={runPipeline}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Working…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate 3 angles (front, back, side)
            </>
          )}
        </button>
      )}

      {loading && progress && (
        <p className="text-xs text-indigo-700 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          {progress}
        </p>
      )}

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
          {error}
        </p>
      )}

      {results && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-700">Choose a shot for your design</p>
          <div className="grid grid-cols-3 gap-2">
            {(['front', 'back', 'side'] as const).map((angle) => (
              <div key={angle} className="flex flex-col gap-1.5">
                <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-gray-200 bg-gray-100 shadow-sm">
                  <img
                    src={results[angle]}
                    alt={ANGLE_LABELS[angle]}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0 left-0 right-0 text-[10px] font-semibold text-white bg-black/55 px-1 py-0.5 text-center">
                    {ANGLE_LABELS[angle]}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleUseAsDesign(angle)}
                  className={`text-[11px] font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                    selectedAngle === angle
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-900 text-white hover:bg-black'
                  }`}
                >
                  {selectedAngle === angle ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      In use
                    </>
                  ) : (
                    'Use as design'
                  )}
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={runPipeline}
            disabled={loading}
            className="w-full text-xs text-indigo-700 font-medium py-2 rounded-lg border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50"
          >
            Regenerate all angles
          </button>
        </div>
      )}
    </div>
  );
};
