import { db } from '../db/database.js';
import { IntegratedArticleRecord } from '../db/types.js';

export interface SentenceTraceInput {
  sentenceIndex: number;
  sentenceText: string;
  sourceArticleId: string;
  sourceFragment: string;
}

export class IntegratedArticleService {
  saveIntegratedArticle(data: {
    title: string;
    subtitle?: string;
    body: string;
    portalCategoryId: string;
    sourceArticleIds: string[];
    sentences?: SentenceTraceInput[];
  }): IntegratedArticleRecord {
    const intId = `INT-ART-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const record: IntegratedArticleRecord = {
      integrated_article_id: intId,
      title: data.title,
      subtitle: data.subtitle,
      body: data.body,
      portal_category_id: data.portalCategoryId,
      source_article_ids: data.sourceArticleIds,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    db.core.integratedArticles[intId] = record;

    // Split body into sentences if sentences trace not explicitly provided
    if (data.sentences && data.sentences.length > 0) {
      for (const st of data.sentences) {
        const sentId = `SENT-${intId}-${st.sentenceIndex}`;
        db.core.integratedSentences[sentId] = {
          sentence_id: sentId,
          integrated_article_id: intId,
          sentence_index: st.sentenceIndex,
          sentence_text: st.sentenceText
        };

        const srcId = `ISRC-${sentId}-1`;
        const srcArt = db.core.articles[st.sourceArticleId];
        db.core.integratedSentenceSources[srcId] = {
          id: srcId,
          sentence_id: sentId,
          source_article_id: st.sourceArticleId,
          source_title: srcArt?.original_title || db.core.sources[srcArt?.source_id]?.name,
          source_url: srcArt?.source_url,
          source_fragment: st.sourceFragment
        };
      }
    } else {
      // Auto-segment paragraphs / sentences for baseline trace
      const rawSentences = data.body
        .split(/(?<=[.?!])\s+/)
        .filter(s => s.trim().length > 10);

      for (let i = 0; i < rawSentences.length; i++) {
        const sentId = `SENT-${intId}-${i + 1}`;
        db.core.integratedSentences[sentId] = {
          sentence_id: sentId,
          integrated_article_id: intId,
          sentence_index: i + 1,
          sentence_text: rawSentences[i]
        };

        // Attribute to representative source articles
        const targetArtId = data.sourceArticleIds[i % data.sourceArticleIds.length];
        const srcArt = db.core.articles[targetArtId];
        const srcId = `ISRC-${sentId}-1`;
        db.core.integratedSentenceSources[srcId] = {
          id: srcId,
          sentence_id: sentId,
          source_article_id: targetArtId,
          source_title: srcArt?.original_title || 'Source Reference',
          source_url: srcArt?.source_url,
          source_fragment: (srcArt?.original_body || '').slice(0, 180) + '...'
        };
      }
    }

    db.save();
    return record;
  }

  getSentenceTraces(integratedArticleId: string) {
    const sentences = Object.values(db.core.integratedSentences)
      .filter(s => s.integrated_article_id === integratedArticleId)
      .sort((a, b) => a.sentence_index - b.sentence_index);

    return sentences.map(sent => {
      const sources = Object.values(db.core.integratedSentenceSources)
        .filter(src => src.sentence_id === sent.sentence_id);
      return {
        ...sent,
        sources
      };
    });
  }
}

export const integratedArticleService = new IntegratedArticleService();
