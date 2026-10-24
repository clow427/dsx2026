import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Check, Image as ImageIcon } from "lucide-react";
import { PolaroidIcon } from "@/components/icons/PolaroidIcon";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface AICoverImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventName: string;
  description: string;
  eventType: string;
  template: string;
  locationType: string;
  onAccept: (url: string) => void;
}

const buildAutoPrompt = (
  name: string,
  description: string,
  eventType: string,
  locationType: string,
) => {
  const parts: string[] = [];
  if (name) parts.push(`Cover image for an event called "${name}"`);
  else parts.push("Cover image for an upcoming event");
  if (eventType) parts.push(`Event type: ${eventType}`);
  if (locationType) parts.push(`Format: ${locationType}`);
  if (description) {
    const trimmed = description.trim().slice(0, 280);
    parts.push(`About: ${trimmed}`);
  }
  parts.push("Style: authentic candid photojournalism of real people experiencing this event — engaged faces, genuine emotion, warm cinematic lighting, shallow depth of field, natural skin tones. Documentary realism that conveys the energy people would feel, NOT abstract, NOT illustration, NOT 3D render.");
  return parts.join(". ");
};

const TEMPLATE_ASPECT: Record<string, { aspect: string; label: string }> = {
  minimal: { aspect: "aspect-video", label: "16:9 · 1920×1080" },
  split: { aspect: "aspect-[3/4]", label: "3:4 · 1200×1600" },
  landing: { aspect: "aspect-video", label: "16:9 · 1920×1080" },
};

export const AICoverImageDialog = ({
  open, onOpenChange, eventName, description, eventType, template, locationType, onAccept,
}: AICoverImageDialogProps) => {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPrompt(buildAutoPrompt(eventName, description, eventType, locationType));
      setPreviewUrl(null);
    }
  }, [open, eventName, description, eventType, locationType]);

  const tpl = TEMPLATE_ASPECT[template] ?? TEMPLATE_ASPECT.minimal;

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Add a prompt first");
      return;
    }
    setGenerating(true);
    setPreviewUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-cover-image", {
        body: { prompt, template, count: 1 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const url = data?.images?.[0]?.url || data?.imageUrl;
      if (!url) throw new Error("No image returned");
      setPreviewUrl(url);
    } catch (err: any) {
      toast.error(err.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleAccept = async () => {
    if (!previewUrl) return;
    setUploading(true);
    try {
      // Image is already uploaded to storage by the edge function
      onAccept(previewUrl);
      toast.success("Cover image set!");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to set image");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <PolaroidIcon className="w-5 h-5 text-primary" />
            Generate cover image with AI
          </DialogTitle>
          <DialogDescription>
            Auto-sized for your selected template ({tpl.label}). Edit the prompt to fine-tune.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-prompt" className="text-sm">Prompt</Label>
            <Textarea
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Describe the cover image you want…"
              className="rounded-2xl resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Auto-generated from your event details. Tweak it however you like.
            </p>
          </div>

          <div className={`relative w-full ${tpl.aspect} max-h-[45vh] mx-auto rounded-2xl border border-border bg-muted/30 overflow-hidden flex items-center justify-center`} style={{ maxWidth: template === "split" ? "300px" : "100%" }}>
            <AnimatePresence mode="wait">
              {generating ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-2 text-muted-foreground"
                >
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm">Conjuring your cover…</p>
                </motion.div>
              ) : previewUrl ? (
                <motion.img
                  key="preview"
                  src={previewUrl}
                  alt="AI generated preview"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex flex-col items-center gap-2 text-muted-foreground"
                >
                  <ImageIcon className="w-8 h-8" />
                  <p className="text-sm">Preview will appear here</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={handleGenerate}
              disabled={generating || uploading}
              className="rounded-full"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : previewUrl ? (
                <RefreshCw className="w-4 h-4 mr-2" />
              ) : (
                <PolaroidIcon className="w-4 h-4 mr-2" />
              )}
              {previewUrl ? "Regenerate" : "Generate"}
            </Button>
            <Button
              onClick={handleAccept}
              disabled={!previewUrl || uploading || generating}
              className="rounded-full"
            >
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Use this image
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
