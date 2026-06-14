import { db } from '../database.js';
import { callGemini } from '../ai.js';

/**
 * Helper to perform a DuckDuckGo HTML search and scrape results.
 * Code duplicated or imported to ensure isolation.
 */
async function searchDuckDuckGo(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) return [];

    const text = await response.text();
    const cheerio = await import('cheerio');
    const $ = cheerio.load(text);
    const results = [];

    $('.result').each((i, element) => {
      const title = $(element).find('.result__a').text().trim();
      const link = $(element).find('.result__a').attr('href');
      const snippet = $(element).find('.result__snippet').text().trim();

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
  } catch (error) {
    db.addLog(`DDG search error in decision maker extraction: ${error.message}`, 'error');
    return [];
  }
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
