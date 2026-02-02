// ========================================
// Global Pulse — Redesigned Poster Sketch
// ========================================

let canvas;
let topStories = [];
let currentBottomWord = "";
let headerBounds = []; // Будем хранить границы заголовков
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;
const NEWS_API_KEY = 'e995fc4497af487f887bf84cd5f679e8';

async function setup() {
    canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    canvas.parent('canvas-container');
    
    pixelDensity(2);
    noLoop();
    
    // 1. Fetch real data from latest.json
    await fetchLatestData();
    
    // 2. Update HTML elements (Titles + Top Text + Bottom Word)
    updateUI();
    
    // Даем браузеру время отрисовать HTML, чтобы получить размеры заголовков
    setTimeout(() => {
        calculateHeaderBounds();
        drawPoster();
    }, 100);

    // 4. Export data for the website
    exportPosterData();
}

function calculateHeaderBounds() {
    headerBounds = [];
    // Заголовки
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById(`title-${i}`);
        if (el && el.innerText.trim() !== "") {
            const rect = el.getBoundingClientRect();
            const containerRect = document.querySelector('.poster-container').getBoundingClientRect();
            
            headerBounds.push({
                type: 'title',
                top: rect.top - containerRect.top,
                bottom: rect.bottom - containerRect.top,
                left: rect.left - containerRect.left,
                right: rect.right - containerRect.left
            });
        }
    }
    // Блоки описания сверху
    const expBlocks = document.querySelectorAll('.explanation-block');
    expBlocks.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        const containerRect = document.querySelector('.poster-container').getBoundingClientRect();
        headerBounds.push({
            type: 'exp',
            id: i, // Добавляем ID для точной идентификации
            top: rect.top - containerRect.top,
            bottom: rect.bottom - containerRect.top,
            left: rect.left - containerRect.left,
            right: rect.right - containerRect.left
        });
    });
    // Большое слово внизу
    const bottomWord = document.getElementById('bottom-word');
    if (bottomWord) {
        const rect = bottomWord.getBoundingClientRect();
        const containerRect = document.querySelector('.poster-container').getBoundingClientRect();
        headerBounds.push({
            type: 'bottom',
            top: rect.top - containerRect.top,
            bottom: rect.bottom - containerRect.top,
            left: rect.left - containerRect.left,
            right: rect.right - containerRect.left
        });
    }
}

async function fetchLatestData() {
    console.log("📡 Загрузка последних данных из latest.json...");
    try {
        const response = await fetch('latest.json');
        const data = await response.json();
        
        if (data && data.stories) {
            topStories = data.stories;
            currentBottomWord = data.bottomWord || "";
            console.log("✅ Данные загружены:", topStories, "Слово дня:", currentBottomWord);
        }
    } catch (e) {
        console.error("❌ Ошибка загрузки latest.json, пробуем NewsAPI:", e);
        await fetchRealData();
    }
}

function exportPosterData() {
    const dataToExport = {
        date: new Date().toISOString().split('T')[0],
        displayDate: getTodayFormatted(),
        bottomWord: document.getElementById('bottom-word').innerText,
        stories: topStories
    };
    
    console.log("💾 Данные для сайта подготовлены:", dataToExport);
}

