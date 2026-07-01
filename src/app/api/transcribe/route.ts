import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, readFile, unlink, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import ZAI from "z-ai-web-dev-sdk";

const execFileAsync = promisify(execFile);

// Cache for SDK instance
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

/**
 * Convert audio file to WAV 16kHz mono using ffmpeg.
 * Returns the path to the converted file.
 */
async function convertToWav(inputPath: string, outputDir: string): Promise<string> {
  const outputPath = join(outputDir, "converted.wav");

  await execFileAsync("ffmpeg", [
    "-y",
    "-i", inputPath,
    "-ar", "16000",       // 16kHz sample rate (optimal for ASR)
    "-ac", "1",           // mono
    "-sample_fmt", "s16", // 16-bit PCM
    outputPath,
  ], { timeout: 120_000 });

  return outputPath;
}

/**
 * Convert audio file to WebM using ffmpeg.
 * Returns the path to the converted file.
 */
async function convertToWebm(inputPath: string, outputDir: string): Promise<string> {
  const outputPath = join(outputDir, "converted.webm");

  await execFileAsync("ffmpeg", [
    "-y",
    "-i", inputPath,
    "-ar", "16000",
    "-ac", "1",
    "-c:a", "libopus",
    outputPath,
  ], { timeout: 120_000 });

  return outputPath;
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
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/wave",
      "audio/x-wav",
      "audio/mp4",
      "audio/m4a",
      "audio/ogg",
      "audio/flac",
      "audio/x-flac",
      "audio/webm",
    ];
    const validExtensions = [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm"];
    const fileName = audioFile.name.toLowerCase();
    const ext = fileName.substring(fileName.lastIndexOf("."));

    if (!validTypes.includes(audioFile.type) && !validExtensions.includes(ext)) {
      return NextResponse.json(
        {
          success: false,
          error: `Неподдерживаемый формат файла: ${ext || audioFile.type}. Поддерживаются: MP3, WAV, M4A, FLAC, OGG, WebM`,
        },
        { status: 400 }
      );
    }

    // Check file size (max 100MB)
    const fileSizeMB = audioFile.size / (1024 * 1024);
    if (fileSizeMB > 100) {
      return NextResponse.json(
        {
          success: false,
          error: `Файл слишком большой: ${fileSizeMB.toFixed(1)} МБ. Максимум 100 МБ`,
        },
        { status: 400 }
      );
    }

    // Create temp directory and save the uploaded file
    tempDir = await mkdtemp(join(tmpdir(), "vox-decoder-"));
    const inputPath = join(tempDir, audioFile.name);
    const arrayBuffer = await audioFile.arrayBuffer();
    await writeFile(inputPath, Buffer.from(arrayBuffer));

    // Determine if conversion is needed
    // ASR SDK supports WAV and WebM natively
    const needsConversion = ext !== ".wav" && ext !== ".webm";

    let finalAudioPath: string;

    if (needsConversion) {
      console.log(`[VOX DECODER] Converting ${ext} → WAV for ASR...`);
      finalAudioPath = await convertToWav(inputPath, tempDir);
      console.log(`[VOX DECODER] Conversion complete`);
    } else {
      finalAudioPath = inputPath;
    }

    // Read the (possibly converted) file and encode to base64
    const audioBuffer = await readFile(finalAudioPath);
    const base64Audio = audioBuffer.toString("base64");

    // Transcribe using ASR SDK
    const zai = await getZAI();
    const startTime = Date.now();

    console.log(`[VOX DECODER] Sending to ASR (${(audioBuffer.length / 1024).toFixed(1)} KB)...`);

    const response = await zai.audio.asr.create({
      file_base64: base64Audio,
    });

    const processingTime = Date.now() - startTime;
    console.log(`[VOX DECODER] ASR done in ${processingTime}ms`);

    if (!response.text || response.text.trim().length === 0) {
      return NextResponse.json({
        success: true,
        transcription: "",
        wordCount: 0,
        processingTime,
        fileName: audioFile.name,
        fileSize: audioFile.size,
        message: "Речь не обнаружена в аудиофайле",
      });
    }

    // Post-process the text
    const cleanedText = response.text
      .replace(/\s+/g, " ")
      .trim()
      .replace(/(^\w|[.!?]\s+\w)/g, (match) => match.toUpperCase());

    return NextResponse.json({
      success: true,
      transcription: cleanedText,
      rawTranscription: response.text,
      wordCount: cleanedText.split(/\s+/).filter(Boolean).length,
      charCount: cleanedText.length,
      processingTime,
      fileName: audioFile.name,
      fileSize: audioFile.size,
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
    // Clean up temp directory
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}