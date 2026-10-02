import { db } from '../db/database.js';
import { ArticleRecord } from '../db/types.js';
import { calculateSimilarity, contentHash, normalizeTitle } from '../sources/utils/hash.js';

export class DeduplicationService {
  /**
   * Evaluates if a newly crawled article is an exact or near duplicate of an existing one.
   * Returns duplicate_group_id if duplicate found, or creates a new one.
   */
  processArticleDuplicates(article: ArticleRecord): { isDuplicate: boolean; duplicateGroupId?: string } {
    const allArticles = Object.values(db.core.articles);

    for (const existing of allArticles) {
      if (existing.article_id === article.article_id) continue;

      // 1. Canonical URL match
      if (existing.canonical_url && article.canonical_url && existing.canonical_url === article.canonical_url) {
        return this.assignDuplicateGroup(existing, article);
      }

      // 2. Exact content hash match
      if (existing.content_hash && article.content_hash && existing.content_hash === article.content_hash) {
        return this.assignDuplicateGroup(existing, article);
      }

      // 3. Near-duplicate: Same source domain + normalized title similarity > 0.9 + same date
      if (existing.source_id === article.source_id) {
        const titleSim = calculateSimilarity(existing.normalized_title, article.normalized_title);
        const dateA = existing.published_at.slice(0, 10);
        const dateB = article.published_at.slice(0, 10);
        if (titleSim >= 0.9 && dateA === dateB) {
          return this.assignDuplicateGroup(existing, article);
        }
      }
    }

    return { isDuplicate: false };
  }

  private assignDuplicateGroup(existing: ArticleRecord, incoming: ArticleRecord): { isDuplicate: boolean; duplicateGroupId: string } {
    let groupId = existing.duplicate_group_id;

    if (!groupId) {
      groupId = `DUP-GRP-${Math.random().toString(36).slice(2, 9)}`;
      existing.duplicate_group_id = groupId;
      db.core.duplicateGroups[groupId] = {
        id: groupId,
        canonicalArticleId: existing.article_id,
        articleIds: [existing.article_id, incoming.article_id]
      };
    } else {
      if (!db.core.duplicateGroups[groupId]) {
        db.core.duplicateGroups[groupId] = {
          id: groupId,
          canonicalArticleId: existing.article_id,
          articleIds: [existing.article_id]
        };
      }
      if (!db.core.duplicateGroups[groupId].articleIds.includes(incoming.article_id)) {
        db.core.duplicateGroups[groupId].articleIds.push(incoming.article_id);
      }
    }

    incoming.duplicate_group_id = groupId;
    db.save();
    return { isDuplicate: true, duplicateGroupId: groupId };
  }

