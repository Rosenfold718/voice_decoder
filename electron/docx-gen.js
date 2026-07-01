/**
 * Minimal DOCX generator — zero external dependencies.
 * Creates a valid .docx (ZIP of XML files) using only Node.js Buffer.
 */

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

function createZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const c = crc32(data);
    const sz = data.length;

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);   // version
    local.writeUInt16LE(0, 6);    // flags
    local.writeUInt16LE(0, 8);    // compression: stored
    local.writeUInt16LE(0, 10);   // mod time
    local.writeUInt16LE(0, 12);   // mod date
    local.writeUInt32LE(c, 14);   // crc32
    local.writeUInt32LE(sz, 18);  // compressed size
    local.writeUInt32LE(sz, 22);  // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);   // extra field length
    nameBuf.copy(local, 30);
    locals.push(local, data);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt32LE(c, 16);
    central.writeUInt32LE(sz, 20);
    central.writeUInt32LE(sz, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt32LE(0, 36);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);

    offset += local.length + sz;
  }

  const centralOff = offset;
  const centralSz = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt32LE(centralSz, 12);
  eocd.writeUInt32LE(centralOff, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, ...centrals, eocd]);
}

function escXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generate a .docx buffer with Russian formatting:
 * - Times New Roman 14pt, justified, 1cm first-line indent
 * - Title, metadata, separator, body paragraphs
 */
function generateDocx(text, fileName) {
  const now = new Date();
  const dateStr = now.toLocaleString("ru-RU", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(Boolean);

  // Font run properties for body text (Times New Roman 14pt, with Cyrillic support)
  const bodyRPr = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="ru-RU"/></w:rPr>`;

  const bodyXml = paragraphs
    .map(p => `<w:p><w:pPr><w:jc w:val="both"/><w:ind w:firstLine="567"/><w:spacing w:after="200" w:line="360"/></w:pPr><w:r>${bodyRPr}<w:t xml:space="preserve">${escXml(p)}</w:t></w:r></w:p>`)
    .join("\n");

  // Font run properties for title (18pt bold)
  const titleRPr = `<w:rPr><w:b/><w:bCs/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="36"/><w:szCs w:val="36"/><w:lang w:val="ru-RU"/></w:rPr>`;

  // Font run properties for metadata (11pt italic gray)
  const metaRPr = `<w:rPr><w:i/><w:iCs/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="666666"/><w:lang w:val="ru-RU"/></w:rPr>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr><w:r>${titleRPr}<w:t>Расшифровка аудиозаписи</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="100"/></w:pPr><w:r>${metaRPr}<w:t>Файл: ${escXml(fileName || "transcription")}</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="400"/></w:pPr><w:r>${metaRPr}<w:t>Дата обработки: ${escXml(dateStr)}</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="400"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="CCCCCC"/><w:lang w:val="ru-RU"/></w:rPr><w:t>${"\u2500".repeat(60)}</w:t></w:r></w:p>
${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/>
      <w:pgNumType w:start="1"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  return createZip([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
    { name: "word/document.xml", data: Buffer.from(documentXml, "utf8") },
  ]);
}

module.exports = { generateDocx };