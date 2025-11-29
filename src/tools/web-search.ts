import axios from 'axios';
import { ToolResult } from '../types';

export interface WebSearchOptions {
  maxResults?: number;
  safeSearch?: boolean;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Web Search Tool using DuckDuckGo Instant Answer API
 * Falls back to scraping if needed
 */
export class WebSearchTool {
  private cache: Map<string, { results: SearchResult[]; timestamp: number }> = new Map();
  private cacheTTL = 15 * 60 * 1000; // 15 minutes cache

  /**
   * Search the web using DuckDuckGo
   */
  async search(query: string, options: WebSearchOptions = {}): Promise<ToolResult> {
    const { maxResults = 5 } = options;

    try {
      // Check cache first
      const cacheKey = `${query}-${maxResults}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        return {
          success: true,
          output: this.formatResults(cached.results, query)
        };
      }

      // Use DuckDuckGo HTML search (more reliable than API)
      const results = await this.searchDuckDuckGo(query, maxResults);

      if (results.length === 0) {
        return {
          success: true,
          output: `No results found for: "${query}"`
        };
      }

      // Cache results
      this.cache.set(cacheKey, { results, timestamp: Date.now() });

      return {
        success: true,
        output: this.formatResults(results, query)
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Web search failed: ${error.message}`
      };
    }
  }

  /**
   * Fetch and summarize a web page
   */
  async fetchPage(url: string, _prompt?: string): Promise<ToolResult> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GrokCLI/1.0; +https://github.com/grok-cli)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 10000,
        maxRedirects: 5
      });

      const html = response.data;
      const text = this.extractTextFromHtml(html);

      // Truncate if too long
      const maxLength = 8000;
      const truncatedText = text.length > maxLength
        ? text.substring(0, maxLength) + '\n\n[Content truncated...]'
        : text;

      return {
        success: true,
        output: `Content from ${url}:\n\n${truncatedText}`,
        data: { url, contentLength: text.length }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to fetch page: ${error.message}`
      };
    }
  }

  /**
   * Search using DuckDuckGo HTML
   */
  private async searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 10000
    });

    const html = response.data;
    const results: SearchResult[] = [];

    // Parse DuckDuckGo HTML results
    // Looking for result divs with class "result"
    const resultRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    const titleRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/i;
    const snippetRegex = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i;

    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      const resultHtml = match[1];

      const titleMatch = titleRegex.exec(resultHtml);
      const snippetMatch = snippetRegex.exec(resultHtml);

      if (titleMatch) {
        let url = titleMatch[1];
        // DuckDuckGo wraps URLs, need to extract actual URL
        if (url.includes('uddg=')) {
          const uddgMatch = url.match(/uddg=([^&]+)/);
          if (uddgMatch) {
            url = decodeURIComponent(uddgMatch[1]);
          }
        }

        results.push({
          title: this.decodeHtmlEntities(titleMatch[2].trim()),
          url: url,
          snippet: snippetMatch
            ? this.decodeHtmlEntities(this.stripHtml(snippetMatch[1]).trim())
            : ''
        });
      }
    }

    // Fallback: try alternative parsing if no results
    if (results.length === 0) {
      const linkRegex = /<a[^>]*class="[^"]*result__url[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
      while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
        let url = match[1];
        if (url.includes('uddg=')) {
          const uddgMatch = url.match(/uddg=([^&]+)/);
          if (uddgMatch) {
            url = decodeURIComponent(uddgMatch[1]);
          }
        }
        results.push({
          title: this.decodeHtmlEntities(match[2].trim()) || url,
          url: url,
          snippet: ''
        });
      }
    }

    return results;
  }

  /**
   * Format search results for display
   */
  private formatResults(results: SearchResult[], query: string): string {
    const header = `Web search results for: "${query}"\n${'─'.repeat(50)}\n\n`;

    const formattedResults = results.map((result, index) => {
      return `${index + 1}. ${result.title}\n   URL: ${result.url}\n   ${result.snippet}\n`;
    }).join('\n');

    return header + formattedResults;
  }

  /**
   * Extract readable text from HTML
   */
  private extractTextFromHtml(html: string): string {
    // Remove script and style tags
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');

    // Convert common elements to newlines
    text = text
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ');

    // Strip remaining HTML tags
    text = this.stripHtml(text);

    // Decode HTML entities
    text = this.decodeHtmlEntities(text);

    // Clean up whitespace
    text = text
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    return text;
  }

  /**
   * Strip HTML tags from text
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '');
  }

  /**
   * Decode HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&nbsp;': ' ',
      '&ndash;': '–',
      '&mdash;': '—',
      '&hellip;': '…',
      '&copy;': '©',
      '&reg;': '®',
      '&trade;': '™',
    };

    let result = text;
    for (const [entity, char] of Object.entries(entities)) {
      result = result.replace(new RegExp(entity, 'gi'), char);
    }

    // Handle numeric entities
    result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
    result = result.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

    return result;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
