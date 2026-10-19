import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, FileImage, ImagePlus, Loader2, RotateCcw, Upload, X } from 'lucide-react';
import { PhotoEntryKind, PhotoExtraction, photoEntryApi } from '../services/api';
import { isTouchDevice, prepareBillImage, wantsPhotoOnOpen } from '../utils/photoEntry';

interface Props {
  kind: PhotoEntryKind;
  /** Fill the screen's form. Return notes to show (e.g. "New party — add it"). */
  onApply: (extraction: PhotoExtraction) => string[] | void;
  label?: string;
  disabled?: boolean;
}

type Stage = 'idle' | 'reading' | 'review' | 'error';

const money = (v: number) => (v ? v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const formatDate = (v: string) => (v ? v.split('-').reverse().join('-') : '—');

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5">
    <div className="text-[9px] font-black uppercase tracking-wide text-slate-500">{label}</div>
    <div className="truncate text-sm font-bold text-slate-900">{value || '—'}</div>
  </div>
);

export const PhotoEntryButton: React.FC<Props> = ({ kind, onApply, label = 'Fill from bill photo', disabled }) => {
  const touch = isTouchDevice();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [stage, setStage] = useState<Stage>('idle');
  const [result, setResult] = useState<PhotoExtraction | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (disabled || !wantsPhotoOnOpen()) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('photo');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    if (touch) setChooserOpen(true);
    else setPanelOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const read = useCallback(async (pages: string[]) => {
    if (!pages.length) return;
    setStage('reading');
    setError('');
    try {
      const { extraction, warnings: found } = await photoEntryApi.extract(kind, pages);
      setResult(extraction);
      setWarnings(found);
      setStage('review');
    } catch (err: any) {
      setError(err.message || 'Could not read the photo.');
      setStage('error');
    }
  }, [kind]);

  const addFiles = useCallback(async (files: FileList | File[] | null | undefined, replace = false) => {
    const list = Array.from(files || []).filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
    if (!list.length) return;
    setChooserOpen(false);
    setPanelOpen(true);
    setApplied(false);
    setNotes([]);
    const prepared = await Promise.all(list.map(prepareBillImage));
    const next = (replace ? prepared : [...images, ...prepared]).slice(0, 4);
    setImages(next);
    void read(next);
  }, [images, read]);

  useEffect(() => {
    if (!panelOpen || touch) return;
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files || []);
      if (files.length) void addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [panelOpen, touch, addFiles]);

  const start = () => {
    if (touch) setChooserOpen(true);
    else setPanelOpen(true);
  };

  const startOver = () => {
    setImages([]);
    setResult(null);
    setStage('idle');
    setError('');
    setWarnings([]);
    setApplied(false);
    setNotes([]);
    start();
  };

  const apply = () => {
    if (!result) return;
    const out = onApply(result) || [];
    setNotes(out);
    setApplied(true);
    setPanelOpen(false);
  };

  const pickers = (
    <>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden
        onChange={e => { void addFiles(e.target.files, stage !== 'review' && !images.length); e.target.value = ''; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
        onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} />
    </>
  );

  const pageStrip = (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {images.map((src, i) => (
        <button key={i} type="button" onClick={() => setViewerOpen(true)}
          className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100" title="View photo">
          {src.startsWith('data:application/pdf')
            ? <FileImage className="m-auto mt-6 h-6 w-6 text-slate-500" />
            : <img src={src} alt={`Page ${i + 1}`} className="h-full w-full object-cover" />}
          <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-center text-[9px] font-bold text-white">Page {i + 1}</span>
        </button>
      ))}
      {images.length < 4 && stage !== 'reading' && (
        <button type="button" onClick={() => (touch ? cameraRef.current?.click() : fileRef.current?.click())}
          className="flex h-20 w-16 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed border-indigo-200 text-[9px] font-black uppercase text-indigo-700">
          <ImagePlus className="mb-1 h-4 w-4" /> Add page
        </button>
      )}
    </div>
  );

  return (
    <>
      <button type="button" onClick={start} disabled={disabled}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-3 py-2 text-xs font-black uppercase text-white shadow-sm hover:opacity-95 disabled:opacity-50">
        {touch ? <Camera className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
        {touch ? 'Bill photo' : label}
      </button>
      {pickers}

      {applied && images.length > 0 && !panelOpen && (
        <button type="button" onClick={() => setViewerOpen(v => !v)}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-indigo-200 bg-white py-1.5 pl-1.5 pr-3 text-xs font-black text-indigo-800 shadow-lg">
          {images[0].startsWith('data:application/pdf')
            ? <FileImage className="h-8 w-8 rounded-full bg-slate-100 p-1.5" />
            : <img src={images[0]} alt="" className="h-8 w-8 rounded-full object-cover" />}
          {viewerOpen ? 'Hide bill' : 'Check with bill'}
        </button>
      )}

      {chooserOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setChooserOpen(false)}>
          <div className="w-full rounded-t-3xl bg-white p-5 pb-8" onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300" />
            <p className="mb-4 text-center text-sm font-black text-slate-900">Fill this entry from a bill photo</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => cameraRef.current?.click()}
                className="flex flex-col items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-5 text-sm font-black text-white">
                <Camera className="h-7 w-7" /> Click photo
              </button>
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm font-black text-slate-800">
                <Upload className="h-7 w-7" /> From gallery
              </button>
            </div>
            <p className="mt-4 text-center text-[11px] text-slate-500">Keep the full bill in the frame, flat, in good light.</p>
          </div>
        </div>
      )}

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end overflow-hidden bg-black/30" onClick={() => stage !== 'reading' && setPanelOpen(false)}>
          <aside
            className={`flex h-full w-full max-w-[min(28rem,100%)] shrink-0 flex-col overflow-hidden bg-white shadow-2xl ${dragging ? 'ring-4 ring-inset ring-indigo-400' : ''}`}
            onClick={e => e.stopPropagation()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}
          >
            <header className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-sm font-black text-slate-900">Bill photo</p>
                <p className="text-[11px] text-slate-500">{touch ? 'Up to 4 pages of one bill' : 'Drop, paste (Ctrl+V) or add up to 4 pages'}</p>
              </div>
              <button type="button" onClick={() => setPanelOpen(false)} disabled={stage === 'reading'} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {images.length === 0 ? (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 px-4 py-12 text-center">
                  <Upload className="h-8 w-8 text-indigo-600" />
                  <span className="text-sm font-black text-indigo-900">Drop the bill here, or click to choose</span>
                  <span className="text-xs text-indigo-700">Photo (JPG / PNG) or PDF · you can also paste a screenshot</span>
                </button>
              ) : pageStrip}

              {stage === 'reading' && (
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-6 text-center">
                  <Loader2 className="mx-auto h-7 w-7 animate-spin text-indigo-600" />
                  <p className="mt-3 text-sm font-black text-indigo-900">Reading the bill…</p>
                  <p className="mt-1 text-xs text-indigo-700">Usually 5–15 seconds.</p>
                </div>
              )}

              {stage === 'error' && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
                  {error}
                  <button type="button" onClick={() => void read(images)} className="mt-3 flex items-center gap-1 text-xs font-black uppercase text-rose-700">
                    <RotateCcw className="h-3.5 w-3.5" /> Try again
                  </button>
                </div>
              )}

              {stage === 'review' && result && (
                <>
                  <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${
                    result.confidence === 'high' ? 'bg-emerald-50 text-emerald-800' : result.confidence === 'low' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'
                  }`}>
                    <CheckCircle2 className="h-4 w-4" />
                    {result.confidence === 'high' ? 'Read clearly' : result.confidence === 'low' ? 'Hard to read — check every field' : 'Read — please check the highlighted points'}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2"><Field label="Party" value={result.party.name} /></div>
                    <Field label="GSTIN" value={result.party.gstin} />
                    <Field label="Bill / Doc no." value={result.docNo} />
                    <Field label="Date" value={formatDate(result.docDate)} />
                    <Field label="Items" value={result.lines.length ? `${result.lines.length} line(s)` : ''} />
                    <Field label="Taxable" value={money(result.taxableAmount)} />
                    <Field label="GST" value={money(result.cgstAmount + result.sgstAmount + result.igstAmount)} />
                    <div className="col-span-2"><Field label="Bill total" value={money(result.totalAmount || result.payment.amount)} /></div>
                  </div>

                  {result.lines.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-500">
                          <tr><th className="px-2 py-1 text-left">Item</th><th className="px-2 py-1 text-right">Qty</th><th className="px-2 py-1 text-right">Rate</th><th className="px-2 py-1 text-right">Amount</th></tr>
                        </thead>
                        <tbody>
                          {result.lines.map((line, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="px-2 py-1 font-semibold">{line.description || '—'}</td>
                              <td className="px-2 py-1 text-right">{line.mts || line.pcs || line.qty || '—'} {line.mts ? 'm' : line.pcs ? 'pc' : ''}</td>
                              <td className="px-2 py-1 text-right">{line.rate || '—'}</td>
                              <td className="px-2 py-1 text-right font-bold">{money(line.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {warnings.length > 0 && (
                    <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                      {warnings.map(w => <li key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</li>)}
                    </ul>
                  )}
                </>
              )}
            </div>

            <footer className="grid grid-cols-[auto_1fr] gap-2 border-t p-4">
              <button type="button" onClick={startOver} disabled={stage === 'reading'}
                className="rounded-xl border border-slate-200 px-3 py-3 text-xs font-black uppercase text-slate-700 disabled:opacity-50">
                New photo
              </button>
              <button type="button" onClick={apply} disabled={stage !== 'review'}
                className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
                Fill the form
              </button>
            </footer>
          </aside>
        </div>
      )}

      {notes.length > 0 && !panelOpen && (
        <div className="fixed bottom-16 right-4 z-40 max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900 shadow-lg">
          <button type="button" onClick={() => setNotes([])} className="float-right text-amber-700"><X className="h-3.5 w-3.5" /></button>
          <p className="mb-1 font-black uppercase">Filled from photo — please check</p>
          {[...notes, ...warnings].map(n => <p key={n}>• {n}</p>)}
        </div>
      )}

      {viewerOpen && images.length > 0 && (
        <div className={touch ? 'fixed inset-0 z-50 overflow-auto bg-black/90' : 'fixed bottom-16 right-4 top-20 z-40 w-[min(480px,45vw)] overflow-auto rounded-2xl border bg-white shadow-2xl'}>
          <div className="sticky top-0 flex items-center justify-between bg-white/95 px-3 py-2">
            <span className="text-xs font-black uppercase text-slate-700">Bill photo · compare and correct</span>
            <button type="button" onClick={() => setViewerOpen(false)} className="rounded-lg p-1 text-slate-600"><X className="h-4 w-4" /></button>
          </div>
          {images.map((src, i) => (src.startsWith('data:application/pdf')
            ? <iframe key={i} src={src} title={`Page ${i + 1}`} className="h-[80vh] w-full" />
            : <img key={i} src={src} alt={`Page ${i + 1}`} className="w-full" />))}
        </div>
      )}
    </>
  );
};
