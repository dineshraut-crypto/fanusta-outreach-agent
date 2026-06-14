import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { db } from '../database.js';
import { callGemini } from '../ai.js';

const parser = new Parser();

// RSS Feeds to monitor
const FEEDS = [
  { name: 'ET Hospitality', url: 'https://hospitality.economictimes.indiatimes.com/rss/topstories' },
  { name: 'Hotelier India', url: 'https://www.hotelierindia.com/feed' },
  { name: 'Hotelier India Design', url: 'https://www.hotelierindia.com/design/feed' },
  { name: 'Hospitality Net', url: 'https://www.hospitalitynet.org/feed/news.xml' }
];

// Search queries for DuckDuckGo
const SEARCH_QUERIES = [
  'hotel announcements India 2026 new opening',
  'resort development India project news',
  'hotel renovation refurbishment India brand upgrades',
  'hotel management contract signed India expansion'
];

/**
 * Perform a DuckDuckGo HTML search and scrape results.
 * @param {string} query Search query
 * @returns {Promise<Array>} List of { title, link, snippet }
 */
async function searchDuckDuckGo(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      db.addLog(`DuckDuckGo search failed with status ${response.status}`, 'warn');
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results = [];

    $('.result').each((i, element) => {
      const titleEl = $(element).find('.result__a');
      const snippetEl = $(element).find('.result__snippet');

      const title = titleEl.text().trim();
      const link = titleEl.attr('href');
      const snippet = snippetEl.text().trim();

      if (title && link) {
        // Parse out DuckDuckGo redirect link if present
        let cleanLink = link;
        if (link.includes('uddg=')) {
          const parts = link.split('uddg=');
          if (parts[1]) {
            cleanLink = decodeURIComponent(parts[1].split('&')[0]);
          }
        }
        results.push({ title, link: cleanLink, snippet });
      }
    });

    return results;
  } catch (error) {
    db.addLog(`DuckDuckGo search error: ${error.message}`, 'error');
    return [];
  }
}

/**
 * Fetch and parse specified RSS feeds.
 * @returns {Promise<Array>} List of { title, link, snippet }
 */
async function fetchRssFeeds() {
  const allItems = [];
  for (const feed of FEEDS) {
    try {
      db.addLog(`Fetching RSS Feed: ${feed.name}...`, 'info');
      const parsed = await parser.parseURL(feed.url);
      parsed.items.forEach(item => {
        allItems.push({
          title: item.title || '',
          link: item.link || '',
          snippet: item.contentSnippet || item.content || ''
        });
      });
    } catch (error) {
      db.addLog(`Failed to fetch RSS Feed "${feed.name}": ${error.message}`, 'warn');
    }
  }
  return allItems;
}

/**
 * Filter out items that are already tracked in the database by URL.
 */
function filterExisting(items) {
  const existingOpps = db.getOpportunities();
  const existingUrls = new Set(existingOpps.map(o => o.sourceUrl?.toLowerCase()));
  return items.filter(item => !existingUrls.has(item.link?.toLowerCase()));
}

/**
 * Discovers hospitality opportunities.
 * Returns a list of structured opportunities.
 */
