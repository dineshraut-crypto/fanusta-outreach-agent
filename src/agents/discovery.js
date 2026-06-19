import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { db } from '../database.js';
import { callGemini } from '../ai.js';

const parser = new Parser();

// RSS Feeds to monitor
const FEEDS = [
  { name: 'ET Hospitality', url: 'https://hospitality.economictimes.indiatimes.com/rss/topstories' },
  { name: 'Construction Week India', url: 'https://www.constructionweekonline.in/feed' }
];

// Search queries for DuckDuckGo
const SEARCH_QUERIES = [
  // 1. General search queries (announcements, openings, renovations)
  'hotel announcements India 2026 new opening',
  'resort development India project news',
  'hotel renovation refurbishment India brand upgrades',
  'hotel management contract signed India expansion',

  // 2. Focused Domain Searches (Highly reliable alternatives to RSS feeds)
  'site:hotelierindia.com "project" OR "signing" OR "renovation" OR "design"',
  'site:hospitalitybizindia.com "hotel" OR "resort" OR "project" OR "signing"',
  'site:constructionweekonline.in "hotel" OR "resort" project India',
  'site:architectandinteriorsindia.com "hotel" OR "resort" design',

  // 3. LinkedIn Post Searches for real-time announcements
  'site:linkedin.com/posts "hotel project" OR "resort project" OR "hotel opening" India',
  'site:linkedin.com/posts "turnkey" OR "fit out" hotel India'
];

/**
 * Perform a DuckDuckGo HTML search and scrape results.
 * @param {string} query Search query
 * @returns {Promise<Array>} List of { title, link, snippet }
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36'
];

/**
 * Perform a DuckDuckGo search (HTML or Lite version) and scrape results.
 * Handles rate limits, retries, and User-Agent rotation.
 */
