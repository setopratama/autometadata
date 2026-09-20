// Zero-Dependency Adobe XMP Dublin Core Parser & Serializer

function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(str = '') {
  return String(str)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function parseXmp(xmlString) {
  const result = {
    title: '',
    description: '',
    keywords: [],
    author: ''
  };

  if (!xmlString || typeof xmlString !== 'string') return result;

  // 1. Match dc:title
  const titleMatch = xmlString.match(/<dc:title[^>]*>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>[\s\S]*?<\/dc:title>/i);
  if (titleMatch) {
    result.title = unescapeXml(titleMatch[1].trim());
  }

  // 2. Match dc:description
  const descMatch = xmlString.match(/<dc:description[^>]*>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>[\s\S]*?<\/dc:description>/i);
  if (descMatch) {
    result.description = unescapeXml(descMatch[1].trim());
  }

  // 3. Match dc:subject (Bag of keywords)
  const subjectMatch = xmlString.match(/<dc:subject[^>]*>([\s\S]*?)<\/dc:subject>/i);
  if (subjectMatch) {
    const liRegex = /<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/gi;
    let match;
    while ((match = liRegex.exec(subjectMatch[1])) !== null) {
      const kw = unescapeXml(match[1].trim());
      if (kw && !result.keywords.includes(kw)) {
        result.keywords.push(kw);
      }
    }
  }

  // 4. Match dc:creator
  const creatorMatch = xmlString.match(/<dc:creator[^>]*>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>[\s\S]*?<\/dc:creator>/i);
  if (creatorMatch) {
    result.author = unescapeXml(creatorMatch[1].trim());
  }

  return result;
}

export function serializeXmp(data = {}) {
  const title = data.title ? escapeXml(data.title) : '';
  const description = data.description ? escapeXml(data.description) : '';
  const keywords = Array.isArray(data.keywords) ? data.keywords : [];
  const author = data.author ? escapeXml(data.author) : '';

  const keywordsXml = keywords
    .filter(k => k && k.trim())
    .map(k => `        <rdf:li>${escapeXml(k.trim())}</rdf:li>`)
    .join('\n');

  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="imgmeta-seo zero-dependency">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">
      ${title ? `<dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${title}</rdf:li>
        </rdf:Alt>
      </dc:title>` : ''}
      ${description ? `<dc:description>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${description}</rdf:li>
        </rdf:Alt>
      </dc:description>` : ''}
      ${keywords.length > 0 ? `<dc:subject>
        <rdf:Bag>
${keywordsXml}
        </rdf:Bag>
      </dc:subject>` : ''}
      ${author ? `<dc:creator>
        <rdf:Seq>
          <rdf:li>${author}</rdf:li>
        </rdf:Seq>
      </dc:creator>` : ''}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}
