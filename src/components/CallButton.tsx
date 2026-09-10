"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Loader2, Grid3x3, Delete, X } from "lucide-react";

// Smartphone-style keypad layout: digit + letters (like a real phone dialpad).
const KEYPAD: { digit: string; letters?: string }[] = [
  { digit: "1" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "*" },
  { digit: "0", letters: "+" },
  { digit: "#" },
];

// Module-level singleton — one Device for the entire page, regardless of
// how many CallButton instances exist. Prevents IndexedDB write conflicts.
let _device: unknown = null;
let _initializing = false;

function deviceSingleton() { return _device as { destroy(): void } | null; }
function setDeviceSingleton(d: unknown) { _device = d; }
function destroyDeviceSingleton() {
  (_device as { destroy(): void } | null)?.destroy();
  _device = null;
}

type CallState = "idle" | "initializing" | "connecting" | "in-progress";

export default function CallButton({
  phoneNumber,
  contactId,
  compact = false,
}: {
  phoneNumber: string;
  contactId: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [showKeypad, setShowKeypad] = useState(false);
  const [sentDigits, setSentDigits] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callRef = useRef<any>(null);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cleanedUpRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startTimer() {
    startTimeRef.current = Date.now();
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current!) / 1000));
    }, 1000);
  }

  function stopTimer(): number {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const secs = startTimeRef.current
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : 0;
    startTimeRef.current = null;
    setElapsed(0);
    return secs;
  }

  async function saveCommunication(durationSecs: number) {
    await fetch("/api/communications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: contactId,
        channel: "phone",
        direction: "outbound",
        subject: "Akquiseanruf",
        occurred_at: new Date().toISOString(),
        body: durationSecs === 0 ? "Niemanden erreicht" : undefined,
        duration_seconds: durationSecs > 0 ? durationSecs : null,
      }),
    });
  }

  async function saveActivity(durationSecs: number) {
    const minutes = Math.floor(durationSecs / 60);
    const description = durationSecs === 0
      ? "Niemanden erreicht"
      : `Dauer: ${minutes} Minute${minutes !== 1 ? "n" : ""} (${durationSecs} Sekunden)`;
    await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_type: "contact",
        entity_id: contactId,
        type: "call",
        title: "Ausgehender Anruf",
        description,
        performed_at: new Date().toISOString(),
      }),
    });
  }

  function cleanup(durationSecs?: number) {
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;

    const secs = durationSecs ?? stopTimer();
    destroyDeviceSingleton();
    _initializing = false;
    callRef.current = null;
    setState("idle");
    setShowKeypad(false);
    setSentDigits("");

    saveCommunication(secs);
    saveActivity(secs);
  }

  async function startCall() {
    // Block if any Device is already active or being initialized
    if (deviceSingleton() || _initializing) return;

    _initializing = true;
    cleanedUpRef.current = false;
    setState("initializing");
    setError("");

    try {
      const res = await fetch("/api/twilio/token", { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Token konnte nicht abgerufen werden");
      }
      const { token } = await res.json();

      const { Device } = await import("@twilio/voice-sdk");
      const device = new Device(token, { logLevel: "warn" });
      setDeviceSingleton(device);
      _initializing = false;

      setState("connecting");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const call = await (device as any).connect({ params: { To: phoneNumber } });
      callRef.current = call;

      call.on("accept", () => {
        setState("in-progress");
        startTimer();
      });

      call.on("disconnect", () => {
        const secs = stopTimer();
        cleanup(secs);
      });

      call.on("error", (err: Error) => {
        setError(err.message ?? "Anruf fehlgeschlagen");
        cleanup(0);
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Anruf fehlgeschlagen");
      cleanup(0);
    }
  }

  function hangUp() {
    callRef.current?.disconnect();
  }

  // Transmit a DTMF tone to the remote party (e.g. an IVR / Sprachcomputer
  // that forwards the call depending on the selected option).
  function sendDigit(digit: string) {
    callRef.current?.sendDigits(digit);
    setSentDigits((prev) => (prev + digit).slice(-24));
  }

  function formatTime(secs: number): string {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  if (state === "in-progress") {
    return (
      <>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowKeypad(true)}
            title="Tastenfeld – Ziffern senden"
            className="flex items-center justify-center p-1 rounded-lg text-xs font-medium bg-slate-600 text-white hover:bg-slate-700 transition-colors"
          >
            <Grid3x3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={hangUp}
            title="Auflegen"
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            <PhoneOff className="w-3 h-3" />
            {formatTime(elapsed)}
          </button>
        </div>

        {showKeypad && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setShowKeypad(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[280px] rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Verbunden · {formatTime(elapsed)}
                </span>
                <button
                  onClick={() => setShowKeypad(false)}
                  title="Tastenfeld schließen"
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Display of transmitted digits */}
              <div className="flex items-center justify-between gap-2 mb-4 h-8 px-3 rounded-xl bg-slate-100 dark:bg-slate-800">
                <span className="font-mono text-lg tracking-widest text-slate-800 dark:text-slate-100 truncate">
                  {sentDigits || <span className="text-slate-400 text-sm tracking-normal">Ziffern senden…</span>}
                </span>
                {sentDigits && (
                  <button
                    onClick={() => setSentDigits("")}
                    title="Anzeige löschen"
                    className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Smartphone-style keypad */}
              <div className="grid grid-cols-3 gap-2.5">
                {KEYPAD.map(({ digit, letters }) => (
                  <button
                    key={digit}
                    onClick={() => sendDigit(digit)}
                    className="flex flex-col items-center justify-center h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all select-none"
                  >
                    <span className="text-xl font-semibold leading-none text-slate-800 dark:text-slate-100">
                      {digit}
                    </span>
                    {letters && (
                      <span className="mt-0.5 text-[9px] font-medium tracking-[0.15em] text-slate-400 dark:text-slate-500">
                        {letters}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Hang up */}
              <button
                onClick={hangUp}
                title="Auflegen"
                className="mt-4 mx-auto flex items-center justify-center w-14 h-14 rounded-full bg-red-500 text-white hover:bg-red-600 active:scale-95 transition-all"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (state === "initializing" || state === "connecting") {
    return (
      <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-emerald-500/80 text-white">
        <Loader2 className="w-3 h-3 animate-spin" />
        {state === "initializing" ? "Verbinde…" : "Klingelt…"}
      </span>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <button
          onClick={startCall}
          title={`${phoneNumber} anrufen`}
          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/10 transition-colors cursor-pointer"
        >
          <Phone className="w-4 h-4" />
        </button>
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        onClick={startCall}
        title={`${phoneNumber} anrufen`}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
      >
        <Phone className="w-3 h-3" />
        Anrufen
      </button>
      {error && <p className="text-xs text-red-500 max-w-[120px] text-right">{error}</p>}
    </div>
  );
}
