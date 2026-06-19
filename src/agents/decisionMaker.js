import { db } from '../database.js';
import { callGemini } from '../ai.js';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36'
];

/**
 * Helper to perform a DuckDuckGo search (HTML or Lite version) and scrape results.
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

  db.addLog(`All DuckDuckGo search endpoints failed in decision maker extraction. Last error: ${lastError ? lastError.message : 'N/A'}`, 'error');
  return [];
}

/**
 * Identifies decision makers for a discovered opportunity.
 * 
 * @param {Object} opportunity Discovered opportunity details
 * @returns {Promise<Array>} List of identified contacts
 */
export async function identifyDecisionMakers(opportunity) {
  const { propertyName, hotelGroup, city, state } = opportunity;
  db.addLog(`Finding decision makers for: ${propertyName} in ${city}...`, 'info');

  // Build targeted search queries
  const queries = [
    `"${propertyName}" "General Manager" OR "Procurement" OR "Projects" OR "Owner" India`,
    `"${propertyName}" OR "${hotelGroup} ${city}" (General Manager OR Procurement Head OR Project Director) LinkedIn`,
    `"${hotelGroup}" corporate procurement projects team India`
  ];

  const searchResults = [];
  for (const query of queries) {
    db.addLog(`Searching: ${query}`, 'info');
    const results = await searchDuckDuckGo(query);
    searchResults.push(...results.slice(0, 5)); // Take top 5 from each query
    await new Promise(r => setTimeout(r, 1000)); // Be polite
  }

  if (searchResults.length === 0) {
    db.addLog(`No search results returned for ${propertyName}`, 'warn');
    return [];
  }

  // Deduplicate search results
  const uniqueResults = [];
  const seenUrls = new Set();
  for (const res of searchResults) {
    if (!seenUrls.has(res.link)) {
      seenUrls.add(res.link);
      uniqueResults.push(res);
    }
  }

  const prompt = `
You are the Decision Maker Intelligence Agent for Fanusta, a premium interior design-build contractor.
Your task is to identify real decision makers for the following hospitality opportunity.

Opportunity Details:
- Property Name: ${propertyName}
- Hotel Group/Brand: ${hotelGroup}
- Location: ${city}, ${state}

Search Results Content:
${uniqueResults.map((r, idx) => `
[Result #${idx}]
Title: ${r.title}
Link: ${r.link}
Snippet: ${r.snippet}
---`).join('\n')}

Identify any individual listed in the search results who belongs to this hotel, hotel group, or project, and fits one of these target roles:
- General Manager (GM)
- Procurement Head / Materials Manager / Corporate Procurement Manager
- Projects Head / Projects Director / Engineering Head
- Development Head / Owner Representative / Managing Director / Founder

Extract the following details for each identified contact:
1. "fullName": First and last name.
2. "designation": Exact job title (e.g. "General Manager", "Director of Projects").
3. "linkedIn": LinkedIn profile URL if found in the search results snippets/titles. Otherwise, null.
4. "companyWebsite": The official website URL for the hotel or brand.
5. "publicContactInfo": Any email address, phone number, or office address found in the text. Otherwise, null.
6. "confidenceScore": Assess how certain you are that this contact is currently the decision maker for this property/group. Must be exactly one of: "High", "Medium", "Low".
7. "role": Must be mapped to one of: "General Manager", "Procurement Head", "Projects Head", "Engineering Head", "Development Head", "Owner Representative", "Corporate Procurement Manager".

CRITICAL RULE:
- NEVER FABRICATE OR INVENT names, designations, LinkedIn profiles, or contact details.
- Only return people who are explicitly mentioned in the search snippets provided.
- If no decision makers can be identified with certainty, return an empty array [].

Format your response as a valid JSON array of objects. Do not include markdown codeblocks or wrapper text, just the raw JSON.
Example Response:
[
  {
    "fullName": "Rajesh Kumar",
    "designation": "General Manager",
    "linkedIn": "https://www.linkedin.com/in/rajesh-kumar-hotel",
    "companyWebsite": "https://www.grandpalacehotel.com",
    "publicContactInfo": "gm@grandpalacehotel.com",
    "confidenceScore": "High",
    "role": "General Manager"
  }
]
`;

  try {
    const responseText = await callGemini(prompt, 'You are an elite corporate intelligence agent. Do not invent details. Output valid JSON array only.', true);
    const contacts = JSON.parse(responseText.trim());
    
    if (Array.isArray(contacts)) {
      db.addLog(`Extracted ${contacts.length} decision makers for ${propertyName}.`, 'info');
      // Link back to the opportunity
      return contacts.map(c => ({
        ...c,
        opportunityId: opportunity.id,
        company: hotelGroup !== 'Unknown' ? hotelGroup : propertyName
      }));
    }
    return [];
  } catch (error) {
    db.addLog(`Failed to extract decision makers for ${propertyName}: ${error.message}`, 'error');
    return [];
  }
}
