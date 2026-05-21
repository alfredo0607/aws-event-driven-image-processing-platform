import { useState, useEffect } from 'react';
import type { ImageFile } from '../lib/api';

interface Props {
  variant: ImageFile;
  filename: string;
  sizeLabel: string;
  dims: string;
  onClose: () => void;
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
      strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function ImagePreviewModal({ variant, filename, sizeLabel, dims, onClose }: Props) {
  const [realDims, setRealDims] = useState<{ w: number; h: number } | null>(null);
  const [loaded, setLoaded]     = useState(false);
  const [error, setError]       = useState(false);

  // Cerrar con ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Bloquear scroll del body mientras el modal está abierto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-slate-800 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Cabecera ───────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <p className="font-semibold text-slate-100 text-sm truncate max-w-xs" title={filename}>
              {filename}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-medium text-violet-400">{sizeLabel}</span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-slate-400">M&aacute;x. {dims.replace('x', ' × ')}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors flex-shrink-0 ml-4"
            title="Cerrar (ESC)"
          >
            <XIcon />
          </button>
        </div>

        {/* ── Imagen ─────────────────────────────────────────────── */}
        <div className="relative flex items-center justify-center bg-slate-900/70 min-h-64 px-6 py-8"
          style={{ maxHeight: '62vh' }}>

          {/* Spinner mientras carga */}
          {!loaded && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Error al cargar */}
          {error && (
            <p className="text-slate-500 text-sm">No se pudo cargar la imagen.</p>
          )}

          {variant.url && !error && (
            <img
              src={variant.url}
              alt={`${filename} — ${sizeLabel}`}
              className={`max-w-full rounded-lg object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
              style={{ maxHeight: '52vh' }}
              onLoad={(e) => {
                const img = e.currentTarget;
                setRealDims({ w: img.naturalWidth, h: img.naturalHeight });
                setLoaded(true);
              }}
              onError={() => setError(true)}
            />
          )}
        </div>

        {/* ── Metadatos ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4 border-t border-slate-700 bg-slate-800/80">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Variante</p>
            <p className="text-sm font-semibold text-slate-200">{sizeLabel}</p>
          </div>

          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Dimensiones reales</p>
            <p className="text-sm font-semibold text-slate-200">
              {realDims
                ? <>{realDims.w} <span className="text-slate-500 font-normal">×</span> {realDims.h} <span className="text-slate-500 font-normal text-xs">px</span></>
                : <span className="text-slate-500">—</span>
              }
            </p>
          </div>

          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Peso</p>
            <p className="text-sm font-semibold text-slate-200">{formatBytes(variant.size)}</p>
          </div>

          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Procesado</p>
            <p className="text-xs font-medium text-slate-300 leading-snug">{formatDate(variant.lastModified)}</p>
          </div>
        </div>

        {/* Hint ESC */}
        <p className="text-center text-[10px] text-slate-600 py-2">
          Presiona ESC o haz clic fuera para cerrar
        </p>
      </div>
    </div>
  );
}
