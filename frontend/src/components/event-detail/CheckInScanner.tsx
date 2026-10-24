import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Camera, CameraOff, CheckCircle2, AlertCircle, RefreshCw, ScanLine, Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

type Result =
  | { kind: "success"; name: string; ticket?: string | null; at: string }
  | { kind: "already"; name: string; at: string }
  | { kind: "error"; message: string };

interface Props {
  eventId: string;
}

export default function CheckInScanner({ eventId }: Props) {
  const containerId = "checkin-qr-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [processing, setProcessing] = useState(false);
  const lastScanRef = useRef<{ id: string; at: number } | null>(null);

  const stop = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      }
    } catch {}
    scannerRef.current = null;
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDecoded = async (raw: string) => {
    const match = raw.match(UUID_RE);
    if (!match) {
      setResult({ kind: "error", message: "QR code is not a valid ticket" });
      return;
    }
    const regId = match[1];

    // Debounce: same code within 3s = ignore
    const now = Date.now();
    if (lastScanRef.current && lastScanRef.current.id === regId && now - lastScanRef.current.at < 3000) {
      return;
    }
    lastScanRef.current = { id: regId, at: now };

    setProcessing(true);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc("check_in_attendee", { p_registration_id: regId });
      if (error) {
        const msg = error.message || "Check-in failed";
        if (/not found/i.test(msg)) setResult({ kind: "error", message: "Ticket not found" });
        else if (/not authorized/i.test(msg)) setResult({ kind: "error", message: "Ticket belongs to a different event" });
        else setResult({ kind: "error", message: msg });
        return;
      }
      const payload = data as any;
      if (payload.event_id !== eventId) {
        setResult({ kind: "error", message: "Ticket belongs to a different event" });
        return;
      }
      if (payload.already_checked_in) {
        setResult({
          kind: "already",
          name: payload.attendee_name || "Guest",
          at: payload.checked_in_at,
        });
      } else {
        // Soft success vibration on mobile
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try { (navigator as any).vibrate(60); } catch {}
        }
        setResult({
          kind: "success",
          name: payload.attendee_name || "Guest",
          ticket: payload.ticket_name,
          at: payload.checked_in_at,
        });
      }
    } catch (e: any) {
      setResult({ kind: "error", message: e?.message || "Check-in failed" });
    } finally {
      setProcessing(false);
    }
  };

  const start = async () => {
    setStarting(true);
    setResult(null);
    try {
      const html5 = new Html5Qrcode(containerId, { verbose: false });
      scannerRef.current = html5;
      await html5.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (vw, vh) => {
            const m = Math.floor(Math.min(vw, vh) * 0.7);
            return { width: m, height: m };
          },
          aspectRatio: 1.0,
        },
        (decoded) => {
          void handleDecoded(decoded);
        },
        () => {
          /* per-frame decode errors are noisy; ignore */
        }
      );
      setScanning(true);
    } catch (e: any) {
      setResult({
        kind: "error",
        message:
          e?.message ||
          "Could not access the camera. Make sure you grant camera permission and use HTTPS.",
      });
      scannerRef.current = null;
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-display font-bold tracking-[-0.02em]">Check-in scanner</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Point your camera at an attendee's ticket QR code to mark them as checked in.
        </p>
      </div>

      <div className="rounded-3xl bg-card overflow-hidden">
        <div className="relative aspect-square w-full max-w-md mx-auto bg-black">
          <div id={containerId} className="absolute inset-0 [&_video]:object-cover [&_video]:w-full [&_video]:h-full" />
          {!scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 gap-3 text-center px-6">
              <ScanLine className="w-10 h-10" />
              <p className="text-sm">
                {starting ? "Starting camera…" : "Camera is off. Tap start to begin scanning."}
              </p>
            </div>
          )}
          {processing && (
            <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs py-2 flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking up ticket…
            </div>
          )}
        </div>

        <div className="p-4 flex items-center justify-center gap-2">
          {!scanning ? (
            <Button
              onClick={start}
              disabled={starting}
              className="rounded-full h-11 px-6 bg-foreground text-background hover:bg-foreground/90"
            >
              <Camera className="w-4 h-4 mr-2" />
              {starting ? "Starting…" : "Start scanning"}
            </Button>
          ) : (
            <Button
              onClick={stop}
              variant="outline"
              className="rounded-full h-11 px-6"
            >
              <CameraOff className="w-4 h-4 mr-2" />
              Stop
            </Button>
          )}
          {result && (
            <Button
              variant="ghost"
              onClick={() => setResult(null)}
              className="rounded-full h-11 px-4"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Next
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key={`${result.kind}-${("name" in result ? result.name : "") + ("message" in result ? result.message : "")}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className={
              "rounded-2xl p-5 flex items-start gap-4 " +
              (result.kind === "success"
                ? "bg-emerald-50 text-emerald-900"
                : result.kind === "already"
                ? "bg-amber-50 text-amber-900"
                : "bg-rose-50 text-rose-900")
            }
          >
            {result.kind === "success" && <CheckCircle2 className="w-6 h-6 mt-0.5 shrink-0" />}
            {result.kind === "already" && <AlertCircle className="w-6 h-6 mt-0.5 shrink-0" />}
            {result.kind === "error" && <AlertCircle className="w-6 h-6 mt-0.5 shrink-0" />}
            <div className="flex-1 min-w-0">
              {result.kind === "success" && (
                <>
                  <p className="font-display font-semibold text-base">Checked in: {result.name}</p>
                  {result.ticket && <p className="text-xs opacity-80 mt-0.5">{result.ticket}</p>}
                  <p className="text-xs opacity-70 mt-1">
                    {new Date(result.at).toLocaleTimeString()}
                  </p>
                </>
              )}
              {result.kind === "already" && (
                <>
                  <p className="font-display font-semibold text-base">Already checked in</p>
                  <p className="text-sm mt-0.5">{result.name}</p>
                  <p className="text-xs opacity-70 mt-1">
                    First scanned {new Date(result.at).toLocaleString()}
                  </p>
                </>
              )}
              {result.kind === "error" && (
                <>
                  <p className="font-display font-semibold text-base">Couldn't check in</p>
                  <p className="text-sm mt-0.5">{result.message}</p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
