import { db } from '../database.js';
import { callGemini } from '../ai.js';

/**
 * Validates email address format using standard regex.
 */
export function validateEmailFormat(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim());
}

/**
 * Helper to perform a DuckDuckGo HTML search and scrape results.
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
    db.addLog(`DDG search error in email discovery: ${error.message}`, 'error');
    return [];
  }
}

/**
 * Discovers and validates email for a given contact.
 * 
 * @param {Object} contact Contact details from Agent 2
 * @param {Object} opportunity Associated opportunity details
 * @returns {Promise<Object|null>} Updated contact with email, or null if not found
 */
export async function discoverContactEmail(contact, opportunity) {
  db.addLog(`Running Email Discovery Agent (Agent 3) for ${contact.fullName} (${contact.role}) at ${contact.company}...`, 'info');

  // Check if we already have a valid email from Agent 2
  if (contact.publicContactInfo && validateEmailFormat(contact.publicContactInfo)) {
    db.addLog(`Found valid email pre-extracted: ${contact.publicContactInfo}`, 'info');
    return {
      ...contact,
      email: contact.publicContactInfo.trim()
    };
  }

  // Derive target domains from website URL if available
  let domain = '';
  if (contact.companyWebsite) {
    try {
      const url = new URL(contact.companyWebsite);
      domain = url.hostname.replace('www.', '');
    } catch (e) {
      domain = contact.companyWebsite.replace('www.', '').replace('http://', '').replace('https://', '').split('/')[0];
    }
  }

  // If website/domain is not known, search for it
  if (!domain) {
    db.addLog(`Searching for domain of ${contact.company}...`, 'info');
    const domainResults = await searchDuckDuckGo(`"${contact.company}" official website`);
    if (domainResults.length > 0) {
      const firstLink = domainResults[0].link;
      try {
        const url = new URL(firstLink);
        domain = url.hostname.replace('www.', '');
      } catch (e) {
        domain = firstLink.replace('www.', '').replace('http://', '').replace('https://', '').split('/')[0];
      }
    }
  }

  if (!domain) {
    db.addLog(`Could not find domain for ${contact.company}. Skipping email discovery.`, 'warn');
    return null;
  }

  db.addLog(`Identified domain: ${domain}`, 'info');

  // Search for the contact email and general company email format
  const searchQueries = [
    `"${contact.fullName}" "${domain}" email`,
    `"${contact.fullName}" email OR contact`,
    `site:${domain} contact OR "email us" OR "@"`
  ];

  const emailSearchResults = [];
  for (const query of searchQueries) {
    const results = await searchDuckDuckGo(query);
    emailSearchResults.push(...results.slice(0, 5));
    await new Promise(r => setTimeout(r, 1000));
  }

  const prompt = `
You are the Email Discovery Agent for Fanusta.
Find the business email address for this decision maker or the general hospitality property.

Contact Details:
- Name: ${contact.fullName}
- Role: ${contact.role}
- Company: ${contact.company}
- Domain: ${domain}

Search Results:
${emailSearchResults.map((r, idx) => `
[Result #${idx}]
Title: ${r.title}
Link: ${r.link}
Snippet: ${r.snippet}
---`).join('\n')}

Identify if there is any email address associated with the contact or the hotel domain in the snippets.
Analyze common email formats for this domain (e.g. gm@domain.com, rajesh.kumar@domain.com, purchase@domain.com).

Return a JSON object with:
1. "email": The found email address. If no email can be found with high confidence, set this to null.
2. "confidence": "High" (explicitly matched), "Medium" (standard pattern e.g. gm@domain.com or first.last@domain.com matched with other corroborating info), or "Low".
3. "source": The URL or description of how the email was found.

CRITICAL RULES:
- Never fabricate or make up email addresses without confidence.
- The email MUST end with the domain "${domain}" or be a verified public domain like gmail.com if and only if it's explicitly stated as their contact email.
- Do not return standard placeholders or dummy addresses.

Format your response as a valid JSON object only. No markdown formatting.
Example Response:
{
  "email": "gm.city@hotelgroup.com",
  "confidence": "High",
  "source": "Found in snippet: 'reach the GM at gm.city@hotelgroup.com'"
}
`;

  try {
    const responseText = await callGemini(prompt, 'You are an elite email verification and research agent. Output valid JSON object only.', true);
    const parsed = JSON.parse(responseText.trim());

    if (parsed.email && validateEmailFormat(parsed.email)) {
      db.addLog(`Discovered email: ${parsed.email} (Confidence: ${parsed.confidence})`, 'info');
      return {
        ...contact,
        email: parsed.email.trim().toLowerCase(),
        emailConfidence: parsed.confidence,
        emailSource: parsed.source
      };
    } else {
      db.addLog(`No valid email discovered for ${contact.fullName}`, 'warn');
      return null;
    }
  } catch (error) {
    db.addLog(`Error discovering email for ${contact.fullName}: ${error.message}`, 'error');
    return null;
  }
}
