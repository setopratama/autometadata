// Zero-Dependency IPTC IIM Parser & Serializer in Photoshop 3.0 8BIM

export const IPTC_TAGS = {
  RECORD_ENV: 1,
  RECORD_APP: 2,
  
  // Record 1
  CodedCharacterSet: 0x5A, // ESC % G -> UTF-8

  // Record 2
  ObjectName: 0x05,        // Title
  Keywords: 0x19,          // Tags / Keywords (repeated)
  Caption: 0x78,           // Description / Caption
  Byline: 0x50             // Creator / Author
};

export function parseIptc(buffer) {
  const result = {
    title: '',
    description: '',
    keywords: [],
    author: '',
    charset: 'utf8'
  };

  let offset = 0;
  while (offset < buffer.length - 5) {
    if (buffer[offset] !== 0x1C) {
      offset++;
      continue;
    }

    const record = buffer[offset + 1];
    const dataset = buffer[offset + 2];
    const size = buffer.readUInt16BE(offset + 3);
    offset += 5;

    if (offset + size > buffer.length) break;

    const valBuf = buffer.subarray(offset, offset + size);
    offset += size;

    if (record === 1 && dataset === IPTC_TAGS.CodedCharacterSet) {
      if (valBuf.toString('ascii') === '\x1b%G') {
        result.charset = 'utf8';
      }
    } else if (record === 2) {
      if (dataset === IPTC_TAGS.ObjectName) {
        result.title = valBuf.toString('utf8');
      } else if (dataset === IPTC_TAGS.Caption) {
        result.description = valBuf.toString('utf8');
      } else if (dataset === IPTC_TAGS.Keywords) {
        const kw = valBuf.toString('utf8').trim();
        if (kw && !result.keywords.includes(kw)) {
          result.keywords.push(kw);
        }
      } else if (dataset === IPTC_TAGS.Byline) {
        result.author = valBuf.toString('utf8');
      }
    }
  }

  return result;
}

export function serializeIptc(data = {}) {
  const parts = [];

  // Helper write dataset tag
  const writeDataset = (record, dataset, valBuffer) => {
    const header = Buffer.alloc(5);
    header[0] = 0x1C; // Tag marker
    header[1] = record;
    header[2] = dataset;
    header.writeUInt16BE(valBuffer.length, 3);
    parts.push(header, valBuffer);
  };

  // 1. Always declare UTF-8 charset (Record 1, Dataset 0x5A -> ESC % G)
  const utf8Sequence = Buffer.from([0x1B, 0x25, 0x47]); // ESC % G
  writeDataset(1, IPTC_TAGS.CodedCharacterSet, utf8Sequence);

  // 2. ObjectName (Title)
  if (data.title) {
    writeDataset(2, IPTC_TAGS.ObjectName, Buffer.from(data.title, 'utf8'));
  }

  // 3. Keywords (Repeated dataset 0x19)
  if (Array.isArray(data.keywords)) {
    for (const kw of data.keywords) {
      if (kw && kw.trim()) {
        writeDataset(2, IPTC_TAGS.Keywords, Buffer.from(kw.trim(), 'utf8'));
      }
    }
  }

  // 4. Caption (Description)
  if (data.description) {
    writeDataset(2, IPTC_TAGS.Caption, Buffer.from(data.description, 'utf8'));
  }

  // 5. Byline (Author)
  if (data.author) {
    writeDataset(2, IPTC_TAGS.Byline, Buffer.from(data.author, 'utf8'));
  }

  return Buffer.concat(parts);
}

// Photoshop 3.0 8BIM Resource Block Parser & Serializer
export function parsePhotoshop8BIM(buffer) {
  const resources = [];
  let offset = 0;

  while (offset + 12 <= buffer.length) {
    const signature = buffer.toString('ascii', offset, offset + 4);
    if (signature !== '8BIM') break;

    const id = buffer.readUInt16BE(offset + 4);
    const nameLen = buffer[offset + 6];
    let nameEnd = offset + 7 + nameLen;
    if (nameEnd % 2 !== 0) nameEnd += 1; // 2-byte padded

    if (nameEnd + 4 > buffer.length) break;
    const dataSize = buffer.readUInt32BE(nameEnd);
    const dataStart = nameEnd + 4;
    let dataEnd = dataStart + dataSize;
    if (dataEnd % 2 !== 0) dataEnd += 1; // 2-byte padded

    if (dataStart + dataSize > buffer.length) break;

    const rawData = buffer.subarray(dataStart, dataStart + dataSize);
    resources.push({
      id,
      name: buffer.toString('ascii', offset + 7, offset + 7 + nameLen),
      data: rawData
    });

    offset = dataEnd;
  }

  return resources;
}

export function serializePhotoshop8BIM(resources) {
  const parts = [];

  for (const res of resources) {
    const nameBuf = Buffer.from(res.name || '', 'ascii');
    let nameBlockLen = 1 + nameBuf.length;
    if (nameBlockLen % 2 !== 0) nameBlockLen += 1;

    const header = Buffer.alloc(4 + 2 + nameBlockLen + 4);
    header.write('8BIM', 0, 4, 'ascii');
    header.writeUInt16BE(res.id, 4);
    header[6] = nameBuf.length;
    nameBuf.copy(header, 7);

    header.writeUInt32BE(res.data.length, 6 + nameBlockLen);
    parts.push(header, res.data);

    if (res.data.length % 2 !== 0) {
      parts.push(Buffer.alloc(1)); // Padding byte
    }
  }

  return Buffer.concat(parts);
}
