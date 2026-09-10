"use client";

import { useState, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import { Phone, PhoneOff, Loader2, CheckCircle2, XCircle, AlertTriangle, Eye, EyeOff } from "lucide-react";

type StepStatus = "pending" | "running" | "ok" | "error";
type Step = { id: string; label: string; status: StepStatus; detail?: string };
type CallState = "idle" | "connecting" | "in-progress";

interface Creds {
  accountSid: string;
  accountSidKey: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
  phoneNumber: string;
}

const FIELD_LABELS: Record<keyof Creds, string> = {
  accountSid:   "Account SID",
  accountSidKey: "Account SID key",
  apiKeySid:    "API Key SID",
  apiKeySecret: "API Key Secret",
  twimlAppSid:  "TwiML App SID",
  phoneNumber:  "Twilio-Nummer",
};

const FIELD_PLACEHOLDERS: Record<keyof Creds, string> = {
  accountSid:   "AC…",
  accountSidKey: "...",
  apiKeySid:    "SK…",
  apiKeySecret: "…",
  twimlAppSid:  "AP…",
  phoneNumber:  "+49…",
};

export default function TwilioTestPage() {
  const [creds, setCreds] = useState<Creds>({
    accountSid: "", accountSidKey: "", apiKeySid: "", apiKeySecret: "", twimlAppSid: "", phoneNumber: "",
  });
  const [showSecret, setShowSecret] = useState(false);
  useEffect(() => {
    fetch("/api/twilio/test-config")
      .then((r) => r.json())
      .then((data) => {
        setCreds(data);
        if (data.phoneNumber) setTo(data.phoneNumber);
      })
      .catch(() => {});
  }, []);
  const [to, setTo] = useState("+49");
  const [steps, setSteps] = useState<Step[]>([]);
  const [callState, setCallState] = useState<CallState>("idle");
  const [logLines, setLogLines] = useState<string[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deviceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callRef = useRef<any>(null);

  function mark(id: string, status: StepStatus, detail?: string) {
    flushSync(() =>
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, detail } : s)))
    );
  }

  function addLog(msg: string) {
    const ts = new Date().toLocaleTimeString("de-DE", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    flushSync(() => setLogLines((l) => [`[${ts}] ${msg}`, ...l]));
  }

  const credsComplete =
    creds.accountSid.startsWith("AC") &&
    creds.apiKeySid.startsWith("SK") &&
    creds.apiKeySecret.length > 10 &&
    creds.twimlAppSid.startsWith("AP") &&
    to.startsWith("+") && to.length > 5;

  async function runTest() {
    flushSync(() => {
      setSteps([
        { id: "creds",   label: "Credentials gegen Twilio REST API prüfen", status: "pending" },
        { id: "token",   label: "Access Token generieren",                   status: "pending" },
        { id: "decode",  label: "JWT dekodieren & TTL prüfen",               status: "pending" },
        { id: "device",  label: "Twilio Device initialisieren",              status: "pending" },
        { id: "connect", label: `Anruf aufbauen → ${to}`,                   status: "pending" },
      ]);
      setLogLines([]);
    });

    let token = "";

    // ── Step 0: Credentials validieren ──────────────────────────────────────
    mark("creds", "running");
    console.log("creds", creds)
    try {
      const res = await fetch("/api/twilio/test-validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountSid:   creds.accountSid,
          accountSidKey: creds.accountSidKey,
          apiKeySid:    creds.apiKeySid,
          apiKeySecret: creds.apiKeySecret,
          twimlAppSid:  creds.twimlAppSid,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? data.account?.error ?? "Ungültige Credentials");

      const app = data.twimlApp;
      const detail = [
        `Account: ${data.account.friendlyName ?? creds.accountSid}`,
        `App: ${app?.friendlyName ?? creds.twimlAppSid}`,
        app?.voiceUrl ? `Voice URL: ${app.voiceUrl}` : "⚠ Voice URL fehlt",
      ].join(" · ");
      mark("creds", "ok", detail);
      addLog(`Credentials OK · ${detail}`);
      if (app && !app.voiceUrl) {
        addLog("⚠ Voice Request URL in der TwiML App ist nicht gesetzt!");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      mark("creds", "error", msg);
      addLog(`FEHLER Credentials: ${msg}`);
      return;
    }

    // ── Step 1: Token generieren ─────────────────────────────────────────────
    mark("token", "running");
    try {
      const res = await fetch("/api/twilio/test-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountSid:   creds.accountSid,
          apiKeySid:    creds.apiKeySid,
          apiKeySecret: creds.apiKeySecret,
          twimlAppSid:  creds.twimlAppSid,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      token = data.token;

      // Token-Inhalt analysieren
      try {
        const [headerB64, payloadB64] = token.split('.');
        const header  = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')));
        const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
        
        console.log('=== JWT HEADER ===', header);
        console.log('=== JWT PAYLOAD ===', {
          iss: payload.iss,                              // muss SK... sein
          sub: payload.sub,                              // muss AC... sein
          exp: new Date(payload.exp * 1000).toISOString(),
          iat: new Date(payload.iat * 1000).toISOString(),
          now: new Date().toISOString(),
          grants: payload.grants,
        });
      } catch (e) {
        console.error('Token nicht parsebar:', e);
      }

      if (!token) throw new Error("Kein Token im Response");
      mark("token", "ok", `${token.length} Zeichen`);
      addLog(`Token erhalten: ${token.slice(0, 40)}…`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      mark("token", "error", msg);
      addLog(`FEHLER Token: ${msg}`);
      return;
    }

    // ── Step 2: JWT dekodieren ───────────────────────────────────────────────
    mark("decode", "running");
    try {
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error("Kein gültiges JWT (3 Segmente erwartet)");
      const payload = JSON.parse(atob(parts[1]));
      const now = Math.floor(Date.now() / 1000);
      const ttlLeft = (payload.exp ?? 0) - now;
      const identity = payload.grants?.identity ?? "–";
      const appSid = payload.grants?.voice?.outgoing?.application_sid ?? "–";

      if (ttlLeft <= 0) throw new Error(`Token abgelaufen vor ${-ttlLeft}s`);

      mark("decode", "ok",
        `iss: ${payload.iss ?? "–"} · identity: ${identity} · app: ${appSid} · noch ${ttlLeft}s gültig`
      );
      addLog(`JWT OK · identity: ${identity} · app: ${appSid} · TTL: ${ttlLeft}s`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      mark("decode", "error", msg);
      addLog(`FEHLER JWT: ${msg}`);
      return;
    }

    // ── Step 3: Device initialisieren ────────────────────────────────────────
    mark("device", "running");
    try {
      const { Device } = await import("@twilio/voice-sdk");
      
      const device = new Device(token, { logLevel: "debug" });
      device.on("error", (err: { message: string; code?: number }) => {
        addLog(`Device-Fehler [${err.code ?? "–"}]: ${err.message}`);
      });
      deviceRef.current = device;
      mark("device", "ok", "Device erstellt");
      addLog("Twilio Device initialisiert");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      mark("device", "error", msg);
      addLog(`FEHLER Device: ${msg}`);
      return;
    }

    // ── Step 4: Anruf aufbauen ───────────────────────────────────────────────
    mark("connect", "running");
    flushSync(() => setCallState("connecting"));
    try {
      const call = await deviceRef.current.connect({ params: { To: to } });
      callRef.current = call;
      addLog(`Anruf wird aufgebaut → ${to}`);

      call.on("accept", () => {
        mark("connect", "ok", "Anruf angenommen");
        flushSync(() => setCallState("in-progress"));
        addLog("Anruf angenommen");
      });
      call.on("ringing", () => addLog("Klingelt…"));
      call.on("disconnect", () => {
        addLog("Anruf beendet");
        cleanup();
      });
      call.on("error", (err: { message: string; code?: number }) => {
        const msg = `[${err.code ?? "–"}] ${err.message}`;
        mark("connect", "error", msg);
        addLog(`Anruf-Fehler: ${msg}`);
        cleanup();
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      mark("connect", "error", msg);
      addLog(`FEHLER connect(): ${msg}`);
      cleanup();
    }
  }

  function hangUp() {
    callRef.current?.disconnect();
    addLog("Aufgelegt (manuell)");
    cleanup();
  }

  function cleanup() {
    deviceRef.current?.destroy();
    deviceRef.current = null;
    callRef.current = null;
    flushSync(() => setCallState("idle"));
  }

  const inputCls =
    "w-full px-3 py-2 rounded-lg border text-sm font-mono " +
    "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-300 " +
    "focus:outline-none focus:ring-2 focus:ring-indigo-500/50 " +
    "dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-600";

  return (
    <div className="min-h-screen p-8 bg-slate-50 dark:bg-gray-950">
      <div className="max-w-2xl mx-auto space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Twilio Integrationstest</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Credentials eingeben, Zielrufnummer wählen und alle Schritte live beobachten.
          </p>
        </div>

        {/* Credentials */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Twilio Credentials
          </p>

          {(Object.keys(FIELD_LABELS) as (keyof Creds)[]).map((key) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {FIELD_LABELS[key]}
              </label>
              <div className="relative">
                <input
                  type={key === "apiKeySecret" && !showSecret ? "password" : "text"}
                  value={creds[key]}
                  onChange={(e) => setCreds((c) => ({ ...c, [key]: e.target.value.trim() }))}
                  placeholder={FIELD_PLACEHOLDERS[key]}
                  spellCheck={false}
                  className={inputCls + (key === "apiKeySecret" ? " pr-9" : "")}
                />
                {key === "apiKeySecret" && (
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Zielrufnummer + Button */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Zielrufnummer (E.164)
            </label>
            <input
              type="tel"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="+49 30 12345678"
              disabled={callState !== "idle"}
              className={inputCls + " disabled:opacity-50"}
            />
          </div>
          <div className="flex items-end">
            {callState === "idle" && (
              <button
                onClick={runTest}
                disabled={!credsComplete}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium
                  bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-colors"
              >
                <Phone className="w-4 h-4" />
                Test &amp; Anrufen
              </button>
            )}
            {callState === "connecting" && (
              <span className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white">
                <Loader2 className="w-4 h-4 animate-spin" />
                Verbinde…
              </span>
            )}
            {callState === "in-progress" && (
              <button
                onClick={hangUp}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                <PhoneOff className="w-4 h-4" />
                Auflegen
              </button>
            )}
          </div>
        </div>

        {!credsComplete && steps.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Fülle alle Felder aus (AC…, SK…, Secret, AP…, Rufnummer), um den Test zu starten.
          </p>
        )}

        {/* Steps */}
        {steps.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
            {steps.map((s) => (
              <div key={s.id} className="flex items-start gap-3 px-5 py-4">
                <div className="mt-0.5 flex-shrink-0">
                  {s.status === "pending" && <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600" />}
                  {s.status === "running"  && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
                  {s.status === "ok"       && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {s.status === "error"    && <XCircle className="w-4 h-4 text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${
                    s.status === "error"   ? "text-red-600 dark:text-red-400" :
                    s.status === "ok"      ? "text-gray-900 dark:text-white" :
                    s.status === "running" ? "text-indigo-600 dark:text-indigo-400" :
                    "text-gray-400 dark:text-gray-500"
                  }`}>
                    {s.label}
                  </p>
                  {s.detail && (
                    <p className={`text-xs mt-0.5 font-mono break-all ${
                      s.status === "error" ? "text-red-500" : "text-gray-400 dark:text-gray-500"
                    }`}>
                      {s.detail}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Live-Log */}
        {logLines.length > 0 && (
          <div className="bg-gray-950 rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Live-Log</span>
            </div>
            <div className="space-y-1 font-mono text-xs">
              {logLines.map((line, i) => (
                <p key={i} className={
                  line.includes("FEHLER") ? "text-red-400" :
                  line.includes("OK") || line.includes("angenommen") ? "text-emerald-400" :
                  line.includes("⚠") ? "text-amber-400" :
                  "text-gray-400"
                }>
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