async function fetchRealData() {
    console.log("📡 Запрос самых важных мировых новостей...");
    try {
        const query = 'war OR election OR economy OR crisis OR "breaking news" OR politics';
        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=relevancy&pageSize=15&apiKey=${NEWS_API_KEY}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data.status === "ok" && data.articles.length > 0) {
            const colors = shuffle(["#ff2d55", "#ff6b35", "#ffb800", "#34c759", "#5ac8fa"]);
            
            const cityDatabase = {
                'USA': { name: 'WASHINGTON DC', lat: 38.9, lng: -77.0 },
                'WASHINGTON': { name: 'WASHINGTON DC', lat: 38.9, lng: -77.0 },
                'TRUMP': { name: 'WASHINGTON DC', lat: 38.9, lng: -77.0 },
                'BIDEN': { name: 'WASHINGTON DC', lat: 38.9, lng: -77.0 },
                'IRAN': { name: 'TEHRAN', lat: 35.6, lng: 51.3 },
                'TEHRAN': { name: 'TEHRAN', lat: 35.6, lng: 51.3 },
                'UKRAINE': { name: 'KYIV', lat: 50.4, lng: 30.5 },
                'RUSSIA': { name: 'MOSCOW', lat: 55.7, lng: 37.6 },
                'CHINA': { name: 'BEIJING', lat: 39.9, lng: 116.4 },
                'UK': { name: 'LONDON', lat: 51.5, lng: -0.1 },
                'ISRAEL': { name: 'TEL AVIV', lat: 32.1, lng: 34.8 },
                'GAZA': { name: 'GAZA CITY', lat: 31.5, lng: 34.4 },
                'GERMANY': { name: 'BERLIN', lat: 52.5, lng: 13.4 },
                'FRANCE': { name: 'PARIS', lat: 48.8, lng: 2.3 },
                'JAPAN': { name: 'TOKYO', lat: 35.7, lng: 139.7 },
                'INDIA': { name: 'NEW DELHI', lat: 28.6, lng: 77.2 },
                'AI': { name: 'SILICON VALLEY', lat: 37.4, lng: -122.0 }
            };

            const defaultCities = [
                { name: 'NEW YORK', lat: 40.7, lng: -74.0 },
                { name: 'LONDON', lat: 51.5, lng: -0.1 },
                { name: 'SINGAPORE', lat: 1.3, lng: 103.8 },
                { name: 'DUBAI', lat: 25.2, lng: 55.3 }
            ];

            const filteredArticles = data.articles.filter(art => 
                art.title && 
                art.title.length > 30 && 
                !art.title.includes("Warhammer") &&
                !art.title.includes("Deal of the day")
            );

            topStories = filteredArticles.slice(0, 5).map((art, i) => {
                let cleanTitle = art.title.split(' - ')[0];
                let content = art.description || art.content || "";
                let shortDesc = content.length > 120 ? content.substring(0, 120) + "..." : content;
                
                let textWeight = content.length;
                let calculatedIntensity = map(textWeight, 0, 500, 40, 100);
                calculatedIntensity = constrain(calculatedIntensity, 40, 100);
                
                let city = null;
                const upperTitle = cleanTitle.toUpperCase();
                const upperContent = content.toUpperCase();
                
                for (let key in cityDatabase) {
                    if (upperTitle.includes(key) || upperContent.includes(key)) {
                        city = cityDatabase[key];
                        break;
                    }
                }

                if (!city) {
                    city = defaultCities[i % defaultCities.length];
                }
                
                return {
                    id: i + 1,
                    rank: i + 1,
                    headline: cleanTitle,
                    description: shortDesc,
                    mainLocation: city,
                    intensity: calculatedIntensity,
                    color: colors[i % colors.length],
                    url: art.url,
                    imageUrl: art.urlToImage
                };
            });
        }
    } catch (e) {
        console.error("❌ Ошибка:", e);
        topStories = TRENDING_STORIES.slice(0, 3);
    }
}

// Вспомогательная функция для перемешивания массива (Fisher-Yates shuffle)
function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

