/**
 * Bulletproof DOCX generator — zero external dependencies.
 * Uses DEFLATE compression (standard for .docx) and a complete
 * OOXML structure that works in Word, WordPad, Google Docs, LibreOffice.
 */

const zlib = require("zlib");

function crc32(buf) {
  let crc = 0xffffffff;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function deflateSync(data) {
  // DEFLATE with max compression — produces standard ZIP-compatible data
  return zlib.deflateRawSync(data, { level: 9 });
}

function createZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const uncompressed = data;
    const compressed = deflateSync(uncompressed);
    const crc = crc32(uncompressed);
    const uncompSize = uncompressed.length;
    const compSize = compressed.length;

    // Local file header (30 bytes + name + extra)
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);  // signature
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0, 6);            // flags
    local.writeUInt16LE(8, 8);            // compression: DEFLATE
    local.writeUInt16LE(0, 10);           // mod time
    local.writeUInt16LE(0, 12);           // mod date
    local.writeUInt32LE(crc, 14);         // crc32
    local.writeUInt32LE(compSize, 18);    // compressed size
    local.writeUInt32LE(uncompSize, 22);  // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // extra field length
    nameBuf.copy(local, 30);
    locals.push(local, compressed);

    // Central directory entry (46 bytes + name + extra + comment)
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0); // signature
    central.writeUInt16LE(20, 4);         // version made by
    central.writeUInt16LE(20, 6);         // version needed
    central.writeUInt16LE(0, 8);          // flags
    central.writeUInt16LE(8, 10);         // compression: DEFLATE
    central.writeUInt16LE(0, 12);         // mod time
    central.writeUInt16LE(0, 14);         // mod date
    central.writeUInt32LE(crc, 16);       // crc32
    central.writeUInt32LE(compSize, 20);  // compressed size
    central.writeUInt32LE(uncompSize, 24);// uncompressed size
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);         // extra field length
    central.writeUInt16LE(0, 32);         // file comment length
    central.writeUInt16LE(0, 34);         // disk number
    central.writeUInt16LE(0, 36);         // internal attrs
    central.writeUInt32LE(0, 38);         // external attrs
    central.writeUInt32LE(offset, 42);    // offset of local header
    nameBuf.copy(central, 46);
    centrals.push(central);

    offset += local.length + compSize;
  }

  const centralOff = offset;
  const centralSz = centrals.reduce((s, c) => s + c.length, 0);

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);              // disk number
  eocd.writeUInt16LE(0, 6);              // central dir disk
  eocd.writeUInt16LE(files.length, 8);   // entries on this disk
  eocd.writeUInt32LE(centralSz, 12);     // central dir size
  eocd.writeUInt32LE(centralOff, 16);    // central dir offset
  eocd.writeUInt16LE(0, 20);             // comment length

  return Buffer.concat([...locals, ...centrals, eocd]);
}

function escXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Remove control characters that break XML (keep \n, \r, \t) */
function sanitize(s) {
  return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

/**
 * Generate a .docx buffer.
 * - Times New Roman 14pt, justified, 1cm first-line indent
 * - Title, metadata, separator, body paragraphs
 */
function generateDocx(text, fileName) {
  const now = new Date();
  const dateStr = now.toLocaleString("ru-RU", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const cleanText = sanitize(text || "");
  const paragraphs = cleanText.split(/\n+/).map(p => p.trim()).filter(Boolean);

  // --- word/document.xml ---
  const bodyParas = paragraphs
    .map(p => `      <w:p w:rsidR="00000000" w:rsidRDefault="00000000">
        <w:pPr>
          <w:jc w:val="both"/>
          <w:ind w:firstLine="567"/>
          <w:spacing w:after="200"/>
          <w:rPr>
            <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
            <w:sz w:val="28"/>
            <w:szCs w:val="28"/>
          </w:rPr>
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
            <w:sz w:val="28"/>
            <w:szCs w:val="28"/>
          </w:rPr>
          <w:t xml:space="preserve">${escXml(p)}</w:t>
        </w:r>
      </w:p>`)
    .join("\n");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" mc:Ignorable="w14 w15 wp14">
  <w:body>
    <w:p w:rsidR="00000000" w:rsidRDefault="00000000">
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:after="200"/>
        <w:rPr>
          <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
          <w:b/>
          <w:bCs/>
          <w:sz w:val="36"/>
          <w:szCs w:val="36"/>
        </w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
          <w:b/>
          <w:bCs/>
          <w:sz w:val="36"/>
          <w:szCs w:val="36"/>
        </w:rPr>
        <w:t>Расшифровка аудиозаписи</w:t>
      </w:r>
    </w:p>
    <w:p w:rsidR="00000000" w:rsidRDefault="00000000">
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:after="100"/>
        <w:rPr>
          <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
          <w:sz w:val="22"/>
          <w:szCs w:val="22"/>
        </w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
          <w:i/>
          <w:iCs/>
          <w:sz w:val="22"/>
          <w:szCs w:val="22"/>
        </w:rPr>
        <w:t>Файл: ${escXml(fileName || "transcription")}</w:t>
      </w:r>
    </w:p>
    <w:p w:rsidR="00000000" w:rsidRDefault="00000000">
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:after="400"/>
        <w:rPr>
          <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
          <w:sz w:val="22"/>
          <w:szCs w:val="22"/>
        </w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
          <w:i/>
          <w:iCs/>
          <w:sz w:val="22"/>
          <w:szCs w:val="22"/>
        </w:rPr>
        <w:t>Дата обработки: ${escXml(dateStr)}</w:t>
      </w:r>
    </w:p>
${bodyParas}
    <w:sectPr w:rsidR="00000000">
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  // --- [Content_Types].xml ---
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  // --- _rels/.rels ---
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  // --- word/_rels/document.xml.rels ---
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  return createZip([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
    { name: "word/_rels/document.xml.rels", data: Buffer.from(docRels, "utf8") },
    { name: "word/document.xml", data: Buffer.from(documentXml, "utf8") },
  ]);
}

module.exports = { generateDocx };