export interface ContentBlock {
  blockId: string;
  type: 'paragraph' | 'heading' | 'blockquote' | 'image' | 'video' | 'embed';
  text?: string;
  headingLevel?: number;
  imageId?: string;
  url?: string;
  alt?: string;
  caption?: string;
  credit?: string;
}
export interface ExtractedImage {imageId:string;url:string;alt?:string;caption?:string;credit?:string}
export interface ParsedArticle {sourceId:string;sourceUrl:string;canonicalUrl:string;originalLanguage:string;originalTitle:string;originalSubtitle?:string;originalBody:string;author?:string;publishedAt:string;updatedAt?:string;sourceSection?:string;region?:string;leadImageUrl?:string;imageUrls:string[];contentBlocks:ContentBlock[]}
export interface DiscoveredArticleHint {url:string;section?:string;publishedAtHint?:string;titleHint?:string}
export interface DiscoveryOptions {mode:'backfill'|'incremental';cutoffDate?:Date;maxPagesPerSection?:number;checkpointPage?:number}
export interface DiscoveryResult {articles:DiscoveredArticleHint[];oldestDateReached?:Date;lastSuccessfulPage:number;completed:boolean}
export interface SourceMetadata {id:string;domain:string;name:string;region:'rwanda'|'korea'|'africa'|'world';type:'news'|'government'|'social';defaultLanguage:string;homeUrl:string;sections:{id:string;name:string;path:string}[];enabled:boolean}
export interface SourceAdapter {getMetadata():SourceMetadata;discoverArticles(options:DiscoveryOptions):Promise<DiscoveryResult>;fetchArticle(url:string):Promise<string>;parseArticle(html:string,url:string):Promise<ParsedArticle|null>;normalizeArticle(article:ParsedArticle):ParsedArticle}
