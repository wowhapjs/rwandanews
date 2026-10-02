import * as XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import { db } from '../db/database.js';
import { ArticleRecord, EventRecord } from '../db/types.js';
import { ContentBlock } from '../sources/types.js';
import { eventService } from './events.js';
import { deduplicationService } from './dedup.js';

export interface ImportPreviewResult {
  totalArticles: number;
  koCount: number;
  enCount: number;
  rwCount: number;
  eventCandidatesCount: number;
  tagsCount: number;
  relationsCount: number;
  errors: string[];
  warnings: string[];
  validArticleIds: string[];
}

export interface MultiImportPreviewResult {
  totalFiles: number;
  totalArticles: number;
  koCount: number;
  enCount: number;
  rwCount: number;
  eventCandidatesCount: number;
  tagsCount: number;
  relationsCount: number;
  errors: string[];
  warnings: string[];
  fileSummaries: { filename: string; totalArticles: number; validCount: number; status: string; errors: string[] }[];
}

export interface MultiImportCommitResult {
  success: boolean;
  totalFiles: number;
  importedCount: number;
  relationsCount: number;
  errors: string[];
  fileSummaries: { filename: string; importedCount: number; status: string }[];
}

/**
 * Excel stores at most 32,767 characters in a single cell. We deliberately
 * stay below the hard limit to avoid SheetJS / Excel UTF-16 edge cases.
 */
const EXCEL_CELL_SAFE_LIMIT = 30_000;
const EXCEL_TRUNCATION_SUFFIX = '\n[SEE CHUNK SHEET FOR FULL TEXT]';

/** Split text WITHOUT losing characters. */
function splitExcelText(
  value: string | null | undefined,
  maxLength: number = EXCEL_CELL_SAFE_LIMIT
): string[] {
  const text = value || '';
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let offset = 0;

  while (offset < text.length) {
    const remaining = text.length - offset;
    if (remaining <= maxLength) {
      chunks.push(text.slice(offset));
      break;
    }

    const hardEnd = offset + maxLength;
    const minPreferred = offset + Math.floor(maxLength * 0.60);

    let splitAt = text.lastIndexOf('\n\n', hardEnd);
    if (splitAt >= minPreferred) {
      splitAt += 2;
    } else {
      splitAt = text.lastIndexOf('\n', hardEnd);
      if (splitAt >= minPreferred) {
        splitAt += 1;
      } else {
        splitAt = text.lastIndexOf(' ', hardEnd);
        if (splitAt >= minPreferred) {
          splitAt += 1;
        } else {
          splitAt = hardEnd;
        }
      }
    }

    if (splitAt <= offset) splitAt = hardEnd;
    chunks.push(text.slice(offset, splitAt));
    offset = splitAt;
  }

  return chunks.length > 0 ? chunks : [''];
}

function safeExcelCellText(
  value: unknown,
  maxLength: number = EXCEL_CELL_SAFE_LIMIT
): unknown {
  if (typeof value !== 'string') return value;
  if (value.length <= maxLength) return value;

  const keep = Math.max(0, maxLength - EXCEL_TRUNCATION_SUFFIX.length);
  return value.slice(0, keep) + EXCEL_TRUNCATION_SUFFIX;
}

/**
 * Last-resort workbook-wide guard. No generated XLSX reaches XLSX.write()
 * with a string cell above the safe limit.
 */
function sanitizeWorkbookCells(wb: XLSX.WorkBook): number {
  let changed = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    for (const address of Object.keys(ws)) {
      if (address.startsWith('!')) continue;

      const cell = ws[address] as XLSX.CellObject | undefined;
      if (!cell || typeof cell.v !== 'string') continue;

      if (cell.v.length > EXCEL_CELL_SAFE_LIMIT) {
        cell.v = safeExcelCellText(cell.v) as string;
        delete (cell as any).w;
        delete (cell as any).h;
        changed++;
      }
    }
  }

  return changed;
}

function appendChunkRows(
  target: any[],
  articleId: string,
  language: string,
  fieldName: string,
  text: string | null | undefined,
  scope: string = 'SOURCE'
): number {
  const chunks = splitExcelText(text);

  for (let i = 0; i < chunks.length; i++) {
    target.push({
      article_id: articleId,
      scope,
      language,
      field_name: fieldName,
      chunk_index: i + 1,
      chunk_total: chunks.length,
      text: chunks[i]
    });
  }

  return chunks.length;
}

function readOutputBodyChunks(wb: XLSX.WorkBook): Map<string, string> {
  const sheet = wb.Sheets['OUTPUT_BODY_CHUNKS'];
  const result = new Map<string, string>();
  if (!sheet) return result;

  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const grouped = new Map<string, { index: number; text: string }[]>();

  for (const row of rows) {
    const articleId = String(row.article_id || '').trim();
    const language = String(row.language || '').trim().toLowerCase();
    const fieldName = String(row.field_name || '').trim();
    const text = String(row.text || '');
    if (!articleId || !language || !fieldName || !text) continue;

    const key = `${articleId}|${language}|${fieldName}`;
    const items = grouped.get(key) || [];
    items.push({
      index: Math.max(1, Number(row.chunk_index) || 1),
      text
    });
    grouped.set(key, items);
  }

  for (const [key, items] of grouped.entries()) {
    items.sort((a, b) => a.index - b.index);
    result.set(key, items.map(item => item.text).join(''));
  }

  return result;
}

function getChunkedOutputBody(
  chunks: Map<string, string>,
  articleId: string,
  language: 'ko' | 'en' | 'rw',
  fieldNames: string[]
): string {
  for (const fieldName of fieldNames) {
    const value = chunks.get(`${articleId}|${language}|${fieldName}`);
    if (value && value.trim().length > 0) return value;
  }
  return '';
}

