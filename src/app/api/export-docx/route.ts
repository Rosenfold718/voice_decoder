import { NextRequest, NextResponse } from "next/server";
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
} from "docx";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, fileName } = body as {
      text: string;
      fileName?: string;
    };

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Нет текста для экспорта" },
        { status: 400 }
      );
    }

    const docFileName = fileName || "transcription";
    const timestamp = new Date().toLocaleString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Split text into paragraphs
    const paragraphs = text
      .split(/\n+/)
      .map((p: string) => p.trim())
      .filter(Boolean);

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: "Times New Roman",
              size: 28, // 14pt
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1134, // 2cm
                right: 1134,
                bottom: 1134,
                left: 1701, // 3cm
              },
            },
          },
          children: [
            // Title
            new Paragraph({
              children: [
                new TextRun({
                  text: "Расшифровка аудиозаписи",
                  bold: true,
                  size: 36, // 18pt
                  font: "Times New Roman",
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
            }),

            // Metadata line
            new Paragraph({
              children: [
                new TextRun({
                  text: `Файл: ${docFileName}`,
                  italics: true,
                  size: 22, // 11pt
                  color: "666666",
                  font: "Times New Roman",
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 100 },
            }),

            // Timestamp
            new Paragraph({
              children: [
                new TextRun({
                  text: `Дата обработки: ${timestamp}`,
                  italics: true,
                  size: 22,
                  color: "666666",
                  font: "Times New Roman",
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),

            // Separator
            new Paragraph({
              children: [
                new TextRun({
                  text: "─".repeat(60),
                  color: "CCCCCC",
                  size: 22,
                  font: "Times New Roman",
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),

            // Transcription text paragraphs
            ...paragraphs.map(
              (para: string) =>
                new Paragraph({
                  children: [
                    new TextRun({
                      text: para,
                      size: 28, // 14pt
                      font: "Times New Roman",
                    }),
                  ],
                  spacing: { after: 200, line: 360 },
                  alignment: AlignmentType.JUSTIFIED,
                  indent: { firstLine: 567 }, // 1cm indent
                })
            ),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(docFileName.replace(/\.[^.]+$/, ""))}_расшифровка.docx"`,
      },
    });
  } catch (error) {
    console.error("DOCX export error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Произошла ошибка при создании документа",
      },
      { status: 500 }
    );
  }
}