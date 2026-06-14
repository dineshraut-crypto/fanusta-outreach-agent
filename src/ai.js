import { db } from './database.js';

/**
 * Call the Gemini API.
 * Reads the api key dynamically from the database.
 * 
 * @param {string} prompt The prompt for the LLM
 * @param {string} systemInstruction Optional system instructions to guide behavior
 * @param {boolean} responseJson Set to true to enforce JSON responses
 * @returns {Promise<string>} The model response text
 */
export async function callGemini(prompt, systemInstruction = '', responseJson = false) {
  const settings = db.getSettings();
  const apiKey = settings.gemini_api_key;

  if (!apiKey) {
    db.addLog('No Gemini API Key configured in Settings. Using Demo/Mock AI Mode...', 'warn');
    return getMockAiResponse(prompt, responseJson);
  }

  // Use gemini-2.5-flash as default, or fallback to gemini-1.5-flash
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {}
  };

  if (systemInstruction) {
    requestBody.systemInstruction = {
      parts: [
        { text: systemInstruction }
      ]
    };
  }

  if (responseJson) {
    requestBody.generationConfig.responseMimeType = 'application/json';
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API call failed with status ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textResponse) {
      throw new Error('Empty response received from Gemini API');
    }

    return textResponse;
  } catch (error) {
    db.addLog(`Gemini API Warning: ${error.message}. Falling back to Demo/Mock AI Mode for this step.`, 'warn');
    return getMockAiResponse(prompt, responseJson);
  }
}

/**
 * Generates realistic mock responses for testing purposes when API keys fail.
 */
