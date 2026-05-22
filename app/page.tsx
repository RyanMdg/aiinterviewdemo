"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Conversation } from "@elevenlabs/client";
import type { VoiceConversation, Mode, Status } from "@elevenlabs/client";
import StepupLogo from "./../stepuplogo.png";

// ── Config ────────────────────────────────────────────────────────────────────
/** Maximum interview duration in seconds. Session is cut off when reached. */
const MAX_INTERVIEW_SECONDS = 2 * 60; // 15 minutes

// ── Types ─────────────────────────────────────────────────────────────────────
type Stage = "form" | "mictest" | "interview" | "thankyou";

interface TranscriptEntry {
  role: "user" | "agent";
  message: string;
  id: number;
}

interface CandidateInfo {
  name: string;
  email: string;
  position: string;
}

const POSITIONS = [
  "IELTS Instructor",
  "CELPIP Instructor",
  "French Instructor",
];

function resolveAgentId(): string {
  const direct = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  if (direct) return direct;
  const link = process.env.NEXT_PUBLIC_ELEVENLABS_SHAREABLE_LINK;
  if (link) {
    try {
      const id = new URL(link).searchParams.get("agent_id");
      if (id) return id;
    } catch {
      /* fall through */
    }
  }
  throw new Error(
    "Set NEXT_PUBLIC_ELEVENLABS_AGENT_ID or NEXT_PUBLIC_ELEVENLABS_SHAREABLE_LINK in .env.local",
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ── Maple leaf icon ───────────────────────────────────────────────────────────
function MapleLeaf({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 110" fill="currentColor">
      <path d="M50 2 L57 32 C65 26 73 23 80 26 L72 40 C82 38 90 42 93 50 L75 50 L82 62 C74 60 68 63 65 70 L72 95 L55 85 L55 108 L45 108 L45 85 L28 95 L35 70 C32 63 26 60 18 62 L25 50 L7 50 C10 42 18 38 28 40 L20 26 C27 23 35 26 43 32 Z" />
    </svg>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm py-3 px-6 flex items-center gap-3">
      <div>
        <img src={StepupLogo.src} alt="StepupLogo" className="h-10 w-auto" />
        <p className="font-bold text-[#1a3150] leading-tight tracking-wide text-sm uppercase">
          Step Up Canada
        </p>
        <p className="text-[10px] text-red-500 uppercase tracking-widest font-medium">
          AI Interview Platform
        </p>
      </div>
    </header>
  );
}

// ── Orb visual ────────────────────────────────────────────────────────────────
function Orb({ mode, status }: { mode: Mode; status: Status }) {
  const connected = status === "connected";
  const speaking = connected && mode === "speaking";

  const orbClass = !connected
    ? "orb-connecting"
    : speaking
      ? "orb-speaking"
      : "orb-listening";

  const gradient = speaking
    ? `conic-gradient(from 0deg,#0c4a6e 0deg,#0ea5e9 20deg,#67e8f9 40deg,#e0f2fe 60deg,#0284c7 100deg,#06b6d4 130deg,#bfdbfe 160deg,#0369a1 200deg,#38bdf8 230deg,#f0f9ff 260deg,#0c4a6e 300deg,#22d3ee 330deg,#0c4a6e 360deg)`
    : `conic-gradient(from 0deg,#1e3a5f 0deg,#0ea5e9 25deg,#7dd3fc 55deg,#dbeafe 80deg,#0369a1 120deg,#38bdf8 155deg,#e0f2fe 180deg,#0c4a6e 220deg,#22d3ee 255deg,#bfdbfe 285deg,#0284c7 320deg,#1e3a5f 360deg)`;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: 300, height: 300 }}
    >
      <div
        className="absolute rounded-full opacity-25 blur-2xl"
        style={{
          width: 260,
          height: 260,
          background: "radial-gradient(circle,#38bdf8,#0ea5e9,transparent)",
        }}
      />
      <div
        className={`rounded-full ${orbClass}`}
        style={{
          width: 260,
          height: 260,
          background: gradient,
          filter: "blur(0.5px)",
        }}
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 260,
          height: 260,
          background:
            "radial-gradient(circle at 38% 38%,rgba(255,255,255,0.35) 0%,rgba(255,255,255,0.05) 45%,transparent 70%)",
        }}
      />
    </div>
  );
}

