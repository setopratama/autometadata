// Zero-Dependency JPEG Parser & Injector

import { parseTiff, serializeTiff } from './exif.js';
import { parseIptc, serializeIptc, parsePhotoshop8BIM, serializePhotoshop8BIM } from './iptc.js';
import { parseXmp, serializeXmp } from './xmp.js';

export function parseJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
    throw new Error('Not a valid JPEG image (missing SOI marker 0xFFD8)');
  }

  let offset = 2;
  const segments = [];
  let width = 0;
  let height = 0;

  let exifModel = null;
  let iptcModel = null;
  let xmpModel = null;
  let rawPhotoshopResources = [];

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xFF) {
      offset++;
      continue;
    }

    const marker = buffer[offset + 1];
    offset += 2;

    // Standalone markers
    if (marker === 0xD9 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      if (marker === 0xD9) break; // EOI
      continue;
    }

    // Start of Scan (compressed image data follows until EOI)
    if (marker === 0xDA) {
      const sosLen = buffer.readUInt16BE(offset);
      const sosHeader = buffer.subarray(offset, offset + sosLen);
      const entropyData = buffer.subarray(offset + sosLen);
      segments.push({ marker: 0xDA, data: sosHeader, entropy: entropyData });
      break;
    }

    if (offset + 2 > buffer.length) break;
    const len = buffer.readUInt16BE(offset);
    const segData = buffer.subarray(offset + 2, offset + len);
    offset += len;

    // Check SOF markers for dimensions (SOF0, SOF1, SOF2)
    if ([0xC0, 0xC1, 0xC2].includes(marker) && segData.length >= 5) {
      height = segData.readUInt16BE(1);
      width = segData.readUInt16BE(3);
    }

    // APP1 Exif
    if (marker === 0xE1 && segData.subarray(0, 6).toString('ascii') === 'Exif\0\0') {
      const tiffBuf = segData.subarray(6);
      exifModel = parseTiff(tiffBuf);
    }

    // APP1 XMP
    if (marker === 0xE1 && segData.subarray(0, 29).toString('ascii') === 'http://ns.adobe.com/xap/1.0/\0') {
      const xmpStr = segData.subarray(29).toString('utf8');
      xmpModel = parseXmp(xmpStr);
    }

    // APP13 Photoshop 3.0 IPTC
    if (marker === 0xED && segData.subarray(0, 14).toString('ascii') === 'Photoshop 3.0\0') {
      const psData = segData.subarray(14);
      rawPhotoshopResources = parsePhotoshop8BIM(psData);
      const iptcResource = rawPhotoshopResources.find(r => r.id === 0x0404);
      if (iptcResource) {
        iptcModel = parseIptc(iptcResource.data);
      }
    }

    segments.push({ marker, data: segData });
  }

  // Combined metadata view
  const title = iptcModel?.title || exifModel?.title || xmpModel?.title || '';
  const description = iptcModel?.description || exifModel?.description || xmpModel?.description || '';
  const keywords = (iptcModel?.keywords?.length ? iptcModel.keywords : (exifModel?.keywords?.length ? exifModel.keywords : xmpModel?.keywords)) || [];
  const author = iptcModel?.author || exifModel?.author || xmpModel?.author || '';

  return {
    format: 'jpg',
    width,
    height,
    dimensions: width && height ? `${width} x ${height}` : 'Unknown',
    endian: exifModel?.endian || 'II',
    exif: exifModel,
    iptc: iptcModel,
    xmp: xmpModel,
    rawPhotoshopResources,
    metadata: {
      title,
      description,
      keywords,
      author
    },
    segments
  };
}

export function injectJpegMetadata(buffer, edits = {}) {
  const parsed = parseJpeg(buffer);
  const outSegments = [];

  // Helper create segment buffer
  const makeSegment = (marker, dataBuffer) => {
    const len = 2 + dataBuffer.length;
    const header = Buffer.alloc(4);
    header[0] = 0xFF;
    header[1] = marker;
    header.writeUInt16BE(len, 2);
    return Buffer.concat([header, dataBuffer]);
  };

  // 1. Serialize EXIF
  const tiffData = serializeTiff(parsed.exif, edits);
  const exifHeader = Buffer.from('Exif\0\0', 'ascii');
  const exifSegData = Buffer.concat([exifHeader, tiffData]);

  // 2. Serialize IPTC & 8BIM
  const iptcData = serializeIptc(edits);
  let updated8BIM = parsed.rawPhotoshopResources.filter(r => r.id !== 0x0404);
  updated8BIM.push({
    id: 0x0404,
    name: 'IPTC-NAA',
    data: iptcData
  });
  const serialized8BIM = serializePhotoshop8BIM(updated8BIM);
  const psHeader = Buffer.from('Photoshop 3.0\0', 'ascii');
  const iptcSegData = Buffer.concat([psHeader, serialized8BIM]);

  // 3. Serialize XMP
  const xmpString = serializeXmp(edits);
  const xmpHeader = Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'ascii');
  const xmpSegData = Buffer.concat([xmpHeader, Buffer.from(xmpString, 'utf8')]);

  // Push SOI
  outSegments.push(Buffer.from([0xFF, 0xD8]));

  // Injeksi segmen metadata di urutan terdepan
  outSegments.push(makeSegment(0xE1, exifSegData)); // APP1 Exif
  outSegments.push(makeSegment(0xED, iptcSegData)); // APP13 Photoshop
  outSegments.push(makeSegment(0xE1, xmpSegData));  // APP1 XMP

  // Salin sisa segmen lama (kecuali Exif, IPTC, XMP lama yang digantikan)
  for (const seg of parsed.segments) {
    // Skip old APP1 Exif
    if (seg.marker === 0xE1 && seg.data.subarray(0, 6).toString('ascii') === 'Exif\0\0') continue;
    // Skip old APP1 XMP
    if (seg.marker === 0xE1 && seg.data.subarray(0, 29).toString('ascii') === 'http://ns.adobe.com/xap/1.0/\0') continue;
    // Skip old APP13 Photoshop
    if (seg.marker === 0xED && seg.data.subarray(0, 14).toString('ascii') === 'Photoshop 3.0\0') continue;

    if (seg.marker === 0xDA) {
      // SOS header and entropy data
      const len = 2 + seg.data.length;
      const h = Buffer.alloc(4);
      h[0] = 0xFF;
      h[1] = 0xDA;
      h.writeUInt16BE(len, 2);
      outSegments.push(h, seg.data, seg.entropy);
    } else {
      outSegments.push(makeSegment(seg.marker, seg.data));
    }
  }

  return Buffer.concat(outSegments);
}
