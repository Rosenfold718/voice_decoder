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
  Download,
  Copy,
  Check,
  Trash2,
  FileAudio,
  Clock,
  Type,
  AlertCircle,
  X,
  ArrowDownToLine,
  Loader2,
  AudioWaveform,
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

type Status = "idle" | "processing" | "done" | "error";

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

/* ------------------------------------------------------------------ */
/*  Processing Loader Component                                        */
/* ------------------------------------------------------------------ */

function ProcessingLoader({ fileName, fileSize }: { fileName: string; fileSize: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timerStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  // Cycling messages based on elapsed time
  const messages = [
    { t: 0, text: "Подготовка аудиофайла..." },
    { t: 5, text: "Анализ звуковой дорожки..." },
    { t: 15, text: "Распознавание речи..." },
    { t: 45, text: "Обработка фрагментов..." },
    { t: 90, text: "Сборка текста..." },
  ];
  const msg = [...messages].reverse().find((m) => elapsed >= m.t)?.text ?? messages[0].text;

  return (
    <div className="mt-5">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-8 sm:p-10 flex flex-col items-center"
      >
        {/* Animated wave */}
        <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
          {/* Outer ring pulse */}
          <div className="absolute inset-0 rounded-full border border-white/[0.06] animate-[ping_3s_ease-in-out_infinite]" />
          <div className="absolute inset-2 rounded-full border border-white/[0.04] animate-[ping_3s_ease-in-out_infinite_1s]" />

          {/* Center icon */}
          <div className="relative w-16 h-16 rounded-full bg-white/[0.06] flex items-center justify-center">
            <AudioWaveform className="w-7 h-7 text-white/50" />
            {/* Orbiting dot */}
            <div className="absolute inset-0 animate-[spin_3s_linear_infinite]">
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white/40" />
            </div>
          </div>
        </div>

        {/* Message */}
        <p className="text-[15px] font-medium text-white/60 mb-1">{msg}</p>
        <p className="text-[12px] text-white/20 mb-5">
          Это может занять некоторое время в зависимости от длительности аудио
        </p>

        {/* File info + timer */}
        <div className="w-full max-w-xs space-y-3">
          {/* Progress bar (indeterminate) */}
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full w-1/3 bg-white/20 rounded-full animate-[shimmer_2s_ease-in-out_infinite]" />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-white/25 truncate max-w-[180px]">{fileName}</span>
            <span className="text-white/30 tabular-nums">{timerStr}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-white/15">{fmtSize(fileSize)}</span>
            <span className="text-white/15 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Обработка
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function VoxPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [editableText, setEditableText] = useState("");
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
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
    },
    [toast]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files[0]) acceptFile(e.dataTransfer.files[0]);
    },
    [acceptFile]
  );
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) acceptFile(e.target.files[0]);
    },
    [acceptFile]
  );

  /* ---- transcribe ---- */

  const handleTranscribe = async () => {
    if (!file) return;
    setStatus("processing");
    try {
      const buf = await file.arrayBuffer();
      const audioBase64 = Buffer.from(buf).toString("base64");

      let data: TranscriptionResult;
      if (window.electronAPI?.isElectron) {
        data = await window.electronAPI.transcribe(audioBase64, file.name);
      } else {
        throw new Error("Распознавание доступно только в приложении Vox");
      }

      if (!data.success) throw new Error(data.error || "Ошибка распознавания");
      setResult(data);
      setEditableText(data.transcription);
      setStatus("done");
      if (data.message) {
        toast({ title: "Внимание", description: data.message });
      } else {
        toast({
          title: "Готово",
          description: `${data.wordCount} слов за ${fmtTime(data.processingTime)}`,
        });
      }
    } catch (err) {
      setStatus("error");
      toast({
        title: "Ошибка",
        description: err instanceof Error ? err.message : "Не удалось распознать",
        variant: "destructive",
      });
    }
  };

  /* ---- export ---- */

  const exportDocx = async () => {
    if (!editableText.trim()) return;
    try {
      const fName = file?.name || "transcription";

      if (window.electronAPI?.isElectron) {
        await window.electronAPI.exportDocx(editableText, fName);
        toast({ title: "Документ сохранён" });
      } else {
        throw new Error("Экспорт доступен только в приложении Vox");
      }
    } catch (err) {
      toast({
        title: "Ошибка экспорта",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
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
    setResult(null);
    setEditableText("");
    setStatus("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ================================================================ */
  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen flex flex-col bg-[#09090b] text-[#fafafa]">
        {/* ---------- HEADER ---------- */}
        <header className="border-b border-white/[0.06]">
          <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white/[0.07] flex items-center justify-center">
                <AudioWaveform className="w-3.5 h-3.5 text-white/60" />
              </div>
              <span className="text-[15px] font-semibold tracking-tight">Vox - BETA</span>
            </div>
            <span className="text-[11px] text-white/25 font-mono">расшифровка голоса</span>
          </div>
        </header>

        {/* ---------- MAIN ---------- */}
        <main className="flex-1 flex items-start justify-center px-5 py-10 sm:py-16">
          <div className="w-full max-w-3xl">
            {/* === Input Section === */}
            {!result && status !== "done" && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                {/* ---- FILE DROP ZONE ---- */}
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
                        <span
                          key={f}
                          className="text-[10px] font-mono text-white/15 bg-white/[0.04] px-2 py-0.5 rounded"
                        >
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

                {/* ---- Source Selected (idle, ready to transcribe) ---- */}
                {file && status === "idle" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-5"
                  >
                    <div className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-3 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileAudio className="w-4 h-4 text-white/25 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[13px] text-white/70 truncate">{file?.name}</p>
                          <p className="text-[11px] text-white/25">{fmtSize(file.size)}</p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          clearAll();
                        }}
                        className="p-1.5 rounded-md text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
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
                {isProcessing && file && (
                  <ProcessingLoader fileName={file.name} fileSize={file.size} />
                )}

                {/* ---- Error ---- */}
                {status === "error" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-5"
                  >
                    <div className="rounded-xl bg-red-500/[0.06] border border-red-500/15 p-6 flex flex-col items-center text-center">
                      <AlertCircle className="w-5 h-5 text-red-400/60 mb-3" />
                      <p className="text-[13px] text-white/50 mb-4">
                        Произошла ошибка при обработке
                      </p>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleTranscribe}
                          variant="outline"
                          size="sm"
                          className="border-white/10 text-white/50 text-[13px] rounded-lg h-9"
                        >
                          Повторить
                        </Button>
                        <Button
                          onClick={clearAll}
                          variant="ghost"
                          size="sm"
                          className="text-white/30 text-[13px] rounded-lg h-9"
                        >
                          Сбросить
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* === Result Section === */}
            {status === "done" && result && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <button
                    onClick={clearAll}
                    className="text-[13px] text-white/30 hover:text-white/50 transition-colors flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Новый файл
                  </button>
                  <div className="flex items-center gap-3 text-[11px] text-white/20 font-mono">
                    <span>{result.wordCount} сл.</span>
                    <span className="w-px h-3 bg-white/10" />
                    <span>{fmtTime(result.processingTime)}</span>
                  </div>
                </div>

                <div
                  className={cn(
                    "grid gap-3",
                    result.audioDuration != null ? "grid-cols-4" : "grid-cols-3"
                  )}
                >
                  {[
                    {
                      icon: Type,
                      label: "Символов",
                      value: (result.charCount || editableText.length).toString(),
                    },
                    { icon: Clock, label: "Обработка", value: fmtTime(result.processingTime) },
                    { icon: FileAudio, label: "Размер", value: fmtSize(result.fileSize) },
                    ...(result.audioDuration != null
                      ? [
                          {
                            icon: Clock,
                            label: "Длительность",
                            value: `${result.audioDuration.toFixed(0)}с`,
                          },
                        ]
                      : []),
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-3.5 py-3"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <s.icon className="w-3 h-3 text-white/15" />
                        <span className="text-[10px] text-white/20 uppercase tracking-wider">
                          {s.label}
                        </span>
                      </div>
                      <p className="text-[15px] font-medium font-mono text-white/70">
                        {s.value}
                      </p>
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
                      <span className="text-[11px] text-white/15 font-mono ml-2">
                        расшифровка
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={copyText}
                            className="p-1.5 rounded-md text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-colors"
                          >
                            {copied ? (
                              <Check className="w-3.5 h-3.5 text-white/60" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Копировать</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setEditableText("")}
                            className="p-1.5 rounded-md text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Очистить</p>
                        </TooltipContent>
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
                    {copied ? (
                      <Check className="w-4 h-4 mr-2" />
                    ) : (
                      <Copy className="w-4 h-4 mr-2" />
                    )}
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
            <span className="text-[11px] text-white/15">Vox v1.3.1</span>
            <span className="text-[11px] text-white/15">Русский язык</span>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}