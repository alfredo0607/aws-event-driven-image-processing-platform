import { useState, useEffect, useCallback, useRef } from 'react';
import { listImages, deleteImage, type ImageFile } from '../lib/api';
import { ImagePreviewModal } from './ImagePreviewModal';

// ── Tipos ──────────────────────────────────────────────────────────────────

const SIZES = ['800x600', '400x300', '150x150'] as const;
type SizeKey = (typeof SIZES)[number];

interface SizeConfig {
  label: string;
  dims: string;
  aspectClass: string;
}

const SIZE_CONFIG: Record<SizeKey, SizeConfig> = {
  '800x600': { label: 'Full',      dims: '800×600', aspectClass: 'aspect-[4/3]' },
  '400x300': { label: 'Medium',    dims: '400×300', aspectClass: 'aspect-[4/3]' },
  '150x150': { label: 'Thumbnail', dims: '150×150', aspectClass: 'aspect-square' },
};

interface ImageGroup {
  filename: string;
  lastModified: string;
  variants: Partial<Record<SizeKey, ImageFile>>;
}

interface PreviewState {
  variant: ImageFile;
  sizeLabel: string;
  dims: string;
  filename: string;
}

interface Props {
  refreshTrigger: number;
  isProcessing: boolean;
  onProcessingComplete: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function groupImages(files: ImageFile[]): ImageGroup[] {
  const map = new Map<string, ImageGroup>();

  for (const file of files) {
    // key: image-resize/resized/800x600/abc123.jpg
    const parts = file.key.split('/');
    const sizeLabel = parts[parts.length - 2] as SizeKey;
    const filename  = parts[parts.length - 1];

    if (!map.has(filename)) {
      map.set(filename, { filename, lastModified: file.lastModified, variants: {} });
    }

    const group = map.get(filename)!;
    group.variants[sizeLabel] = file;

    if (file.lastModified > group.lastModified) {
      group.lastModified = file.lastModified;
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

// ── Iconos ─────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
      strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
      strokeWidth={1.5} stroke="currentColor"
      className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function ImagePlaceholderIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
      strokeWidth={1} stroke="currentColor" className="w-8 h-8 text-slate-600">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  );
}

// ── Subcomponentes ─────────────────────────────────────────────────────────

function SkeletonGroupCard() {
  return (
    <div className="bg-slate-800/60 rounded-2xl overflow-hidden animate-pulse">
      <div className="h-10 bg-slate-700/40 border-b border-slate-700/30" />
      <div className="grid grid-cols-3 divide-x divide-slate-700/30 p-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 bg-slate-700/40 rounded w-2/3 mx-auto" />
            <div className="aspect-[4/3] bg-slate-700/40 rounded-lg" />
            <div className="h-2 bg-slate-700/40 rounded w-1/2 mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ZoomIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
      strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607ZM10.5 7.5v6m3-3h-6" />
    </svg>
  );
}

function VariantCell({ variant, label, dims, aspectClass, onPreview }: {
  variant: ImageFile | undefined;
  label: string;
  dims: string;
  aspectClass: string;
  onPreview?: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const canPreview = !!variant?.url && !imgError;

  return (
    <div className="flex flex-col items-center gap-1.5 p-3">
      {/* Etiqueta de tamaño */}
      <div className="text-center">
        <p className="text-xs font-semibold text-slate-300">{label}</p>
        <p className="text-[10px] text-slate-500">{dims}</p>
      </div>

      {/* Imagen */}
      <div
        className={`relative w-full bg-slate-700/50 rounded-lg overflow-hidden ${aspectClass} flex items-center justify-center ${canPreview ? 'cursor-zoom-in group' : ''}`}
        onClick={canPreview ? onPreview : undefined}
      >
        {canPreview ? (
          <>
            <img
              src={variant!.url!}
              alt={`${label} — ${dims}`}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImgError(true)}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg">
                <ZoomIcon />
              </span>
            </div>
          </>
        ) : (
          <ImagePlaceholderIcon />
        )}
      </div>

      {/* Peso del archivo */}
      <p className="text-[10px] text-slate-500">
        {variant ? formatBytes(variant.size) : '—'}
      </p>
    </div>
  );
}

function GroupCard({
  group,
  onDelete,
  isDeleting,
  onPreview,
}: {
  group: ImageGroup;
  onDelete: (group: ImageGroup) => void;
  isDeleting: boolean;
  onPreview: (state: PreviewState) => void;
}) {
  const variantCount = SIZES.filter((s) => group.variants[s]).length;
  const isPartial = variantCount < SIZES.length;

  return (
    <div className={`bg-slate-800 rounded-2xl overflow-hidden transition-opacity ${isDeleting ? 'opacity-50' : ''}`}>
      {/* Cabecera del grupo */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-200 truncate" title={group.filename}>
            {group.filename}
          </p>
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-slate-500">{timeAgo(group.lastModified)}</p>
            {isPartial && (
              <span className="text-[10px] text-amber-400 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse inline-block" />
                procesando...
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => onDelete(group)}
          disabled={isDeleting}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ml-3"
        >
          <TrashIcon />
          Eliminar
        </button>
      </div>

      {/* Las 3 variantes en la misma fila */}
      <div className="grid grid-cols-3 divide-x divide-slate-700/50">
        {SIZES.map((sizeKey) => {
          const variant = group.variants[sizeKey];
          return (
            <VariantCell
              key={sizeKey}
              variant={variant}
              label={SIZE_CONFIG[sizeKey].label}
              dims={SIZE_CONFIG[sizeKey].dims}
              aspectClass={SIZE_CONFIG[sizeKey].aspectClass}
              onPreview={variant?.url ? () => onPreview({
                variant: variant,
                sizeLabel: SIZE_CONFIG[sizeKey].label,
                dims: SIZE_CONFIG[sizeKey].dims,
                filename: group.filename,
              }) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export function ImageGallery({ refreshTrigger, isProcessing, onProcessingComplete }: Props) {
  const [groups, setGroups]         = useState<ImageGroup[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);
  const [preview, setPreview]       = useState<PreviewState | null>(null);

  // Referencia al conteo para detectar imágenes nuevas durante el polling
  const groupCountRef = useRef(0);

  const fetchGroups = useCallback(async () => {
    setError('');
    try {
      const result = await listImages();
      if (result.success) {
        const newGroups = groupImages(result.data.files);
        setGroups(newGroups);
        groupCountRef.current = newGroups.length;
      } else {
        setError(result.error.message);
      }
    } catch {
      setError('No se pudo conectar al servidor.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch inicial y al cambiar refreshTrigger (upload nuevo)
  useEffect(() => {
    setLoading(true);
    fetchGroups();
  }, [fetchGroups, refreshTrigger]);

  // Polling automático cada 4 s cuando Lambda está procesando.
  // Se detiene cuando el número de grupos aumenta (imágenes listas)
  // o tras 30 s de timeout.
  useEffect(() => {
    if (!isProcessing) return;

    const startCount = groupCountRef.current;

    const interval = setInterval(async () => {
      try {
        const result = await listImages();
        if (result.success) {
          const newGroups = groupImages(result.data.files);
          setGroups(newGroups);
          groupCountRef.current = newGroups.length;

          if (newGroups.length > startCount) {
            clearInterval(interval);
            clearTimeout(timeout);
            onProcessingComplete();
          }
        }
      } catch {
        // silencioso durante polling
      }
    }, 4000);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      onProcessingComplete();
    }, 30_000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isProcessing, onProcessingComplete]);

  const handleDeleteGroup = async (group: ImageGroup) => {
    const keys = SIZES.map((s) => group.variants[s]?.key).filter(Boolean) as string[];
    if (!confirm(`¿Eliminar "${group.filename}" y sus ${keys.length} variante(s)?`)) return;

    setDeletingGroup(group.filename);
    try {
      await Promise.all(keys.map((key) => deleteImage(key)));
      setGroups((prev) => prev.filter((g) => g.filename !== group.filename));
      groupCountRef.current -= 1;
    } finally {
      setDeletingGroup(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <section>
      {/* Cabecera de sección */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-200">
            Im&aacute;genes procesadas
            {!loading && groups.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-500">
                ({groups.length})
              </span>
            )}
          </h2>

          {/* Indicador de procesamiento */}
          {isProcessing && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <RefreshIcon spinning />
              Lambda procesando...
            </span>
          )}
        </div>

        <button
          onClick={() => { setLoading(true); fetchGroups(); }}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <RefreshIcon spinning={loading} />
          Actualizar
        </button>
      </div>

      {/* Skeleton */}
      {loading && (
        <div className="space-y-4">
          {[0, 1].map((i) => <SkeletonGroupCard key={i} />)}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-center py-16 space-y-3">
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchGroups}
            className="text-sm text-slate-500 underline hover:text-slate-300 transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Estado vacío */}
      {!loading && !error && groups.length === 0 && (
        <div className="text-center py-16 space-y-2 text-slate-500">
          <ImagePlaceholderIcon />
          <p className="font-medium text-slate-400">No hay im&aacute;genes procesadas a&uacute;n</p>
          <p className="text-sm">Sube una imagen y Lambda generar&aacute; 3 resoluciones autom&aacute;ticamente.</p>
        </div>
      )}

      {/* Lista de grupos */}
      {!loading && !error && groups.length > 0 && (
        <div className="space-y-4">
          {groups.map((group) => (
            <GroupCard
              key={group.filename}
              group={group}
              onDelete={handleDeleteGroup}
              isDeleting={deletingGroup === group.filename}
              onPreview={setPreview}
            />
          ))}
        </div>
      )}

      {preview && (
        <ImagePreviewModal
          variant={preview.variant}
          filename={preview.filename}
          sizeLabel={preview.sizeLabel}
          dims={preview.dims}
          onClose={() => setPreview(null)}
        />
      )}
    </section>
  );
}
