import { db } from './database.js';
import { sourceRegistry } from '../sources/registry.js';

export function seedInitialData(): void {
  // 1. Seed sources from source registry
  const metadataList = sourceRegistry.getAllMetadata();
  for (const meta of metadataList) {
    if (!db.core.sources[meta.id]) {
      db.core.sources[meta.id] = {
        id: meta.id,
        domain: meta.domain,
        name: meta.name,
        region: meta.region,
        type: meta.type,
        defaultLanguage: meta.defaultLanguage,
        homeUrl: meta.homeUrl,
        enabled: meta.enabled,
        createdAt: new Date('2026-09-01T00:00:00Z').toISOString(),
        updatedAt: new Date().toISOString()
      };
    }
  }

  // 2. Multilingual Tag Concepts
  const initialTags = [
    { id: 'TAG-CONCEPT-001', key: 'kigali', type: 'PLACE', en: 'Kigali', ko: '키갈리', rw: 'Kigali', aliases: ['Kigali City', 'Umujyi wa Kigali'] },
    { id: 'TAG-CONCEPT-002', key: 'investment', type: 'TOPIC', en: 'Investment', ko: '투자 유치', rw: 'Ishoramari', aliases: ['FDI', 'Direct Investment'] },
    { id: 'TAG-CONCEPT-003', key: 'rdb', type: 'ORGANIZATION', en: 'Rwanda Development Board (RDB)', ko: '르완다 개발청 (RDB)', rw: 'Urwego rw’Igihugu rw’Iterambere (RDB)', aliases: ['RDB', 'Rwanda Development Board'] },
    { id: 'TAG-CONCEPT-004', key: 'education', type: 'TOPIC', en: 'Education', ko: '교육 혁신', rw: 'Uburezi', aliases: ['REB', 'School System'] },
    { id: 'TAG-CONCEPT-005', key: 'ai', type: 'INDUSTRY', en: 'AI & Semiconductors', ko: '인공지능 및 반도체', rw: 'Ikoranabuhanga rya AI', aliases: ['Artificial Intelligence', 'DeepTech'] },
    { id: 'TAG-CONCEPT-006', key: 'real-estate', type: 'INDUSTRY', en: 'Real Estate & Infrastructure', ko: '부동산 및 도시인프라', rw: 'Imyubakire n’Ubutaka', aliases: ['Construction', 'Housing'] },
    { id: 'TAG-CONCEPT-007', key: 'kcc', type: 'PLACE', en: 'Kigali Convention Centre', ko: '키갈리 컨벤션 센터', rw: 'Kigali Convention Centre', aliases: ['KCC', 'Radisson Blu KCC'] },
    { id: 'TAG-CONCEPT-008', key: 'green-economy', type: 'TOPIC', en: 'Green Economy', ko: '친환경 녹색 경제', rw: 'Ubukungu Butangiza Ibidukikije', aliases: ['Sustainability', 'Carbon Neutral'] }
  ];

  for (const tag of initialTags) {
    if (!db.core.tagConcepts[tag.id]) {
      db.core.tagConcepts[tag.id] = {
        tag_concept_id: tag.id,
        key: tag.key,
        type: tag.type as any,
        created_at: new Date('2026-09-01T00:00:00Z').toISOString()
      };

      for (const alias of tag.aliases) {
        const aliasId = `ALIAS-${tag.key}-${Math.random().toString(36).slice(2, 7)}`;
        db.core.tagAliases[aliasId] = {
          id: aliasId,
          tag_concept_id: tag.id,
          alias,
          language: 'en'
        };
      }

      db.en.tags[tag.id] = { tag_concept_id: tag.id, name: tag.en };
      db.ko.tags[tag.id] = { tag_concept_id: tag.id, name: tag.ko };
      db.rw.tags[tag.id] = { tag_concept_id: tag.id, name: tag.rw };
    }
  }

  // NOTE: Requirement 1: Do NOT seed mock/example articles or events.
  // Real articles are collected through crawlers and persisted directly to SQLite.
  db.purgeMockData();
  db.saveSync();
}
