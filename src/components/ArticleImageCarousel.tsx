import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';

interface ArticleImageCarouselProps {
  leadImageUrl?: string;
  imageUrls?: string[];
  contentBlocks?: any[];
  altTitle?: string;
  onClick?: () => void;
  aspectRatioClass?: string;
  compact?: boolean;
  className?: string;
}

export const ArticleImageCarousel: React.FC<ArticleImageCarouselProps> = ({
  leadImageUrl,
  imageUrls = [],
  contentBlocks = [],
  altTitle = '',
  onClick,
  aspectRatioClass = 'aspect-video',
  compact = false,
  className = ''
}) => {
  // Collect all unique, valid image URLs
  const candidateUrls = [
    leadImageUrl,
    ...imageUrls,
    ...contentBlocks.filter(b => b.type === 'image' && b.url).map(b => b.url)
  ].filter((url): url is string => typeof url === 'string' && url.trim().length > 0);

  const images = Array.from(new Set(candidateUrls));
  const [currentIndex, setCurrentIndex] = useState(0);

  if (images.length === 0) {
    return null;
  }

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const currentImage = images[currentIndex];

  return (
    <div className={`relative overflow-hidden ${className || 'rounded-xl border border-[var(--border)]'} group bg-[var(--bg-main)] ${aspectRatioClass}`}>
      <img
        src={currentImage}
        alt={altTitle || 'Article photo'}
        referrerPolicy="no-referrer"
        onClick={onClick}
        className="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-[1.02]"
      />

      {/* Multi-photo indicator and left/right swap controls */}
      {images.length > 1 && (
        <>
          {/* Left button */}
          <button
            onClick={handlePrev}
            aria-label="Previous photo"
            className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/60 hover:bg-black/85 text-white backdrop-blur-xs opacity-85 group-hover:opacity-100 transition-opacity z-10"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          {/* Right button */}
          <button
            onClick={handleNext}
            aria-label="Next photo"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/60 hover:bg-black/85 text-white backdrop-blur-xs opacity-85 group-hover:opacity-100 transition-opacity z-10"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {/* Counter pill */}
          <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-black/70 text-white backdrop-blur-xs flex items-center space-x-1 pointer-events-none z-10">
            <ImageIcon className="w-2.5 h-2.5 text-[var(--accent)]" />
            <span>{currentIndex + 1}/{images.length}</span>
          </div>

          {/* Dot indicators */}
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center space-x-1 pointer-events-none z-10">
            {images.slice(0, 7).map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === currentIndex ? 'w-3 bg-white' : 'w-1 bg-white/50'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