export async function discoverOpportunities() {
  db.addLog('Starting Opportunity Discovery Agent (Agent 1)...', 'info');

  // 1. Gather all candidates from RSS and DuckDuckGo
  const rssItems = await fetchRssFeeds();
  db.addLog(`Fetched ${rssItems.length} news items from RSS feeds.`, 'info');

  const searchItems = [];
  for (const query of SEARCH_QUERIES) {
    db.addLog(`Searching DuckDuckGo for: "${query}"...`, 'info');
    const results = await searchDuckDuckGo(query);
    db.addLog(`Found ${results.length} results.`, 'info');
    searchItems.push(...results);
    // Be polite to DDG
    await new Promise(r => setTimeout(r, 1000));
  }

  const allCandidates = [...rssItems, ...searchItems];
  
  // Deduplicate by URL
  const uniqueCandidates = [];
  const seenUrls = new Set();
  for (const c of allCandidates) {
    if (c.link && !seenUrls.has(c.link)) {
      seenUrls.add(c.link);
      uniqueCandidates.push(c);
    }
  }

  // Filter out already discovered
  const newCandidates = filterExisting(uniqueCandidates);
  db.addLog(`Found ${newCandidates.length} new candidates to analyze after deduplication.`, 'info');

  if (newCandidates.length === 0) {
    db.addLog('No new candidates found to analyze.', 'info');
    return [];
  }

  // Slice candidates to process in batches of 10 to avoid token overload
  const batchSize = 10;
  const discoveredOpportunities = [];

  for (let i = 0; i < newCandidates.length && i < 30; i += batchSize) {
    const batch = newCandidates.slice(i, i + batchSize);
    db.addLog(`Analyzing candidate batch ${Math.floor(i/batchSize) + 1}...`, 'info');

    const prompt = `
You are the Discovery Agent for Fanusta, a design-build interior contractor in India.
Analyze the following list of news articles and search snippets and identify any hospitality-related projects (hotels, resorts, boutique hotels, luxury villas, hotel chains) under planning, construction, expansion, rebranding, or renovation in India.

Return a JSON array of objects representing VALID Indian hospitality projects. 
Exclude non-hospitality projects (like apartments, offices, malls) and projects outside India.

For each valid hospitality opportunity, provide:
1. "propertyName": The name of the property (e.g. "Taj Mahal Palace Renovation", "Radisson Blu Bengaluru").
2. "hotelGroup": The parent brand/group (e.g. "IHG", "Marriott", "Indian Hotels Company Limited (IHCL)", "Independent"). If unknown, use "Unknown".
3. "city": The Indian city where the project is located.
4. "state": The Indian state where the project is located.
5. "projectType": Must be exactly one of: "New Development", "Renovation", "Expansion", "Brand Upgrade".
6. "expectedTimeline": Any timeline details mentioned (e.g. "Opening late 2026", "Completion in 18 months", "Immediate"). If unknown, use "TBD".
7. "sourceUrl": The source URL for this article.
8. "description": A brief summary of the project details mentioned in the text.
9. "initialDiscoveryScore": An integer from 1-10 assessing the viability as a hospitality interior project based on the text.

Input Articles:
${batch.map((c, idx) => `
[ID: ${idx}]
Title: ${c.title}
Link: ${c.link}
Snippet: ${c.snippet}
---`).join('\n')}

Format your response as a valid JSON array of objects. Do not include markdown codeblocks or wrapper text, just the raw JSON.
Example Response:
[
  {
    "propertyName": "Grand Hyatt Kochi",
    "hotelGroup": "Hyatt",
    "city": "Kochi",
    "state": "Kerala",
    "projectType": "New Development",
    "expectedTimeline": "Q4 2027",
    "sourceUrl": "https://example.com/article1",
    "description": "Hyatt is planning to build a new 200-room property in Kochi.",
    "initialDiscoveryScore": 8
  }
]
`;

    try {
      const responseText = await callGemini(prompt, 'You are an elite hospitality research analyst. Your output must be a valid, parseable JSON array.', true);
      const parsed = JSON.parse(responseText.trim());
      
      if (Array.isArray(parsed)) {
        parsed.forEach(opp => {
          // Verify URL is set correctly from the source
          const matchingSource = batch.find(b => b.link === opp.sourceUrl) || batch[0];
          opp.sourceUrl = opp.sourceUrl || matchingSource.link;
          discoveredOpportunities.push(opp);
          db.addLog(`Discovered opportunity: ${opp.propertyName} in ${opp.city}, ${opp.state} (${opp.projectType})`, 'info');
        });
      }
    } catch (error) {
      db.addLog(`Failed to parse AI response for discovery batch: ${error.message}`, 'error');
    }
  }

  db.addLog(`Opportunity discovery complete. Discovered ${discoveredOpportunities.length} structured opportunities.`, 'info');
  return discoveredOpportunities;
}
