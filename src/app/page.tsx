"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Mic,
  MicOff,
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
import { Card } from "@/components/ui/card";
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
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

  const startRecording = async () => {
    // Check if getUserMedia is available at all (iframe/sandbox restriction)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast({
        title: "Микрофон недоступен",
        description: "Доступ к микрофону запрещён в текущей среде. На реальном ПК в браузере запись будет работать.",
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
          toast({ title: "Запись пуста", description: "Попробуйте снова и говорите громче", variant: "destructive" });
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
    } catch (err) {
      const msg = err instanceof DOMException && err.name === "NotAllowedError"
        ? "Разрешите доступ к микрофону в настройках браузера"
        : "Не удалось получить доступ к микрофону";
      toast({ title: "Микрофон недоступен", description: msg, variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    clearInterval(timerRef.current);
    setMediaRecorder(null);
    setStatus("idle");
    setFile(null);
    setResult(null);
    setEditableText("");
  };

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      mediaStream?.getTracks().forEach((t) => t.stop());
    };
  }, [mediaStream]);

  /* ---- transcribe ---- */

  const handleTranscribe = async () => {
    setStatus("processing");

    try {
      const formData = new FormData();
      const sourceLabel = recordedBlob ? "запись.webm" : file!.name;

      if (recordedBlob) {
        formData.append("audio", recordedBlob, "recording.webm");
      } else if (file) {
        formData.append("audio", file);
      }

      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      const data: TranscriptionResult = await res.json();

      if (!res.ok) throw new Error(data.error || "Ошибка сервера");

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
      const res = await fetch("/api/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editableText, fileName: file?.name || recordedBlob ? "запись" : "transcription" }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = (file?.name || "transcription").replace(/\.[^.]+$/, "");
      a.download = `${base}_расшифровка.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Документ скачан" });
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
                  <div className="flex flex-col items-center py-16 sm:py-20">
                    {status !== "recording" ? (
                      <>
                        <button
                          onClick={startRecording}
                          className="w-20 h-20 rounded-full bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] flex items-center justify-center transition-all duration-200 mb-6 group"
                        >
                          <Mic className="w-7 h-7 text-white/40 group-hover:text-white/60 transition-colors" />
                        </button>
                        <p className="text-[15px] font-medium text-white/50 mb-1">Нажмите для записи</p>
                        <p className="text-[13px] text-white/20 max-w-xs text-center leading-relaxed">
                          Голос записывается прямо в браузере, затем отправляется на обработку
                        </p>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={stopRecording}
                          className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mb-6 transition-all hover:bg-red-500/20"
                        >
                          <Square className="w-6 h-6 text-red-400 fill-red-400" />
                        </button>
                        <p className="text-2xl font-mono font-light text-white/70 tabular-nums mb-2">
                          {fmtTimer(recSeconds)}
                        </p>
                        <p className="text-[13px] text-red-400/70">Запись идёт — нажмите для остановки</p>
                      </>
                    )}
                  </div>
                )}

                {/* ---- Source Selected (idle, ready to transcribe) ---- */}
                {hasSource && status === "idle" && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
                    {/* Source info bar */}
                    <div className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-3 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileAudio className="w-4 h-4 text-white/25 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[13px] text-white/70 truncate">
                            {recordedBlob ? `Запись (${fmtTimer(recSeconds)})` : file?.name}
                          </p>
                          {file && <p className="text-[11px] text-white/25">{fmtSize(file.size)}</p>}
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
                {/* Back / source info */}
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

                {/* Stats */}
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

                {/* Text output */}
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                  {/* Toolbar */}
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

                {/* Actions */}
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