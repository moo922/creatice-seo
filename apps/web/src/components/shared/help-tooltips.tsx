import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Concept help tooltips for AEO, GEO, AI Visibility, and other platform-specific
 * terms. Shown as inline badges that expand on click to explain what the concept
 * means in plain language.
 */

const CONCEPTS: Record<string, { title: string; short: string; full: string }> = {
  AEO: {
    title: 'Answer Engine Optimization (AEO)',
    short: 'Optimizing for AI-powered search answers (ChatGPT, Perplexity, Gemini).',
    full: 'AEO focuses on making your content the preferred source when AI assistants generate answers. Unlike traditional SEO which optimizes for blue links, AEO optimizes for being cited, referenced, or used as the basis for AI-generated responses. This includes structured data, authoritative claims, and question-answer format.',
  },
  GEO: {
    title: 'Generative Engine Optimization (GEO)',
    short: 'Optimizing content for AI-generated search results and overviews.',
    full: 'GEO is about ensuring your content appears in AI-generated search features like Google\'s AI Overviews, Bing Chat, and Perplexity. It involves entity optimization, factual accuracy, citation readiness, and structuring content so AI systems can reliably extract and present your information.',
  },
  'AI Visibility': {
    title: 'AI Visibility',
    short: 'How visible your brand/domain is across AI-powered search and chat platforms.',
    full: 'AI Visibility measures whether AI systems (ChatGPT, Perplexity, Gemini, Claude, etc.) mention your brand, cite your content, or recommend your products/services when users ask relevant questions. It\'s tracked through controlled prompt observations across multiple AI providers.',
  },
  Cannibalization: {
    title: 'Keyword Cannibalization',
    short: 'When multiple pages compete for the same keyword, diluting rankings.',
    full: 'Cannibalization occurs when two or more pages on your site target the same or very similar keywords. Instead of one strong page ranking well, you get multiple weak pages that split clicks and authority. The platform detects this through keyword mapping analysis and GSC data.',
  },
  'URL Mapping': {
    title: 'URL Mapping',
    short: 'Assigning target keywords to specific pages on your site.',
    full: 'URL Mapping is the process of deciding which page should rank for which keyword. Each important keyword should map to exactly one page. This prevents cannibalization and ensures your strongest page targets your most important queries.',
  },
  Baseline: {
    title: 'Baseline Snapshot',
    short: 'A reference point capturing your site\'s state at a specific moment.',
    full: 'A baseline is a point-in-time snapshot of your site\'s metrics — crawl health, SEO scores, GSC performance, keyword positions, issues, and more. Subsequent monitoring compares against this baseline to measure improvement or decline.',
  },
  RankMath: {
    title: 'Rank Math SEO Plugin',
    short: 'WordPress SEO plugin used for on-page metadata management.',
    full: 'Rank Math is a WordPress plugin that manages SEO titles, meta descriptions, Open Graph tags, schema markup, and other on-page SEO elements. The platform integrates directly with Rank Math to read and write SEO metadata during content publication.',
  },
  Snapshot: {
    title: 'Performance Snapshot',
    short: 'Periodic capture of site metrics for trend analysis.',
    full: 'A snapshot records key metrics at a point in time — GSC clicks, impressions, CTR, position, crawl health, issue counts, and more. Snapshots enable month-over-month and quarter-over-quarter comparison to track whether your SEO efforts are producing results.',
  },
};

interface HelpTooltipProps {
  concept: string;
  className?: string;
}

export function HelpTooltip({ concept, className }: HelpTooltipProps) {
  const [expanded, setExpanded] = useState(false);
  const info = CONCEPTS[concept];
  if (!info) return null;

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/80"
      >
        {concept}
        <HelpCircle className="size-3" />
      </button>
      {expanded && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setExpanded(false)} />
          <div className="absolute start-0 top-full z-50 mt-1 w-80 rounded-md border bg-card p-4 shadow-lg">
            <div className="mb-2 flex items-start justify-between">
              <h3 className="text-sm font-semibold">{info.title}</h3>
              <Button variant="ghost" size="icon" className="size-5 shrink-0" onClick={() => setExpanded(false)}>
                <X className="size-3" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{info.full}</p>
          </div>
        </>
      )}
    </span>
  );
}

/** Inline list of help badges for a content section */
export function ConceptHelp({ concepts }: { concepts: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {concepts.map((concept) => (
        <HelpTooltip key={concept} concept={concept} />
      ))}
    </div>
  );
}
