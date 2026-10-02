import { Router } from 'express';
import { db } from '../db/database.js';
import { deduplicationService } from '../services/dedup.js';

const router = Router();

// Category normalization helper
function normalizeTopicCategory(cat: string = ''): string {
  const c = cat.toLowerCase();
  if (c.includes('tech') || c.includes('ai')) return 'AI/Tech';
  if (c.includes('educat') || c.includes('school') || c.includes('learn') || c.includes('acad')) return 'Education';
  if (c.includes('econ') || c.includes('estate') || c.includes('invest') || c.includes('business')) return 'Economy/RealEstate';
  if (c.includes('sport')) return 'Sports';
  if (c.includes('politic') || c.includes('gov')) return 'Politics';
  if (c.includes('volunt') || c.includes('communit') || c.includes('charity')) return 'Volunteers';
  if (c.includes('nature') || c.includes('liv') || c.includes('environ') || c.includes('cultur')) return 'Nature/Living';
  return cat;
}

// Region resolution helper
function getArticleRegion(a: any): string {
  if (a.region) return a.region.toLowerCase();
  const src = db.core.sources[a.source_id];
  if (src?.region) return src.region.toLowerCase();
  const cat = (a.portal_category_id || '').toLowerCase();
  if (['rwanda', 'korea', 'africa', 'world'].includes(cat)) return cat;
  return 'rwanda';
}

