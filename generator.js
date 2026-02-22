const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// API Keys
const NEWS_API_KEY = process.env.NEWS_API_KEY || 'e995fc4497af487f887bf84cd5f679e8';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
// Higher temperature for word-of-the-day → more variety, less repetition
const sentimentModel = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { temperature: 0.95 }
});

// List of keywords for finding locations in text (countries and major regions)
const countryKeywords = {
    'USA': 'Washington DC, USA',
    'UK': 'London, UK',
    'Ukraine': 'Kyiv, Ukraine',
    'Russia': 'Moscow, Russia',
    'China': 'Beijing, China',
    'Israel': 'Tel Aviv, Israel',
    'Germany': 'Berlin, Germany',
    'France': 'Paris, France',
    'Japan': 'Tokyo, Japan',
    'India': 'New Delhi, India',
    'Brazil': 'Brasilia, Brazil',
    'Canada': 'Ottawa, Canada',
    'Australia': 'Canberra, Australia',
    'Gaza': 'Gaza City, Palestine',
    'Iran': 'Tehran, Iran',
    'Taiwan': 'Taipei, Taiwan',
    'Turkey': 'Ankara, Turkey',
    'Italy': 'Rome, Italy',
    'Greenland': 'Nuuk, Greenland',
    'NATO': 'Brussels, Belgium',
    'EU': 'Brussels, Belgium',
    'Venezuela': 'Caracas, Venezuela',
    'OpenAI': 'San Francisco, USA',
    'Meta': 'Menlo Park, USA',
    'Apple': 'Cupertino, USA',
    'Google': 'Mountain View, USA',
    'Samsung': 'Seoul, South Korea'
};

/**
 * Function to analyze news via AI and determine location
 */
async function analyzeLocationWithAI(title, description) {
    try {
        const prompt = `Analyze this news headline and description. Determine the most relevant geographic location (city and country) where the event is happening or where the main organization is based. 
        
        PRIORITY NEWS (keep these):
        - Politics, government, elections, diplomacy
        - International relations, conflicts, peace agreements
        - Major economic policy, trade deals
        - Climate policy, environmental disasters
        - Major tech policy and regulation
        
        SKIP these types of news:
        - Celebrity gossip, entertainment, movies, music
        - Sports results and athlete news
        - Local crime, car accidents, local weather
        - Product reviews, deals, "how to" articles
        - Social media trends, viral content
        
        Example: "EU imposes new sanctions on Russia" -> Brussels, Belgium.
        Example: "Prime Minister announces new climate policy" -> [capital of that country].
        Example: "Boxing results: Fighter wins title" -> Skip.
        Example: "Highway pileup causes traffic" -> Skip.
        
        News Title: "${title}"
        Description: "${description}"
        
        Return ONLY the city and country name, separated by a comma. If no specific location can be determined, return "Global". If it should be skipped, return "Skip".`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();
        
        return text !== "Global" ? text : null;
    } catch (error) {
        console.error("⚠️ AI error analyzing location:", error.message);
        return null;
    }
}

/**
 * Function to assess news importance via AI
 */
async function analyzeIntensityWithAI(title, description) {
    try {
        const prompt = `Rate the global importance and scale of this news on a scale from 40 to 100.
        100 = Major global event (war, global crisis, pandemic, world-changing breakthrough).
        70 = Significant international news (major policy change, large-scale protest, big tech release).
        40 = Normal international news or regional event.
        
        News Title: "${title}"
        Description: "${description}"
        
        Return ONLY the number.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();
        const intensity = parseInt(text.replace(/[^0-9]/g, ''));
        
        return isNaN(intensity) ? 60 : Math.min(100, Math.max(40, intensity));
    } catch (error) {
        console.error("⚠️ AI error analyzing intensity:", error.message);
        return 60;
    }
}

/**
 * Function to shorten news headline via AI
 */
async function shortenHeadlineWithAI(headline) {
    try {
        const prompt = `Shorten this news headline to be very impactful and concise, like a poster title.
        It should be maximum 60 characters long and easy to read in 2-3 short lines.
        
        Original Headline: "${headline}"
        
        Return ONLY the shortened headline text in uppercase.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim().toUpperCase();
    } catch (error) {
        console.error("⚠️ AI error shortening headline:", error.message);
        return headline.substring(0, 60).toUpperCase();
    }
}

/**
 * Function to shorten news description via AI
 */
