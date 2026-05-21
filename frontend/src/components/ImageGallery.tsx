import { useState, useEffect, useCallback } from 'react';
import { listImages, deleteImage, type ImageFile } from '../lib/api';

interface Props {
  refreshTrigger: number;
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="w-4 h-4"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="w-4 h-4"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1}
      stroke="currentColor"
      className="w-14 h-14 text-slate-600"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
      />
    </svg>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileName(key: string): string {
  return key.split('/').pop() ?? key;
}

function SkeletonCard() {
  return <div className="bg-slate-800/60 rounded-2xl h-56 animate-pulse" />;
}

function ImageCard({
  img,
  onDelete,
  isDeleting,
}: {
  img: ImageFile;
  onDelete: (key: string) => void;
  isDeleting: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="bg-slate-800 rounded-2xl overflow-hidden flex flex-col">
      <div className="aspect-video bg-slate-700/60 flex items-center justify-center">
        {img.url && !imgError ? (
          <img
            src={img.url}
            alt={fileName(img.key)}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <ImageIcon />
        )}
      </div>

      <div className="p-3 flex items-center justify-between gap-2 flex-1">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate" title={img.key}>
            {fileName(img.key)}
          </p>
          <p className="text-xs text-slate-500">{formatBytes(img.size)}</p>
        </div>

        <button
          onClick={() => onDelete(img.key)}
          disabled={isDeleting}
          title="Eliminar"
          className="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

export function ImageGallery({ refreshTrigger }: Props) {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchImages = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listImages();
      if (result.success) {
        setImages(result.data.files);
      } else {
        setError(result.error.message);
      }
    } catch {
      setError('No se pudo conectar al servidor.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages, refreshTrigger]);

  const handleDelete = async (key: string) => {
    if (!confirm(`¿Eliminar "${fileName(key)}"?`)) return;
    setDeleting(key);
    try {
      const result = await deleteImage(key);
      if (result.success) {
        setImages((prev) => prev.filter((img) => img.key !== key));
      }
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-slate-200">
          Im&aacute;genes procesadas
          {!loading && images.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-500">({images.length})</span>
          )}
        </h2>
        <button
          onClick={fetchImages}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <RefreshIcon />
          Actualizar
        </button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-16 space-y-3">
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchImages}
            className="text-sm text-slate-500 underline hover:text-slate-300 transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && images.length === 0 && (
        <div className="text-center py-16 space-y-2 text-slate-500">
          <ImageIcon />
          <p className="font-medium text-slate-400">No hay im&aacute;genes procesadas a&uacute;n</p>
          <p className="text-sm">Sube una imagen y Lambda la procesara autom&aacute;ticamente.</p>
        </div>
      )}

      {!loading && !error && images.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {images.map((img) => (
            <ImageCard
              key={img.key}
              img={img}
              onDelete={handleDelete}
              isDeleting={deleting === img.key}
            />
          ))}
        </div>
      )}
    </section>
  );
}
