import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Download, Loader2 } from "lucide-react";
import QRCode from "qrcode";

interface Props {
  registrationUrl: string;
  eventName: string;
}

export default function EventQRCode({ registrationUrl, eventName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canvasRef.current) return;
    setLoading(true);
    QRCode.toCanvas(canvasRef.current, registrationUrl, {
      width: 200,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    }).then(() => setLoading(false));
  }, [registrationUrl]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `${eventName.replace(/\s+/g, "-").toLowerCase()}-qr-code.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="bg-card rounded-xl p-4 sm:p-6">
      <Label className="mb-3 block font-display font-semibold">Event QR code</Label>
      <p className="text-xs text-muted-foreground mb-4">
        Share this QR code so attendees can quickly access your registration page.
      </p>
      <div className="flex flex-col items-center gap-4">
        <div className="bg-white rounded-xl p-3 inline-block">
          {loading && (
            <div className="w-[200px] h-[200px] flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          <canvas ref={canvasRef} className={loading ? "hidden" : ""} />
        </div>
        <p className="text-xs text-muted-foreground text-center break-all max-w-[240px]">{registrationUrl}</p>
        <Button variant="outline" size="sm" className="rounded-full" onClick={handleDownload}>
          <Download className="w-3.5 h-3.5 mr-1" /> Download PNG
        </Button>
      </div>
    </div>
  );
}
