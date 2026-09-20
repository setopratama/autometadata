// Zero-Dependency TIFF / EXIF Parser & Serializer

// TIFF Type Sizes
const TYPE_SIZES = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL (2x LONG)
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8 // SRATIONAL
};

export const EXIF_TAGS = {
  ImageDescription: 0x010E,
  Make: 0x010F,
  Model: 0x0110,
  Orientation: 0x0112,
  Software: 0x0131,
  DateTime: 0x0132,
  Artist: 0x013B,
  XPTitle: 0x9C9B,
  XPComment: 0x9C9C,
  XPAuthor: 0x9C9D,
  XPKeywords: 0x9C9E,
  ExifIFDPointer: 0x8769,
  GPSInfoIFDPointer: 0x8825,
  JPEGInterchangeFormat: 0x0201,      // Thumbnail offset
  JPEGInterchangeFormatLength: 0x0202 // Thumbnail length
};

export function parseTiff(buffer, offset = 0) {
  if (buffer.length < offset + 8) return null;

  const endianStr = buffer.toString('ascii', offset, offset + 2);
  const isLittle = endianStr === 'II';
  if (!isLittle && endianStr !== 'MM') return null;

  const readU16 = (pos) => isLittle ? buffer.readUInt16LE(offset + pos) : buffer.readUInt16BE(offset + pos);
  const readU32 = (pos) => isLittle ? buffer.readUInt32LE(offset + pos) : buffer.readUInt32BE(offset + pos);

  const magic = readU16(2);
  if (magic !== 42) return null;

  const firstIfdOffset = readU32(4);

  const parseIfd = (ifdOffset) => {
    if (ifdOffset === 0 || ifdOffset >= buffer.length - offset) return { entries: [], nextIfdOffset: 0 };
    const numEntries = readU16(ifdOffset);
    const entries = [];
    let cur = ifdOffset + 2;

    for (let i = 0; i < numEntries; i++) {
      if (cur + 12 > buffer.length - offset) break;
      const tag = readU16(cur);
      const type = readU16(cur + 2);
      const count = readU32(cur + 4);
      const valueOrOffset = readU32(cur + 8);
      const totalSize = (TYPE_SIZES[type] || 1) * count;

      let valueBuffer;
      if (totalSize <= 4) {
        valueBuffer = buffer.subarray(offset + cur + 8, offset + cur + 8 + totalSize);
      } else {
        const valOffset = valueOrOffset;
        if (offset + valOffset + totalSize <= buffer.length) {
          valueBuffer = buffer.subarray(offset + valOffset, offset + valOffset + totalSize);
        } else {
          valueBuffer = Buffer.alloc(0);
        }
      }

      entries.push({ tag, type, count, valueBuffer, valueOrOffset });
      cur += 12;
    }

    const nextIfdOffset = cur + 4 <= buffer.length - offset ? readU32(cur) : 0;
    return { entries, nextIfdOffset };
  };

  const ifd0 = parseIfd(firstIfdOffset);
  let ifd1 = null;
  if (ifd0.nextIfdOffset > 0) {
    ifd1 = parseIfd(ifd0.nextIfdOffset);
  }

  // Extract human values from IFD0
  const metadata = {
    endian: isLittle ? 'II' : 'MM',
    rawEntries: ifd0.entries,
    ifd1: ifd1,
    title: '',
    description: '',
    keywords: [],
    author: ''
  };

  for (const e of ifd0.entries) {
    if (e.tag === EXIF_TAGS.ImageDescription && e.type === 2) {
      metadata.description = e.valueBuffer.toString('utf8').replace(/\0+$/, '');
    } else if (e.tag === EXIF_TAGS.XPTitle) {
      metadata.title = e.valueBuffer.toString('utf16le').replace(/\0+$/, '');
    } else if (e.tag === EXIF_TAGS.XPKeywords) {
      const raw = e.valueBuffer.toString('utf16le').replace(/\0+$/, '');
      metadata.keywords = raw ? raw.split(';').map(k => k.trim()).filter(Boolean) : [];
    } else if (e.tag === EXIF_TAGS.XPAuthor || e.tag === EXIF_TAGS.Artist) {
      metadata.author = e.valueBuffer.toString(e.tag === EXIF_TAGS.XPAuthor ? 'utf16le' : 'utf8').replace(/\0+$/, '');
    }
  }

  return metadata;
}

