"use client";

import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileAudio,
  Mic,
  Download,
  Copy,
  Check,
  Trash2,
  Loader2,
  Volume2,
  FileText,
  Clock,
  Type,
  AlertCircle,
  X,
  Sparkles,
  Shield,
  Cpu,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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

interface TranscriptionResult {
  success: boolean;
  transcription: string;
  wordCount: number;
  charCount?: number;
  processingTime: number;
  fileName: string;
  fileSize: number;
  error?: string;
  message?: string;
}

type ProcessingStatus = "idle" | "uploading" | "processing" | "done" | "error";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Б";
  const k = 1024;
  const sizes = ["Б", "КБ", "МБ", "ГБ"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatProcessingTime(ms: number): string {
  if (ms < 1000) return `${ms} мс`;
  return `${(ms / 1000).toFixed(1)} с`;
}

// Animated waveform component
function WaveformAnimation({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex items-center gap-[3px] h-8">
      {[...Array(24)].map((_, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-emerald-400"
          animate={
            isActive
              ? {
                  height: [4, Math.random() * 28 + 4, 4],
                }
              : { height: 4 }
          }
          transition={
            isActive
              ? {
                  duration: 0.6 + Math.random() * 0.4,
                  repeat: Infinity,
                  repeatType: "reverse",
                  delay: i * 0.03,
                }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
}

// Glowing orb background effect
function GlowOrb({
  color,
  size,
  x,
  y,
}: {
  color: string;
  size: number;
  x: string;
  y: string;
}) {
  return (
    <div
      className="absolute rounded-full blur-[100px] opacity-15 pointer-events-none"
      style={{
        background: color,
        width: size,
        height: size,
        left: x,
        top: y,
      }}
    />
  );
}

export default function VoiceDecoderPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editableText, setEditableText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = useCallback(
    (selectedFile: File) => {
      const validExtensions = [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm"];
      const ext = selectedFile.name
        .toLowerCase()
        .substring(selectedFile.name.lastIndexOf("."));

      if (!validExtensions.includes(ext)) {
        toast({
          title: "Неподдерживаемый формат",
          description: `Файл "${selectedFile.name}" имеет формат ${ext}. Поддерживаются: MP3, WAV, M4A, FLAC, OGG, WebM`,
          variant: "destructive",
        });
        return;
      }

      const fileSizeMB = selectedFile.size / (1024 * 1024);
      if (fileSizeMB > 100) {
        toast({
          title: "Файл слишком большой",
          description: `Размер ${fileSizeMB.toFixed(1)} МБ. Максимум 100 МБ`,
          variant: "destructive",
        });
        return;
      }

      setFile(selectedFile);
      setResult(null);
      setEditableText("");
      setStatus("idle");
      setProgress(0);
    },
    [toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFileSelect(droppedFile);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) handleFileSelect(selectedFile);
    },
    [handleFileSelect]
  );

  const handleTranscribe = async () => {
    if (!file) return;

    setStatus("uploading");
    setProgress(10);

    // Simulate upload progress
    const uploadInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 30) {
          clearInterval(uploadInterval);
          return 30;
        }
        return prev + 5;
      });
    }, 200);

    try {
      const formData = new FormData();
      formData.append("audio", file);

      setStatus("processing");
      clearInterval(uploadInterval);
      setProgress(40);

      // Simulate processing progress
      const processInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 85) {
            clearInterval(processInterval);
            return 85;
          }
          return prev + 3;
        });
      }, 300);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      clearInterval(processInterval);
      setProgress(95);

      const data: TranscriptionResult = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ошибка сервера");
      }

      setProgress(100);
      setResult(data);
      setEditableText(data.transcription);
      setStatus("done");

      if (data.message) {
        toast({
          title: "Внимание",
          description: data.message,
          variant: "default",
        });
      } else {
        toast({
          title: "Распознавание завершено",
          description: `Обработано ${data.wordCount} слов за ${formatProcessingTime(data.processingTime)}`,
        });
      }
    } catch (error) {
      setStatus("error");
      setProgress(0);
      toast({
        title: "Ошибка",
        description:
          error instanceof Error ? error.message : "Не удалось распознать речь",
        variant: "destructive",
      });
    }
  };

  const handleExportDocx = async () => {
    if (!editableText.trim()) return;

    try {
      const response = await fetch("/api/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: editableText,
          fileName: file?.name || "transcription",
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Ошибка создания документа");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(file?.name || "transcription").replace(/\.[^.]+$/, "")}_расшифровка.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Документ скачан",
        description: "Word-файл успешно создан и загружен",
      });
    } catch (error) {
      toast({
        title: "Ошибка экспорта",
        description:
          error instanceof Error
            ? error.message
            : "Не удалось создать документ",
        variant: "destructive",
      });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editableText);
      setCopied(true);
      toast({ title: "Скопировано", description: "Текст скопирован в буфер обмена" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Ошибка",
        description: "Не удалось скопировать текст",
        variant: "destructive",
      });
    }
  };

  const handleClear = () => {
    setFile(null);
    setResult(null);
    setEditableText("");
    setStatus("idle");
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isProcessing = status === "uploading" || status === "processing";

  return (
    <TooltipProvider>
      <div className="min-h-screen flex flex-col bg-[#0a0a0f] text-white overflow-hidden relative">
        {/* Background effects */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <GlowOrb color="#10b981" size={600} x="10%" y="20%" />
          <GlowOrb color="#06b6d4" size={500} x="80%" y="60%" />
          <GlowOrb color="#8b5cf6" size={400} x="50%" y="10%" />
          {/* Grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
              `,
              backgroundSize: "60px 60px",
            }}
          />
        </div>

        {/* Header */}
        <header className="relative z-10 border-b border-white/[0.06] backdrop-blur-xl bg-black/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Mic className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0a0a0f] animate-pulse" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  VOX DECODER
                </h1>
                <p className="text-[11px] text-white/30 font-mono tracking-wider uppercase">
                  AI Speech Recognition Engine
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge
                variant="outline"
                className="border-emerald-500/30 text-emerald-400 bg-emerald-500/5 text-xs font-mono"
              >
                <Cpu className="w-3 h-3 mr-1" />
                ASR Ready
              </Badge>
              <Badge
                variant="outline"
                className="border-cyan-500/30 text-cyan-400 bg-cyan-500/5 text-xs font-mono"
              >
                <Globe className="w-3 h-3 mr-1" />
                RU
              </Badge>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="relative z-10 flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8">
          {/* Upload Zone */}
          <AnimatePresence mode="wait">
            {!file && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col items-center"
              >
                {/* Hero Section */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1, duration: 0.5 }}
                  className="text-center mb-8"
                >
                  <div className="flex justify-center mb-4">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center backdrop-blur-sm">
                        <Volume2 className="w-10 h-10 text-emerald-400" />
                      </div>
                      <motion.div
                        className="absolute -inset-1 rounded-2xl border border-emerald-500/20"
                        animate={{ opacity: [0.3, 0.8, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    </div>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-bold mb-3">
                    <span className="bg-gradient-to-r from-white via-emerald-200 to-cyan-200 bg-clip-text text-transparent">
                      Расшифровка голоса
                    </span>
                  </h2>
                  <p className="text-white/40 text-sm sm:text-base max-w-md mx-auto leading-relaxed">
                    Загрузите аудиофайл с русской речью — AI-движок распознает
                    текст и подготовит его для экспорта
                  </p>
                </motion.div>

                {/* Drop Zone */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={cn(
                    "w-full max-w-xl cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300 relative overflow-hidden group",
                    isDragging
                      ? "border-emerald-400 bg-emerald-500/10 scale-[1.02]"
                      : "border-white/10 hover:border-emerald-500/40 hover:bg-white/[0.02]"
                  )}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative p-10 sm:p-14 flex flex-col items-center text-center">
                    <motion.div
                      animate={isDragging ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <Upload
                        className={cn(
                          "w-12 h-12 mb-4 transition-colors",
                          isDragging
                            ? "text-emerald-400"
                            : "text-white/20 group-hover:text-emerald-400/60"
                        )}
                      />
                    </motion.div>
                    <p className="text-white/60 font-medium mb-1">
                      {isDragging
                        ? "Отпустите файл"
                        : "Перетащите аудиофайл сюда"}
                    </p>
                    <p className="text-white/25 text-sm">
                      или нажмите для выбора файла
                    </p>
                    <div className="flex gap-2 mt-4">
                      {["MP3", "WAV", "M4A", "FLAC", "OGG"].map((fmt) => (
                        <Badge
                          key={fmt}
                          variant="outline"
                          className="border-white/10 text-white/30 text-[10px] font-mono"
                        >
                          {fmt}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.webm"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                </motion.div>

                {/* Tech Stack Info */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                  className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-xl"
                >
                  {[
                    {
                      icon: Shield,
                      title: "Шифрование",
                      desc: "Файлы обрабатываются безопасно",
                    },
                    {
                      icon: Sparkles,
                      title: "AI-модель",
                      desc: "Передовые модели распознавания",
                    },
                    {
                      icon: FileText,
                      title: "Экспорт",
                      desc: "Конвертация в Word (.docx)",
                    },
                  ].map((item) => (
                    <Card
                      key={item.title}
                      className="bg-white/[0.03] border-white/[0.06] backdrop-blur-sm p-4 text-center"
                    >
                      <item.icon className="w-5 h-5 text-emerald-400/60 mx-auto mb-2" />
                      <p className="text-xs font-medium text-white/60">
                        {item.title}
                      </p>
                      <p className="text-[10px] text-white/25 mt-1">
                        {item.desc}
                      </p>
                    </Card>
                  ))}
                </motion.div>
              </motion.div>
            )}

            {/* Processing / Result View */}
            {file && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="space-y-6"
              >
                {/* File Info Bar */}
                <Card className="bg-white/[0.03] border-white/[0.08] backdrop-blur-xl p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <FileAudio className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-white/30">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {status === "done" && result && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 text-emerald-400 bg-emerald-500/5 text-xs font-mono"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Готово
                        </Badge>
                      )}
                      {status === "error" && (
                        <Badge
                          variant="outline"
                          className="border-red-500/30 text-red-400 bg-red-500/5 text-xs font-mono"
                        >
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Ошибка
                        </Badge>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-white/30 hover:text-red-400 hover:bg-red-500/10"
                            onClick={handleClear}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Удалить и загрузить другой</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </Card>

                {/* Processing State */}
                {isProcessing && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <Card className="bg-white/[0.03] border-white/[0.08] backdrop-blur-xl p-6 sm:p-8">
                      <div className="flex flex-col items-center text-center gap-4">
                        <WaveformAnimation isActive={true} />
                        <div>
                          <p className="text-sm font-medium text-white/70">
                            {status === "uploading"
                              ? "Загрузка файла..."
                              : "Распознавание речи..."}
                          </p>
                          <p className="text-xs text-white/30 mt-1">
                            AI-модель обрабатывает аудиозапись
                          </p>
                        </div>
                        <div className="w-full max-w-xs">
                          <Progress
                            value={progress}
                            className="h-1.5 bg-white/[0.06]"
                          />
                          <p className="text-xs text-white/20 mt-2 font-mono">
                            {progress}%
                          </p>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                )}

                {/* Transcription Result */}
                {status === "done" && result && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-4"
                  >
                    {/* Stats Bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        {
                          icon: Type,
                          label: "Слов",
                          value: result.wordCount.toString(),
                        },
                        {
                          icon: FileText,
                          label: "Символов",
                          value: (result.charCount || editableText.length).toString(),
                        },
                        {
                          icon: Clock,
                          label: "Время",
                          value: formatProcessingTime(result.processingTime),
                        },
                        {
                          icon: FileAudio,
                          label: "Файл",
                          value: formatFileSize(result.fileSize),
                        },
                      ].map((stat) => (
                        <Card
                          key={stat.label}
                          className="bg-white/[0.03] border-white/[0.06] backdrop-blur-sm p-3"
                        >
                          <div className="flex items-center gap-2">
                            <stat.icon className="w-3.5 h-3.5 text-emerald-400/60" />
                            <span className="text-[10px] text-white/30 uppercase tracking-wider">
                              {stat.label}
                            </span>
                          </div>
                          <p className="text-lg font-bold font-mono mt-1 text-white/80">
                            {stat.value}
                          </p>
                        </Card>
                      ))}
                    </div>

                    {/* Text Output */}
                    <Card className="bg-white/[0.03] border-white/[0.08] backdrop-blur-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                            <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                            <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                          </div>
                          <span className="text-xs text-white/30 font-mono ml-2">
                            transcription.txt
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-white/30 hover:text-white/60"
                                onClick={handleCopy}
                              >
                                {copied ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Копировать текст</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-white/30 hover:text-white/60"
                                onClick={() => setEditableText("")}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Очистить текст</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                      <ScrollArea className="h-[300px] sm:h-[400px]">
                        <textarea
                          value={editableText}
                          onChange={(e) => setEditableText(e.target.value)}
                          className="w-full min-h-[300px] sm:min-h-[400px] p-4 sm:p-6 bg-transparent text-sm sm:text-base text-white/80 leading-relaxed resize-none focus:outline-none placeholder:text-white/15 font-[inherit]"
                          placeholder="Распознанный текст появится здесь..."
                          spellCheck={false}
                        />
                      </ScrollArea>
                    </Card>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        onClick={handleExportDocx}
                        disabled={!editableText.trim()}
                        className="flex-1 h-12 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-30 disabled:shadow-none"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Скачать Word (.docx)
                      </Button>
                      <Button
                        onClick={handleCopy}
                        disabled={!editableText.trim()}
                        variant="outline"
                        className="flex-1 h-12 border-white/10 hover:bg-white/[0.05] text-white/60 hover:text-white rounded-xl"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 mr-2 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4 mr-2" />
                        )}
                        {copied ? "Скопировано" : "Копировать текст"}
                      </Button>
                    </div>

                    {/* Upload Another */}
                    <div className="text-center pt-2">
                      <Button
                        variant="ghost"
                        onClick={handleClear}
                        className="text-white/25 hover:text-white/50 text-sm"
                      >
                        <Upload className="w-3.5 h-3.5 mr-1.5" />
                        Загрузить другой файл
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* Error State */}
                {status === "error" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className="bg-red-500/5 border-red-500/20 backdrop-blur-xl p-6 text-center">
                      <AlertCircle className="w-8 h-8 text-red-400/60 mx-auto mb-3" />
                      <p className="text-sm text-white/60 mb-4">
                        Произошла ошибка при обработке файла
                      </p>
                      <div className="flex gap-3 justify-center">
                        <Button
                          onClick={handleTranscribe}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl"
                        >
                          <Loader2 className="w-4 h-4 mr-2" />
                          Повторить
                        </Button>
                        <Button
                          onClick={handleClear}
                          variant="outline"
                          className="border-white/10 hover:bg-white/[0.05] text-white/60 rounded-xl"
                        >
                          Другой файл
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                )}

                {/* Idle but file loaded — show start button */}
                {status === "idle" && file && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center pt-4"
                  >
                    <Button
                      onClick={handleTranscribe}
                      size="lg"
                      className="h-14 px-10 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-semibold text-base rounded-xl shadow-lg shadow-emerald-500/25 transition-all"
                    >
                      <Sparkles className="w-5 h-5 mr-2" />
                      Распознать речь
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="relative z-10 border-t border-white/[0.06] backdrop-blur-xl bg-black/20 mt-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-white/20 font-mono">
              <div className="flex items-center gap-3">
                <span>VOX DECODER v1.0</span>
                <span className="hidden sm:inline">|</span>
                <span className="hidden sm:inline">
                  Powered by z-ai-web-dev-sdk
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span>ASR Engine</span>
                <span>|</span>
                <span>Русский язык</span>
                <span>|</span>
                <span>Next.js 16</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}