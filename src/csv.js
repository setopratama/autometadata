// Zero-Dependency Shutterstock CSV Metadata Serializer (RFC 4180 Compliant)

import path from 'node:path';

/**
 * Escape a CSV field cell according to RFC 4180 rules.
 * @param {string|number|boolean} value
 * @returns {string} Escaped CSV cell string
 */
export function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);

  // If cell contains double quotes, commas, or newlines, enclose in quotes and escape internal quotes
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate standard Shutterstock Contributor CSV metadata file string.
 * Official Schema: Filename,Description,Keywords,Categories,Illustration,Mature Content,Editorial
 * 
 * @param {Array<Object>} files List of file objects
 * @returns {string} CSV formatted string ready for file output or HTTP download
 */
export function generateShutterstockCsv(files = []) {
  const headers = ['Filename', 'Description', 'Keywords', 'Categories', 'Illustration', 'Mature Content', 'Editorial'];
  const rows = [headers.join(',')];

  for (const item of files) {
    const fileName = item.name || item.fileName || (item.filePath ? path.basename(item.filePath) : 'untitled.jpg');
    const ext = path.extname(fileName).toLowerCase().replace('.', '');
    const format = item.format || ext;

    const title = item.seo?.title || item.title || '';
    const description = item.seo?.description || item.description || title;
    
    let keywordsList = [];
    if (Array.isArray(item.seo?.keywords)) {
      keywordsList = item.seo.keywords;
    } else if (Array.isArray(item.keywords)) {
      keywordsList = item.keywords;
    } else if (typeof item.keywords === 'string') {
      keywordsList = item.keywords.split(',').map(k => k.trim()).filter(Boolean);
    }

    let categoriesList = [];
    if (Array.isArray(item.seo?.categories)) {
      categoriesList = item.seo.categories;
    } else if (Array.isArray(item.categories)) {
      categoriesList = item.categories;
    } else if (Array.isArray(item.seo_categories)) {
      categoriesList = item.seo_categories;
    } else if (typeof item.categories === 'string' && item.categories) {
      try {
        const parsed = JSON.parse(item.categories);
        categoriesList = Array.isArray(parsed) ? parsed : [item.categories];
      } catch (e) {
        categoriesList = item.categories.split(',').map(c => c.trim()).filter(Boolean);
      }
    } else if (typeof item.seo_categories === 'string' && item.seo_categories) {
      try {
        const parsed = JSON.parse(item.seo_categories);
        categoriesList = Array.isArray(parsed) ? parsed : [item.seo_categories];
      } catch (e) {
        categoriesList = item.seo_categories.split(',').map(c => c.trim()).filter(Boolean);
      }
    }

    const keywordsStr = keywordsList.join(', ');
    const categoriesStr = categoriesList.join(', ');
    const isIllustration = ['svg', 'eps'].includes(format.toLowerCase()) ? 'Yes' : 'No';
    const isMature = item.mature ? 'Yes' : 'No';
    const isEditorial = item.editorial ? 'Yes' : 'No';

    const row = [
      escapeCsvCell(fileName),
      escapeCsvCell(description),
      escapeCsvCell(keywordsStr),
      escapeCsvCell(categoriesStr),
      escapeCsvCell(isIllustration),
      escapeCsvCell(isMature),
      escapeCsvCell(isEditorial)
    ];

    rows.push(row.join(','));
  }

  return rows.join('\r\n');
}
