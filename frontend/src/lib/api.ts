const BASE = `${import.meta.env.VITE_API_URL ?? "https://services-resize-image-api.alfredo-dominguez.dev"}/api/v1`;

export interface ImageFile {
  key: string;
  size: number;
  lastModified: string;
  url: string | null;
}

interface ApiOk<T> {
  success: true;
  data: T;
  message?: string;
}

interface ApiError {
  success: false;
  error: { code: string; message: string };
}

type ApiResult<T> = ApiOk<T> | ApiError;

export async function uploadImage(
  file: File,
): Promise<
  ApiResult<{ key: string; filename: string; size: number; mimeType: string }>
> {
  const body = new FormData();
  body.append("image", file);
  const res = await fetch(`${BASE}/files/upload`, { method: "POST", body });
  return res.json();
}

export async function listImages(
  prefix = "image-resize/resized/",
): Promise<ApiResult<{ count: number; files: ImageFile[] }>> {
  const res = await fetch(`${BASE}/files?prefix=${encodeURIComponent(prefix)}`);
  return res.json();
}

export async function deleteImage(key: string): Promise<ApiResult<never>> {
  const res = await fetch(`${BASE}/files?key=${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
  return res.json();
}