async function shortenDescriptionWithAI(headline, description) {
    try {
        const prompt = `Shorten this news description to be concise and fit in a small UI card (max 100 characters). 
        It must be a complete sentence.
        
        Headline: "${headline}"
        Original Description: "${description}"
        
        Return ONLY the shortened description text.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("⚠️ AI error shortening text:", error.message);
        return description.substring(0, 100) + "...";
    }
}

/**
 * Function to get coordinates by place name via OpenStreetMap (Nominatim)
 */
async function getCoordinates(locationName) {
    if (!locationName) return null;
    try {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Delay for Nominatim
        
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&limit=1`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'GlobalPulsePosterGenerator/1.0' }
        });
        const data = await response.json();
        
        if (data && data.length > 0) {
            return {
                name: locationName.toUpperCase(),
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
        }
    } catch (error) {
        console.error(`⚠️ Could not find coordinates for: ${locationName}`);
    }
    return null;
}

/**
 * Get recently used "word of the day" from archive (last 7 days) to avoid repetition
 */
function getRecentBottomWords() {
    const archiveDir = path.join(__dirname, 'archive');
    if (!fs.existsSync(archiveDir)) return [];
    const files = fs.readdirSync(archiveDir)
        .filter(f => f.startsWith('poster-') && f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 7);
    const recent = [];
    for (const f of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(archiveDir, f), 'utf8'));
            if (data.bottomWord) recent.push(data.bottomWord.toUpperCase());
        } catch (_) {}
    }
    return [...new Set(recent)];
}

/**
 * Function to determine the main word of the day via AI
 * Uses higher temperature + "avoid recent" for more variety
 */
async function analyzeGlobalSentiment(stories) {
    try {
        const fullText = stories.map(s => `${s.headline}. ${s.description}`).join("\n");
        const recentWords = getRecentBottomWords();
        const avoidLine = recentWords.length > 0
            ? `\nIMPORTANT: Do NOT use any of these recently used words (pick something different): ${recentWords.join(', ')}`
            : '';

        const prompt = `Analyze these news stories and determine one single powerful word (in English, uppercase) that captures the overall global mood or theme of the day.
        The word should be impactful and distinctive. Examples of good words: TENSION, ESCALATION, INNOVATION, CRISIS, TRANSITION, DISRUPTION, POWER, RESILIENCE, SHIFT, MOMENTUM, DIALOGUE, RIFT, CONVERGENCE.
        Pick a word that feels specific to TODAY's news — avoid generic fallbacks.${avoidLine}

        News stories:
        ${fullText}

        Return ONLY the single word in uppercase.`;

        const result = await sentimentModel.generateContent(prompt);
        const response = await result.response;
        return response.text().trim().toUpperCase().replace(/[^A-Z]/g, '');
    } catch (error) {
        console.error("⚠️ AI error analyzing sentiment:", error.message);
        return "GLOBAL";
    }
}