export function serializeTiff(model, edits = {}) {
  const isLittle = model?.endian !== 'MM'; // Default II
  const entries = [];
  const existingEntries = model?.rawEntries ? [...model.rawEntries] : [];

  const title = edits.title !== undefined ? edits.title : (model?.title || '');
  const description = edits.description !== undefined ? edits.description : (model?.description || '');
  const keywords = edits.keywords !== undefined ? edits.keywords : (model?.keywords || []);
  const author = edits.author !== undefined ? edits.author : (model?.author || '');

  // Filter out overwritten tags from existing
  const targetTags = new Set([
    EXIF_TAGS.ImageDescription,
    EXIF_TAGS.XPTitle,
    EXIF_TAGS.XPKeywords,
    EXIF_TAGS.XPComment,
    EXIF_TAGS.XPAuthor
  ]);

  for (const entry of existingEntries) {
    if (!targetTags.has(entry.tag)) {
      entries.push(entry);
    }
  }

  // Helper encode UCS-2 / UTF-16LE with null terminator
  const encodeUcs2 = (str) => {
    const buf = Buffer.from(str + '\0', 'utf16le');
    return buf;
  };

  // Helper encode ASCII with null terminator
  const encodeAscii = (str) => {
    return Buffer.from(str + '\0', 'utf8');
  };

  if (description) {
    const descBuf = encodeAscii(description);
    entries.push({ tag: EXIF_TAGS.ImageDescription, type: 2, count: descBuf.length, valueBuffer: descBuf });
  }

  if (title) {
    const titleBuf = encodeUcs2(title);
    entries.push({ tag: EXIF_TAGS.XPTitle, type: 1, count: titleBuf.length, valueBuffer: titleBuf });
  }

  if (keywords && keywords.length > 0) {
    const kwStr = keywords.join(';');
    const kwBuf = encodeUcs2(kwStr);
    entries.push({ tag: EXIF_TAGS.XPKeywords, type: 1, count: kwBuf.length, valueBuffer: kwBuf });
  }

  if (author) {
    const authorBuf = encodeUcs2(author);
    entries.push({ tag: EXIF_TAGS.XPAuthor, type: 1, count: authorBuf.length, valueBuffer: authorBuf });
  }

  // Wajib urutan tag menaik berdasarkan spesifikasi TIFF 6.0
  entries.sort((a, b) => a.tag - b.tag);

  // Layout calculation
  // Header: 8 bytes
  // IFD0: 2 + entries.length * 12 + 4
  const ifd0Offset = 8;
  const ifd0Size = 2 + (entries.length * 12) + 4;
  let dataOffset = ifd0Offset + ifd0Size;

  const outParts = [];
  const ifdBuffer = Buffer.alloc(ifd0Size);
  let ifdPos = 0;

  const writeU16 = (val, buf, pos) => isLittle ? buf.writeUInt16LE(val, pos) : buf.writeUInt16BE(val, pos);
  const writeU32 = (val, buf, pos) => isLittle ? buf.writeUInt32LE(val, pos) : buf.writeUInt32BE(val, pos);

  writeU16(entries.length, ifdBuffer, ifdPos);
  ifdPos += 2;

  const dataBuffers = [];

  for (const e of entries) {
    writeU16(e.tag, ifdBuffer, ifdPos);
    writeU16(e.type, ifdBuffer, ifdPos + 2);
    writeU32(e.count, ifdBuffer, ifdPos + 4);

    const buf = e.valueBuffer;
    if (buf.length <= 4) {
      buf.copy(ifdBuffer, ifdPos + 8);
      // Pad to 4 bytes
      if (buf.length < 4) {
        ifdBuffer.fill(0, ifdPos + 8 + buf.length, ifdPos + 12);
      }
    } else {
      writeU32(dataOffset, ifdBuffer, ifdPos + 8);
      dataBuffers.push(buf);
      dataOffset += buf.length;
      // Align 2 bytes
      if (dataOffset % 2 !== 0) {
        dataBuffers.push(Buffer.alloc(1));
        dataOffset += 1;
      }
    }
    ifdPos += 12;
  }

  // Next IFD Offset (0 for no IFD1)
  writeU32(0, ifdBuffer, ifdPos);

  // Assemble full TIFF buffer
  const headerBuf = Buffer.alloc(8);
  headerBuf.write(isLittle ? 'II' : 'MM', 0, 2, 'ascii');
  writeU16(42, headerBuf, 2);
  writeU32(ifd0Offset, headerBuf, 4);

  return Buffer.concat([headerBuf, ifdBuffer, ...dataBuffers]);
}
