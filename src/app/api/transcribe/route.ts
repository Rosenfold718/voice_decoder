import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, readFile, rm, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import ZAI from "z-ai-web-dev-sdk";

const execFileAsync = promisify(execFile);

// --- Ffmpeg / ffprobe path resolution ---
// In Electron packaged app: env vars set by main.js point to bundled binaries
// In dev / web: fall back to system PATH ("ffmpeg", "ffprobe")
const FFMPEG = process.env.VOX_FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.VOX_FFPROBE_PATH || "ffprobe";

// Cache for SDK instance
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

// ASR max duration is 30 seconds — we use 28s chunks to be safe
const CHUNK_SECONDS = 28;

/**
 * Get audio duration in seconds using ffprobe
 */
async function getDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(FFPROBE, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ], { timeout: 30_000 });
  return parseFloat(stdout.trim());
}

/**
 * Convert audio file to WAV 16kHz mono using ffmpeg.
 */
async function convertToWav(inputPath: string, outputDir: string): Promise<string> {
  const outputPath = join(outputDir, "converted.wav");
  await execFileAsync(FFMPEG, [
    "-y", "-i", inputPath,
    "-ar", "16000", "-ac", "1", "-sample_fmt", "s16",
    outputPath,
  ], { timeout: 120_000 });
  return outputPath;
}

/**
 * Split WAV file into 28-second chunks.
 * Returns array of chunk file paths.
 */
async function splitIntoChunks(
  wavPath: string,
  outputDir: string,
  duration: number
): Promise<string[]> {
  if (duration <= CHUNK_SECONDS) return [wavPath];

  const chunkDir = join(outputDir, "chunks");
  const { mkdir } = await import("fs/promises");
  await mkdir(chunkDir, { recursive: true });

  await execFileAsync(FFMPEG, [
    "-y", "-i", wavPath,
    "-f", "segment",
    "-segment_time", String(CHUNK_SECONDS),
    "-ar", "16000", "-ac", "1", "-sample_fmt", "s16",
    join(chunkDir, "chunk_%03d.wav"),
  ], { timeout: 300_000 });

  const files = await readdir(chunkDir);
  const chunkFiles = files
    .filter((f) => f.endsWith(".wav"))
    .sort()
    .map((f) => join(chunkDir, f));

  console.log(`[VOX] Split ${duration.toFixed(1)}s audio into ${chunkFiles.length} chunks`);
  return chunkFiles;
}

/**
 * Transcribe a single audio file (WAV or WebM)
 */
async function transcribeFile(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  filePath: string
): Promise<string> {
  const audioBuffer = await readFile(filePath);
  const base64Audio = audioBuffer.toString("base64");

  console.log(`[VOX] Sending chunk (${(audioBuffer.length / 1024).toFixed(1)} KB) to ASR...`);

  const response = await zai.audio.asr.create({
    file_base64: base64Audio,
    language: "ru",
  } as any);

  return response.text || "";
}

/**
 * Detect if text contains significant non-Cyrillic (likely English) content.
 * Returns the ratio of non-Cyrillic word characters to total word characters.
 */
function englishRatio(text: string): number {
  const letters = text.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, "");
  if (letters.length === 0) return 0;
  const latinChars = letters.replace(/[а-яА-ЯёЁ]/g, "").length;
  return latinChars / letters.length;
}

/**
 * Post-process ASR text via LLM to ensure it's in Russian.
 * Only called when significant English content is detected.
 */