function convertTextToParagraphBlocks(text: string, existingBlocks?: ContentBlock[]): ContentBlock[] {
  if (!text) return existingBlocks || [];
  const rawParagraphs = text
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (rawParagraphs.length === 0) return existingBlocks || [];

  const blocks: ContentBlock[] = [];
  let blockIndex = 1;
  const imageBlocks = (existingBlocks || []).filter(b => b.type === 'image' && b.url);
  let imageIdx = 0;

  for (let i = 0; i < rawParagraphs.length; i++) {
    const p = rawParagraphs[i];
    if (p.startsWith('#')) {
      const match = p.match(/^(#+)\s*(.*)$/);
      if (match) {
        blocks.push({
          blockId: `BLK-H-${Date.now().toString(36)}-${blockIndex++}`,
          type: 'heading',
          text: match[2] || p,
          headingLevel: Math.min(match[1].length, 6)
        });
        continue;
      }
    }

    blocks.push({
      blockId: `BLK-P-${Date.now().toString(36)}-${blockIndex++}`,
      type: 'paragraph',
      text: p
    });
    // Place an image block after every 2-3 paragraphs if present
    if ((i + 1) % 3 === 0 && imageIdx < imageBlocks.length) {
      blocks.push(imageBlocks[imageIdx++]);
    }
  }

  while (imageIdx < imageBlocks.length) {
    blocks.push(imageBlocks[imageIdx++]);
  }

  return blocks;
}

function createZipBuffer(entries: { name: string; buffer: Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const zip = new AdmZip();

      for (const entry of entries) {
        // addFile stores the already-generated XLSX buffer as-is.
        // This avoids archiver ESM/CommonJS interop issues entirely.
        zip.addFile(entry.name, entry.buffer);
      }

      const buffer = zip.toBuffer();
      resolve(buffer);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Extracts all Excel files (.xlsx, .xls) from uploaded files,
 * automatically decompressing any .zip archive containing workbooks.
 */
export function extractExcelFilesFromUploads(files: { filename: string; buffer: Buffer }[]): { filename: string; buffer: Buffer }[] {
  const result: { filename: string; buffer: Buffer }[] = [];
  for (const f of files) {
    const lower = f.filename.toLowerCase();
    if (lower.endsWith('.zip')) {
      try {
        const zip = new AdmZip(f.buffer);
        const entries = zip.getEntries();
        for (const entry of entries) {
          const entryName = entry.entryName;
          const entryLower = entryName.toLowerCase();
          if (
            !entry.isDirectory &&
            (entryLower.endsWith('.xlsx') || entryLower.endsWith('.xls')) &&
            !entryName.includes('__MACOSX') &&
            !entryName.split('/').pop()?.startsWith('.')
          ) {
            result.push({
              filename: entryName.split('/').pop() || entryName,
              buffer: entry.getData()
            });
          }
        }
      } catch (err: any) {
        console.error(`Failed to unpack uploaded ZIP archive ${f.filename}:`, err);
      }
    } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      result.push(f);
    }
  }
  return result;
}

export class ExcelService {
  // In-memory cache for downloadable multi-part ZIP packages
  public zipCache: Map<string, { filename: string; buffer: Buffer; createdAt: number }> = new Map();

  /**
   * Generates standard Article Processing Workbook buffer
   */
  generateArticleBatchWorkbook(
    articleIds: string[],
    batchName: string,
    customBatchId?: string,
    recordInDb: boolean = true
  ): { buffer: Buffer; filename: string; batchId: string } {
    const batchId = customBatchId || `BATCH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const filename = `AI_ARTICLE_BATCH_${batchId}.xlsx`;

    const wb = XLSX.utils.book_new();

    // 1. INSTRUCTIONS Sheet
    const instructionsData = [
      ['=== PERSONAL NEWS INTELLIGENCE PORTAL - AI ARTICLE PROCESSING WORKBOOK ==='],
      [''],
      ['MANDATORY STRICT RULES FOR CHATGPT / LLM ASSISTANT:'],
      ['1. PRESERVE ALL IDs: Never change, delete, or translate "article_id", "block_id", or "image_id".'],
      ['2. IMAGE INTEGRITY: Do not delete, skip, or reorder any image blocks. Image positions must stay intact.'],
      ['3. FACTUAL INTEGRITY: Never hallucinate or invent facts, quotes, dates, or names not present in the original source.'],
      ['4. MANDATORY AI NATIVE TRANSLATION (NOT MACHINE / API TRANSLATION):'],
      ['   - All translations into Korean (OUTPUT_KO), English (OUTPUT_EN), and Kinyarwanda (OUTPUT_RW) MUST be crafted using high-caliber AI native multilingual reasoning and journalistic context.'],
      ['   - STRICTLY PROHIBITED: Do NOT use mechanical translation APIs or word-for-word translation tools (such as rigid Google Translate outputs). Write naturally, idiomatically, and eloquently as a senior news desk editor.'],
      ['5. MANDATORY DIRECT RE-PARAGRAPHING INTO body_ko, body_en, body_rw:'],
      ['   - There are NO separate reparagraphed columns. The body written into "body_ko", "body_en", and "body_rw" MUST directly be re-paragraphed into clean, well-spaced, logical paragraphs (3-5 sentences each) separated by double line-breaks (\\n\\n).'],
      ['   - Even if the target language is the SAME as the original article (e.g. English source for OUTPUT_EN, or Korean for OUTPUT_KO), you MUST reformulate the body into clean, well-spaced, logical paragraphs directly in "body_*". Never leave it as a giant wall of text.'],
      ['6. SIMILAR ARTICLES & CHRONOLOGICAL RELATIONS (SIMILAR_ARTICLES Sheet):'],
      ['   - Examine titles and publication dates across all articles.'],
      ['   - In the SIMILAR_ARTICLES sheet:'],
      ['     * "similar_article_ids": List comma-separated IDs of articles reporting on the same event/subject contemporaneous in time.'],
      ['     * "previous_article_ids": List IDs of related background articles published EARLIER than this article.'],
      ['     * "future_article_ids": List IDs of related follow-up articles published LATER than this article.'],
      ['     * "story_cluster_title": Provide a concise shared title for the overarching storyline.'],
      ['7. REQUIRED OUTPUT SHEETS:'],
      ['   - OUTPUT_KO: article_id, main_topic, region, title_ko, subtitle_ko, summary_ko, body_ko.'],
      ['   - OUTPUT_EN: article_id, main_topic, region, title_en, subtitle_en, summary_en, body_en.'],
      ['   - OUTPUT_RW: article_id, main_topic, region, title_rw, subtitle_rw, summary_rw, body_rw.'],
      ['     * "main_topic": Topic category corresponding to filter (tech, economy, sports, politics, volunteers, living, or undefined).'],
      ['     * "region": Geographic region corresponding to filter (rwanda, korea, africa, world, or undefined).'],
      ['   - ARTICLE_TAGS: Extract meaningful concept tags (Person, Organization, Place, Topic, Industry) with multilingual names.'],
      ['   - EVENT_CANDIDATES: Extract any specific upcoming or past dated events mentioned (start_date YYYY-MM-DD, venue, etc.).'],
      ['   - SIMILAR_ARTICLES: Cross-article clustering and chronological previous/future links.'],
      ['   - BODY_CHUNKS: Contains complete source/existing text when a body is too long for one Excel cell. Reconstruct by article_id + field_name + chunk_index.'],
      ['   - OUTPUT_BODY_CHUNKS: If any generated body would exceed 30,000 characters, split it here into sequential chunks. Use language = ko/en/rw and field_name = body_ko, body_en, or body_rw.'],
      ['8. EXCEL CELL LIMIT: Never place more than 30,000 characters in a single cell. Use BODY_CHUNKS / OUTPUT_BODY_CHUNKS instead of truncating content.'],
      ['9. WORKBOOK INTEGRITY: Do not rename sheet tabs or change column header names.'],
      ['10. SCANNED DOCUMENT PHOTOS & HEADLINE CORRECTIONS:'],
      ['   - Some articles (such as official gazette announcements, public notices, or name change requests) have NO written body text, but contain scanned photos of documents, certificates, or letters (see "document_images/" in the ZIP archive or URLs in INPUT/CONTENT_BLOCKS).'],
      ['   - For these articles, ChatGPT MUST NOT leave the body empty or simply translate an empty string. INSTEAD:'],
      ['     a) Read and transcribe the document text from the attached document photos/links.'],
      ['     b) Draft a comprehensive, professional, well-structured news article body (3-5 paragraphs) in body_ko, body_en, and body_rw reporting all key facts (who applied, old name, new name, reasons, dates, legal authorities, locations, instructions for public objections).'],
      ['     c) MANDATORY TITLE REVISION: If the original title is generic or placeholder (e.g. "Name change request", "Change of name", "Notice", "Public Announcement", "Untitled"), DO NOT keep the vague title! Create an informative, specific headline in Korean, English, and Kinyarwanda specifying the applicant\'s name and context (e.g. "[고시] OOO씨 개명 허가 신청 공고" / "Public Notice: Name Change Application for [Applicant Name]").'],
      [''],
      ['PROMPT TO PASTE INTO CHATGPT:'],
      ['"Please act as a senior multilingual news intelligence editor. I have attached an Excel workbook containing raw news articles in INPUT, CONTENT_BLOCKS, and BODY_CHUNKS. Process all articles strictly according to the INSTRUCTIONS sheet:"'],
      ['1. AI NATIVE TRANSLATION: Do NOT use mechanical translation APIs. Perform fluent, idiomatic, high-quality AI native translations into Korean (OUTPUT_KO), English (OUTPUT_EN), and Kinyarwanda (OUTPUT_RW).'],
      ['2. DIRECT RE-PARAGRAPHING: Write the re-paragraphed text directly into body_ko, body_en, and body_rw with clean, well-spaced paragraphs (3-5 sentences each). Even if an article is already in English or Korean, re-paragraph directly into body_* for optimal journalistic readability.'],
      ['3. SCANNED DOCUMENT PHOTOS: If an article has no body text but contains document photos (see document_images/ or image URLs), read the document text, draft a complete news article in body_*, and revise vague placeholder headlines into informative titles.'],
      ['4. SIMILAR ARTICLES, TAGS & EVENTS: Group similar articles in SIMILAR_ARTICLES, extract multilingual concept tags in ARTICLE_TAGS, and detect event candidates in EVENT_CANDIDATES.'],
      ['5. PRESERVE ALL IDs: Keep article_id, block_id, and image_id unchanged. Return the completed Excel workbook for download."']
    ];
    const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'INSTRUCTIONS');

    // 2. INPUT Sheet
    const inputRows: any[] = [];
    // 3. CONTENT_BLOCKS Sheet
    const blockRows: any[] = [];
    // Pre-populate sample output headers
    const koRows: any[] = [];
    const enRows: any[] = [];
    const rwRows: any[] = [];

    // Full-length source/existing text that cannot safely fit in one Excel cell.
    const bodyChunkRows: any[] = [];

    let totalChars = 0;

    for (const id of articleIds) {
      const art = db.core.articles[id];
      if (!art) continue;

      const originalBody = art.original_body || '';
      const originalLanguage = art.original_language || 'unknown';
      const originalBodyChunks = splitExcelText(originalBody);

      totalChars += originalBody.length + (art.original_title?.length || 0);

      // Preserve the ENTIRE source body losslessly in BODY_CHUNKS.
      appendChunkRows(
        bodyChunkRows,
        art.article_id,
        originalLanguage,
        'original_body',
        originalBody,
        'SOURCE'
      );

      const inputArtRegion = (art as any).region || db.core.sources[art.source_id]?.region || 'rwanda';
      const isProcessed = art.processing_status === 'PROCESSED';
      const isDocOnly = (!originalBody || originalBody.trim().length < 100) && ((art.image_urls && art.image_urls.length > 0) || !!art.lead_image_url);
      const isPlaceholderTitle = (!art.original_title ||
        art.original_title.toLowerCase().includes('name change') ||
        art.original_title.toLowerCase().includes('change of name') ||
        art.original_title.toLowerCase().includes('notice') ||
        art.original_title.toLowerCase().includes('untitled'));

      inputRows.push({
        article_id: art.article_id,
        region: inputArtRegion,
        main_topic: art.portal_category_id,
        ai_status: isProcessed ? 'Done' : 'Waiting',
        source_name: db.core.sources[art.source_id]?.name || art.source_id,
        source_domain: db.core.sources[art.source_id]?.domain || '',
        source_url: art.source_url,
        published_at: art.published_at,
        source_section: art.source_section || '',
        source_subcategory: art.source_subcategory || '',
        original_language: originalLanguage,
        original_title: art.original_title,
        original_subtitle: art.original_subtitle || '',
        // Document & Title Special Handling Flags
        document_image_status: isDocOnly ? 'CONTAINS_DOCUMENT_IMAGE' : 'NORMAL',
        document_image_count: (art.image_urls?.length || 0) + (art.lead_image_url ? 1 : 0),
        requires_title_revision: isPlaceholderTitle ? 'YES - FORMULATE INFORMATIVE HEADLINE' : 'NO',
        document_notice: isDocOnly ? 'NO SOURCE BODY TEXT. ARTICLE MUST BE DRAFTED FROM ATTACHED DOCUMENT IMAGES (see document_images/ in ZIP or image URLs).' : '',
        // Safe preview. Full text is always available in BODY_CHUNKS.
        original_body: safeExcelCellText(originalBody),
        original_body_chunked: originalBodyChunks.length > 1 ? 'YES' : 'NO',
        original_body_chunk_count: originalBodyChunks.length,
        current_portal_category: art.portal_category_id
      });

      // Preserve stable block_id exactly. Long text blocks become multiple rows
      // with block_part_index/block_part_total instead of inventing new IDs.
      for (let i = 0; i < (art.content_blocks || []).length; i++) {
        const blk = art.content_blocks[i];
        const blockTextChunks = splitExcelText(blk.text || '');

        for (let part = 0; part < blockTextChunks.length; part++) {
          blockRows.push({
            article_id: art.article_id,
            block_id: blk.blockId,
            block_order: i + 1,
            block_part_index: part + 1,
            block_part_total: blockTextChunks.length,
            block_type: blk.type.toUpperCase(),
            original_text: blockTextChunks[part],
            image_id: part === 0 ? (blk.imageId || '') : '',
            image_url: part === 0 ? (blk.url || '') : '',
            image_alt: part === 0 ? (blk.alt || '') : '',
            image_caption: part === 0 ? (blk.caption || '') : '',
            image_credit: part === 0 ? (blk.credit || '') : ''
          });
        }
      }

      // Pre-fill Output rows with ID & existing content if available.
      // Existing long localized bodies are preserved in BODY_CHUNKS too.
      const existingKoBody = db.ko.articles[art.article_id]?.body || '';
      const existingEnBody = db.en.articles[art.article_id]?.body || '';
      const existingRwBody = db.rw.articles[art.article_id]?.body || '';

      if (existingKoBody.length > EXCEL_CELL_SAFE_LIMIT) {
        appendChunkRows(bodyChunkRows, art.article_id, 'ko', 'body_ko', existingKoBody, 'EXISTING_LOCALIZED');
      }
      if (existingEnBody.length > EXCEL_CELL_SAFE_LIMIT) {
        appendChunkRows(bodyChunkRows, art.article_id, 'en', 'body_en', existingEnBody, 'EXISTING_LOCALIZED');
      }
      if (existingRwBody.length > EXCEL_CELL_SAFE_LIMIT) {
        appendChunkRows(bodyChunkRows, art.article_id, 'rw', 'body_rw', existingRwBody, 'EXISTING_LOCALIZED');
      }

      const artRegion = art.region || (db.core.sources[art.source_id]?.region) || 'undefined';
      const artTopic = art.portal_category_id || 'undefined';

      koRows.push({
        article_id: art.article_id,
        main_topic: artTopic,
        region: artRegion,
        title_ko: db.ko.articles[art.article_id]?.title || '',
        subtitle_ko: db.ko.articles[art.article_id]?.subtitle || '',
        summary_ko: db.ko.articles[art.article_id]?.summary || '',
        body_ko: safeExcelCellText(existingKoBody)
      });
      enRows.push({
        article_id: art.article_id,
        main_topic: artTopic,
        region: artRegion,
        title_en: db.en.articles[art.article_id]?.title || '',
        subtitle_en: db.en.articles[art.article_id]?.subtitle || '',
        summary_en: db.en.articles[art.article_id]?.summary || '',
        body_en: safeExcelCellText(existingEnBody)
      });
      rwRows.push({
        article_id: art.article_id,
        main_topic: artTopic,
        region: artRegion,
        title_rw: db.rw.articles[art.article_id]?.title || '',
        subtitle_rw: db.rw.articles[art.article_id]?.subtitle || '',
        summary_rw: db.rw.articles[art.article_id]?.summary || '',
        body_rw: safeExcelCellText(existingRwBody)
      });
    }

    const wsInput = XLSX.utils.json_to_sheet(inputRows);
    XLSX.utils.book_append_sheet(wb, wsInput, 'INPUT');

    const wsBlocks = XLSX.utils.json_to_sheet(blockRows);
    XLSX.utils.book_append_sheet(wb, wsBlocks, 'CONTENT_BLOCKS');

    const wsBodyChunks = XLSX.utils.json_to_sheet(bodyChunkRows);
    XLSX.utils.book_append_sheet(wb, wsBodyChunks, 'BODY_CHUNKS');

    // AI writes oversized generated localized bodies here; import reconstructs them.
    const wsOutputBodyChunks = XLSX.utils.aoa_to_sheet([[
      'article_id',
      'language',
      'field_name',
      'chunk_index',
      'chunk_total',
      'text'
    ]]);
    XLSX.utils.book_append_sheet(wb, wsOutputBodyChunks, 'OUTPUT_BODY_CHUNKS');

    const wsKo = XLSX.utils.json_to_sheet(koRows);
    XLSX.utils.book_append_sheet(wb, wsKo, 'OUTPUT_KO');

    const wsEn = XLSX.utils.json_to_sheet(enRows);
    XLSX.utils.book_append_sheet(wb, wsEn, 'OUTPUT_EN');

    const wsRw = XLSX.utils.json_to_sheet(rwRows);
    XLSX.utils.book_append_sheet(wb, wsRw, 'OUTPUT_RW');

    // 7. ARTICLE_TAGS Sheet
    const tagRows = [
      {
        article_id: articleIds[0] || 'ART-SAMPLE',
        tag_concept_key: 'kigali',
        tag_type: 'PLACE',
        tag_ko: '키갈리',
        tag_en: 'Kigali',
        tag_rw: 'Kigali',
        aliases: 'Kigali City'
      }
    ];
    const wsTags = XLSX.utils.json_to_sheet(tagRows);
    XLSX.utils.book_append_sheet(wb, wsTags, 'ARTICLE_TAGS');

    // 8. EVENT_CANDIDATES Sheet
    const eventRows = [
      {
        article_id: articleIds[0] || 'ART-SAMPLE',
        has_event: 'YES',
        event_name: 'Sample Event Name',
        event_name_ko: '샘플 이벤트명 (한국어)',
        event_name_en: 'Sample Event Name (English)',
        event_name_rw: 'Izina ry\'igikorwa (Ikinyarwanda)',
        event_subtitle: 'Brief event description',
        event_subtitle_ko: '이벤트 한줄 설명 (한국어)',
        event_subtitle_en: 'Brief event description (English)',
        event_subtitle_rw: 'Ibisobanuro by\'igikorwa (Ikinyarwanda)',
        start_date: '2026-09-28',
        start_time: '09:00',
        end_date: '2026-09-30',
        end_time: '17:00',
        venue: 'Kigali Convention Centre',
        city: 'Kigali',
        country: 'Rwanda',
        organizer: 'RDB',
        event_type: 'Summit',
        category: 'Business / Investment',
        tags_ko: '키갈리, 투자',
        tags_en: 'Kigali, Investment',
        tags_rw: 'Kigali, Ishoramari',
        confidence: 0.95
      }
    ];
    const wsEvents = XLSX.utils.json_to_sheet(eventRows);
    XLSX.utils.book_append_sheet(wb, wsEvents, 'EVENT_CANDIDATES');

    // 9. SIMILAR_ARTICLES & CHRONOLOGICAL RELATIONS Sheet
    const similarRows = articleIds.map(id => {
      const art = db.core.articles[id];
      const cluster = art?.story_cluster_id ? db.core.storyClusters[art.story_cluster_id] : null;
      const relations = db.core.articleRelations?.[id];
      return {
        article_id: id,
        published_at: art?.published_at || '',
        article_title: art?.original_title || '',
        story_cluster_title: cluster?.title || '',
        similar_article_ids: (relations?.similar || []).join(', '),
        previous_article_ids: (relations?.previous || []).join(', '),
        future_article_ids: (relations?.future || []).join(', '),
        relation_notes: ''
      };
    });
    const wsSimilar = XLSX.utils.json_to_sheet(similarRows);
    XLSX.utils.book_append_sheet(wb, wsSimilar, 'SIMILAR_ARTICLES');

    // 10. STORY_HINTS Sheet (Backwards compatibility)
    const storyRows = [
      {
        article_id: articleIds[0] || 'ART-SAMPLE',
        story_topic: 'Major Investment in Kigali Innovation City',
        related_article_ids: articleIds.slice(1, 3).join(', ')
      }
    ];
    const wsStory = XLSX.utils.json_to_sheet(storyRows);
    XLSX.utils.book_append_sheet(wb, wsStory, 'STORY_HINTS');

    const sanitizedCellCount = sanitizeWorkbookCells(wb);
    if (sanitizedCellCount > 0) {
      console.warn(`[ExcelService] Sanitized ${sanitizedCellCount} oversized Excel cells in ${filename}. Full source bodies are preserved in chunk sheets where applicable.`);
    }
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    if (recordInDb) {
      // Record AI Batch only if recordInDb is true
      db.core.aiBatches[batchId] = {
        batch_id: batchId,
        batch_type: 'article_processing',
        name: batchName || `Article Batch (${articleIds.length} items)`,
        status: 'EXPORTED',
        item_count: articleIds.length,
        char_count: totalChars,
        filename,
        article_ids: [...articleIds],
        created_at: new Date().toISOString()
      };

      // Mark articles as EXPORTED
      for (const id of articleIds) {
        if (db.core.articles[id]) {
          db.core.articles[id].processing_status = 'EXPORTED';
        }
      }
      db.save();
    }

    return { buffer, filename, batchId };
  }

  /**
   * Generates a multi-part batch of up to 100 Excel files (25 articles each)
   * packaged into a single ZIP file for downloading 2,500 articles at once.
   */
  async generateMultiArticleBatchZip(
    articleIds: string[],
    batchName: string = 'Multi Batch 2500',
    chunkSize: number = 25,
    targetTotal: number = 2500,
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<{
    zipBuffer: Buffer;
    zipFilename: string;
    batchId: string;
    fileCount: number;
    totalArticles: number;
  }> {
    const batchId = `MULTI-BATCH-${Date.now().toString(36).toUpperCase()}`;

    // Package only the actual articles passed (unprocessed only, no cycling/duplication)
    const effectiveArticleIds = [...articleIds];
    if (effectiveArticleIds.length === 0) {
      throw new Error('No unprocessed articles found to export in batch.');
    }

    // Split into chunks of chunkSize (e.g. 25 articles per file)
    const chunks: string[][] = [];
    for (let i = 0; i < effectiveArticleIds.length; i += chunkSize) {
      chunks.push(effectiveArticleIds.slice(i, i + chunkSize));
      if (chunks.length >= 100) break; // Limit to 100 files
    }

    const totalChunks = chunks.length;
    const zipFilename = `AI_BATCH_PACKAGE_${totalChunks}_FILES_${effectiveArticleIds.length}_ARTICLES_${batchId}.zip`;
    const zipEntries: { name: string; buffer: Buffer }[] = [];

    // 1. Generate Excel files
    for (let idx = 0; idx < totalChunks; idx++) {
      const chunkArticleIds = chunks[idx];
      const partNumberStr = String(idx + 1).padStart(3, '0');
      const totalPartsStr = String(totalChunks).padStart(3, '0');
      const partBatchId = `${batchId}_PART_${partNumberStr}`;
      const partFilename = `AI_BATCH_Part_${partNumberStr}_of_${totalPartsStr}_(${chunkArticleIds.length}_articles).xlsx`;

      if (onProgress) {
        const artStart = (idx * chunkSize) + 1;
        const artEnd = Math.min((idx + 1) * chunkSize, effectiveArticleIds.length);
        onProgress(
          idx + 1,
          totalChunks,
          `Creating file ${idx + 1}/${totalChunks}: ${partFilename} (articles ${artStart.toLocaleString()} - ${artEnd.toLocaleString()})...`
        );
      }

      const { buffer } = this.generateArticleBatchWorkbook(
        chunkArticleIds,
        `${batchName} - Part ${idx + 1}/${totalChunks}`,
        partBatchId,
        false // Do NOT record sub-part in db.core.aiBatches!
      );

      zipEntries.push({
        name: partFilename,
        buffer
      });

      // Brief tick to allow asynchronous progress polling
      await new Promise(r => setTimeout(r, 15));
    }

    // 2. Identify articles with empty or short bodies but containing document photos
    if (onProgress) {
      onProgress(
        totalChunks,
        totalChunks,
        `Scanning and packaging attached document photos for articles without body text...`
      );
    }

    const docArticles: { article: ArticleRecord; images: string[] }[] = [];
    for (const id of effectiveArticleIds) {
      const art = db.core.articles[id];
      if (!art) continue;
      const bodyLen = (art.original_body || '').trim().length;
      if (bodyLen < 100) {
        const imgs = new Set<string>();
        if (art.lead_image_url) imgs.add(art.lead_image_url);
        (art.image_urls || []).forEach(u => { if (u) imgs.add(u); });
        (art.content_blocks || []).forEach(b => {
          if (b.type === 'image' && b.url) imgs.add(b.url);
        });
        if (imgs.size > 0) {
          docArticles.push({ article: art, images: Array.from(imgs) });
        }
      }
    }

    if (docArticles.length > 0) {
      // Add root README_DOCUMENT_IMAGES.txt
      const readmeLines = [
        '=== PERSONAL NEWS INTELLIGENCE PORTAL: DOCUMENT IMAGE INSTRUCTIONS ===',
        '',
        'IMPORTANT INSTRUCTIONS FOR CHATGPT / LLM ASSISTANT:',
        'Some articles in this batch contain scanned official document images (such as public gazette notices, legal proclamations, or name change requests) where the source body text is empty.',
        '',
        'For any article listed in the "document_images/" folder:',
        '1. EXAMINE THE ATTACHED SCANNED DOCUMENT PHOTO(S).',
        '2. DO NOT simply translate an empty body. INSTEAD, TRANSCRIBE AND DRAFT A COMPLETE, INFORMATIVE, WELL-STRUCTURED NEWS ARTICLE (3-5 paragraphs) in OUTPUT_KO, OUTPUT_EN, and OUTPUT_RW based on the document\'s content.',
        '3. TITLE CORRECTION REQUIREMENT: If the original title is vague or placeholder (e.g., "Name change request", "Change of name", "Notice", "Public Notice", "Untitled"), you MUST replace the title in OUTPUT_KO, OUTPUT_EN, and OUTPUT_RW with a precise, informative headline including the applicant\'s name and official procedure (e.g., "[고시] OOO씨 개명 허가 신청 공고" / "Public Notice: Name Change Application for [Applicant Name]").',
        '',
        `Total Document-Only Articles: ${docArticles.length}`,
        ...docArticles.map(d => `- [${d.article.article_id}] "${d.article.original_title}" (${d.images.length} photo(s))`)
      ];

      zipEntries.push({
        name: 'README_DOCUMENT_IMAGES.txt',
        buffer: Buffer.from(readmeLines.join('\n'), 'utf-8')
      });

      // Fetch images for each document-only article (up to 3 photos per article, 2.5s timeout)
      for (const item of docArticles) {
        const art = item.article;
        let imgIdx = 1;
        for (const imgUrl of item.images.slice(0, 3)) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2500);
            const imgRes = await fetch(imgUrl, {
              signal: controller.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PersonalNewsIntelligence/1.0'
              }
            });
            clearTimeout(timer);
            if (imgRes.ok) {
              const arrayBuf = await imgRes.arrayBuffer();
              const ext = imgUrl.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
              zipEntries.push({
                name: `document_images/${art.article_id}_doc_${imgIdx}.${ext}`,
                buffer: Buffer.from(arrayBuf)
              });
              imgIdx++;
            }
          } catch {
            // Ignore individual image download timeouts gracefully
          }
        }

        const infoText = [
          `Article ID: ${art.article_id}`,
          `Original Title: ${art.original_title}`,
          `Source: ${art.source_id} (${art.source_url})`,
          `Published At: ${art.published_at}`,
          '',
          `Photo URLs:`,
          ...item.images.map((u, i) => `[Photo ${i + 1}]: ${u}`),
          '',
          'INSTRUCTIONS FOR CHATGPT:',
          'This article has no body text because the news content consists of scanned official announcement / gazette document photo(s).',
          '1. Read all text, dates, applicant names, government seals, and details from the attached image(s).',
          '2. DRAFT A FULL, PROFESSIONAL NEWS ARTICLE in OUTPUT_KO, OUTPUT_EN, and OUTPUT_RW covering all facts from the document.',
          '3. TITLE CORRECTION: If the original title is generic or placeholder (such as "Name change request", "Change of name", "Notice", "Public Announcement", "Untitled"), DO NOT keep the generic title. Formulate a specific, informative headline (e.g. "[고시] OOO씨 개명 허가 신청 공고" / "Public Notice: Name Change Application for [Applicant Name]").'
        ].join('\n');

        zipEntries.push({
          name: `document_images/${art.article_id}_info.txt`,
          buffer: Buffer.from(infoText, 'utf-8')
        });
      }
    }

    if (onProgress) {
      onProgress(
        totalChunks,
        totalChunks,
        `Compressing ${totalChunks} Excel files and document assets into high-speed ZIP archive...`
      );
    }

    const zipBuffer = await createZipBuffer(zipEntries);

    // Cache the ZIP buffer for direct streaming download
    this.zipCache.set(batchId, {
      filename: zipFilename,
      buffer: zipBuffer,
      createdAt: Date.now()
    });

    // Record single parent AI Batch in DB
    db.core.aiBatches[batchId] = {
      batch_id: batchId,
      batch_type: 'article_processing',
      name: `${batchName} (${totalChunks} Excel files, ${effectiveArticleIds.length} articles)`,
      status: 'EXPORTED',
      item_count: effectiveArticleIds.length,
      char_count: 0,
      filename: zipFilename,
      article_ids: [...effectiveArticleIds],
      created_at: new Date().toISOString()
    };

    // Mark articles as EXPORTED
    for (const id of effectiveArticleIds) {
      if (db.core.articles[id]) {
        db.core.articles[id].processing_status = 'EXPORTED';
      }
    }
    db.save();

    if (onProgress) {
      onProgress(
        totalChunks,
        totalChunks,
        `Package ready! Downloading ${zipFilename}...`
      );
    }

    return {
      zipBuffer,
      zipFilename,
      batchId,
      fileCount: totalChunks,
      totalArticles: effectiveArticleIds.length
    };
  }

  /**
   * Previews & validates multiple uploaded Excel workbooks simultaneously
   */
  previewMultipleWorkbooks(files: { filename: string; buffer: Buffer }[]): MultiImportPreviewResult {
    let totalArticles = 0;
    let koCount = 0;
    let enCount = 0;
    let rwCount = 0;
    let eventCandidatesCount = 0;
    let tagsCount = 0;
    let relationsCount = 0;
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    const fileSummaries: { filename: string; totalArticles: number; validCount: number; status: string; errors: string[] }[] = [];

    for (const f of files) {
      try {
        const preview = this.previewArticleWorkbook(f.buffer);
        totalArticles += preview.totalArticles;
        koCount += preview.koCount;
        enCount += preview.enCount;
        rwCount += preview.rwCount;
        eventCandidatesCount += preview.eventCandidatesCount;
        tagsCount += preview.tagsCount;
        relationsCount += preview.relationsCount || 0;

        fileSummaries.push({
          filename: f.filename,
          totalArticles: preview.totalArticles,
          validCount: preview.validArticleIds.length,
          status: preview.errors.length > 0 ? 'WARNING' : 'READY',
          errors: preview.errors
        });

        if (preview.errors.length > 0) {
          allErrors.push(`[${f.filename}] ${preview.errors.join('; ')}`);
        }
        if (preview.warnings.length > 0) {
          allWarnings.push(`[${f.filename}] ${preview.warnings.join('; ')}`);
        }
      } catch (err: any) {
        fileSummaries.push({
          filename: f.filename,
          totalArticles: 0,
          validCount: 0,
          status: 'ERROR',
          errors: [err.message || 'Failed to read workbook']
        });
        allErrors.push(`[${f.filename}] Parse failure: ${err.message}`);
      }
    }

    return {
      totalFiles: files.length,
      totalArticles,
      koCount,
      enCount,
      rwCount,
      eventCandidatesCount,
      tagsCount,
      relationsCount,
      errors: allErrors,
      warnings: allWarnings,
      fileSummaries
    };
  }

  /**
   * Commits multiple uploaded Excel workbooks into the database
   */
  importMultipleWorkbooks(files: { filename: string; buffer: Buffer }[]): MultiImportCommitResult {
    let totalImported = 0;
    let totalRelations = 0;
    const allErrors: string[] = [];
    const fileSummaries: { filename: string; importedCount: number; status: string }[] = [];

    for (const f of files) {
      try {
        const result = this.importArticleWorkbook(f.buffer);
        totalImported += result.importedCount;
        totalRelations += (result as any).relationsCount || 0;
        fileSummaries.push({
          filename: f.filename,
          importedCount: result.importedCount,
          status: result.success ? 'IMPORTED' : 'FAILED'
        });
        if (result.errors.length > 0) {
          allErrors.push(`[${f.filename}] ${result.errors.join('; ')}`);
        }
      } catch (err: any) {
        fileSummaries.push({
          filename: f.filename,
          importedCount: 0,
          status: 'ERROR'
        });
        allErrors.push(`[${f.filename}] Import failed: ${err.message}`);
      }
    }

    return {
      success: totalImported > 0 || files.length === 0,
      totalFiles: files.length,
      importedCount: totalImported,
      relationsCount: totalRelations,
      errors: allErrors,
      fileSummaries
    };
  }

  /**
   * Previews & validates an uploaded Excel file before importing
   */
  previewArticleWorkbook(fileBuffer: Buffer): ImportPreviewResult {
    const wb = XLSX.read(fileBuffer, { type: 'buffer' });
    const errors: string[] = [];
    const warnings: string[] = [];

    const koSheet = wb.Sheets['OUTPUT_KO'];
    const enSheet = wb.Sheets['OUTPUT_EN'];
    const rwSheet = wb.Sheets['OUTPUT_RW'];

    if (!koSheet && !enSheet && !rwSheet) {
      errors.push('Missing localized output sheets (OUTPUT_KO, OUTPUT_EN, or OUTPUT_RW)');
    }

    const koRows: any[] = koSheet ? XLSX.utils.sheet_to_json(koSheet) : [];
    const enRows: any[] = enSheet ? XLSX.utils.sheet_to_json(enSheet) : [];
    const rwRows: any[] = rwSheet ? XLSX.utils.sheet_to_json(rwSheet) : [];
    const outputBodyChunkSheet = wb.Sheets['OUTPUT_BODY_CHUNKS'];
    const outputBodyChunkRows: any[] = outputBodyChunkSheet
      ? XLSX.utils.sheet_to_json(outputBodyChunkSheet, { defval: '' })
      : [];

    const articleIdSet = new Set<string>();
    [...koRows, ...enRows, ...rwRows, ...outputBodyChunkRows].forEach(r => {
      if (r.article_id) articleIdSet.add(String(r.article_id).trim());
    });

    const validArticleIds: string[] = [];
    for (const id of articleIdSet) {
      if (!db.core.articles[id]) {
        warnings.push(`Article ID ${id} in Excel does not match any existing article in portal_core.`);
      } else {
        validArticleIds.push(id);
      }
    }

    const eventSheet = wb.Sheets['EVENT_CANDIDATES'];
    const eventRows: any[] = eventSheet ? XLSX.utils.sheet_to_json(eventSheet) : [];
    const eventCandidatesCount = eventRows.filter(r => r.has_event === 'YES' || r.event_name).length;

    const tagSheet = wb.Sheets['ARTICLE_TAGS'];
    const tagRows: any[] = tagSheet ? XLSX.utils.sheet_to_json(tagSheet) : [];

    const similarSheet = wb.Sheets['SIMILAR_ARTICLES'] || wb.Sheets['STORY_HINTS'];
    const similarRows: any[] = similarSheet ? XLSX.utils.sheet_to_json(similarSheet) : [];
    const relationsCount = similarRows.filter(r => r.similar_article_ids || r.previous_article_ids || r.future_article_ids || r.related_article_ids).length;

    return {
      totalArticles: validArticleIds.length,
      koCount: new Set([
        ...koRows.filter(r => r.body_ko || r.reparagraphed_body_ko || r.title_ko).map(r => r.article_id),
        ...outputBodyChunkRows.filter(r => String(r.language || '').toLowerCase() === 'ko' && r.text).map(r => r.article_id)
      ].filter(Boolean)).size,
      enCount: new Set([
        ...enRows.filter(r => r.body_en || r.reparagraphed_body_en || r.title_en).map(r => r.article_id),
        ...outputBodyChunkRows.filter(r => String(r.language || '').toLowerCase() === 'en' && r.text).map(r => r.article_id)
      ].filter(Boolean)).size,
      rwCount: new Set([
        ...rwRows.filter(r => r.body_rw || r.reparagraphed_body_rw || r.title_rw).map(r => r.article_id),
        ...outputBodyChunkRows.filter(r => String(r.language || '').toLowerCase() === 'rw' && r.text).map(r => r.article_id)
      ].filter(Boolean)).size,
      eventCandidatesCount,
      tagsCount: tagRows.length,
      relationsCount,
      errors,
      warnings,
      validArticleIds
    };
  }

  /**
   * Commits the validated workbook into portal_core, portal_ko, portal_en, portal_rw
   */
  importArticleWorkbook(fileBuffer: Buffer): { success: boolean; importedCount: number; relationsCount: number; errors: string[] } {
    const preview = this.previewArticleWorkbook(fileBuffer);
    if (preview.errors.length > 0 && preview.validArticleIds.length === 0) {
      return { success: false, importedCount: 0, relationsCount: 0, errors: preview.errors };
    }

    const wb = XLSX.read(fileBuffer, { type: 'buffer' });
    const now = new Date().toISOString();

    const koSheet = wb.Sheets['OUTPUT_KO'];
    const enSheet = wb.Sheets['OUTPUT_EN'];
    const rwSheet = wb.Sheets['OUTPUT_RW'];
    const tagSheet = wb.Sheets['ARTICLE_TAGS'];
    const eventSheet = wb.Sheets['EVENT_CANDIDATES'];
    const similarSheet = wb.Sheets['SIMILAR_ARTICLES'] || wb.Sheets['STORY_HINTS'];

    const koRows: any[] = koSheet ? XLSX.utils.sheet_to_json(koSheet) : [];
    const enRows: any[] = enSheet ? XLSX.utils.sheet_to_json(enSheet) : [];
    const rwRows: any[] = rwSheet ? XLSX.utils.sheet_to_json(rwSheet) : [];

    // Map localized outputs
    const koMap = new Map<string, any>(koRows.map(r => [r.article_id, r]));
    const enMap = new Map<string, any>(enRows.map(r => [r.article_id, r]));
    const rwMap = new Map<string, any>(rwRows.map(r => [r.article_id, r]));
    const outputBodyChunks = readOutputBodyChunks(wb);

    let importedCount = 0;

    for (const artId of preview.validArticleIds) {
      const art = db.core.articles[artId];
      if (!art) continue;

      const ko = koMap.get(artId);
      const en = enMap.get(artId);
      const rw = rwMap.get(artId);

      // Re-paragraphed text check:
      // Even if original language matches, update with re-paragraphed text
      const bodyEn = (
        getChunkedOutputBody(outputBodyChunks, artId, 'en', ['reparagraphed_body_en', 'body_en'])
        || en?.reparagraphed_body_en
        || en?.body_en
        || ''
      ).trim();
      const bodyKo = (
        getChunkedOutputBody(outputBodyChunks, artId, 'ko', ['reparagraphed_body_ko', 'body_ko'])
        || ko?.reparagraphed_body_ko
        || ko?.body_ko
        || ''
      ).trim();
      const bodyRw = (
        getChunkedOutputBody(outputBodyChunks, artId, 'rw', ['reparagraphed_body_rw', 'body_rw'])
        || rw?.reparagraphed_body_rw
        || rw?.body_rw
        || ''
      ).trim();

      const origLang = (art.original_language || '').toLowerCase();
      if (origLang.startsWith('en') && bodyEn.length > 0) {
        art.original_body = bodyEn;
        art.content_blocks = convertTextToParagraphBlocks(bodyEn, art.content_blocks);
      } else if (origLang.startsWith('ko') && bodyKo.length > 0) {
        art.original_body = bodyKo;
        art.content_blocks = convertTextToParagraphBlocks(bodyKo, art.content_blocks);
      } else if (origLang.startsWith('rw') && bodyRw.length > 0) {
        art.original_body = bodyRw;
        art.content_blocks = convertTextToParagraphBlocks(bodyRw, art.content_blocks);
      }

      // Update portal_category_id (main topic) and region from imported sheets
      const importedTopic = (ko?.main_topic || en?.main_topic || rw?.main_topic || ko?.category_ko || en?.category_en || rw?.category_rw || '').trim();
      const importedRegion = (ko?.region || en?.region || rw?.region || '').trim();

      if (importedTopic) {
        art.portal_category_id = importedTopic;
      }
      if (importedRegion) {
        art.region = importedRegion.toLowerCase();
      }

      let isComplete = true;

      // Korean
      if ((ko && (ko.title_ko || ko.body_ko || ko.reparagraphed_body_ko)) || bodyKo.length > 0) {
        const finalKoBody = bodyKo || art.original_body;
        db.ko.articles[artId] = {
          article_id: artId,
          title: ko?.title_ko || art.original_title,
          subtitle: ko?.subtitle_ko,
          summary: ko?.summary_ko,
          body: finalKoBody,
          category_label: importedTopic || ko?.category_ko || art.portal_category_id,
          processed_at: now,
          content_blocks: convertTextToParagraphBlocks(finalKoBody, art.content_blocks)
        };
      } else {
        isComplete = false;
      }

      // English
      if ((en && (en.title_en || en.body_en || en.reparagraphed_body_en)) || bodyEn.length > 0) {
        const finalEnBody = bodyEn || art.original_body;
        db.en.articles[artId] = {
          article_id: artId,
          title: en?.title_en || art.original_title,
          subtitle: en?.subtitle_en,
          summary: en?.summary_en,
          body: finalEnBody,
          category_label: importedTopic || en?.category_en || art.portal_category_id,
          processed_at: now,
          content_blocks: convertTextToParagraphBlocks(finalEnBody, art.content_blocks)
        };
      } else {
        isComplete = false;
      }

      // Kinyarwanda
      if ((rw && (rw.title_rw || rw.body_rw || rw.reparagraphed_body_rw)) || bodyRw.length > 0) {
        const finalRwBody = bodyRw || art.original_body;
        db.rw.articles[artId] = {
          article_id: artId,
          title: rw?.title_rw || art.original_title,
          subtitle: rw?.subtitle_rw,
          summary: rw?.summary_rw,
          body: finalRwBody,
          category_label: importedTopic || rw?.category_rw || art.portal_category_id,
          processed_at: now,
          content_blocks: convertTextToParagraphBlocks(finalRwBody, art.content_blocks)
        };
      } else {
        isComplete = false;
      }

      art.processing_status = isComplete ? 'PROCESSED' : 'PARTIAL';
      importedCount++;
    }

    // Process Similar Articles & Chronological Relations
    let relationsCount = 0;
    if (similarSheet) {
      if (!db.core.articleRelations) db.core.articleRelations = {};
      const simRows: any[] = XLSX.utils.sheet_to_json(similarSheet);

      for (const row of simRows) {
        const artId = row.article_id;
        if (!artId || !db.core.articles[artId]) continue;

        const parseIds = (raw: any): string[] => {
          if (!raw) return [];
          return String(raw)
            .split(/[,;\s]+/)
            .map(s => s.trim())
            .filter(s => s.length > 0 && s !== artId && db.core.articles[s]);
        };

        const similarIds = parseIds(row.similar_article_ids || row.related_article_ids);
        const previousIds = parseIds(row.previous_article_ids);
        const futureIds = parseIds(row.future_article_ids);

        if (similarIds.length > 0 || previousIds.length > 0 || futureIds.length > 0 || row.story_cluster_title) {
          relationsCount++;
          const existing = db.core.articleRelations[artId] || { similar: [], previous: [], future: [] };

          const mergedSimilar = Array.from(new Set([...existing.similar, ...similarIds]));
          const mergedPrevious = Array.from(new Set([...existing.previous, ...previousIds]));
          const mergedFuture = Array.from(new Set([...existing.future, ...futureIds]));

          db.core.articleRelations[artId] = {
            similar: mergedSimilar,
            previous: mergedPrevious,
            future: mergedFuture,
            cluster_title: row.story_cluster_title || row.story_topic || existing.cluster_title,
            notes: row.relation_notes || existing.notes
          };

          const art = db.core.articles[artId];
          art.similar_article_ids = mergedSimilar;
          art.previous_article_ids = mergedPrevious;
          art.future_article_ids = mergedFuture;

          // Story Cluster Assignment
          if (row.story_cluster_title || row.story_topic) {
            const clusterTitle = row.story_cluster_title || row.story_topic;
            let clusterId = art.story_cluster_id;
            if (!clusterId || !db.core.storyClusters[clusterId]) {
              clusterId = `CLUSTER-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5)}`;
              db.core.storyClusters[clusterId] = {
                id: clusterId,
                title: clusterTitle,
                representative_article_id: artId,
                article_count: 1,
                created_at: now,
                updated_at: now
              };
              db.core.storyClusterArticles[clusterId] = [artId];
              art.story_cluster_id = clusterId;
            } else {
              db.core.storyClusters[clusterId].title = clusterTitle;
            }

            // Also attach similar articles into the cluster
            for (const sId of mergedSimilar) {
              if (db.core.articles[sId]) {
                db.core.articles[sId].story_cluster_id = clusterId;
                if (!db.core.storyClusterArticles[clusterId].includes(sId)) {
                  db.core.storyClusterArticles[clusterId].push(sId);
                }
              }
            }
            db.core.storyClusters[clusterId].article_count = db.core.storyClusterArticles[clusterId].length;
          }
        }
      }
    }

    // Run automated clustering on imported articles to link any unlinked ones
    deduplicationService.updateArticleRelations(preview.validArticleIds);

    // Process Tags
    if (tagSheet) {
      const tagRows: any[] = XLSX.utils.sheet_to_json(tagSheet);
      for (const tr of tagRows) {
        if (!tr.tag_concept_key || !tr.article_id) continue;
        const key = tr.tag_concept_key.toLowerCase().trim();
        // Check existing concept
        let concept = Object.values(db.core.tagConcepts).find(c => c.key === key);
        if (!concept) {
          const conceptId = `TAG-CONCEPT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5)}`;
          concept = {
            tag_concept_id: conceptId,
            key,
            type: tr.tag_type || 'TOPIC',
            created_at: now
          };
          db.core.tagConcepts[conceptId] = concept;
          db.en.tags[conceptId] = { tag_concept_id: conceptId, name: tr.tag_en || key };
          db.ko.tags[conceptId] = { tag_concept_id: conceptId, name: tr.tag_ko || key };
          db.rw.tags[conceptId] = { tag_concept_id: conceptId, name: tr.tag_rw || key };
        }

        // Attach tag to article
        for (const langSchema of [db.en, db.ko, db.rw]) {
          if (!langSchema.articleTags[tr.article_id]) langSchema.articleTags[tr.article_id] = [];
          if (!langSchema.articleTags[tr.article_id].includes(concept.tag_concept_id)) {
            langSchema.articleTags[tr.article_id].push(concept.tag_concept_id);
          }
        }
      }
    }

    // Process Event Candidates
    if (eventSheet) {
      const eventRows: any[] = XLSX.utils.sheet_to_json(eventSheet);
      for (const er of eventRows) {
        if (er.has_event === 'NO' || !er.event_name) continue;
        const res = eventService.createOrMergeEvent({
          canonical_name: er.event_name,
          original_name: er.event_name,
          subtitle: er.event_subtitle,
          start_date: er.start_date,
          start_time: er.start_time,
          end_date: er.end_date || er.start_date,
          end_time: er.end_time,
          venue: er.venue,
          city: er.city || 'Kigali',
          country: er.country || 'Rwanda',
          organizer: er.organizer,
          category: er.category || 'Other',
          confidence: parseFloat(er.confidence) || 0.9,
          source_article_id: er.article_id
        });

        const targetEventId = res.event.event_id;
        // Save multilingual names & subtitles
        if (er.event_name_ko || er.event_subtitle_ko) {
          if (!db.ko.eventText[targetEventId]) {
            db.ko.eventText[targetEventId] = { event_id: targetEventId, canonical_name: er.event_name_ko || er.event_name, subtitle: er.event_subtitle_ko || er.event_subtitle };
          } else {
            if (er.event_name_ko) db.ko.eventText[targetEventId].canonical_name = er.event_name_ko;
            if (er.event_subtitle_ko) db.ko.eventText[targetEventId].subtitle = er.event_subtitle_ko;
          }
        }
        if (er.event_name_en || er.event_subtitle_en) {
          if (!db.en.eventText[targetEventId]) {
            db.en.eventText[targetEventId] = { event_id: targetEventId, canonical_name: er.event_name_en || er.event_name, subtitle: er.event_subtitle_en || er.event_subtitle };
          } else {
            if (er.event_name_en) db.en.eventText[targetEventId].canonical_name = er.event_name_en;
            if (er.event_subtitle_en) db.en.eventText[targetEventId].subtitle = er.event_subtitle_en;
          }
        }
        if (er.event_name_rw || er.event_subtitle_rw) {
          if (!db.rw.eventText[targetEventId]) {
            db.rw.eventText[targetEventId] = { event_id: targetEventId, canonical_name: er.event_name_rw || er.event_name, subtitle: er.event_subtitle_rw || er.event_subtitle };
          } else {
            if (er.event_name_rw) db.rw.eventText[targetEventId].canonical_name = er.event_name_rw;
            if (er.event_subtitle_rw) db.rw.eventText[targetEventId].subtitle = er.event_subtitle_rw;
          }
        }
      }
    }

    db.save();
    return { success: true, importedCount, relationsCount, errors: [] };
  }

  /**
   * Generates Events Export Workbook with multilingual name and subtitle columns
   */
  generateEventsExportWorkbook(eventIds?: string[]): { buffer: Buffer; filename: string } {
    const filename = `EVENTS_EXPORT_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const wb = XLSX.utils.book_new();

    const eventsToExport = eventIds && eventIds.length > 0
      ? eventIds.map(id => db.core.events[id]).filter(Boolean)
      : Object.values(db.core.events);

    const rows = eventsToExport.map(evt => {
      const nameKo = db.ko.eventText[evt.event_id]?.canonical_name || '';
      const nameEn = db.en.eventText[evt.event_id]?.canonical_name || evt.canonical_name;
      const nameRw = db.rw.eventText[evt.event_id]?.canonical_name || '';

      const subKo = db.ko.eventText[evt.event_id]?.subtitle || '';
      const subEn = db.en.eventText[evt.event_id]?.subtitle || evt.subtitle || '';
      const subRw = db.rw.eventText[evt.event_id]?.subtitle || '';

      const relatedArticles = db.core.eventArticles[evt.event_id] || [];

      return {
        event_id: evt.event_id,
        canonical_name: evt.canonical_name,
        name_ko: nameKo,
        name_en: nameEn,
        name_rw: nameRw,
        subtitle: evt.subtitle || '',
        subtitle_ko: subKo,
        subtitle_en: subEn,
        subtitle_rw: subRw,
        start_date: evt.start_date,
        start_time: evt.start_time || '',
        end_date: evt.end_date || evt.start_date,
        end_time: evt.end_time || '',
        venue: evt.venue || '',
        city: evt.city || '',
        country: evt.country || '',
        organizer: evt.organizer || '',
        category: evt.category || '',
        status: evt.status || 'UPCOMING',
        related_articles_count: relatedArticles.length,
        related_article_ids: relatedArticles.join(', ')
      };
    });

    const wsEvents = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, wsEvents, 'EVENTS');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return { buffer, filename };
  }

  /**
   * Generates Event URL Batch Workbook
   */
  generateEventUrlWorkbook(urlIds: string[]): { buffer: Buffer; filename: string; batchId: string } {
    const batchId = `EVT-BATCH-${Date.now().toString(36).toUpperCase()}`;
    const filename = `AI_EVENT_URL_BATCH_${batchId}.xlsx`;

    const wb = XLSX.utils.book_new();

    const wsInstructions = XLSX.utils.aoa_to_sheet([
      ['=== EVENT EXTRACTION WORKBOOK - URL INBOX ==='],
      ['Extract event date, location, venue, organizer, pricing, and category from the provided web texts.'],
      ['Preserve url_id. Leave has_event = NO if no valid event is found.']
    ]);
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'INSTRUCTIONS');

    const inputUrls: any[] = [];
    for (const uid of urlIds) {
      const rec = db.core.eventUrls[uid];
      if (!rec) continue;
      inputUrls.push({
        url_id: rec.id,
        url: rec.url,
        fetched_title: rec.fetched_title || '',
        fetched_text: (rec.fetched_text || '').slice(0, 15000)
      });
    }

    const wsInput = XLSX.utils.json_to_sheet(inputUrls);
    XLSX.utils.book_append_sheet(wb, wsInput, 'INPUT_URLS');

    const resultRows = inputUrls.map(u => ({
      url_id: u.url_id,
      event_name: '',
      subtitle: '',
      start_date: '',
      start_time: '',
      end_date: '',
      end_time: '',
      all_day: 'FALSE',
      venue: '',
      city: 'Kigali',
      country: 'Rwanda',
      organizer: '',
      event_type: 'Conference',
      category: 'Business / Investment',
      price_text: 'Free',
      registration_url: '',
      official_url: u.url,
      description: '',
      confidence: 0.9
    }));
    const wsResults = XLSX.utils.json_to_sheet(resultRows);
    XLSX.utils.book_append_sheet(wb, wsResults, 'EVENT_RESULTS');

    const wsTags = XLSX.utils.json_to_sheet([
      { url_id: urlIds[0] || 'URL-001', tag_concept_key: 'kigali', tag_type: 'PLACE', tag_ko: '키갈리', tag_en: 'Kigali', tag_rw: 'Kigali' }
    ]);
    XLSX.utils.book_append_sheet(wb, wsTags, 'EVENT_TAGS');

    const sanitizedCellCount = sanitizeWorkbookCells(wb);
    if (sanitizedCellCount > 0) {
      console.warn(`[ExcelService] Sanitized ${sanitizedCellCount} oversized Excel cells in ${filename}. Full source bodies are preserved in chunk sheets where applicable.`);
    }
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    db.core.aiBatches[batchId] = {
      batch_id: batchId,
      batch_type: 'event_extraction',
      name: `Event URL Batch (${urlIds.length} URLs)`,
      status: 'EXPORTED',
      item_count: urlIds.length,
      char_count: 0,
      filename,
      created_at: new Date().toISOString()
    };
    db.save();

    return { buffer, filename, batchId };
  }

  /**
   * Generates Integrated Article Workbook
   */
  generateIntegratedArticleWorkbook(articleIds: string[], topicTitle: string): { buffer: Buffer; filename: string; batchId: string } {
    const batchId = `INT-BATCH-${Date.now().toString(36).toUpperCase()}`;
    const filename = `AI_INTEGRATED_ARTICLE_${batchId}.xlsx`;

    const wb = XLSX.utils.book_new();

    const wsInstructions = XLSX.utils.aoa_to_sheet([
      ['=== INTEGRATED ARTICLE GENERATION WORKBOOK ==='],
      ['Synthesize the provided source articles into ONE cohesive, natural news article.'],
      ['STRICT RULES:'],
      ['1. Do NOT output analytical headers like "Key Points", "Differences", or "Facts".'],
      ['2. Produce a single cohesive article: Title, Subtitle, and unified Body.'],
      ['3. In the SENTENCE_SOURCES sheet, map every generated sentence to its source article ID and evidence fragment.'],
      ['4. Preserve uncertainty and attribute conflicting claims.']
    ]);
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'INSTRUCTIONS');

    const inputRows: any[] = [];
    const inputBodyChunkRows: any[] = [];
    for (const id of articleIds) {
      const art = db.core.articles[id];
      if (!art) continue;

      const body = art.original_body || '';
      const bodyChunks = splitExcelText(body);
      appendChunkRows(
        inputBodyChunkRows,
        art.article_id,
        art.original_language || 'unknown',
        'original_body',
        body,
        'INTEGRATED_SOURCE'
      );

      inputRows.push({
        article_id: art.article_id,
        source_name: db.core.sources[art.source_id]?.name || art.source_id,
        title: art.original_title,
        published_at: art.published_at,
        body: safeExcelCellText(body),
        body_chunked: bodyChunks.length > 1 ? 'YES' : 'NO',
        body_chunk_count: bodyChunks.length
      });
    }

    const wsInput = XLSX.utils.json_to_sheet(inputRows);
    XLSX.utils.book_append_sheet(wb, wsInput, 'INPUT_ARTICLES');

    const wsInputChunks = XLSX.utils.json_to_sheet(inputBodyChunkRows);
    XLSX.utils.book_append_sheet(wb, wsInputChunks, 'INPUT_BODY_CHUNKS');

    const wsOutput = XLSX.utils.json_to_sheet([
      {
        batch_id: batchId,
        title: topicTitle || 'Integrated Article Title',
        subtitle: 'Comprehensive synthesis subtitle',
        body: 'Full cohesive article body text...'
      }
    ]);
    XLSX.utils.book_append_sheet(wb, wsOutput, 'INTEGRATED_OUTPUT');

    const wsSentences = XLSX.utils.json_to_sheet([
      {
        sentence_index: 1,
        sentence_text: 'First synthesized sentence...',
        source_article_id: articleIds[0] || 'ART-001',
        source_fragment: 'Quoted or paraphrased fragment from source article'
      }
    ]);
    XLSX.utils.book_append_sheet(wb, wsSentences, 'SENTENCE_SOURCES');

    const sanitizedCellCount = sanitizeWorkbookCells(wb);
    if (sanitizedCellCount > 0) {
      console.warn(`[ExcelService] Sanitized ${sanitizedCellCount} oversized Excel cells in ${filename}. Full source bodies are preserved in chunk sheets where applicable.`);
    }
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    db.core.aiBatches[batchId] = {
      batch_id: batchId,
      batch_type: 'integrated_article',
      name: `Integrated Article: ${topicTitle}`,
      status: 'EXPORTED',
      item_count: articleIds.length,
      char_count: 0,
      filename,
      created_at: new Date().toISOString()
    };
    db.save();

    return { buffer, filename, batchId };
  }
}

export const excelService = new ExcelService();
