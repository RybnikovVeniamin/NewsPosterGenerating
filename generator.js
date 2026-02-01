const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Ключи API (берутся из переменных окружения)
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!NEWS_API_KEY || !GEMINI_API_KEY) {
    console.error("❌ Ошибка: API ключи не найдены в переменных окружения!");
    console.error("Убедитесь, что NEWS_API_KEY и GEMINI_API_KEY установлены.");
    process.exit(1);
}

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
    'Italy': 'Rome, Italy'
};

/**
 * Функция для анализа новости через ИИ и определения локации
 */
async function analyzeLocationWithAI(title, description) {
    try {
        const prompt = `Analyze this news headline and description. Determine the most relevant geographic location (city and country) where the event is happening or where the main organization is based. 
        Example: "OpenAI releases new model" -> San Francisco, USA.
        Example: "EU imposes new sanctions" -> Brussels, Belgium.
        
        News Title: "${title}"
        Description: "${description}"
        
        Return ONLY the city and country name, separated by a comma. If no specific location can be determined, return "Global".`;

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
        // Получаем новости за последние 24 часа
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const fromDate = yesterday.toISOString().split('T')[0];
        
        const query = 'war OR election OR economy OR crisis OR "breaking news" OR politics OR "tech giants" OR AI';
        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&from=${fromDate}&sortBy=publishedAt&pageSize=15&apiKey=${NEWS_API_KEY}`;
        
        console.log(`🔍 Ищем новости с ${fromDate}...`);
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data.status === "ok" && data.articles.length > 0) {
            const colors = ["#ff2d55", "#ff6b35", "#ffb800", "#34c759", "#5ac8fa"];
            
            const filteredArticles = data.articles.filter(art => 
                art.title && art.title.length > 30
            );

            const topStories = [];
            const processedArticles = filteredArticles.slice(0, 5);

            for (let i = 0; i < processedArticles.length; i++) {
                const art = processedArticles[i];
                let cleanTitle = art.title.split(' - ')[0];
                let content = art.description || art.content || "";
                
                console.log(`\n📰 Новость ${i+1}: ${cleanTitle}`);
                
                // 1. Сокращаем текст через ИИ, если он слишком длинный
                let finalDesc = content;
                if (content.length > 120) {
                    console.log(`📝 Текст слишком длинный (${content.length} симв.), сокращаем через ИИ...`);
                    finalDesc = await shortenDescriptionWithAI(cleanTitle, content);
                }
                
                // 2. Спрашиваем ИИ про локацию
                console.log(`🤖 ИИ анализирует локацию...`);
                const aiLocation = await analyzeLocationWithAI(cleanTitle, content);
                
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

                // Если и словарь не помог — city останется null
                if (!city) {
                    console.log(`❌ Локация не определена. Точка на карте не будет показана.`);
                }
                
                topStories.push({
                    id: i + 1,
                    headline: cleanTitle,
                    description: finalDesc,
                    mainLocation: city,
                    intensity: Math.floor(Math.random() * 40) + 60,
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
