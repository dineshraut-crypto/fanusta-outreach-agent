import { db } from '../database.js';
import { callGemini } from '../ai.js';

/**
 * Scores and qualifies a discovered opportunity.
 * 
 * @param {Object} opportunity Opportunity data
 * @param {Array} contacts Contacts found for this opportunity
 * @returns {Promise<Object>} The qualification scores and shortlisting status
 */
export async function qualifyOpportunity(opportunity, contacts = []) {
  db.addLog(`Running Qualification Agent (Agent 4) for ${opportunity.propertyName}...`, 'info');

  const settings = db.getSettings();
  const threshold = settings.opportunity_score_threshold || 70;

  const prompt = `
You are the Opportunity Qualification Agent for Fanusta, a premium interior design-build contractor.
Your task is to score a hospitality project opportunity based on its potential value and feasibility for our services.

Fanusta's Target Profile:
- Services: Interior design, hotel renovation, resort development, turnkey execution, hotel fit-outs.
- Target Geography: India.
- Focus: Mid-scale to luxury hotels, boutique resorts, luxury villas, hotel chains, and premium hospitality spaces.

Opportunity details:
- Property Name: ${opportunity.propertyName}
- Hotel Group: ${opportunity.hotelGroup}
- Location: ${opportunity.city}, ${opportunity.state}
- Project Type: ${opportunity.projectType} (New Development / Renovation / Expansion / Brand Upgrade)
- Expected Timeline: ${opportunity.expectedTimeline}
- Description: ${opportunity.description}
- Number of Decision Makers found: ${contacts.length}
- Decision Maker Details: ${JSON.stringify(contacts.map(c => ({ name: c.fullName, role: c.role, email: !!c.email, linkedin: !!c.linkedIn })))}

Score the opportunity from 1 to 10 on the following metrics:
1. "projectSize": Scale of the opportunity (1 = small guest house/low budget, 10 = massive luxury resort or five-star chain hotel).
2. "interiorProbability": Likelihood that they require design-build/turnkey interior services (1 = minimal interior change/structure only, 10 = new development or full refurbishment).
3. "timelineUrgency": Timeline suitability (1 = opening in 5+ years or very delayed, 10 = immediate action or opening in 6-18 months which is prime time for fit-out).
4. "dmAvailability": Quality of decision-maker contacts found (1 = no contacts/no emails, 10 = key contacts like GM or Projects Head found with validated emails).

Calculate the "overallScore" from 1 to 100 based on the sub-scores and provide a concise "reasoning" for the scoring.

Format your response as a valid JSON object only. No markdown formatting.
Example Response:
{
  "projectSize": 8,
  "interiorProbability": 9,
  "timelineUrgency": 7,
  "dmAvailability": 8,
  "overallScore": 82,
  "reasoning": "Large resort expansion in Goa with an expected opening in 12 months. GM and Projects Head identified with verified contacts, indicating high outreach viability."
}
`;

  try {
    const responseText = await callGemini(prompt, 'You are an objective sales qualification agent. Score honestly and output valid JSON object only.', true);
    const scoreData = JSON.parse(responseText.trim());

    const overallScore = parseInt(scoreData.overallScore) || 50;
    const isShortlisted = overallScore >= threshold;

    db.addLog(`Qualified ${opportunity.propertyName}: Score = ${overallScore} (Threshold = ${threshold}) -> ${isShortlisted ? 'SHORTLISTED' : 'DISQUALIFIED'}`, 'info');

    return {
      qualificationScore: {
        projectSize: scoreData.projectSize || 5,
        interiorProbability: scoreData.interiorProbability || 5,
        timelineUrgency: scoreData.timelineUrgency || 5,
        dmAvailability: scoreData.dmAvailability || 5,
        overallScore: overallScore,
        reasoning: scoreData.reasoning || 'No details provided.'
      },
      status: isShortlisted ? 'shortlisted' : 'disqualified'
    };
  } catch (error) {
    db.addLog(`Failed to score opportunity ${opportunity.propertyName}: ${error.message}. Defaulting to score 50.`, 'error');
    return {
      qualificationScore: {
        projectSize: 5,
        interiorProbability: 5,
        timelineUrgency: 5,
        dmAvailability: 3,
        overallScore: 50,
        reasoning: 'Error during automated qualification assessment.'
      },
      status: 'disqualified'
    };
  }
}
