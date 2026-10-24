import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AssetDropzoneProps {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  className?: string;
}

const MAX_BYTES = 5 * 1024 * 1024;

export function AssetDropzone({ value, onChange, max = 4, className }: AssetDropzoneProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const room = max - value.length;
      const accepted = files.slice(0, room).filter((f) => {
        if (!f.type.startsWith("image/")) {
          toast.error(`${f.name} isn't an image`);
          return false;
        }
        if (f.size > MAX_BYTES) {
          toast.error(`${f.name} is over 5MB`);
          return false;
        }
        return true;
      });
      if (!accepted.length) return;

      setUploading(true);
      try {
        const newUrls: string[] = [];
        for (const file of accepted) {
          const ext = file.name.split(".").pop() ?? "png";
          const path = `references/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error } = await supabase.storage
            .from("landing-assets")
            .upload(path, file, { contentType: file.type, upsert: false });
          if (error) {
            toast.error(`Upload failed: ${error.message}`);
            continue;
          }
          const { data } = supabase.storage.from("landing-assets").getPublicUrl(path);
          newUrls.push(data.publicUrl);
        }
        if (newUrls.length) onChange([...value, ...newUrls]);
      } finally {
        setUploading(false);
      }
    },
    [value, onChange, max],
  );

  return (
    <div className={className}>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          upload(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "rounded-2xl bg-muted/40 px-5 py-6 text-center cursor-pointer transition-colors",
          dragOver ? "bg-primary/10" : "hover:bg-muted/70",
          value.length >= max && "opacity-60 pointer-events-none",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Drop images, or click to upload ({value.length}/{max})
            </>
          )}
        </div>
      </div>

      {value.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {value.map((url, i) => (
            <div key={url} className="relative group">
              <img
                src={url}
                alt={`Reference ${i + 1}`}
                className="w-full aspect-square object-cover rounded-xl"
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((u) => u !== url))}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