async function searchDuckDuckGo(query) {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const endpoints = [
    {
      name: 'html',
      url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      parse: ($) => {
        const results = [];
        $('.result').each((i, element) => {
          const titleEl = $(element).find('.result__a');
          const snippetEl = $(element).find('.result__snippet');
          const title = titleEl.text().trim();
          const link = titleEl.attr('href');
          const snippet = snippetEl.text().trim();

          if (title && link) {
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
      }
    },
    {
      name: 'lite',
      url: `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
      parse: ($) => {
        const results = [];
        $('.result-link').each((i, element) => {
          const title = $(element).text().trim();
          const link = $(element).attr('href');
          const parentRow = $(element).closest('tr');
          const nextRow = parentRow.next();
          const snippetTd = nextRow.find('.result-snippet');
          const snippet = snippetTd.length > 0 ? snippetTd.text().trim() : nextRow.text().trim();

          if (title && link) {
            let cleanLink = link;
            if (link.startsWith('//')) {
              cleanLink = 'https:' + link;
            }
            if (cleanLink.includes('uddg=')) {
              const parts = cleanLink.split('uddg=');
              if (parts[1]) {
                cleanLink = decodeURIComponent(parts[1].split('&')[0]);
              }
            }
            results.push({ title, link: cleanLink, snippet: snippet.replace(/\s+/g, ' ') });
          }
        });
        return results;
      }
    }
  ];

  let lastError = null;

  for (const endpoint of endpoints) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(endpoint.url, {
          headers: { 'User-Agent': ua }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        const cheerio = await import('cheerio');
        const $ = cheerio.load(html);
        const results = endpoint.parse($);

        if (results.length > 0) {
          return results;
        }
      } catch (error) {
        lastError = error;
        db.addLog(`DuckDuckGo (${endpoint.name}) search attempt ${attempt} failed: ${error.message}`, 'warn');
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  }

  db.addLog(`All DuckDuckGo search endpoints failed. Last error: ${lastError ? lastError.message : 'N/A'}`, 'error');
  return [];
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
/**
 * Helper to extract opportunities from a batch of candidate snippets.
 */
async function extractOppsFromBatch(batch) {
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
    let cleanText = responseText.trim();
    if (cleanText.includes('```json')) {
      cleanText = cleanText.split('```json')[1].split('```')[0];
    } else if (cleanText.includes('```')) {
      cleanText = cleanText.split('```')[1].split('```')[0];
    }
    const parsed = JSON.parse(cleanText.trim());
    
    if (Array.isArray(parsed)) {
      const results = [];
      parsed.forEach(opp => {
        const matchingSource = batch.find(b => b.link === opp.sourceUrl) || batch[0];
        opp.sourceUrl = opp.sourceUrl || matchingSource.link;
        results.push(opp);
        db.addLog(`Discovered opportunity: ${opp.propertyName} in ${opp.city}, ${opp.state} (${opp.projectType})`, 'info');
      });
      return results;
    }
  } catch (error) {
    db.addLog(`Failed to parse AI response for discovery batch: ${error.message}`, 'error');
  }
  return [];
}

/**
 * Discovers hospitality opportunities using direct Google Search grounding.
 */
async function discoverOpportunitiesViaGoogleSearch(apiKey) {
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `
  Using Google Search, find recent hospitality projects, hotel openings, resort developments, or renovations announced in India for 2026.
  Provide a list of 5-10 real projects.
  For each project, return:
  - "propertyName": Name of hotel/resort
  - "hotelGroup": Parent brand/group (e.g. "Marriott", "Taj", "IHG", "Independent")
  - "city": Located city in India
  - "state": Located state in India
  - "projectType": Must be exactly one of: "New Development", "Renovation", "Expansion", "Brand Upgrade"
  - "expectedTimeline": Timeline details (e.g. "Immediate", "Opening late 2026", "TBD")
  - "sourceUrl": The source URL where this news was found
  - "description": A brief summary of the project details
  - "initialDiscoveryScore": An integer from 1-10 assessing viability as an interior project based on scale, luxury level, and location.
  
  Format your response as a valid JSON array of objects. Do not include markdown codeblocks or wrapper text. Just output a valid JSON array.
  `;

  try {
    db.addLog("Searching the web for new projects using Google Search Grounding...", "info");
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const result = await response.json();
    let textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new Error("No text response received from grounding");
    }

    if (textResponse.includes('```json')) {
      textResponse = textResponse.split('```json')[1].split('```')[0];
    } else if (textResponse.includes('```')) {
      textResponse = textResponse.split('```')[1].split('```')[0];
    }

    const parsed = JSON.parse(textResponse.trim());
    if (Array.isArray(parsed)) {
      parsed.forEach(opp => {
        db.addLog(`Directly Discovered opportunity (via Grounding): ${opp.propertyName} in ${opp.city}, ${opp.state} (${opp.projectType})`, 'info');
      });
      return parsed;
    }
    return [];
  } catch (error) {
    db.addLog(`Google Search Grounding failed: ${error.message}. Falling back to DuckDuckGo...`, 'warn');
    return [];
  }
}

/**
 * Filter out opportunities that are already tracked in the database by propertyName + city.
 */
function filterExistingOpportunities(opps) {
  const existingOpps = db.getOpportunities();
  const existingKeys = new Set(existingOpps.map(o => `${o.propertyName.toLowerCase().trim()}_${o.city.toLowerCase().trim()}`));
  return opps.filter(o => {
    const key = `${o.propertyName.toLowerCase().trim()}_${o.city.toLowerCase().trim()}`;
    return !existingKeys.has(key);
  });
}

/**
 * Discovers hospitality opportunities.
 * Returns a list of structured opportunities.
 */
export async function discoverOpportunities() {
  db.addLog('Starting Opportunity Discovery Agent (Agent 1)...', 'info');
  const settings = db.getSettings();

  // 1. Gather all candidates from RSS
  const rssItems = await fetchRssFeeds();
  db.addLog(`Fetched ${rssItems.length} news items from RSS feeds.`, 'info');

  // Deduplicate RSS candidates by URL
  const uniqueRssCandidates = [];
  const seenUrls = new Set();
  for (const c of rssItems) {
    if (c.link && !seenUrls.has(c.link)) {
      seenUrls.add(c.link);
      uniqueRssCandidates.push(c);
    }
  }

  // Filter out already discovered
  const newRssCandidates = filterExisting(uniqueRssCandidates);
  const discoveredOpportunities = [];

  // Extract from RSS candidates using AI
  if (newRssCandidates.length > 0) {
    db.addLog(`Analyzing ${newRssCandidates.length} new RSS candidates...`, 'info');
    const batchSize = 10;
    for (let i = 0; i < newRssCandidates.length && i < 20; i += batchSize) {
      const batch = newRssCandidates.slice(i, i + batchSize);
      const extracted = await extractOppsFromBatch(batch);
      discoveredOpportunities.push(...extracted);
    }
  }

  // 2. Search the web (use Google Search Grounding if API Key is available, otherwise fallback to DuckDuckGo)
  let searchOpportunities = [];
  if (settings.gemini_api_key) {
    searchOpportunities = await discoverOpportunitiesViaGoogleSearch(settings.gemini_api_key);
  } else {
    // Fallback to DuckDuckGo search
    const searchItems = [];
    for (const query of SEARCH_QUERIES) {
      db.addLog(`Searching DuckDuckGo for: "${query}"...`, 'info');
      const results = await searchDuckDuckGo(query);
      searchItems.push(...results);
      await new Promise(r => setTimeout(r, 1500));
    }
    const uniqueSearchCandidates = [];
    for (const c of searchItems) {
      if (c.link && !seenUrls.has(c.link)) {
        seenUrls.add(c.link);
        uniqueSearchCandidates.push(c);
      }
    }
    const newSearchCandidates = filterExisting(uniqueSearchCandidates);
    if (newSearchCandidates.length > 0) {
      const batchSize = 10;
      for (let i = 0; i < newSearchCandidates.length && i < 30; i += batchSize) {
        const batch = newSearchCandidates.slice(i, i + batchSize);
        const extracted = await extractOppsFromBatch(batch);
        discoveredOpportunities.push(...extracted);
      }
    }
  }

  // Merge direct search opportunities
  if (searchOpportunities.length > 0) {
    const filteredSearchOpps = filterExistingOpportunities(searchOpportunities);
    discoveredOpportunities.push(...filteredSearchOpps);
  }

  // Deduplicate discovered opportunities by propertyName + city
  const finalOpps = [];
  const seenOpps = new Set();
  for (const opp of discoveredOpportunities) {
    const key = `${opp.propertyName.toLowerCase().trim()}_${opp.city.toLowerCase().trim()}`;
    if (!seenOpps.has(key)) {
      seenOpps.add(key);
      finalOpps.push(opp);
    }
  }

  db.addLog(`Opportunity discovery complete. Discovered ${finalOpps.length} structured opportunities.`, 'info');
  return finalOpps;
}
