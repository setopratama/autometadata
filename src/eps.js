// Zero-Dependency EPS Metadata Parser & Injector

import { parseXmp, serializeXmp } from './xmp.js';

export function parseEps(buffer) {
  const content = buffer.toString('latin1');

  let title = '';
  let keywords = [];
  let author = '';
  let description = '';

  const titleMatch = content.match(/%%Title:\s*([^\r\n]+)/i);
  if (titleMatch) title = titleMatch[1].trim();

  const creatorMatch = content.match(/%%Creator:\s*([^\r\n]+)/i);
  if (creatorMatch) author = creatorMatch[1].trim();

  const kwMatch = content.match(/%%Keywords:\s*([^\r\n]+)/i);
  if (kwMatch) {
    keywords = kwMatch[1].split(/[,;]/).map(k => k.trim()).filter(Boolean);
  }

  // Extract XMP if embedded in EPS
  const xmpMatch = content.match(/<\?xpacket begin=[\s\S]*?<\?xpacket end="[rw]"\?>/i);
  if (xmpMatch) {
    const xmpData = parseXmp(xmpMatch[0]);
    if (!title && xmpData.title) title = xmpData.title;
    if (!description && xmpData.description) description = xmpData.description;
    if (xmpData.keywords?.length) keywords = xmpData.keywords;
  }

  return {
    format: 'eps',
    dimensions: 'Vector EPS Postscript',
    endian: 'ASCII PostScript',
    metadata: {
      title,
      description,
      keywords,
      author
    }
  };
}

export function injectEpsMetadata(buffer, edits = {}) {
  let content = buffer.toString('latin1');

  const title = edits.title || '';
  const author = edits.author || '';
  const keywords = edits.keywords || [];
  const description = edits.description || '';

  // Update DSC header comments
  if (title) {
    if (content.includes('%%Title:')) {
      content = content.replace(/%%Title:\s*[^\r\n]+/i, `%%Title: ${title}`);
    } else {
      content = content.replace(/%!PS-Adobe[^\r\n]*\r?\n/, `$&%%Title: ${title}\n`);
    }
  }

  if (author) {
    if (content.includes('%%Creator:')) {
      content = content.replace(/%%Creator:\s*[^\r\n]+/i, `%%Creator: ${author}`);
    } else {
      content = content.replace(/%!PS-Adobe[^\r\n]*\r?\n/, `$&%%Creator: ${author}\n`);
    }
  }

  if (keywords.length > 0) {
    const kwStr = keywords.join(', ');
    if (content.includes('%%Keywords:')) {
      content = content.replace(/%%Keywords:\s*[^\r\n]+/i, `%%Keywords: ${kwStr}`);
    } else {
      content = content.replace(/%!PS-Adobe[^\r\n]*\r?\n/, `$&%%Keywords: ${kwStr}\n`);
    }
  }

  // Embed or update XMP block
  const xmpXml = serializeXmp({ title, description, keywords, author });
  if (content.includes('<?xpacket begin=')) {
    content = content.replace(/<\?xpacket begin=[\s\S]*?<\?xpacket end="[rw]"\?>/i, xmpXml);
  } else {
    // Append XMP before EOF
    content = content + `\n% Begin XMP Packet\n${xmpXml}\n% End XMP Packet\n`;
  }

  return Buffer.from(content, 'latin1');
}