// GET /api/articles - List with faceted filters & sort
router.get('/', (req, res) => {
  const {
    regions,
    categories,
    aiStatus,
    sources,
    languages,
    tags,
    excludeCategories,
    excludeRegions,
    excludeSources,
    excludeLanguages,
    excludeTags,
    tagLogic = 'AND', // AND or OR
    search,
    sort = 'newest',
    limit = 50,
    offset = 0,
    lang = 'original'
  } = req.query;

  const regionList = regions ? (regions as string).split(',').map(r => r.toLowerCase()).filter(Boolean) : [];
  const categoryList = categories ? (categories as string).split(',').filter(Boolean) : [];
  const aiStatusList = aiStatus ? (aiStatus as string).split(',').map(s => s.toLowerCase()).filter(Boolean) : [];
  const sourceList = sources ? (sources as string).split(',').filter(Boolean) : [];
  const langList = languages ? (languages as string).split(',').filter(Boolean) : [];
  const tagList = tags ? (tags as string).split(',').filter(Boolean) : [];

  const excludeCategoryList = excludeCategories ? (excludeCategories as string).split(',').filter(Boolean) : [];
  const excludeRegionList = excludeRegions ? (excludeRegions as string).split(',').map(r => r.toLowerCase()).filter(Boolean) : [];
  const excludeSourceList = excludeSources ? (excludeSources as string).split(',').filter(Boolean) : [];
  const excludeLangList = excludeLanguages ? (excludeLanguages as string).split(',').filter(Boolean) : [];
  const excludeTagList = excludeTags ? (excludeTags as string).split(',').filter(Boolean) : [];

  const searchQuery = search ? (search as string).toLowerCase().trim() : '';

  let allArticles = Object.values(db.core.articles);

  // Apply Exclude Filters first (AND-NOT logic)
  if (excludeCategoryList.length > 0) {
    allArticles = allArticles.filter(a => {
      const norm = normalizeTopicCategory(a.portal_category_id);
      return !excludeCategoryList.includes(norm) && !excludeCategoryList.includes(a.portal_category_id);
    });
  }

  if (excludeRegionList.length > 0) {
    allArticles = allArticles.filter(a => !excludeRegionList.includes(getArticleRegion(a)));
  }

  if (excludeSourceList.length > 0) {
    allArticles = allArticles.filter(a => !excludeSourceList.includes(a.source_id));
  }

  if (excludeLangList.length > 0) {
    allArticles = allArticles.filter(a => !excludeLangList.includes(a.original_language.toLowerCase()));
  }

  // Apply Facet Filters
  // 1. Region Filter (rwanda/korea/africa/world)
  if (regionList.length > 0) {
    allArticles = allArticles.filter(a => regionList.includes(getArticleRegion(a)));
  }

  // 2. Main Topic Category
  if (categoryList.length > 0) {
    allArticles = allArticles.filter(a => {
      const norm = normalizeTopicCategory(a.portal_category_id);
      return categoryList.includes(norm) || categoryList.includes(a.portal_category_id);
    });
  }

  // 3. AI Processed Status (Done / Waiting)
  if (aiStatusList.length > 0) {
    allArticles = allArticles.filter(a => {
      const isDone = a.processing_status === 'PROCESSED';
      const isWaiting = a.processing_status !== 'PROCESSED';
      if (aiStatusList.includes('done') && isDone) return true;
      if (aiStatusList.includes('waiting') && isWaiting) return true;
      return false;
    });
  }

  // 4. Source Page / Domain (OR within row)
  if (sourceList.length > 0) {
    allArticles = allArticles.filter(a => sourceList.includes(a.source_id));
  }

  // 5. Original Language (OR within row)
  if (langList.length > 0) {
    allArticles = allArticles.filter(a => langList.includes(a.original_language.toLowerCase()));
  }

  // 6. Tags (Include and Exclude)
  if (tagList.length > 0 || excludeTagList.length > 0) {
    const normalizedQueryTags = tagList.map(t => t.toLowerCase().trim()).filter(Boolean);
    const normalizedExcludeTags = excludeTagList.map(t => t.toLowerCase().trim()).filter(Boolean);

    allArticles = allArticles.filter(art => {
      // Find all tag concept IDs associated with this article
      const artTagConceptIds = Array.from(new Set([
        ...(db.en.articleTags[art.article_id] || []),
        ...(db.ko.articleTags[art.article_id] || []),
        ...(db.rw.articleTags[art.article_id] || [])
      ]));

      // Build a comprehensive set of lowercase identifiers for this article
      const artTagValues = new Set<string>();
      for (const tcId of artTagConceptIds) {
        artTagValues.add(tcId.toLowerCase());
        const concept = db.core.tagConcepts[tcId];
        if (concept?.key) {
          artTagValues.add(concept.key.toLowerCase());
        }
        const nameEn = db.en.tags[tcId]?.name;
        if (nameEn) artTagValues.add(nameEn.toLowerCase());
        const nameKo = db.ko.tags[tcId]?.name;
        if (nameKo) artTagValues.add(nameKo.toLowerCase());
        const nameRw = db.rw.tags[tcId]?.name;
        if (nameRw) artTagValues.add(nameRw.toLowerCase());

        // Check if any alias in db.core.tagAliases points to this concept ID
        for (const [alias, aliasEntry] of Object.entries(db.core.tagAliases || {})) {
          const targetConceptId = typeof aliasEntry === 'string' ? aliasEntry : aliasEntry?.tag_concept_id;
          if (targetConceptId === tcId) {
            artTagValues.add(alias.toLowerCase());
            if (aliasEntry && typeof aliasEntry === 'object' && aliasEntry.alias) {
              artTagValues.add(aliasEntry.alias.toLowerCase());
            }
          }
        }
      }

      const matchesTag = (queryTag: string) => {
        if (artTagValues.has(queryTag)) return true;
        const aliasEntry = db.core.tagAliases?.[queryTag] || db.core.tagAliases?.[queryTag.toLowerCase()];
        const aliasTargetId = typeof aliasEntry === 'string' ? aliasEntry : aliasEntry?.tag_concept_id;
        if (aliasTargetId && artTagConceptIds.includes(aliasTargetId)) return true;
        return false;
      };

      // Exclude check: If article contains any of the excluded tags, exclude it
      if (normalizedExcludeTags.length > 0) {
        const hasExcluded = normalizedExcludeTags.some(t => matchesTag(t));
        if (hasExcluded) return false;
      }

      // Include check
      if (normalizedQueryTags.length > 0) {
        if (tagLogic === 'OR') {
          return normalizedQueryTags.some(t => matchesTag(t));
        } else {
          return normalizedQueryTags.every(t => matchesTag(t));
        }
      }

      return true;
    });
  }

  // Search filter
  if (searchQuery) {
    allArticles = allArticles.filter(a =>
      a.original_title.toLowerCase().includes(searchQuery) ||
      (a.original_subtitle && a.original_subtitle.toLowerCase().includes(searchQuery)) ||
      a.original_body.toLowerCase().includes(searchQuery) ||
      (a.author && a.author.toLowerCase().includes(searchQuery))
    );
  }

  // Sort
  if (sort === 'oldest') {
    allArticles.sort((a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime());
  } else if (sort === 'recently_collected') {
    allArticles.sort((a, b) => new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime());
  } else if (sort === 'source') {
    allArticles.sort((a, b) => a.source_id.localeCompare(b.source_id));
  } else {
    // newest default
    allArticles.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
  }

  const total = allArticles.length;
  const paginated = allArticles.slice(Number(offset), Number(offset) + Number(limit));

  // Map localized display data if requested language is ko/en/rw
  const results = paginated.map(art => {
    let title = art.original_title;
    let subtitle = art.original_subtitle;
    let summary = art.original_subtitle || art.original_body.slice(0, 180) + '...';
    let isLocalized = false;

    if (lang === 'ko' && db.ko.articles[art.article_id]) {
      title = db.ko.articles[art.article_id].title;
      subtitle = db.ko.articles[art.article_id].subtitle;
      summary = db.ko.articles[art.article_id].summary || summary;
      isLocalized = true;
    } else if (lang === 'en' && db.en.articles[art.article_id]) {
      title = db.en.articles[art.article_id].title;
      subtitle = db.en.articles[art.article_id].subtitle;
      summary = db.en.articles[art.article_id].summary || summary;
      isLocalized = true;
    } else if (lang === 'rw' && db.rw.articles[art.article_id]) {
      title = db.rw.articles[art.article_id].title;
      subtitle = db.rw.articles[art.article_id].subtitle;
      summary = db.rw.articles[art.article_id].summary || summary;
      isLocalized = true;
    }

    const storyCluster = art.story_cluster_id ? db.core.storyClusters[art.story_cluster_id] : undefined;
    const relatedStoriesCount = (storyCluster && art.story_cluster_id) ? (db.core.storyClusterArticles[art.story_cluster_id]?.length || 0) : 0;

    // Associated events
    const relatedEvents = Object.entries(db.core.eventArticles)
      .filter(([_, artIds]) => artIds.includes(art.article_id))
      .map(([eventId]) => db.core.events[eventId])
      .filter(Boolean);

    // Tags
    const tagConceptIds = db.en.articleTags[art.article_id] || db.ko.articleTags[art.article_id] || db.rw.articleTags[art.article_id] || [];
    const tagsInfo = tagConceptIds.map(tcId => {
      const concept = db.core.tagConcepts[tcId];
      return {
        id: tcId,
        key: concept?.key || tcId,
        name: db.en.tags[tcId]?.name || db.ko.tags[tcId]?.name || db.rw.tags[tcId]?.name || concept?.key,
        type: concept?.type || 'TOPIC'
      };
    });

    return {
      ...art,
      displayTitle: title,
      displaySubtitle: subtitle,
      displaySummary: summary,
      isLocalized,
      storyCluster,
      relatedStoriesCount,
      relatedEvents,
      tags: tagsInfo
    };
  });

  res.json({
    total,
    articles: results,
    limit: Number(limit),
    offset: Number(offset)
  });
});

// GET /api/articles/:id - Detail view
router.get('/:id', (req, res) => {
  const art = db.core.articles[req.params.id];
  if (!art) {
    return res.status(404).json({ error: 'Article not found' });
  }

  const ko = db.ko.articles[art.article_id];
  const en = db.en.articles[art.article_id];
  const rw = db.rw.articles[art.article_id];

  const storyCluster = art.story_cluster_id ? db.core.storyClusters[art.story_cluster_id] : undefined;
  const clusterArticleIds = art.story_cluster_id ? (db.core.storyClusterArticles[art.story_cluster_id] || []) : [];
  
  // Relations from db.core.articleRelations or fallback to storyCluster / date sorting
  const rels = db.core.articleRelations?.[art.article_id] || { similar: [], previous: [], future: [] };
  
  // Also check direct article fields if set
  const similarIds = new Set<string>([...rels.similar, ...(art.similar_article_ids || [])]);
  const previousIds = new Set<string>([...rels.previous, ...(art.previous_article_ids || [])]);
  const futureIds = new Set<string>([...rels.future, ...(art.future_article_ids || [])]);

  // If no explicit relations yet, but in story cluster, categorize cluster articles by date
  if (similarIds.size === 0 && previousIds.size === 0 && futureIds.size === 0 && clusterArticleIds.length > 1) {
    const artTime = new Date(art.published_at).getTime();
    clusterArticleIds.forEach(id => {
      if (id === art.article_id) return;
      const other = db.core.articles[id];
      if (!other) return;
      const otherTime = new Date(other.published_at).getTime();
      const diffHours = (otherTime - artTime) / (1000 * 60 * 60);
      if (diffHours < -12) previousIds.add(id);
      else if (diffHours > 12) futureIds.add(id);
      else similarIds.add(id);
    });
  }

  const mapArticleSummary = (id: string) => {
    const a = db.core.articles[id];
    if (!a) return null;
    return {
      article_id: a.article_id,
      original_title: a.original_title,
      published_at: a.published_at,
      source_id: a.source_id,
      lead_image_url: a.lead_image_url,
      portal_category_id: a.portal_category_id
    };
  };

  const similarArticles = Array.from(similarIds).map(mapArticleSummary).filter(Boolean);
  const previousArticles = Array.from(previousIds).map(mapArticleSummary).filter(Boolean).sort((a: any, b: any) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
  const futureArticles = Array.from(futureIds).map(mapArticleSummary).filter(Boolean).sort((a: any, b: any) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime());

  const allRelatedIds = new Set([...clusterArticleIds, ...similarIds, ...previousIds, ...futureIds]);
  allRelatedIds.delete(art.article_id);
  const relatedArticles = Array.from(allRelatedIds).map(id => db.core.articles[id]).filter(Boolean);

  const rawRelatedEvents = Object.entries(db.core.eventArticles)
    .filter(([_, artIds]) => artIds.includes(art.article_id))
    .map(([eventId]) => db.core.events[eventId])
    .filter(Boolean);

  const relatedEvents = rawRelatedEvents.map(evt => {
    const coArticleIds = (db.core.eventArticles[evt.event_id] || []).filter(id => id !== art.article_id);
    const coArticles = coArticleIds.map(id => {
      const a = db.core.articles[id];
      if (!a) return null;
      return {
        article_id: a.article_id,
        original_title: a.original_title,
        source_id: a.source_id,
        published_at: a.published_at,
        lead_image_url: a.lead_image_url || a.image_urls?.[0]
      };
    }).filter(Boolean);
    return {
      ...evt,
      coArticles
    };
  });

  const tagConceptIds = db.en.articleTags[art.article_id] || db.ko.articleTags[art.article_id] || db.rw.articleTags[art.article_id] || [];
  const tagsInfo = tagConceptIds.map(tcId => {
    const concept = db.core.tagConcepts[tcId];
    return {
      id: tcId,
      key: concept?.key,
      nameEn: db.en.tags[tcId]?.name,
      nameKo: db.ko.tags[tcId]?.name,
      nameRw: db.rw.tags[tcId]?.name,
      type: concept?.type
    };
  });

  res.json({
    article: art,
    localized: { ko, en, rw },
    storyCluster,
    relatedArticles,
    similarArticles,
    previousArticles,
    futureArticles,
    relatedEvents,
    tags: tagsInfo
  });
});

// POST /api/articles/group-similar - Auto-examine titles and dates to group similar and previous/future articles
router.post('/group-similar', (req, res) => {
  const { articleIds } = req.body;
  const result = deduplicationService.updateArticleRelations(articleIds);
  res.json({
    success: true,
    message: `Analyzed titles & dates: updated relations for ${result.updatedCount} articles, created ${result.clustersCreated} story clusters`,
    ...result
  });
});

// POST /api/articles/story-cluster - Manage story clusters (merge, split, move)
router.post('/story-cluster', (req, res) => {
  const { action, clusterId, articleIds, targetClusterId, title } = req.body;

  if (action === 'create' && articleIds?.length > 0) {
    const newClusterId = `CLUSTER-${Date.now().toString(36)}`;
    const repId = articleIds[0];
    const repArticle = db.core.articles[repId];
    db.core.storyClusters[newClusterId] = {
      id: newClusterId,
      title: title || repArticle?.original_title || 'Story Cluster',
      representative_article_id: repId,
      article_count: articleIds.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.core.storyClusterArticles[newClusterId] = articleIds;
    articleIds.forEach((id: string) => {
      if (db.core.articles[id]) db.core.articles[id].story_cluster_id = newClusterId;
    });
    db.save();
    return res.json({ success: true, clusterId: newClusterId });
  }

  if (action === 'merge' && clusterId && targetClusterId) {
    const sourceArts = db.core.storyClusterArticles[clusterId] || [];
    if (!db.core.storyClusterArticles[targetClusterId]) db.core.storyClusterArticles[targetClusterId] = [];

    sourceArts.forEach(id => {
      if (!db.core.storyClusterArticles[targetClusterId].includes(id)) {
        db.core.storyClusterArticles[targetClusterId].push(id);
      }
      if (db.core.articles[id]) db.core.articles[id].story_cluster_id = targetClusterId;
    });

    db.core.storyClusters[targetClusterId].article_count = db.core.storyClusterArticles[targetClusterId].length;
    delete db.core.storyClusters[clusterId];
    delete db.core.storyClusterArticles[clusterId];
    db.save();
    return res.json({ success: true });
  }

  if (action === 'remove' && clusterId && articleIds) {
    db.core.storyClusterArticles[clusterId] = (db.core.storyClusterArticles[clusterId] || []).filter(id => !articleIds.includes(id));
    articleIds.forEach((id: string) => {
      if (db.core.articles[id] && db.core.articles[id].story_cluster_id === clusterId) {
        delete db.core.articles[id].story_cluster_id;
      }
    });
    db.core.storyClusters[clusterId].article_count = db.core.storyClusterArticles[clusterId].length;
    db.save();
    return res.json({ success: true });
  }

  res.status(400).json({ error: 'Invalid action or parameters' });
});

// GET /api/articles/story-cluster/:clusterId - Get story cluster articles
router.get('/story-cluster/:clusterId', (req, res) => {
  const { clusterId } = req.params;
  const lang = (req.query.lang as string) || 'original';
  const cluster = db.core.storyClusters[clusterId];
  if (!cluster) {
    return res.status(404).json({ error: 'Story cluster not found' });
  }

  const artIds = db.core.storyClusterArticles[clusterId] || [];
  const articles = artIds
    .map(id => db.core.articles[id])
    .filter(Boolean)
    .map(art => {
      let title = art.original_title;
      let subtitle = art.original_subtitle;
      let summary = art.original_body ? art.original_body.slice(0, 180) + '...' : '';

      if (lang === 'ko' && db.ko.articles[art.article_id]) {
        title = db.ko.articles[art.article_id].title;
        subtitle = db.ko.articles[art.article_id].subtitle;
        summary = db.ko.articles[art.article_id].summary || summary;
      } else if (lang === 'en' && db.en.articles[art.article_id]) {
        title = db.en.articles[art.article_id].title;
        subtitle = db.en.articles[art.article_id].subtitle;
        summary = db.en.articles[art.article_id].summary || summary;
      } else if (lang === 'rw' && db.rw.articles[art.article_id]) {
        title = db.rw.articles[art.article_id].title;
        subtitle = db.rw.articles[art.article_id].subtitle;
        summary = db.rw.articles[art.article_id].summary || summary;
      }

      return {
        ...art,
        displayTitle: title,
        displaySubtitle: subtitle,
        displaySummary: summary
      };
    });

  res.json({ cluster, articles });
});

export default router;