// ── Time-limit alert modal ─────────────────────────────────────────────────────
function TimeLimitAlert({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center">
        <div className="flex items-center justify-center w-14 h-14 bg-red-100 rounded-full mx-auto mb-4">
          <svg
            className="w-7 h-7 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[#1a3150] mb-2">
          Time Limit Reached
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          The maximum interview duration of{" "}
          {Math.floor(MAX_INTERVIEW_SECONDS / 60)} minutes has been reached.
          Your session has been ended automatically.
        </p>
        <button
          onClick={onClose}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// ── Form stage ────────────────────────────────────────────────────────────────
function FormStage({ onSubmit }: { onSubmit: (info: CandidateInfo) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState(POSITIONS[0]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() && email.trim())
      onSubmit({ name: name.trim(), email: email.trim(), position });
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md">
        {/* Top accent bar */}
        <div className="h-1.5 bg-red-600 rounded-t-2xl" />
        <div className="bg-white rounded-b-2xl shadow-lg border border-gray-200 p-8">
          <div className="mb-6">
            <p className="text-xs text-red-500 uppercase tracking-widest font-semibold mb-1">
              Instructor Recruitment
            </p>
            <h1 className="text-2xl font-bold text-[#1a3150]">
              Application Interview
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Complete the form below to begin your AI-powered screening
              interview.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#1a3150] uppercase tracking-wide mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1a3150] uppercase tracking-wide mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1a3150] uppercase tracking-wide mb-1">
                Position Applying For
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition bg-white"
              >
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold py-3 rounded-lg transition-colors duration-150 shadow-sm uppercase tracking-wide text-sm mt-2"
            >
              Continue →
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

// ── Mic test stage ────────────────────────────────────────────────────────────
function MicTestStage({ onReady }: { onReady: () => void }) {
  const [permission, setPermission] = useState<
    "pending" | "granted" | "denied"
  >("pending");
  const [level, setLevel] = useState(0);
  const [detected, setDetected] = useState(false);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let mounted = true;
    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setPermission("granted");
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        function tick() {
          analyser.getByteFrequencyData(buf);
          const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
          if (mounted) {
            setLevel(Math.min(avg / 60, 1));
            if (avg > 8) setDetected(true);
          }
          rafRef.current = requestAnimationFrame(tick);
        }
        tick();
      } catch {
        if (mounted) setPermission("denied");
      }
    }
    setup();
    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const bars = 20;

  return (
    <main className="flex flex-1 items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="h-1.5 bg-red-600 rounded-t-2xl" />
        <div className="bg-white rounded-b-2xl shadow-lg border border-gray-200 p-8 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[#1a3150]/10 mx-auto mb-5">
            <svg
              className="w-8 h-8 text-[#1a3150]"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z" />
            </svg>
          </div>

          <p className="text-xs text-red-500 uppercase tracking-widest font-semibold mb-1">
            Step 2 of 2
          </p>
          <h2 className="text-xl font-bold text-[#1a3150] mb-1">
            Microphone Check
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {permission === "pending"
              ? "Requesting microphone access…"
              : permission === "denied"
                ? "Microphone access was denied. Please allow it in your browser settings and reload the page."
                : "Speak a few words to confirm your microphone is working."}
          </p>

          {permission === "granted" && (
            <div className="mb-6">
              <div className="flex items-end justify-center gap-1 h-12">
                {Array.from({ length: bars }).map((_, i) => {
                  const threshold = i / bars;
                  const active = level > threshold;
                  return (
                    <div
                      key={i}
                      className="rounded-full transition-all duration-75"
                      style={{
                        width: 10,
                        height: `${20 + (i / bars) * 80}%`,
                        background: active
                          ? i / bars < 0.6
                            ? "#0ea5e9"
                            : i / bars < 0.85
                              ? "#22d3ee"
                              : "#dc2626"
                          : "#e2e8f0",
                      }}
                    />
                  );
                })}
              </div>
              <div
                className={`mt-4 flex items-center justify-center gap-2 text-sm font-medium ${detected ? "text-green-600" : "text-gray-400"}`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${detected ? "bg-green-500 animate-pulse" : "bg-gray-300"}`}
                />
                {detected
                  ? "Microphone detected — you're good to go!"
                  : "Waiting for audio input…"}
              </div>
            </div>
          )}

          <button
            onClick={onReady}
            disabled={permission !== "granted" || !detected}
            className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors duration-150 shadow-sm uppercase tracking-wide text-sm"
          >
            Start Interview
          </button>
        </div>
      </div>
    </main>
  );
}

// ── Interview stage ───────────────────────────────────────────────────────────
function InterviewStage({
  candidate,
  onEnd,
}: {
  candidate: CandidateInfo;
  onEnd: (transcript: TranscriptEntry[]) => void;
}) {
  const conversationRef = useRef<VoiceConversation | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [mode, setMode] = useState<Mode>("listening");
  const [timeLeft, setTimeLeft] = useState(MAX_INTERVIEW_SECONDS);
  const [timeLimitHit, setTimeLimitHit] = useState(false);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const entryIdRef = useRef(0);
  const endedRef = useRef(false);

  const addEntry = useCallback((role: "user" | "agent", message: string) => {
    transcriptRef.current = [
      ...transcriptRef.current,
      { role, message, id: entryIdRef.current++ },
    ];
  }, []);

  // Countdown timer — starts when connected
  useEffect(() => {
    if (status !== "connected") return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  // When time hits 0, cut off the session
  useEffect(() => {
    if (timeLeft === 0 && status === "connected" && !endedRef.current) {
      endedRef.current = true;
      setTimeLimitHit(true);
      conversationRef.current?.endSession().catch(() => {});
    }
  }, [timeLeft, status]);

  useEffect(() => {
    let mounted = true;
    async function start() {
      try {
        const conv = await Conversation.startSession({
          agentId: resolveAgentId(),
          dynamicVariables: {
            candidate_name: candidate.name,
            candidate_email: candidate.email,
            candidate_position: candidate.position,
          },
          onConnect: () => {
            if (mounted) setStatus("connected");
          },
          onDisconnect: () => {
            if (!mounted) return;
            setStatus("disconnected");
            if (!endedRef.current) {
              endedRef.current = true;
              onEnd(transcriptRef.current);
            }
          },
          onError: (msg: string) => console.error("ElevenLabs error:", msg),
          onMessage: ({
            role,
            message,
          }: {
            role: "user" | "agent";
            message: string;
          }) => {
            if (mounted) addEntry(role, message);
          },
          onModeChange: ({ mode }: { mode: Mode }) => {
            if (mounted) setMode(mode);
          },
          onStatusChange: ({ status }: { status: Status }) => {
            if (mounted) setStatus(status);
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        if (mounted) conversationRef.current = conv as VoiceConversation;
        else await conv.endSession();
      } catch (err) {
        console.error("Failed to start ElevenLabs session:", err);
        if (mounted) setStatus("disconnected");
      }
    }
    start();
    return () => {
      mounted = false;
      conversationRef.current?.endSession().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleEnd() {
    if (endedRef.current) return;
    endedRef.current = true;
    setStatus("disconnecting");
    await conversationRef.current?.endSession().catch(() => {});
    onEnd(transcriptRef.current);
  }

  function handleTimeLimitClose() {
    setTimeLimitHit(false);
    onEnd(transcriptRef.current);
  }

  const connected = status === "connected";
  const speaking = connected && mode === "speaking";
  const isWarning = timeLeft <= 60 && timeLeft > 0; // last minute warning

  const statusLabel =
    status === "connecting"
      ? "Connecting…"
      : status === "disconnecting"
        ? "Ending session…"
        : speaking
          ? "Alex is speaking"
          : "Listening…";

  return (
    <>
      {timeLimitHit && <TimeLimitAlert onClose={handleTimeLimitClose} />}

      <main className="flex flex-1 flex-col items-center justify-center gap-5 bg-white p-6">
        {/* Top info bar */}
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between bg-[#1a3150] rounded-xl px-4 py-3">
            <div>
              <p className="text-white font-semibold text-sm leading-tight">
                {candidate.name}
              </p>
              <p className="text-blue-300 text-xs">{candidate.position}</p>
            </div>
            {/* Timer */}
            <div
              className={`font-mono text-sm font-bold px-3 py-1 rounded-lg ${
                isWarning
                  ? "bg-red-600 text-white animate-pulse"
                  : "bg-white/10 text-white"
              }`}
            >
              {formatTime(timeLeft)}
            </div>
          </div>
        </div>

        {/* Orb + end button */}
        <div
          className="relative flex items-center justify-center"
          style={{ width: 300, height: 320 }}
        >
          <Orb mode={mode} status={status} />
          <button
            onClick={handleEnd}
            disabled={status === "connecting" || status === "disconnecting"}
            title="End Interview"
            className="absolute bottom-0 left-1/2 -translate-x-1/2 flex items-center justify-center w-14 h-14 rounded-full bg-black shadow-xl hover:bg-gray-800 active:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors z-20"
            style={{ border: "3px solid white" }}
          >
            <svg
              className="w-6 h-6 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
            </svg>
          </button>
        </div>

        {/* Status */}
        <div
          className={`flex items-center gap-2 text-sm font-medium ${
            speaking
              ? "text-blue-600"
              : connected
                ? "text-green-600"
                : "text-gray-400"
          }`}
        >
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              speaking
                ? "bg-blue-500 animate-pulse"
                : connected
                  ? "bg-green-500 animate-pulse"
                  : "bg-gray-300"
            }`}
          />
          {statusLabel}
        </div>
      </main>
    </>
  );
}

// ── Thank-you stage ───────────────────────────────────────────────────────────
function ThankyouStage({ candidate }: { candidate: CandidateInfo }) {
  return (
    <main className="flex flex-1 items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="h-1.5 bg-red-600 rounded-t-2xl" />
        <div className="bg-white rounded-b-2xl shadow-lg border border-gray-200 p-10 text-center">
          <MapleLeaf className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <p className="text-xs text-red-500 uppercase tracking-widest font-semibold mb-1">
            Interview Complete
          </p>
          <h1 className="text-2xl font-bold text-[#1a3150] mb-3">
            Thank You, {candidate.name}!
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            Your application interview for{" "}
            <strong className="text-[#1a3150]">{candidate.position}</strong> has
            been completed. Our Step Up Canada team will review your responses
            and reach out to you at{" "}
            <strong className="text-[#1a3150]">{candidate.email}</strong>.
          </p>
          <div className="border-t border-gray-100 pt-5">
            <p className="text-xs text-gray-400">
              You may close this window. We appreciate your time and interest in
              joining our team.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

// ── Root page ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [stage, setStage] = useState<Stage>("form");
  const [candidate, setCandidate] = useState<CandidateInfo | null>(null);

  function handleFormSubmit(info: CandidateInfo) {
    setCandidate(info);
    setStage("mictest");
  }
  function handleMicReady() {
    setStage("interview");
  }

  function handleInterviewEnd(transcript: TranscriptEntry[]) {
    if (!candidate) return;
    setStage("thankyou");
    const session = {
      id: crypto.randomUUID(),
      candidateName: candidate.name,
      email: candidate.email,
      position: candidate.position,
      transcript,
      createdAt: new Date().toISOString(),
    };
    try {
      const existing = JSON.parse(
        localStorage.getItem("interview_sessions") ?? "[]",
      );
      localStorage.setItem(
        "interview_sessions",
        JSON.stringify([...existing, session]),
      );
    } catch (err) {
      console.error("Failed to save interview:", err);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {stage === "form" && <FormStage onSubmit={handleFormSubmit} />}
      {stage === "mictest" && <MicTestStage onReady={handleMicReady} />}
      {stage === "interview" && candidate && (
        <InterviewStage candidate={candidate} onEnd={handleInterviewEnd} />
      )}
      {stage === "thankyou" && candidate && (
        <ThankyouStage candidate={candidate} />
      )}
    </div>
  );
}
