// Zero-Dependency SVG Metadata Parser & Injector

import { parseXmp, serializeXmp } from './xmp.js';

export function parseSvg(svgContent) {
  const content = typeof svgContent === 'string' ? svgContent : svgContent.toString('utf8');

  let title = '';
  let description = '';
  let keywords = [];
  let author = '';

  // Extract <title>
  const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) title = titleMatch[1].trim();

  // Extract <desc>
  const descMatch = content.match(/<desc[^>]*>([\s\S]*?)<\/desc>/i);
  if (descMatch) description = descMatch[1].trim();

  // Extract <metadata>
  const metadataMatch = content.match(/<metadata[^>]*>([\s\S]*?)<\/metadata>/i);
  if (metadataMatch) {
    const xmpData = parseXmp(metadataMatch[1]);
    if (!title && xmpData.title) title = xmpData.title;
    if (!description && xmpData.description) description = xmpData.description;
    if (xmpData.keywords?.length) keywords = xmpData.keywords;
    if (xmpData.author) author = xmpData.author;
  }

  // Extract dimensions
  let width = 0;
  let height = 0;
  const wMatch = content.match(/width="([0-9.]+)(px)?"/i);
  const hMatch = content.match(/height="([0-9.]+)(px)?"/i);
  if (wMatch) width = parseFloat(wMatch[1]);
  if (hMatch) height = parseFloat(hMatch[1]);

  return {
    format: 'svg',
    width,
    height,
    dimensions: width && height ? `${width} x ${height}` : 'Vector Scalable',
    endian: 'UTF-8 XML',
    metadata: {
      title,
      description,
      keywords,
      author
    }
  };
}

export function injectSvgMetadata(svgContent, edits = {}) {
  let content = typeof svgContent === 'string' ? svgContent : svgContent.toString('utf8');

  const title = edits.title || '';
  const description = edits.description || '';
  const keywords = edits.keywords || [];
  const author = edits.author || '';

  // Remove existing <title>, <desc>, <metadata>
  content = content.replace(/<title[^>]*>[\s\S]*?<\/title>\s*/gi, '');
  content = content.replace(/<desc[^>]*>[\s\S]*?<\/desc>\s*/gi, '');
  content = content.replace(/<metadata[^>]*>[\s\S]*?<\/metadata>\s*/gi, '');

  const xmpXml = serializeXmp({ title, description, keywords, author });

  const metadataBlock = `
  <title>${escapeXml(title)}</title>
  <desc>${escapeXml(description)}</desc>
  <metadata>
${xmpXml}
  </metadata>
`;

  // Insert right after opening <svg ...> tag
  const svgTagMatch = content.match(/<svg[^>]*>/i);
  if (svgTagMatch) {
    const insertPos = svgTagMatch.index + svgTagMatch[0].length;
    content = content.slice(0, insertPos) + metadataBlock + content.slice(insertPos);
  } else {
    content = metadataBlock + content;
  }

  return Buffer.from(content, 'utf8');
}

function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
