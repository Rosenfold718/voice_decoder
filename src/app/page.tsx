"use client";

/* Electron IPC type */
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      transcribe: (audioBase64: string, fileName: string) => Promise<TranscriptionResult>;
      exportDocx: (text: string, fileName: string) => Promise<{ success: boolean }>;
    };
  }
}

import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  Mic,
  Download,
  Copy,
  Check,
  Square,
  Trash2,
  FileAudio,
  Clock,
  Type,
  AlertCircle,
  X,
  ArrowDownToLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TranscriptionResult {
  success: boolean;
  transcription: string;
  wordCount: number;
  charCount?: number;
  processingTime: number;
  fileName: string;
  fileSize: number;
  audioDuration?: number;
  chunksProcessed?: number;
  error?: string;
  message?: string;
}

type Status = "idle" | "recording" | "processing" | "done" | "error";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtSize(b: number) {
  if (b === 0) return "0 Б";
  const k = 1024;
  const u = ["Б", "КБ", "МБ", "ГБ"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${u[i]}`;
}

function fmtTime(ms: number) {
  if (ms < 1000) return `${ms} мс`;
  return `${(ms / 1000).toFixed(1)} с`;
}

function fmtTimer(sec: number) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/* ------------------------------------------------------------------ */
/*  Audio Level Meter (Web Audio API)                                  */
/* ------------------------------------------------------------------ */

function useAudioLevel(stream: MediaStream | null) {
  const [level, setLevel] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!stream) {
      return;
    }

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    ctxRef.current = ctx;
    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      const avg = dataArrayRef.current.reduce((a, b) => a + b, 0) / dataArrayRef.current.length;
      setLevel(avg / 255);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ctx.close();
    };
  }, [stream]);

  return level;
}

/* ------------------------------------------------------------------ */
/*  Level Bars Component                                               */
/* ------------------------------------------------------------------ */

function LevelBars({ level }: { level: number }) {
  const barCount = 32;
  const bars = Array.from({ length: barCount }, (_, i) => {
    // center-weighted distribution — middle bars are taller
    const center = barCount / 2;
    const dist = Math.abs(i - center) / center;
    const height = Math.max(2, level * (1 - dist * 0.6) * 100);
    return height;
  });

  return (
    <div className="flex items-end justify-center gap-[2px] h-10">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full transition-[height] duration-75"
          style={{
            height: `${h}%`,
            backgroundColor: h > 60
              ? "rgba(239, 68, 68, 0.8)"
              : "rgba(255, 255, 255, 0.2)",
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function VoxPage() {
  const [mode, setMode] = useState<"file" | "record">("file");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [editableText, setEditableText] = useState("");
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Recording
  const [recSeconds, setRecSeconds] = useState(0);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [micWorking, setMicWorking] = useState<boolean | null>(null); // null = checking
  const audioLevel = useAudioLevel(mediaStream);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const { toast } = useToast();

  const isProcessing = status === "processing";

  /* ---- file handling ---- */

  const acceptFile = useCallback(
    (f: File) => {
      const ok = [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm"];
      const ext = f.name.toLowerCase().slice(f.name.lastIndexOf("."));
      if (!ok.includes(ext)) {
        toast({ title: "Неподдерживаемый формат", description: ext, variant: "destructive" });
        return;
      }
      if (f.size / 1024 / 1024 > 100) {
        toast({ title: "Слишком большой файл", variant: "destructive" });
        return;
      }
      setFile(f);
      setResult(null);
      setEditableText("");
      setStatus("idle");
      setRecordedBlob(null);
    },
    [toast]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) acceptFile(e.dataTransfer.files[0]); },
    [acceptFile]
  );
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) acceptFile(e.target.files[0]); },
    [acceptFile]
  );

  /* ---- recording ---- */

  const cleanupRecording = useCallback(() => {
    clearInterval(timerRef.current);
    clearTimeout(silenceTimerRef.current);
    mediaStream?.getTracks().forEach((t) => t.stop());
    setMediaStream(null);
    setMediaRecorder(null);
  }, [mediaStream]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    clearInterval(timerRef.current);
    clearTimeout(silenceTimerRef.current);
    setMediaRecorder(null);
    setStatus("idle");
    setFile(null);
    setResult(null);
    setEditableText("");
  }, [mediaRecorder]);

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast({
        title: "Микрофон недоступен",
        description: "Запись голоса работает только в обычном браузере на ПК. Загрузите аудиофайл через вкладку «Файл».",
        variant: "destructive",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const rec = new MediaRecorder(stream, { mimeType });
      const parts: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) parts.push(e.data); };
      rec.onstop = () => {
        if (parts.length === 0) {
          toast({
            title: "Запись пуста",
            description: "Микрофон недоступен в текущей среде. Используйте вкладку «Файл» для загрузки аудио.",
            variant: "destructive",
            duration: 6000,
          });
          return;
        }
        const blob = new Blob(parts, { type: mimeType });
        setRecordedBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
        setMediaStream(null);
      };

      rec.start(250);
      setMediaRecorder(rec);
      setRecSeconds(0);
      setStatus("recording");

      timerRef.current = setInterval(() => setRecSeconds((p) => p + 1), 1000);

      // Auto-detect silence: if level stays at 0 for 3s, mic isn't working
      silenceTimerRef.current = setTimeout(() => {
        // will be checked in the effect below
      }, 3000);
    } catch (err) {
      const msg = err instanceof DOMException && err.name === "NotAllowedError"
        ? "Разрешите доступ к микрофону в адресной строке браузера"
        : "Не удалось получить доступ к микрофону. Попробуйте вкладку «Файл».";
      toast({ title: "Микрофон недоступен", description: msg, variant: "destructive" });
    }
  };

  // Detect persistent silence during recording
  useEffect(() => {
    if (status !== "recording" || recSeconds < 3) return;

    // Check every second after 3s — if level is always near 0, mic is dead
    const check = setInterval(() => {
      if (audioLevel < 0.01 && recSeconds >= 3) {
        clearInterval(check);
        stopRecording();
        toast({
          title: "Микрофон не захватывает звук",
          description: "Запись работает только при запуске на ПК в браузере. Используйте вкладку «Файл».",
          variant: "destructive",
          duration: 6000,
        });
      }
    }, 1000);

    return () => clearInterval(check);
  }, [status, recSeconds, audioLevel, stopRecording]);

  // Proactive mic check when switching to Record tab
  useEffect(() => {
    if (mode !== "record") {
      setMicWorking(null);
      return;
    }

    // If getUserMedia doesn't exist at all — immediately mark as broken
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicWorking(false);
      return;
    }

    let cancelled = false;
    setMicWorking(null); // checking...

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        // Listen for actual audio data for 800ms
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        let hasSignal = false;
        const checkStart = Date.now();
        const probe = () => {
          if (cancelled || Date.now() - checkStart > 800) {
            source.disconnect();
            ctx.close();
            stream.getTracks().forEach((t) => t.stop());
            if (!cancelled) setMicWorking(hasSignal);
            return;
          }
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          if (avg > 1) hasSignal = true;
          requestAnimationFrame(probe);
        };
        requestAnimationFrame(probe);
      } catch {
        if (!cancelled) setMicWorking(false);
      }
    })();

    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => {
    return () => cleanupRecording();
  }, [cleanupRecording]);

  /* ---- transcribe ---- */

  const handleTranscribe = async () => {
    setStatus("processing");
    try {
      let audioBase64: string;
      let fileName: string;

      if (recordedBlob) {
        const buf = await recordedBlob.arrayBuffer();
        audioBase64 = Buffer.from(buf).toString("base64");
        fileName = "recording.webm";
      } else if (file) {
        const buf = await file.arrayBuffer();
        audioBase64 = Buffer.from(buf).toString("base64");
        fileName = file.name;
      } else {
        return;
      }

      let data: TranscriptionResult;
      if (window.electronAPI?.isElectron) {
        data = await window.electronAPI.transcribe(audioBase64, fileName);
      } else {
        const formData = new FormData();
        if (recordedBlob) formData.append("audio", recordedBlob, fileName);
        else if (file) formData.append("audio", file);
        const res = await fetch("/api/transcribe", { method: "POST", body: formData });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || "Ошибка сервера");
      }

      if (!data.success) throw new Error(data.error || "Ошибка распознавания");
      setResult(data);
      setEditableText(data.transcription);
      setStatus("done");
      if (data.message) {
        toast({ title: "Внимание", description: data.message });
      } else {
        toast({ title: "Готово", description: `${data.wordCount} слов за ${fmtTime(data.processingTime)}` });
      }
    } catch (err) {
      setStatus("error");
      toast({ title: "Ошибка", description: err instanceof Error ? err.message : "Не удалось распознать", variant: "destructive" });
    }
  };

  /* ---- export ---- */

  const exportDocx = async () => {
    if (!editableText.trim()) return;
    try {
      const fName = file?.name || (recordedBlob ? "запись" : "transcription");

      if (window.electronAPI?.isElectron) {
        await window.electronAPI.exportDocx(editableText, fName);
        toast({ title: "Документ сохранён" });
      } else {
        const res = await fetch("/api/export-docx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: editableText, fileName: fName }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const base = fName.replace(/\.[^.]+$/, "");
        a.download = `${base}_расшифровка.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast({ title: "Документ скачан" });
      }
    } catch (err) {
      toast({ title: "Ошибка экспорта", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(editableText);
      setCopied(true);
      toast({ title: "Скопировано" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Ошибка копирования", variant: "destructive" });
    }
  };

  const clearAll = () => {
    cleanupRecording();
    setFile(null);
    setRecordedBlob(null);
    setResult(null);
    setEditableText("");
    setStatus("idle");
    setRecSeconds(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const hasSource = !!file || !!recordedBlob;

  /* ================================================================ */
  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen flex flex-col bg-[#09090b] text-[#fafafa]">
        {/* ---------- HEADER ---------- */}
        <header className="border-b border-white/[0.06]">
          <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white/[0.07] flex items-center justify-center">
                <Mic className="w-3.5 h-3.5 text-white/60" />
              </div>
              <span className="text-[15px] font-semibold tracking-tight">Vox</span>
            </div>
            <span className="text-[11px] text-white/25 font-mono">расшифровка голоса</span>
          </div>
        </header>

        {/* ---------- MAIN ---------- */}
        <main className="flex-1 flex items-start justify-center px-5 py-10 sm:py-16">
          <div className="w-full max-w-3xl">

            {/* === Input Section === */}
            {!result && status !== "done" && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                {/* Mode Tabs */}
                <div className="flex gap-1 p-1 bg-white/[0.04] rounded-lg w-fit mb-6">
                  {(["file", "record"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => { setMode(m); clearAll(); }}
                      className={cn(
                        "px-4 py-1.5 text-[13px] rounded-md transition-all",
                        mode === m
                          ? "bg-white/[0.08] text-white/90 font-medium shadow-sm"
                          : "text-white/35 hover:text-white/55"
                      )}
                    >
                      {m === "file" ? "Файл" : "Запись"}
                    </button>
                  ))}
                </div>

                {/* ---- FILE MODE ---- */}
                {mode === "file" && (
                  <div
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "relative cursor-pointer rounded-xl border-2 border-dashed transition-colors duration-200",
                      isDragging
                        ? "border-white/20 bg-white/[0.03]"
                        : "border-white/[0.08] hover:border-white/15"
                    )}
                  >
                    <div className="flex flex-col items-center py-16 sm:py-20 px-6">
                      <div className="w-12 h-12 rounded-2xl bg-white/[0.05] flex items-center justify-center mb-5">
                        <ArrowDownToLine className="w-5 h-5 text-white/30" />
                      </div>
                      <p className="text-[15px] font-medium text-white/70 mb-1">
                        {isDragging ? "Отпустите файл" : "Перетащите аудиофайл"}
                      </p>
                      <p className="text-[13px] text-white/25 mb-6">или нажмите для выбора</p>
                      <div className="flex gap-1.5">
                        {["MP3", "WAV", "M4A", "FLAC", "OGG", "WebM"].map((f) => (
                          <span key={f} className="text-[10px] font-mono text-white/15 bg-white/[0.04] px-2 py-0.5 rounded">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.webm"
                      className="hidden"
                      onChange={onFileChange}
                    />
                  </div>
                )}

                {/* ---- RECORD MODE ---- */}
                {mode === "record" && (
                  <div className="flex flex-col items-center py-12 sm:py-16">
                    {/* Mic unavailable / sandbox warning banner */}
                    {micWorking === false && (
                      <div className="w-full rounded-xl bg-amber-500/[0.06] border border-amber-500/15 px-5 py-4 mb-8 text-center">
                        <p className="text-[13px] text-amber-400/80 mb-1.5">
                          Запись голоса недоступна в этой среде
                        </p>
                        <p className="text-[12px] text-white/30 mb-4 leading-relaxed">
                          Микрофон не захватывает звук. Запись работает при открытии приложения напрямую в браузере на ПК.
                        </p>
                        <button
                          onClick={() => setMode("file")}
                          className="text-[13px] text-white/60 hover:text-white/80 underline underline-offset-2 transition-colors"
                        >
                          Перейти к загрузке файла →
                        </button>
                      </div>
                    )}

                    {/* Checking mic... spinner */}
                    {micWorking === null && (
                      <div className="flex items-center justify-center gap-2 mb-6">
                        <div className="w-3 h-3 rounded-full border border-white/15 border-t-white/40 animate-spin" />
                        <span className="text-[12px] text-white/25">Проверка микрофона...</span>
                      </div>
                    )}

                    {status !== "recording" ? (
                      <>
                        <button
                          onClick={startRecording}
                          disabled={micWorking === false}
                          className={cn(
                            "w-20 h-20 rounded-full border flex items-center justify-center transition-all duration-200 mb-6 group",
                            micWorking === false
                              ? "bg-white/[0.02] border-white/[0.04] opacity-40 cursor-not-allowed"
                              : "bg-white/[0.06] hover:bg-white/[0.09] border-white/[0.08]"
                          )}
                        >
                          <Mic className="w-7 h-7 text-white/40 group-hover:text-white/60 transition-colors" />
                        </button>
                        <p className="text-[15px] font-medium text-white/50 mb-1">Нажмите для записи</p>
                        <p className="text-[13px] text-white/20 max-w-xs text-center leading-relaxed">
                          Голос записывается в браузере, затем отправляется на обработку
                        </p>
                        <p className="text-[11px] text-white/10 mt-3">
                          Требуется доступ к микрофону
                        </p>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={stopRecording}
                          className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mb-5 transition-all hover:bg-red-500/20"
                        >
                          <Square className="w-6 h-6 text-red-400 fill-red-400" />
                        </button>
                        <p className="text-2xl font-mono font-light text-white/70 tabular-nums mb-3">
                          {fmtTimer(recSeconds)}
                        </p>
                        {/* Audio level meter */}
                        <div className="w-full max-w-xs mb-3">
                          <LevelBars level={audioLevel} />
                        </div>
                        <p className="text-[13px] text-red-400/70 mb-1">Запись идёт — нажмите для остановки</p>
                        <p className="text-[11px] text-white/15">
                          {audioLevel < 0.01
                            ? "Микрофон не фиксирует звук..."
                            : "Говорите в микрофон"}
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* ---- Source Selected (idle, ready to transcribe) ---- */}
                {hasSource && status === "idle" && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
                    <div className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-3 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileAudio className="w-4 h-4 text-white/25 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[13px] text-white/70 truncate">
                            {recordedBlob ? `Запись (${fmtTimer(recSeconds)})` : file?.name}
                          </p>
                          {file && <p className="text-[11px] text-white/25">{fmtSize(file.size)}</p>}
                          {recordedBlob && <p className="text-[11px] text-white/25">{fmtSize(recordedBlob.size)}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {recordedBlob && (
                          <Badge variant="outline" className="border-white/10 text-white/30 text-[10px] font-mono mr-1">
                            WebM
                          </Badge>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); clearAll(); }}
                          className="p-1.5 rounded-md text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <Button
                      onClick={handleTranscribe}
                      className="w-full h-11 bg-white text-[#09090b] font-medium text-[14px] rounded-xl hover:bg-white/90 transition-colors"
                    >
                      Распознать
                    </Button>
                  </motion.div>
                )}

                {/* ---- Processing ---- */}
                {isProcessing && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
                    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-8 flex flex-col items-center">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-2 h-2 rounded-full bg-white/30 animate-pulse" />
                        <span className="text-[14px] text-white/50">Обработка аудио</span>
                      </div>
                      <p className="text-[12px] text-white/20">Это может занять некоторое время</p>
                    </div>
                  </motion.div>
                )}

                {/* ---- Error ---- */}
                {status === "error" && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
                    <div className="rounded-xl bg-red-500/[0.06] border border-red-500/15 p-6 flex flex-col items-center text-center">
                      <AlertCircle className="w-5 h-5 text-red-400/60 mb-3" />
                      <p className="text-[13px] text-white/50 mb-4">Произошла ошибка при обработке</p>
                      <div className="flex gap-2">
                        <Button onClick={handleTranscribe} variant="outline" size="sm" className="border-white/10 text-white/50 text-[13px] rounded-lg h-9">
                          Повторить
                        </Button>
                        <Button onClick={clearAll} variant="ghost" size="sm" className="text-white/30 text-[13px] rounded-lg h-9">
                          Сбросить
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* === Result Section === */}
            {(status === "done" && result) && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4">
                <div className="flex items-center justify-between">
                  <button onClick={clearAll} className="text-[13px] text-white/30 hover:text-white/50 transition-colors flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    Новый файл
                  </button>
                  <div className="flex items-center gap-3 text-[11px] text-white/20 font-mono">
                    <span>{result.wordCount} сл.</span>
                    <span className="w-px h-3 bg-white/10" />
                    <span>{fmtTime(result.processingTime)}</span>
                    {result.chunksProcessed && result.chunksProcessed > 1 && (
                      <>
                        <span className="w-px h-3 bg-white/10" />
                        <span>{result.chunksProcessed} чанков</span>
                      </>
                    )}
                  </div>
                </div>

                <div className={cn("grid gap-3", result.audioDuration != null ? "grid-cols-4" : "grid-cols-3")}>
                  {[
                    { icon: Type, label: "Символов", value: (result.charCount || editableText.length).toString() },
                    { icon: Clock, label: "Обработка", value: fmtTime(result.processingTime) },
                    { icon: FileAudio, label: "Размер", value: fmtSize(result.fileSize) },
                    ...(result.audioDuration != null ? [{ icon: Clock, label: "Длительность", value: `${result.audioDuration.toFixed(0)}с` }] : []),
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-3.5 py-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <s.icon className="w-3 h-3 text-white/15" />
                        <span className="text-[10px] text-white/20 uppercase tracking-wider">{s.label}</span>
                      </div>
                      <p className="text-[15px] font-medium font-mono text-white/70">{s.value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                  <div className="flex items-center justify-between px-4 h-10 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-white/[0.06]" />
                        <div className="w-2.5 h-2.5 rounded-full bg-white/[0.06]" />
                        <div className="w-2.5 h-2.5 rounded-full bg-white/[0.06]" />
                      </div>
                      <span className="text-[11px] text-white/15 font-mono ml-2">расшифровка</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={copyText} className="p-1.5 rounded-md text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-colors">
                            {copied ? <Check className="w-3.5 h-3.5 text-white/60" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p>Копировать</p></TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={() => setEditableText("")} className="p-1.5 rounded-md text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p>Очистить</p></TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <ScrollArea className="h-[320px] sm:h-[420px]">
                    <textarea
                      value={editableText}
                      onChange={(e) => setEditableText(e.target.value)}
                      className="w-full min-h-[320px] sm:min-h-[420px] p-5 bg-transparent text-[14px] leading-relaxed resize-none focus:outline-none text-white/75 placeholder:text-white/10"
                      placeholder="Распознанный текст..."
                      spellCheck={false}
                    />
                  </ScrollArea>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={exportDocx}
                    disabled={!editableText.trim()}
                    className="flex-1 h-11 bg-white text-[#09090b] font-medium text-[14px] rounded-xl hover:bg-white/90 transition-colors disabled:opacity-20"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Скачать .docx
                  </Button>
                  <Button
                    onClick={copyText}
                    disabled={!editableText.trim()}
                    variant="outline"
                    className="flex-1 h-11 border-white/10 text-white/50 text-[14px] rounded-xl hover:bg-white/[0.04] hover:text-white/70 transition-colors disabled:opacity-20"
                  >
                    {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                    {copied ? "Скопировано" : "Копировать"}
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        </main>

        {/* ---------- FOOTER ---------- */}
        <footer className="border-t border-white/[0.06] mt-auto">
          <div className="max-w-3xl mx-auto px-5 h-10 flex items-center justify-between">
            <span className="text-[11px] text-white/15">Vox v1.0</span>
            <span className="text-[11px] text-white/15">Русский язык</span>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}