async function generateDailyData() {
    console.log("📡 Robot starting news collection with AI analysis...");
    
    try {
        const today = new Date();
        const fromDate = new Date(today);
        fromDate.setDate(today.getDate() - 1);
        const fromIso = fromDate.toISOString().split('T')[0];
        
        // Use international sources for global coverage
        // BBC (UK), Reuters (international), Al Jazeera (Middle East), Associated Press (international)
        const internationalSources = 'bbc-news,reuters,al-jazeera-english,associated-press';
        const url = `https://newsapi.org/v2/top-headlines?sources=${internationalSources}&pageSize=50&apiKey=${NEWS_API_KEY}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data.status === "ok" && data.articles.length > 0) {
            const colors = ["#ff2d55", "#ff6b35", "#ffb800", "#34c759", "#5ac8fa"];
            
            const filteredArticles = data.articles.filter(art => 
                art.title && art.title.length > 30 && 
                !art.title.toLowerCase().includes("review") &&
                !art.title.toLowerCase().includes("deal") &&
                !art.title.toLowerCase().includes("how to")
            );

            const topStories = [];
            const processedArticles = filteredArticles;
            const countryCount = {}; // Counter of news by country
            const MAX_PER_COUNTRY = 1; // Maximum 1 news story per country

            for (let i = 0; i < processedArticles.length; i++) {
                if (topStories.length >= 5) break; // We only need top 5 stories
                const art = processedArticles[i];
                let cleanTitle = art.title.split(' - ')[0];
                let content = art.description || art.content || "";
                
                console.log(`\n📰 News ${i+1}: ${cleanTitle}`);
                
                // 1. Shorten headline via AI if too long
                let finalTitle = cleanTitle;
                if (cleanTitle.length > 50) {
                    console.log(`📝 Headline too long (${cleanTitle.length} chars), shortening via AI...`);
                    finalTitle = await shortenHeadlineWithAI(cleanTitle);
                }

                // 2. Shorten text via AI if too long
                let finalDesc = content;
                if (content.length > 120) {
                    console.log(`📝 Text too long (${content.length} chars), shortening via AI...`);
                    finalDesc = await shortenDescriptionWithAI(finalTitle, content);
                }
                
                // 3. Ask AI about location
                console.log(`🤖 AI analyzing location...`);
                const aiLocation = await analyzeLocationWithAI(finalTitle, content);
                
                if (aiLocation === "Skip") {
                    console.log(`⏭️ AI recommended skipping this news (entertainment content).`);
                    continue; 
                }

                let city = null;
                if (aiLocation) {
                    console.log(`📍 AI identified location: ${aiLocation}. Searching coordinates...`);
                    city = await getCoordinates(aiLocation);
                }

                // 3. If AI didn't help — try dictionary search
                if (!city) {
                    console.log(`⚠️ AI didn't find location, trying keyword search...`);
                    let foundKeyword = null;
                    const combinedText = (cleanTitle + " " + content).toUpperCase();
                    
                    for (let keyword in countryKeywords) {
                        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
                        if (regex.test(combinedText)) {
                            foundKeyword = countryKeywords[keyword];
                            break;
                        }
                    }

                    if (foundKeyword) {
                        console.log(`🔍 Found dictionary match: ${foundKeyword}. Searching coordinates...`);
                        city = await getCoordinates(foundKeyword);
                    }
                }

                // 4. If city not defined — just leave null, don't use fake data
                if (!city) {
                    console.log(`❌ Location not defined. Point will not be shown on map.`);
                }
                
                // 5. Check country limit (max 1 news per country)
                if (city && city.name) {
                    // Extract country from location name (format: "CITY, COUNTRY")
                    const parts = city.name.split(',');
                    const country = parts.length > 1 ? parts[parts.length - 1].trim() : city.name;
                    
                    if (countryCount[country] >= MAX_PER_COUNTRY) {
                        console.log(`⏭️ Skipping — already have ${MAX_PER_COUNTRY} news from ${country}`);
                        continue;
                    }
                    countryCount[country] = (countryCount[country] || 0) + 1;
                    console.log(`🌍 Country: ${country} (news from this country: ${countryCount[country]})`);
                }
                
                // 6. Assess intensity via AI
                console.log(`📊 AI assessing news importance...`);
                const aiIntensity = await analyzeIntensityWithAI(cleanTitle, content);
                console.log(`📈 Intensity score: ${aiIntensity}/100`);

                topStories.push({
                    id: i + 1,
                    headline: cleanTitle,
                    description: finalDesc,
                    mainLocation: city,
                    intensity: aiIntensity,
                    color: colors[i % colors.length],
                    url: art.url,
                    imageUrl: art.urlToImage
                });
            }

            // Determine main word of day via AI
            const recentWords = getRecentBottomWords();
            if (recentWords.length > 0) {
                console.log(`\n🧠 AI analyzing overall daily sentiment (avoiding recent: ${recentWords.join(', ')})...`);
            } else {
                console.log(`\n🧠 AI analyzing overall daily sentiment...`);
            }
            const globalSentiment = await analyzeGlobalSentiment(topStories);
            console.log(`✨ Main word of the day: ${globalSentiment}`);

            const result = {
                date: new Date().toISOString().split('T')[0],
                displayDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
                bottomWord: globalSentiment,
                stories: topStories
            };

            const archiveDir = path.join(__dirname, 'archive');
            if (!fs.existsSync(archiveDir)){
                fs.mkdirSync(archiveDir);
            }

            const filePath = path.join(archiveDir, `poster-${result.date}.json`);
            fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
            
            console.log(`\n✅ All data successfully saved to ${filePath}`);
            fs.writeFileSync(path.join(__dirname, 'latest.json'), JSON.stringify(result, null, 2));
            
        } else {
            console.error("❌ No news found or API error");
        }
    } catch (error) {
        console.error("❌ Critical robot error:", error);
    }
}

generateDailyData();