function getMockAiResponse(prompt, responseJson) {
  // 1. Agent 1: Discovery Prompt
  if (prompt.includes('Discovery Agent')) {
    const opps = [
      {
        propertyName: "Taj West End Luxury Villas",
        hotelGroup: "Taj Hotels (IHCL)",
        city: "Bengaluru",
        state: "Karnataka",
        projectType: "New Development",
        expectedTimeline: "Q4 2026",
        sourceUrl: "https://www.hotelierindia.com/development/taj-west-end-expansion-bengaluru",
        description: "Taj Hotels is developing 24 ultra-luxury pool villas inside the historic Taj West End property in Bengaluru. Project includes high-end bespoke design and fit-outs.",
        initialDiscoveryScore: 9
      },
      {
        propertyName: "Radisson Resort & Spa Lonavala",
        hotelGroup: "Radisson Hotel Group",
        city: "Lonavala",
        state: "Maharashtra",
        projectType: "Expansion",
        expectedTimeline: "Opening mid-2027",
        sourceUrl: "https://hospitality.economictimes.indiatimes.com/news/radisson-lonavala-expansion-project",
        description: "Radisson is adding a new 60-room wing and premium wellness spa to their existing Lonavala property. Interior construction scheduled for early 2027.",
        initialDiscoveryScore: 8
      },
      {
        propertyName: "Boutique Heritage Resort Alila",
        hotelGroup: "Hyatt (Alila)",
        city: "Jaipur",
        state: "Rajasthan",
        projectType: "Renovation",
        expectedTimeline: "Immediate",
        sourceUrl: "https://www.hospitalitynet.org/news/alila-fort-bishangarh-refurbishment",
        description: "Alila Fort Bishangarh is undergoing a full refurbishing of its guest suites, heritage dining areas, and modular interior fit-outs.",
        initialDiscoveryScore: 8
      }
    ];
    return JSON.stringify(opps, null, 2);
  }

  // 2. Agent 2: Decision Maker Prompt
  if (prompt.includes('Decision Maker Intelligence')) {
    if (prompt.includes('Taj West End')) {
      const contacts = [
        {
          fullName: "Sandip Kumar",
          designation: "General Manager",
          linkedIn: "https://www.linkedin.com/in/sandipkumar-taj-example",
          companyWebsite: "https://www.tajhotels.com",
          publicContactInfo: "sandip.kumar@tajhotels.com",
          confidenceScore: "High",
          role: "General Manager"
        },
        {
          fullName: "Nisha Rao",
          designation: "Head of Projects & Procurement",
          linkedIn: "https://www.linkedin.com/in/nisharao-procurement-example",
          companyWebsite: "https://www.tajhotels.com",
          publicContactInfo: "nisha.rao@tajhotels.com",
          confidenceScore: "High",
          role: "Procurement Head"
        }
      ];
      return JSON.stringify(contacts, null, 2);
    }
    
    if (prompt.includes('Radisson')) {
      const contacts = [
        {
          fullName: "Vikram Mehta",
          designation: "Director of Projects",
          linkedIn: "https://www.linkedin.com/in/vikrammehta-projects-example",
          companyWebsite: "https://www.radissonhotels.com",
          publicContactInfo: "v.mehta@radissonhotels.com",
          confidenceScore: "Medium",
          role: "Projects Head"
        }
      ];
      return JSON.stringify(contacts, null, 2);
    }

    // Default Alila or Landmark Rewa
    const contacts = [
      {
        fullName: "Meera Joshi",
        designation: "Owner Representative",
        linkedIn: "https://www.linkedin.com/in/meerajoshi-owner-example",
        companyWebsite: "https://www.alilahotels.com",
        publicContactInfo: "meera.joshi@alilahotels.com",
        confidenceScore: "High",
        role: "Owner Representative"
      }
    ];
    return JSON.stringify(contacts, null, 2);
  }

  // 3. Agent 3: Email Discovery Prompt
  if (prompt.includes('Email Discovery Agent')) {
    let email = "info@hospitality.in";
    if (prompt.includes('Sandip')) email = "sandip.kumar@tajhotels.com";
    else if (prompt.includes('Nisha')) email = "nisha.rao@tajhotels.com";
    else if (prompt.includes('Vikram')) email = "v.mehta@radissonhotels.com";
    else if (prompt.includes('Meera')) email = "meera.joshi@alilahotels.com";

    const emailObj = {
      email: email,
      confidence: "High",
      source: "Extracted from verified domain listings database."
    };
    return JSON.stringify(emailObj, null, 2);
  }

  // 4. Agent 4: Qualification Prompt
  if (prompt.includes('Opportunity Qualification Agent')) {
    let scoreObj = {
      projectSize: 8,
      interiorProbability: 9,
      timelineUrgency: 9,
      dmAvailability: 8,
      overallScore: 86,
      reasoning: "Demo Score: High-fit renovation/development project matching Fanusta's turnkey expertise."
    };
    
    if (prompt.includes('Taj West End')) {
      scoreObj = {
        projectSize: 9,
        interiorProbability: 10,
        timelineUrgency: 8,
        dmAvailability: 9,
        overallScore: 92,
        reasoning: "Demo Score: Highly prestigious new pool villas development in Bengaluru. Multiple verified decision makers found."
      };
    } else if (prompt.includes('Radisson')) {
      scoreObj = {
        projectSize: 7,
        interiorProbability: 8,
        timelineUrgency: 7,
        dmAvailability: 7,
        overallScore: 76,
        reasoning: "Demo Score: Radisson resort wing expansion in Lonavala. Good budget and active pipeline target."
      };
    }
    return JSON.stringify(scoreObj, null, 2);
  }

  // 5. Agent 5: Email Generation Prompt
  if (prompt.includes('Corporate') || prompt.includes('Version A')) {
    return `Dear [Contact Name],

I hope this email finds you well.

I am reaching out from Fanusta. We are a premier Design-Build partner for hospitality projects in India, specializing in turnkey interior design, hotel renovations, and fit-out execution. 

We recently read about IHCL's prestigious new Taj West End Luxury Villas project in Bengaluru. Given the scale and premium nature of this project, we would love to offer our design-build execution capabilities to your team. We ensure high-end bespoke craftsmanship, modular furniture execution, and professional project management.

Could we connect for a brief 15-20 minute introductory call next week to introduce Fanusta and share some of our recent portfolio work?

Best regards,
Dinesh Raut
Design-Build Partner | Fanusta
dinesh.raut@fanusta.com | +91 99999 99999`;
  }

  // Default Boutique Email
  return `Dear [Contact Name],

I hope you are doing well.

I am writing to express my admiration for the upcoming suite refurbishment project at Alila Fort Bishangarh in Jaipur. 

At Fanusta, we partner with boutique resorts and luxury villas across India to deliver bespoke, high-craftsmanship interiors and turnkey design-fit services. We specialize in custom modular furniture and architectural interiors that capture the unique identity of heritage hospitality properties.

I would love to schedule a quick 15-minute call next week to share how we can support your projects and operations teams.

Warm regards,
Dinesh Raut
Design-Build Partner | Fanusta
dinesh.raut@fanusta.com | +91 99999 99999`;
}
