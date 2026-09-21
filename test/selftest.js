// Self-Test Round-Trip Suite for IMGMETA-SEO (Zero-Dependency)

import assert from 'node:assert/strict';
import { parseTiff, serializeTiff } from '../src/exif.js';
import { parseIptc, serializeIptc, parsePhotoshop8BIM, serializePhotoshop8BIM } from '../src/iptc.js';
import { parseXmp, serializeXmp } from '../src/xmp.js';
import { parseJpeg, injectJpegMetadata } from '../src/jpeg.js';
import { parsePng, injectPngMetadata, crc32 } from '../src/png.js';
import { parseSvg, injectSvgMetadata } from '../src/svg.js';
import { parseEps, injectEpsMetadata } from '../src/eps.js';
import { validateSeoOutput } from '../src/seo.js';
import { colors } from '../src/utils.js';

export async function runSelfTests() {
  console.log(`\n${colors.bold}=== IMGMETA-SEO Internal Round-Trip Self-Test ===${colors.reset}\n`);

  let passed = 0;
  let total = 0;

  const test = (name, fn) => {
    total++;
    try {
      fn();
      console.log(`  ${colors.green}✓ PASS:${colors.reset} ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ${colors.red}✗ FAIL:${colors.reset} ${name}`);
      console.error(`    ${colors.red}${err.message}${colors.reset}`);
    }
  };

  // ── TEST 1: TIFF / EXIF Round-Trip ──
  test('EXIF IFD0 TIFF Serialization & Endianness Round-Trip', () => {
    const edits = {
      title: 'Minimalist Architecture Facade',
      description: 'Clean geometric lines and shadows in daylight.',
      keywords: ['architecture', 'concrete', 'minimalist', 'modern'],
      author: 'Stock Studio Pro'
    };

    // 1. Little-Endian (II)
    const tiffBufLittle = serializeTiff({ endian: 'II' }, edits);
    const parsedLittle = parseTiff(tiffBufLittle);
    assert.equal(parsedLittle.endian, 'II');
    assert.equal(parsedLittle.title, edits.title);
    assert.equal(parsedLittle.description, edits.description);
    assert.deepEqual(parsedLittle.keywords, edits.keywords);
    assert.equal(parsedLittle.author, edits.author);

    // 2. Ascending tag ordering check
    for (let i = 0; i < parsedLittle.rawEntries.length - 1; i++) {
      assert(parsedLittle.rawEntries[i].tag <= parsedLittle.rawEntries[i + 1].tag, 'Tags must be in ascending order');
    }
  });

  // ── TEST 2: IPTC IIM & 8BIM Round-Trip ──
  test('IPTC IIM & Photoshop 3.0 8BIM (UTF-8) Round-Trip', () => {
    const iptcEdits = {
      title: 'Urban Sunset Skyline',
      description: 'Dramatic cityscape during golden hour sunset.',
      keywords: ['skyline', 'sunset', 'city', 'urban', 'golden hour'],
      author: 'Microstock Creator'
    };

    const iptcBuf = serializeIptc(iptcEdits);
    const parsedIptc = parseIptc(iptcBuf);

    assert.equal(parsedIptc.title, iptcEdits.title);
    assert.equal(parsedIptc.description, iptcEdits.description);
    assert.deepEqual(parsedIptc.keywords, iptcEdits.keywords);
    assert.equal(parsedIptc.author, iptcEdits.author);
    assert.equal(parsedIptc.charset, 'utf8');

    // 8BIM preservation
    const resources = [
      { id: 0x0404, name: 'IPTC-NAA', data: iptcBuf },
      { id: 0x0405, name: 'ResolutionInfo', data: Buffer.from([0x00, 0x48, 0x00, 0x00]) }
    ];
    const psBuf = serializePhotoshop8BIM(resources);
    const parsedPs = parsePhotoshop8BIM(psBuf);
    assert.equal(parsedPs.length, 2);
    assert.equal(parsedPs.find(r => r.id === 0x0405).name, 'ResolutionInfo');
  });

  // ── TEST 3: Adobe XMP Dublin Core Round-Trip ──
  test('Adobe XMP Dublin Core (dc:title, dc:subject, dc:description) Round-Trip', () => {
    const xmpData = {
      title: 'Espresso Coffee Beans Macro',
      description: 'Close up roasted dark coffee beans texture.',
      keywords: ['coffee', 'espresso', 'beans', 'macro', 'roasted'],
      author: 'Artisan Photography'
    };

    const xmpXml = serializeXmp(xmpData);
    const parsed = parseXmp(xmpXml);

    assert.equal(parsed.title, xmpData.title);
    assert.equal(parsed.description, xmpData.description);
    assert.deepEqual(parsed.keywords, xmpData.keywords);
    assert.equal(parsed.author, xmpData.author);
  });

  // ── TEST 4: JPEG Segment Injection Round-Trip ──
  test('JPEG 3-Layer Synchronized Metadata Injection Round-Trip', () => {
    // Synthesize valid minimal JPEG
    const rawJpeg = Buffer.from([
      0xFF, 0xD8,                         // SOI
      0xFF, 0xC0, 0x00, 0x11,             // SOF0 (len 17)
      0x08, 0x01, 0x80, 0x02, 0x00, 0x03, // 8-bit, 384h, 512w, 3 components
      0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xFF, 0xDA, 0x00, 0x08,             // SOS (len 8)
      0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, // components
      0xAA, 0xBB, 0xCC,                   // Dummy entropy data
      0xFF, 0xD9                          // EOI
    ]);

    const edits = {
      title: 'Minimalist Architecture JPEG',
      description: 'Tested JPEG 3-layer sync description.',
      keywords: ['jpeg', 'test', 'microstock', 'sync']
    };

    const injected = injectJpegMetadata(rawJpeg, edits);
    const parsed = parseJpeg(injected);

    assert.equal(parsed.dimensions, '512 x 384');
    assert.equal(parsed.metadata.title, edits.title);
    assert.equal(parsed.metadata.description, edits.description);
    assert.deepEqual(parsed.metadata.keywords, edits.keywords);
  });

  // ── TEST 5: PNG Chunk & CRC32 Injection Round-Trip ──
  test('PNG Chunk Injection & Manual CRC32 Round-Trip', () => {
    // Synthesize valid minimal PNG
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const ihdrData = Buffer.from([
      0x00, 0x00, 0x01, 0x00, // width 256
      0x00, 0x00, 0x01, 0x00, // height 256
      0x08, 0x06, 0x00, 0x00, 0x00 // 8bit RGBA
    ]);
    const ihdrType = Buffer.from('IHDR', 'ascii');
    const ihdrCrc = crc32(ihdrType, ihdrData);
    const ihdrChunk = Buffer.alloc(12 + ihdrData.length);
    ihdrChunk.writeUInt32BE(ihdrData.length, 0);
    ihdrType.copy(ihdrChunk, 4);
    ihdrData.copy(ihdrChunk, 8);
    ihdrChunk.writeUInt32BE(ihdrCrc, 8 + ihdrData.length);

    const iendType = Buffer.from('IEND', 'ascii');
    const iendCrc = crc32(iendType, Buffer.alloc(0));
    const iendChunk = Buffer.alloc(12);
    iendChunk.writeUInt32BE(0, 0);
    iendType.copy(iendChunk, 4);
    iendChunk.writeUInt32BE(iendCrc, 8);

    const rawPng = Buffer.concat([pngSignature, ihdrChunk, iendChunk]);

    const edits = {
      title: 'PNG Stock Asset',
      description: 'High resolution PNG with transparency.',
      keywords: ['png', 'isolated', 'transparent', 'asset']
    };

    const injected = injectPngMetadata(rawPng, edits);
    const parsed = parsePng(injected);

    assert.equal(parsed.dimensions, '256 x 256');
    assert.equal(parsed.metadata.title, edits.title);
    assert.equal(parsed.metadata.description, edits.description);
    assert.deepEqual(parsed.metadata.keywords, edits.keywords);
  });

  // ── TEST 6: SVG & EPS Vector Round-Trip ──
  test('SVG & EPS Metadata Injection Round-Trip', () => {
    // SVG
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="red"/></svg>';
    const svgEdits = {
      title: 'Vector Chart Infographic',
      description: 'Clean vector illustration for corporate presentations.',
      keywords: ['vector', 'chart', 'infographic', 'business']
    };
    const injectedSvg = injectSvgMetadata(rawSvg, svgEdits);
    const parsedSvg = parseSvg(injectedSvg);
    assert.equal(parsedSvg.metadata.title, svgEdits.title);
    assert.equal(parsedSvg.metadata.description, svgEdits.description);
    assert.deepEqual(parsedSvg.metadata.keywords, svgEdits.keywords);

    // EPS
    const rawEps = '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 500 500\n%%EndComments\nshowpage\n%%EOF\n';
    const epsEdits = {
      title: 'EPS Business Template',
      author: 'Vector Master',
      keywords: ['template', 'eps', 'vector', 'design']
    };
    const injectedEps = injectEpsMetadata(Buffer.from(rawEps, 'latin1'), epsEdits);
    const parsedEps = parseEps(injectedEps);
    assert.equal(parsedEps.metadata.title, epsEdits.title);
    assert.equal(parsedEps.metadata.author, epsEdits.author);
    assert.deepEqual(parsedEps.metadata.keywords, epsEdits.keywords);
  });

  // ── TEST 7: SEO Output Strict Validation & 26 Categories ──
  test('SEO Output Validation & Trademark Filter', () => {
    const rawLLMOutput = {
      title: 'Freshly Roasted Dark Espresso Coffee Beans Macro Texture Shot with Warm Ambient Lighting and Natural Copy Space for Commercial Gourmet Cafe Advertising and Design Concept Visual Art Background Texture Presentation',
      description: 'A professional commercial image for marketing.',
      categories: ['Food and drink', 'Backgrounds/Textures', 'Invalid Category'],
      keywords: ['canon', 'nikon', 'architecture', 'modern', 'apple', 'building', 'concrete', 'structure']
    };

    const validated = validateSeoOutput(rawLLMOutput);
    assert(validated.title.length <= 200, 'Title must not exceed 200 chars');
    assert.deepEqual(validated.categories, ['Food and drink', 'Backgrounds/Textures']);
    assert(!validated.keywords.includes('canon'), 'Forbidden brand "canon" must be stripped');
    assert(!validated.keywords.includes('nikon'), 'Forbidden brand "nikon" must be stripped');
    assert(!validated.keywords.includes('apple'), 'Forbidden brand "apple" must be stripped');
    assert(validated.keywords.includes('architecture'), 'Valid keywords must remain');
  });

  // ── TEST 8: SEO Title Sanitization & Filename Auto-Rename ──
  test('SEO Filename Sanitization & Collision Safety', () => {
    import('../src/utils.js').then(({ sanitizeFilename }) => {
      const rawTitle = 'Minimalist Architecture: Facade / Concrete & Glass <Special> "Edition"!';
      const cleanName = sanitizeFilename(rawTitle, '.jpg');
      assert.equal(cleanName, 'minimalist architecture facade concrete glass special edition.jpg');
      assert(!cleanName.includes(':'));
      assert(!cleanName.includes('/'));
      assert(!cleanName.includes('<'));
      assert(!cleanName.includes('"'));
      assert(!cleanName.includes('!'));
    });
  });

  // ── TEST 9: Shutterstock CSV Serializer & RFC 4180 Escaping ──
  test('Shutterstock CSV Metadata Serializer & RFC 4180 Formatting', () => {
    import('../src/csv.js').then(({ generateShutterstockCsv, escapeCsvCell }) => {
      // Cell escaping
      assert.equal(escapeCsvCell('simple'), 'simple');
      assert.equal(escapeCsvCell('hello, world'), '"hello, world"');
      assert.equal(escapeCsvCell('say "hello"'), '"say ""hello"""');

      const files = [
        {
          name: 'photo_1.jpg',
          title: 'Vibrant Tropical Leaf',
          description: 'A "vibrant" green leaf, with copy space.',
          categories: ['Nature', 'Backgrounds/Textures'],
          keywords: ['leaf', 'tropical', 'green, fresh', 'nature'],
          format: 'jpg'
        },
        {
          name: 'vector_1.svg',
          title: 'Corporate Infographic Vector',
          description: 'Clean business graphic presentation chart.',
          categories: ['Business/Finance'],
          keywords: ['vector', 'chart', 'business'],
          format: 'svg'
        }
      ];

      const csv = generateShutterstockCsv(files);
      const lines = csv.split('\r\n');

      assert.equal(lines[0], 'Filename,Description,Keywords,Categories,Illustration,Mature Content,Editorial');
      assert(lines[1].includes('photo_1.jpg'));
      assert(lines[1].includes('"A ""vibrant"" green leaf, with copy space."'));
      assert(lines[1].includes('"leaf, tropical, green, fresh, nature"'));
      assert(lines[1].includes('"Nature, Backgrounds/Textures"'));
      assert(lines[1].endsWith(',No,No,No'));

      assert(lines[2].includes('vector_1.svg'));
      assert(lines[2].includes('Business/Finance'));
      assert(lines[2].endsWith(',Yes,No,No')); // Illustration = Yes for SVG
    });
  });

  // ── TEST 10: 26 Shutterstock Categories Validation & Fallback ──
  test('26 Official Shutterstock Categories Validation & Smart Fallback', () => {
    const rawWithCategory = {
      title: 'Espresso Coffee Beans Macro',
      description: 'Close up roasted dark coffee beans texture.',
      categories: ['Food and drink', 'INVALID CATEGORY'],
      keywords: ['coffee', 'espresso', 'beans']
    };
    const validated = validateSeoOutput(rawWithCategory);
    assert.deepEqual(validated.categories, ['Food and drink']);

    const rawEmptyCategory = {
      title: 'Vibrant Banana Leaf Against Blue Sky',
      description: 'Tropical green banana leaf under bright sunlight.',
      categories: [],
      keywords: ['leaf', 'banana', 'tropical', 'nature']
    };
    const validatedFallback = validateSeoOutput(rawEmptyCategory);
    assert(validatedFallback.categories.length > 0 && validatedFallback.categories.length <= 2);
    assert(validatedFallback.categories.includes('Nature') || validatedFallback.categories.includes('Backgrounds/Textures'));
  });

  // ── TEST 11: Plural & Stemming Keyword Deduplication ──
  test('Plural & Stemming Keyword Deduplication (Shutterstock Best Practice)', () => {
    import('../src/seo.js').then(({ getWordStem, hasStemCollision }) => {
      assert.equal(getWordStem('dogs'), 'dog');
      assert.equal(getWordStem('doggy'), 'dog');
      assert.equal(getWordStem('categories'), 'category');

      const cleanList = ['dog', 'cat', 'shiba inu'];
      assert.equal(hasStemCollision(cleanList, 'dogs'), true);
      assert.equal(hasStemCollision(cleanList, 'doggy'), true);
      assert.equal(hasStemCollision(cleanList, 'cats'), true);
      assert.equal(hasStemCollision(cleanList, 'bird'), false);

      const rawWithPlurals = {
        title: 'Shiba Inu Dog Playing in Garden',
        description: 'Happy Shiba Inu dog running outdoors.',
        keywords: ['dog', 'dogs', 'doggy', 'dogged', 'cat', 'cats', 'shiba inu', 'flower', 'flowers', 'garden']
      };

      const validated = validateSeoOutput(rawWithPlurals);
      assert(!validated.keywords.includes('dogs'), 'Plural "dogs" must be deduplicated');
      assert(!validated.keywords.includes('cats'), 'Plural "cats" must be deduplicated');
      assert(!validated.keywords.includes('flowers'), 'Plural "flowers" must be deduplicated');
      assert(validated.keywords.includes('dog'), 'Singular "dog" must be kept');
      assert(validated.keywords.includes('cat'), 'Singular "cat" must be kept');
      assert(validated.keywords.includes('flower'), 'Singular "flower" must be kept');
    });
  });

  // ── TEST 12: Description Keyword List Detection & Keyword Count Range ──
  test('Description Keyword List Auto-Fix & 7-50 Keyword Range Enforcement', () => {
    const rawDotList = {
      title: 'Minimalist Architecture Facade',
      description: 'Pattern. Background. Dogs. Flowers. Concrete.',
      keywords: ['architecture', 'minimalist', 'concrete', 'facade']
    };
    const validated = validateSeoOutput(rawDotList);
    assert(!validated.description.startsWith('Pattern. Background.'), 'Dot keyword list description must be converted to sentence');
    assert(validated.description.includes('Minimalist Architecture Facade'), 'Fixed description must contain title context');
    assert(validated.keywords.length >= 7 && validated.keywords.length <= 50, 'Keywords count must be between 7 and 50');
  });

  console.log(`\n${passed === total ? colors.green : colors.red}Hasil: ${passed} dari ${total} pengujian lulus.${colors.reset}\n`);
  if (passed === total) {
    console.log(`${colors.green}${colors.bold}Semua pengujian lulus.${colors.reset}\n`);
  } else {
    process.exitCode = 1;
  }
}

// Allow direct execution: node test/selftest.js
if (process.argv[1]?.endsWith('selftest.js')) {
  runSelfTests();
}