// Функция для выбора ключевого слова на основе настроения новостей
function getSentimentWord(stories) {
    const text = stories.map(s => (s.headline + " " + s.description).toUpperCase()).join(" ");
    
    // Словари для анализа
    const tensionWords = ["WAR", "CONFLICT", "CRISIS", "DEAD", "ATTACK", "PROTEST", "TENSION", "FIGHT"];
    const powerWords = ["ELECTION", "TRUMP", "BIDEN", "GOVERNMENT", "POLICY", "POWER", "LEADER"];
    const economyWords = ["ECONOMY", "MARKET", "FINANCIAL", "PRICE", "BANK", "TRADE", "OIL"];
    const techWords = ["AI", "TECH", "DIGITAL", "SILICON", "FUTURE", "INNOVATION"];

    let scores = {
        TENSION: 0,
        POWER: 0,
        VOLUME: 0, // По умолчанию
        IMPACT: 0,
        VOICE: 0
    };

    // Подсчет очков
    tensionWords.forEach(w => { if (text.includes(w)) scores.TENSION += 2; });
    powerWords.forEach(w => { if (text.includes(w)) scores.POWER += 1.5; });
    economyWords.forEach(w => { if (text.includes(w)) scores.IMPACT += 1.2; });
    techWords.forEach(w => { if (text.includes(w)) scores.VOICE += 1; });

    // Добавляем немного случайности к базовым словам
    scores.VOLUME += Math.random();
    scores.IMPACT += Math.random();
    scores.VOICE += Math.random();

    // Находим слово с максимальным баллом
    let maxScore = -1;
    let selectedWord = "GLOBAL";

    for (let word in scores) {
        if (scores[word] > maxScore) {
            maxScore = scores[word];
            selectedWord = word;
        }
    }

    return selectedWord;
}

function updateUI() {
    for (let i = 0; i < 3; i++) {
        const titleEl = document.getElementById(`title-${i+1}`);
        if (titleEl && topStories[i]) {
            titleEl.innerText = topStories[i].headline.toUpperCase();
        }
        const expEl = document.getElementById(`exp-${i+1}`);
        if (expEl && topStories[i]) {
            expEl.innerText = topStories[i].description;
        }
    }
    
    const today = getTodayFormatted();
    const oldDate = document.querySelector('.today-date');
    if (oldDate) oldDate.remove();
    const dateEl = document.createElement('div');
    dateEl.className = 'today-date';
    dateEl.innerText = today;
    dateEl.style.position = 'absolute';
    dateEl.style.top = '20px';
    dateEl.style.right = '20px';
    dateEl.style.color = 'rgba(255,255,255,0.5)';
    dateEl.style.fontFamily = 'PP Supply Mono, monospace';
    dateEl.style.fontSize = '10px';
    document.querySelector('.poster-container').appendChild(dateEl);
    
    // ОБНОВЛЕННАЯ ЛОГИКА: Сначала проверяем, есть ли слово от ИИ в данных
    const bottomWordEl = document.getElementById('bottom-word');
    if (bottomWordEl) {
        // Если мы загрузили данные из latest.json и там есть bottomWord, используем его
        // В противном случае рассчитываем по старинке (как запасной вариант)
        if (typeof currentBottomWord !== 'undefined' && currentBottomWord) {
            bottomWordEl.innerText = currentBottomWord;
        } else if (topStories.length > 0) {
            bottomWordEl.innerText = getSentimentWord(topStories);
        }
    }
}

function drawPoster() {
    background(8, 9, 12);
    stroke(255, 12);
    strokeWeight(0.5);
    for (let x = 0; x < width; x += 30) line(x, 0, x, height);
    for (let y = 0; y < height; y += 30) line(0, y, width, y);
    drawHeatmap();
    drawMarkers();
    
    // После отрисовки всего на канвасе, проверяем яркость под текстом
    applyAdaptiveTextColor();
}

