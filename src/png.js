// Zero-Dependency PNG Parser & Serializer with pure CRC32

import { parseTiff, serializeTiff } from './exif.js';
import { parseXmp, serializeXmp } from './xmp.js';

// Precomputed CRC32 Table for PNG
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c;
}

export function crc32(typeBuffer, dataBuffer) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < typeBuffer.length; i++) {
    crc = CRC_TABLE[(crc ^ typeBuffer[i]) & 0xFF] ^ (crc >>> 8);
  }
  for (let i = 0; i < dataBuffer.length; i++) {
    crc = CRC_TABLE[(crc ^ dataBuffer[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

export function parsePng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a valid PNG file (signature mismatch)');
  }

  const chunks = [];
  let offset = 8;
  let width = 0;
  let height = 0;

  let exifModel = null;
  let xmpModel = null;
  const textEntries = {};

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd + 4 > buffer.length) break;

    const data = buffer.subarray(dataStart, dataEnd);
    const crc = buffer.readUInt32BE(dataEnd);
    offset = dataEnd + 4;

    if (type === 'IHDR' && data.length >= 8) {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'eXIf') {
      exifModel = parseTiff(data);
    } else if (type === 'tEXt') {
      const nullIdx = data.indexOf(0);
      if (nullIdx > 0) {
        const key = data.subarray(0, nullIdx).toString('ascii');
        const val = data.subarray(nullIdx + 1).toString('latin1');
        textEntries[key] = val;
      }
    } else if (type === 'iTXt') {
      const nullIdx = data.indexOf(0);
      if (nullIdx > 0) {
        const key = data.subarray(0, nullIdx).toString('ascii');
        // iTXt format: keyword(0) + compFlag(1) + compMethod(1) + lang(0) + transKey(0) + text
        let cur = nullIdx + 3;
        // Skip lang tag
        while (cur < data.length && data[cur] !== 0) cur++;
        cur++; // skip null
        // Skip translated keyword
        while (cur < data.length && data[cur] !== 0) cur++;
        cur++; // skip null

        if (cur <= data.length) {
          const text = data.subarray(cur).toString('utf8');
          textEntries[key] = text;
          if (key === 'XML:com.adobe.xmp') {
            xmpModel = parseXmp(text);
          }
        }
      }
    }

    chunks.push({ type, data, length, crc });
  }

  // Combined metadata view
  const title = textEntries['Title'] || exifModel?.title || xmpModel?.title || '';
  const description = textEntries['Description'] || textEntries['Comment'] || exifModel?.description || xmpModel?.description || '';
  let keywords = [];
  if (textEntries['Keywords']) {
    keywords = textEntries['Keywords'].split(/[,;]/).map(k => k.trim()).filter(Boolean);
  } else if (exifModel?.keywords?.length) {
    keywords = exifModel.keywords;
  } else if (xmpModel?.keywords?.length) {
    keywords = xmpModel.keywords;
  }
  const author = textEntries['Author'] || textEntries['Artist'] || exifModel?.author || xmpModel?.author || '';

  return {
    format: 'png',
    width,
    height,
    dimensions: width && height ? `${width} x ${height}` : 'Unknown',
    endian: exifModel?.endian || 'II',
    exif: exifModel,
    xmp: xmpModel,
    textEntries,
    metadata: {
      title,
      description,
      keywords,
      author
    },
    chunks
  };
}

export function injectPngMetadata(buffer, edits = {}) {
  const parsed = parsePng(buffer);
  const outChunks = [];

  // Helper create PNG chunk buffer
  const makeChunk = (typeStr, dataBuf) => {
    const typeBuf = Buffer.from(typeStr, 'ascii');
    const chunkBuf = Buffer.alloc(4 + 4 + dataBuf.length + 4);
    chunkBuf.writeUInt32BE(dataBuf.length, 0);
    typeBuf.copy(chunkBuf, 4);
    dataBuf.copy(chunkBuf, 8);
    const chunkCrc = crc32(typeBuf, dataBuf);
    chunkBuf.writeUInt32BE(chunkCrc, 8 + dataBuf.length);
    return chunkBuf;
  };

  // Helper make iTXt chunk
  const makeITXtChunk = (key, text) => {
    const keyBuf = Buffer.from(key, 'ascii');
    const textBuf = Buffer.from(text, 'utf8');
    const dataBuf = Buffer.concat([
      keyBuf,
      Buffer.from([0, 0, 0]), // null + uncompressed (flag 0, method 0)
      Buffer.from([0, 0]),    // empty lang + null + empty transKey + null
      textBuf
    ]);
    return makeChunk('iTXt', dataBuf);
  };

  const title = edits.title || parsed.metadata.title || '';
  const description = edits.description || parsed.metadata.description || '';
  const keywords = edits.keywords || parsed.metadata.keywords || [];
  const author = edits.author || parsed.metadata.author || '';

  // 1. Serialize eXIf chunk
  const tiffData = serializeTiff(parsed.exif, edits);
  const exifChunk = makeChunk('eXIf', tiffData);

  // 2. Serialize XMP iTXt chunk
  const xmpXml = serializeXmp(edits);
  const xmpChunk = makeITXtChunk('XML:com.adobe.xmp', xmpXml);

  // 3. Serialize standard PNG text chunks
  const textChunks = [];
  if (title) textChunks.push(makeITXtChunk('Title', title));
  if (description) textChunks.push(makeITXtChunk('Description', description));
  if (keywords.length > 0) textChunks.push(makeITXtChunk('Keywords', keywords.join(', ')));
  if (author) textChunks.push(makeITXtChunk('Author', author));

  let inserted = false;

  for (const chunk of parsed.chunks) {
    // Skip old metadata chunks that are being replaced
    if (['eXIf'].includes(chunk.type)) continue;
    if (chunk.type === 'tEXt' || chunk.type === 'iTXt') {
      const nullIdx = chunk.data.indexOf(0);
      if (nullIdx > 0) {
        const key = chunk.data.subarray(0, nullIdx).toString('ascii');
        if (['Title', 'Description', 'Comment', 'Keywords', 'Author', 'Artist', 'XML:com.adobe.xmp'].includes(key)) {
          continue;
        }
      }
    }

    outChunks.push(makeChunk(chunk.type, chunk.data));

    // Inject our new metadata chunks right after IHDR
    if (chunk.type === 'IHDR' && !inserted) {
      outChunks.push(exifChunk);
      outChunks.push(xmpChunk);
      for (const tc of textChunks) {
        outChunks.push(tc);
      }
      inserted = true;
    }
  }

  return Buffer.concat([PNG_SIGNATURE, ...outChunks]);
}
