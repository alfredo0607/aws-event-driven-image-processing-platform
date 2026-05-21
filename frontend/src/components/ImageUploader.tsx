import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import {  uploadImage } from "../lib/api";

interface Props {
  onUploadSuccess: () => void;
}

type Status = "idle" | "uploading" | "success" | "error";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

function UploadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="w-10 h-10"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

export function ImageUploader({ onUploadSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      setStatus("error");
      setMessage(`Tipo no permitido: ${f.type}`);
      return;
    }
    setFile(f);
    setStatus("idle");
    setMessage("");
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setMessage("");

    try {
      const result = await uploadImage(file);

      if (result.success) {
        setStatus("success");
        setMessage("Imagen subida y encolada para procesamiento.");
        setFile(null);



        if (inputRef.current) inputRef.current.value = "";
        onUploadSuccess();
      } else {
        setStatus("error");
        setMessage(result.error.message);
      }
    } catch {
      setStatus("error");
      setMessage("No se pudo conectar al servidor.");
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all select-none ${
          dragging
            ? "border-violet-400 bg-violet-500/10"
            : "border-slate-700 hover:border-slate-500 bg-slate-900/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          className="hidden"
          onChange={handleChange}
        />

        <div className="flex flex-col items-center gap-3 text-slate-400">
          <UploadIcon />
          {file ? (
            <>
              <p className="font-semibold text-slate-200">{file.name}</p>
              <p className="text-sm text-slate-500">
                {(file.size / 1024).toFixed(1)} KB &middot; {file.type}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-slate-300">
                Arrastra una imagen o haz clic para seleccionar
              </p>
              <p className="text-sm">
                JPEG, PNG, GIF, WebP, SVG &middot; m&aacute;x. 10 MB
              </p>
            </>
          )}
        </div>
      </div>

      {file && (
        <button
          onClick={handleUpload}
          disabled={status === "uploading"}
          className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
        >
          {status === "uploading" ? "Subiendo..." : "Subir imagen"}
        </button>
      )}

      {message && (
        <p
          className={`text-sm text-center ${status === "error" ? "text-red-400" : "text-emerald-400"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