function applyAdaptiveTextColor() {
    loadPixels();
    
    // Проходим по всем зарегистрированным текстовым блокам
    headerBounds.forEach((bound, index) => {
        let totalBrightness = 0;
        let count = 0;
        
        // Вычисляем среднюю яркость фона под этим блоком
        // Берем несколько точек внутри прямоугольника для скорости
        for (let x = Math.floor(bound.left); x < bound.right; x += 10) {
            for (let y = Math.floor(bound.top); y < bound.bottom; y += 10) {
                let pixIndex = 4 * (Math.floor(y * pixelDensity()) * width * pixelDensity() + Math.floor(x * pixelDensity()));
                if (pixIndex < pixels.length) {
                    let r = pixels[pixIndex];
                    let g = pixels[pixIndex + 1];
                    let b = pixels[pixIndex + 2];
                    totalBrightness += (r + g + b) / 3;
                    count++;
                }
            }
        }
        
        let avgBrightness = count > 0 ? totalBrightness / count : 0;
        
        // Если фон яркий (больше 100 из 255), делаем текст темнее или контрастнее
        // В нашем случае, если фон яркий, текст должен быть белым (макс контраст), 
        // а если фон темный, он и так белый. 
        // Но пользователь просил "белый/серый в зависимости от контраста".
        
        let targetColor = '#e8e9eb'; // По умолчанию (светло-серый)
        if (avgBrightness > 120) {
            targetColor = '#ffffff'; // На ярком фоне делаем чисто белым для четкости
        } else if (avgBrightness > 50) {
            targetColor = '#ffffff'; // Тоже белый
        } else {
            targetColor = '#e8e9eb'; // На темном фоне оставляем приглушенным
        }

        // Применяем цвет к HTML элементу
        if (bound.type === 'title') {
            const el = document.getElementById(`title-${index + 1}`);
            if (el) el.style.color = targetColor;
        } else if (bound.type === 'exp') {
            const expBlocks = document.querySelectorAll('.explanation-block');
            if (expBlocks[bound.id]) expBlocks[bound.id].style.color = targetColor === '#ffffff' ? '#ffffff' : '#8b8d93';
        } else if (bound.type === 'bottom') {
            const el = document.getElementById('bottom-word');
            if (el) el.style.color = targetColor;
        }
    });
}

function drawHeatmap() {
    // Используем seed на основе даты, чтобы позиции были стабильны в течение дня
    let dateSeed = day() + month() * 31 + year() * 365;
    randomSeed(dateSeed);
    
    // Рассчитываем позиции кругов — случайно по всему постеру
    const storyPositions = [];
    const padding = 100; // Отступ от краёв, чтобы круги не обрезались
    
    for (let i = 0; i < Math.min(topStories.length, 3); i++) {
        let rx = padding + random(width - padding * 2);
        let ry = padding + random(height - padding * 2);
        storyPositions.push({ x: rx, y: ry });
    }
    
    // Сохраняем позиции глобально для использования в drawMarkers
    window.circlePositions = storyPositions;

    for (let i = 0; i < Math.min(topStories.length, 3); i++) {
        const story = topStories[i];
        const pos = storyPositions[i];
        
        const maxRadius = map(story.intensity, 40, 100, 200, 500);
        
        for (let r = maxRadius; r > 10; r -= 5) { 
            let alpha = map(r, 10, maxRadius, 110, 0); 
            let col = color(story.color);
            col.setAlpha(alpha);
            noStroke();
            fill(col);
            let noiseVal = noise(r * 0.008, i * 10) * 30; 
            ellipse(pos.x, pos.y, r + noiseVal);
        }

        // Белую точку в центре рисуем только если есть реальная локация
        if (story.mainLocation) {
            fill(255, 180);
            ellipse(pos.x, pos.y, 8);
        }
    }
}

function drawMarkers() {
    // Используем позиции из drawHeatmap (они уже рассчитаны)
    const storyPositions = window.circlePositions || [];
    
    if (storyPositions.length === 0) return;
    
    // Рисуем цепочку линий между точками (1 -> 2 -> 3)
    stroke(255, 30);
    strokeWeight(1);
    noFill();
    for (let i = 0; i < storyPositions.length - 1; i++) {
        let p1 = storyPositions[i];
        let p2 = storyPositions[i + 1];
        drawDashedCurve(p1.x, p1.y, p2.x, p2.y);
    }
    
    for (let i = 0; i < Math.min(topStories.length, 3); i++) {
        const story = topStories[i];
        const pos = storyPositions[i];
        
        // Подписи (город и координаты) рисуем только если есть локация
        if (story.mainLocation) {
            drawStoryMarker(pos.x, pos.y, story, i);

            // Основная точка
            fill(255, 200);
            noStroke();
            ellipse(pos.x, pos.y, 6);
        }
    }
}

