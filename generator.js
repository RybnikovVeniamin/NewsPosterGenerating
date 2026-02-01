const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Ключи API
const NEWS_API_KEY = process.env.NEWS_API_KEY || 'e995fc4497af487f887bf84cd5f679e8';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Список ключевых слов для поиска локаций в тексте (страны и крупные регионы)
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
 * Функция для анализа новости через ИИ и определения локации
 */
async function analyzeLocationWithAI(title, description) {
    try {
        const prompt = `Analyze this news headline and description. Determine the most relevant geographic location (city and country) where the event is happening or where the main organization is based. 
        IMPORTANT: Focus on serious global news. If the news is about celebrity gossip, entertainment, or trivial social media trends, return "Skip".
        
        Example: "OpenAI releases new model" -> San Francisco, USA.
        Example: "EU imposes new sanctions" -> Brussels, Belgium.
        Example: "Spencer Pratt says..." -> Skip.
        
        News Title: "${title}"
        Description: "${description}"
        
        Return ONLY the city and country name, separated by a comma. If no specific location can be determined, return "Global". If it should be skipped, return "Skip".`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();
        
        return text !== "Global" ? text : null;
    } catch (error) {
        console.error("⚠️ Ошибка ИИ при анализе локации:", error.message);
        return null;
    }
}

/**
 * Функция для оценки важности новости через ИИ
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
        console.error("⚠️ Ошибка ИИ при анализе интенсивности:", error.message);
        return 60;
    }
}

/**
 * Функция для сокращения заголовка новости через ИИ
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
        console.error("⚠️ Ошибка ИИ при сокращении заголовка:", error.message);
        return headline.substring(0, 60).toUpperCase();
    }
}

/**
 * Функция для сокращения описания новости через ИИ
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
        console.error("⚠️ Ошибка ИИ при сокращении текста:", error.message);
        return description.substring(0, 100) + "...";
    }
}

/**
 * Функция для получения координат по названию места через OpenStreetMap (Nominatim)
 */
async function getCoordinates(locationName) {
    if (!locationName) return null;
    try {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Задержка для Nominatim
        
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
        console.error(`⚠️ Не удалось найти координаты для: ${locationName}`);
    }
    return null;
}

/**
 * Функция для определения главного слова дня через ИИ
 */
async function analyzeGlobalSentiment(stories) {
    try {
        const fullText = stories.map(s => `${s.headline}. ${s.description}`).join("\n");
        const prompt = `Analyze these news stories and determine one single powerful word (in English, uppercase) that captures the overall global mood or theme of the day. 
        The word should be impactful, like: TENSION, ESCALATION, INNOVATION, CRISIS, TRANSITION, DISRUPTION, or POWER.
        
        News stories:
        ${fullText}
        
        Return ONLY the single word in uppercase.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim().toUpperCase().replace(/[^A-Z]/g, '');
    } catch (error) {
        console.error("⚠️ Ошибка ИИ при анализе настроения:", error.message);
        return "GLOBAL";
    }
}

async function generateDailyData() {
    console.log("📡 Робот запускает сбор новостей с ИИ-анализом...");
    
    try {
        const today = new Date();
        const fromDate = new Date(today);
        fromDate.setDate(today.getDate() - 1);
        const fromIso = fromDate.toISOString().split('T')[0];
        
        // Переключаемся на top-headlines для получения самых важных мировых новостей
        // Используем категорию 'general' для широкого охвата мировых событий
        const url = `https://newsapi.org/v2/top-headlines?category=general&language=en&pageSize=40&apiKey=${NEWS_API_KEY}`;
        
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

            for (let i = 0; i < processedArticles.length; i++) {
                if (topStories.length >= 5) break; // Нам нужно только 5 лучших новостей
                const art = processedArticles[i];
                let cleanTitle = art.title.split(' - ')[0];
                let content = art.description || art.content || "";
                
                console.log(`\n📰 Новость ${i+1}: ${cleanTitle}`);
                
                // 1. Сокращаем заголовок через ИИ, если он слишком длинный
                let finalTitle = cleanTitle;
                if (cleanTitle.length > 50) {
                    console.log(`📝 Заголовок слишком длинный (${cleanTitle.length} симв.), сокращаем через ИИ...`);
                    finalTitle = await shortenHeadlineWithAI(cleanTitle);
                }

                // 2. Сокращаем текст через ИИ, если он слишком длинный
                let finalDesc = content;
                if (content.length > 120) {
                    console.log(`📝 Текст слишком длинный (${content.length} симв.), сокращаем через ИИ...`);
                    finalDesc = await shortenDescriptionWithAI(finalTitle, content);
                }
                
                // 3. Спрашиваем ИИ про локацию
                console.log(`🤖 ИИ анализирует локацию...`);
                const aiLocation = await analyzeLocationWithAI(finalTitle, content);
                
                if (aiLocation === "Skip") {
                    console.log(`⏭️ ИИ рекомендовал пропустить эту новость (развлекательный контент).`);
                    continue; 
                }

                let city = null;
                if (aiLocation) {
                    console.log(`📍 ИИ определил локацию: ${aiLocation}. Ищем координаты...`);
                    city = await getCoordinates(aiLocation);
                }

                // 3. Если ИИ не помог — пробуем поиск по словарю
                if (!city) {
                    console.log(`⚠️ ИИ не нашел локацию, пробуем поиск по ключевым словам...`);
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
                        console.log(`🔍 Найдено совпадение в словаре: ${foundKeyword}. Ищем координаты...`);
                        city = await getCoordinates(foundKeyword);
                    }
                }

                // 4. Если город не определен — просто оставляем null, фейковые данные не используем
                if (!city) {
                    console.log(`❌ Локация не определена. Точка на карте не будет показана.`);
                }
                
                // 5. Оцениваем интенсивность через ИИ
                console.log(`📊 ИИ оценивает важность новости...`);
                const aiIntensity = await analyzeIntensityWithAI(cleanTitle, content);
                console.log(`📈 Оценка интенсивности: ${aiIntensity}/100`);

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

            // Определяем главное слово дня через ИИ
            console.log(`\n🧠 ИИ анализирует общее настроение дня...`);
            const globalSentiment = await analyzeGlobalSentiment(topStories);
            console.log(`✨ Главное слово дня: ${globalSentiment}`);

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
            
            console.log(`\n✅ Все данные успешно сохранены в ${filePath}`);
            fs.writeFileSync(path.join(__dirname, 'latest.json'), JSON.stringify(result, null, 2));
            
        } else {
            console.error("❌ Новости не найдены или ошибка API");
        }
    } catch (error) {
        console.error("❌ Критическая ошибка робота:", error);
    }
}

generateDailyData();