async function ensureRussian(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  text: string
): Promise<string> {
  console.log("[VOX] Post-processing: converting to Russian via LLM...");

  const response = await zai.chat.completions.create({
    messages: [
      {
        role: "system",
        content:
          "Ты — ассистент для расшифровки аудио. Твоя задача: переписать предоставленный текст на русском языке. " +
          "Если текст уже на русском — просто верни его исправленным (без переводов, без английского). " +
          "Если текст на английском или смешанный — переведи на русский, сохранив смысл и структуру. " +
          "Не добавляй пояснений, не используй markdown. Верни ТОЛЬКО текст на русском языке.",
      },
      {
        role: "user",
        content: text,
      },
    ],
  });

  const result = response.choices?.[0]?.message?.content?.trim();
  return result || text;
}

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;

  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: "Аудиофайл не предоставлен" },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = [
      "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave",
      "audio/x-wav", "audio/mp4", "audio/m4a", "audio/ogg",
      "audio/flac", "audio/x-flac", "audio/webm",
    ];
    const validExtensions = [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm"];
    const fileName = audioFile.name.toLowerCase();
    const ext = fileName.substring(fileName.lastIndexOf("."));

    if (!validTypes.includes(audioFile.type) && !validExtensions.includes(ext)) {
      return NextResponse.json(
        { success: false, error: `Неподдерживаемый формат: ${ext || audioFile.type}` },
        { status: 400 }
      );
    }

    // Check file size (max 100MB)
    const fileSizeMB = audioFile.size / (1024 * 1024);
    if (fileSizeMB > 100) {
      return NextResponse.json(
        { success: false, error: `Файл слишком большой: ${fileSizeMB.toFixed(1)} МБ (макс. 100 МБ)` },
        { status: 400 }
      );
    }

    // Save uploaded file to temp dir
    tempDir = await mkdtemp(join(tmpdir(), "vox-"));
    const inputPath = join(tempDir, audioFile.name);
    await writeFile(inputPath, Buffer.from(await audioFile.arrayBuffer()));

    const startTime = Date.now();

    // Convert to WAV if needed
    let wavPath: string;
    if (ext !== ".wav") {
      console.log(`[VOX] Converting ${ext} → WAV...`);
      wavPath = await convertToWav(inputPath, tempDir);
    } else {
      wavPath = inputPath;
    }

    // Get duration and split if needed
    const duration = await getDuration(wavPath);
    console.log(`[VOX] Audio duration: ${duration.toFixed(1)}s`);

    const chunks = await splitIntoChunks(wavPath, tempDir, duration);
    const zai = await getZAI();

    // Transcribe all chunks
    const texts: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[VOX] Chunk ${i + 1}/${chunks.length}...`);
      const text = await transcribeFile(zai, chunks[i]);
      if (text.trim()) {
        texts.push(text.trim());
      }
    }

    // Combine and clean text
    const rawText = texts.join(" ");
    let cleanedText = rawText
      .replace(/\s+/g, " ")
      .trim()
      .replace(/(^\w|[.!?]\s+\w)/g, (match) => match.toUpperCase());

    // Post-process: if significant English detected, convert via LLM
    const engRatio = englishRatio(cleanedText);
    console.log(`[VOX] English ratio: ${(engRatio * 100).toFixed(1)}%`);

    if (engRatio > 0.2 && cleanedText.length > 0) {
      cleanedText = await ensureRussian(zai, cleanedText);
    }

    const processingTime = Date.now() - startTime;
    console.log(`[VOX] Done in ${processingTime}ms`);

    if (!cleanedText) {
      return NextResponse.json({
        success: true,
        transcription: "",
        wordCount: 0,
        processingTime,
        fileName: audioFile.name,
        fileSize: audioFile.size,
        audioDuration: duration,
        chunksProcessed: chunks.length,
        message: "Речь не обнаружена в аудиофайле",
      });
    }

    return NextResponse.json({
      success: true,
      transcription: cleanedText,
      rawTranscription: rawText,
      wordCount: cleanedText.split(/\s+/).filter(Boolean).length,
      charCount: cleanedText.length,
      processingTime,
      fileName: audioFile.name,
      fileSize: audioFile.size,
      audioDuration: duration,
      chunksProcessed: chunks.length,
      postProcessed: engRatio > 0.2,
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Произошла ошибка при распознавании речи",
      },
      { status: 500 }
    );
  } finally {
    if (tempDir) {
      try { await rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}