function drawStoryMarker(x, y, story, index) {
    const cityName = story.mainLocation.name.toUpperCase();
    const coords = `${story.mainLocation.lat.toFixed(1)}, ${story.mainLocation.lng.toFixed(1)}`;
    
    stroke(255, 60);
    strokeWeight(0.5);
    noFill();
    
    textFont('PP Supply Mono');
    textSize(10);
    
    let lineLen = 30;
    
    // Определяем направление линии в зависимости от позиции на постере
    // Если точка в верхней половине — линия идёт вниз, иначе вверх
    // Если точка слева — линия может идти вправо, и наоборот
    
    let lineEndX = x;
    let lineEndY;
    let textAlignH = CENTER;
    let textAlignV;
    
    if (y < height * 0.4) {
        // Верхняя часть постера — линия вниз
        lineEndY = y + lineLen;
        textAlignV = TOP;
    } else if (y > height * 0.6) {
        // Нижняя часть постера — линия вверх
        lineEndY = y - lineLen;
        textAlignV = BOTTOM;
    } else {
        // Середина — линия вбок
        let sideDir = x > width / 2 ? -1 : 1;
        lineEndX = x + sideDir * 50;
        lineEndY = y;
        textAlignH = sideDir === 1 ? LEFT : RIGHT;
        textAlignV = CENTER;
    }
    
    line(x, y, lineEndX, lineEndY);
    
    noStroke();
    fill(255, 200);
    textAlign(textAlignH, textAlignV);
    
    if (textAlignV === TOP) {
        text(cityName, lineEndX, lineEndY + 5);
        fill(255, 100);
        textSize(8);
        text(coords, lineEndX, lineEndY + 17);
    } else if (textAlignV === BOTTOM) {
        text(cityName, lineEndX, lineEndY - 15);
        fill(255, 100);
        textSize(8);
        text(coords, lineEndX, lineEndY - 5);
    } else {
        // CENTER (боковая линия)
        let offset = lineEndX > x ? 10 : -10;
        text(cityName, lineEndX + offset, lineEndY - 5);
        fill(255, 100);
        textSize(8);
        text(coords, lineEndX + offset, lineEndY + 7);
    }
}

function drawDashedCurve(x1, y1, x2, y2) {
    let steps = 30; // Увеличили количество шагов для плавности
    
    // Генерируем случайное смещение для "контрольной точки" кривой
    // Это создаст уникальный изгиб для каждой линии
    let midX = lerp(x1, x2, 0.5);
    let midY = lerp(y1, y2, 0.5);
    
    // Добавляем случайный "вылет" в сторону
    let offsetX = random(-50, 50);
    let offsetY = random(-30, 30);
    
    let cpX = midX + offsetX;
    let cpY = midY + offsetY;

    for (let i = 0; i < steps; i += 2) {
        let t1 = i / steps;
        let t2 = (i + 1) / steps;
        
        // Используем квадратичную кривую Безье для плавного изгиба
        let cx1 = (1 - t1) * (1 - t1) * x1 + 2 * (1 - t1) * t1 * cpX + t1 * t1 * x2;
        let cy1 = (1 - t1) * (1 - t1) * y1 + 2 * (1 - t1) * t1 * cpY + t1 * t1 * y2;
        
        let cx2 = (1 - t2) * (1 - t2) * x1 + 2 * (1 - t2) * t2 * cpX + t2 * t2 * x2;
        let cy2 = (1 - t2) * (1 - t2) * y1 + 2 * (1 - t2) * t2 * cpY + t2 * t2 * y2;
        
        line(cx1, cy1, cx2, cy2);
    }
}
