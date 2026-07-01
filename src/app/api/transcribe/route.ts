import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

// Cache for SDK instance
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

export async function POST(request: NextRequest) {
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

    // Convert to base64
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString("base64");

    // Transcribe using ASR SDK
    const zai = await getZAI();
    const startTime = Date.now();

    const response = await zai.audio.asr.create({
      file_base64: base64Audio,
    });

    const processingTime = Date.now() - startTime;

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
  }
}