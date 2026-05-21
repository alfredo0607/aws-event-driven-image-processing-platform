import { useState } from 'react';
import { ImageUploader } from './ImageUploader';
import { ImageGallery } from './ImageGallery';

export function ImageProcessor() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <div className="space-y-12">
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-base font-semibold text-slate-200 mb-4">Subir imagen</h2>
        <ImageUploader onUploadSuccess={() => setRefreshTrigger((n) => n + 1)} />
      </section>

      <ImageGallery refreshTrigger={refreshTrigger} />
    </div>
  );
}