  /**
   * Assigns or clusters articles reporting the same real-world story across different sources.
   */
  findStoryCluster(article: ArticleRecord): string | undefined {
    const allArticles = Object.values(db.core.articles);
    const artDate = new Date(article.published_at).getTime();

    for (const other of allArticles) {
      if (other.article_id === article.article_id) continue;
      // Must be within 4 days of each other
      const otherDate = new Date(other.published_at).getTime();
      const diffHours = Math.abs(artDate - otherDate) / (1000 * 60 * 60);
      if (diffHours > 96) continue;

      const titleSim = calculateSimilarity(article.normalized_title, other.normalized_title);
      if (titleSim >= 0.55) {
        if (other.story_cluster_id) {
          return other.story_cluster_id;
        } else {
          // Form new story cluster
          const newClusterId = `CLUSTER-${Math.random().toString(36).slice(2, 8)}`;
          db.core.storyClusters[newClusterId] = {
            id: newClusterId,
            title: other.original_title,
            representative_article_id: other.article_id,
            article_count: 2,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          db.core.storyClusterArticles[newClusterId] = [other.article_id, article.article_id];
          other.story_cluster_id = newClusterId;
          db.save();
          return newClusterId;
        }
      }
    }
    return undefined;
  }

  /**
   * Examines titles and published dates across articles to discover:
   * 1. Similar articles (covering the same story/event)
   * 2. Previous related articles (published earlier in time, providing historical context)
   * 3. Future / Follow-up related articles (published later in time, providing subsequent developments)
   */
  updateArticleRelations(targetArticleIds?: string[]): { updatedCount: number; clustersCreated: number } {
    if (!db.core.articleRelations) {
      db.core.articleRelations = {};
    }

    const allArticles = Object.values(db.core.articles);
    const scopeArticles = targetArticleIds
      ? targetArticleIds.map(id => db.core.articles[id]).filter(Boolean)
      : allArticles;

    let updatedCount = 0;
    let clustersCreated = 0;

    for (const art of scopeArticles) {
      const artTime = new Date(art.published_at).getTime();
      const artNorm = art.normalized_title || normalizeTitle(art.original_title);

      const similarSet = new Set<string>();
      const previousSet = new Set<string>();
      const futureSet = new Set<string>();

      for (const other of allArticles) {
        if (other.article_id === art.article_id) continue;

        const otherNorm = other.normalized_title || normalizeTitle(other.original_title);
        const sim = calculateSimilarity(artNorm, otherNorm);
        const otherTime = new Date(other.published_at).getTime();
        const diffHours = (otherTime - artTime) / (1000 * 60 * 60);

        // Meaningful title similarity (>= 0.40) or shared topic keywords
        const artWords = new Set(artNorm.split(' ').filter(w => w.length > 3));
        const otherWords = new Set(otherNorm.split(' ').filter(w => w.length > 3));
        let sharedCount = 0;
        artWords.forEach(w => { if (otherWords.has(w)) sharedCount++; });
        const hasKeywordMatch = sharedCount >= 2 && Math.abs(diffHours) < 720; // within 30 days

        if (sim >= 0.45 || (sim >= 0.35 && hasKeywordMatch) || (art.story_cluster_id && art.story_cluster_id === other.story_cluster_id)) {
          // Categorize chronologically
          if (diffHours < -12) {
            // Published earlier (>12h prior) => PREVIOUS related article
            previousSet.add(other.article_id);
          } else if (diffHours > 12) {
            // Published later (>12h after) => FUTURE / follow-up related article
            futureSet.add(other.article_id);
          } else {
            // Published around same time (-12h to +12h) => SIMILAR contemporaneous coverage
            similarSet.add(other.article_id);
          }

          // If not in story cluster, cluster them
          if (!art.story_cluster_id && !other.story_cluster_id && Math.abs(diffHours) <= 168) {
            const newClusterId = `CLUSTER-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            db.core.storyClusters[newClusterId] = {
              id: newClusterId,
              title: art.original_title,
              representative_article_id: art.article_id,
              article_count: 2,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            db.core.storyClusterArticles[newClusterId] = [art.article_id, other.article_id];
            art.story_cluster_id = newClusterId;
            other.story_cluster_id = newClusterId;
            clustersCreated++;
          } else if (art.story_cluster_id && !other.story_cluster_id && Math.abs(diffHours) <= 168) {
            other.story_cluster_id = art.story_cluster_id;
            if (!db.core.storyClusterArticles[art.story_cluster_id]) {
              db.core.storyClusterArticles[art.story_cluster_id] = [];
            }
            if (!db.core.storyClusterArticles[art.story_cluster_id].includes(other.article_id)) {
              db.core.storyClusterArticles[art.story_cluster_id].push(other.article_id);
            }
            if (db.core.storyClusters[art.story_cluster_id]) {
              db.core.storyClusters[art.story_cluster_id].article_count = db.core.storyClusterArticles[art.story_cluster_id].length;
            }
          }
        }
      }

      // Preserve existing manual or chatGPT excel links if any
      const existing = db.core.articleRelations[art.article_id] || { similar: [], previous: [], future: [] };
      existing.similar.forEach(id => similarSet.add(id));
      existing.previous.forEach(id => previousSet.add(id));
      existing.future.forEach(id => futureSet.add(id));

      db.core.articleRelations[art.article_id] = {
        similar: Array.from(similarSet),
        previous: Array.from(previousSet),
        future: Array.from(futureSet),
        cluster_title: art.story_cluster_id ? db.core.storyClusters[art.story_cluster_id]?.title : undefined
      };

      art.similar_article_ids = Array.from(similarSet);
      art.previous_article_ids = Array.from(previousSet);
      art.future_article_ids = Array.from(futureSet);

      updatedCount++;
    }

    db.save();
    return { updatedCount, clustersCreated };
  }
}

export const deduplicationService = new DeduplicationService();
