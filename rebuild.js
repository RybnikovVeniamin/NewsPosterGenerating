// Re-runs the AI analysis on posters already in archive/, for days when the AI step failed
// and the poster was saved with default values (word GLOBAL, intensity 60, few locations).
//
// The stories themselves are kept (NewsAPI only serves current headlines, so the original
// article pool for a past day can't be fetched again). For each story this recomputes the
// location, the intensity and, where it was cut off at 100 characters, the description.
// Then it picks a new word of the day.
//
// Usage: ANTHROPIC_API_KEY=... node rebuild.js 2026-11-06 2026-11-23

const fs = require('fs');
const path = require('path');
const {
    analyzeLocationWithAI,
    analyzeIntensityWithAI,
    shortenDescriptionWithAI,
    analyzeGlobalSentiment,
    getCoordinates,
    countryKeywords,
    aiStats,
} = require('./generator.js');

const archiveDir = path.join(__dirname, 'archive');

function archivePath(date) {
    return path.join(archiveDir, `poster-${date}.json`);
}

function datesBetween(from, to) {
    const dates = [];
    const day = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    while (day <= end) {
        dates.push(day.toISOString().split('T')[0]);
        day.setUTCDate(day.getUTCDate() + 1);
    }
    return dates;
}

// Words of the day from the 7 days before `date`, so the new word doesn't repeat them.
function wordsBefore(date) {
    const words = [];
    const day = new Date(`${date}T00:00:00Z`);
    for (let i = 1; i <= 7; i++) {
        day.setUTCDate(day.getUTCDate() - 1);
        const file = archivePath(day.toISOString().split('T')[0]);
        if (!fs.existsSync(file)) continue;
        const word = JSON.parse(fs.readFileSync(file, 'utf8')).bottomWord;
        if (word && word !== 'GLOBAL') words.push(word.toUpperCase());
    }
    return [...new Set(words)];
}

async function findLocation(headline, description) {
    const aiLocation = await analyzeLocationWithAI(headline, description);
    if (aiLocation && aiLocation !== 'Skip') {
        const city = await getCoordinates(aiLocation);
        if (city) return city;
    }
    // Same keyword fallback as the daily run
    const text = `${headline} ${description}`;
    for (const keyword in countryKeywords) {
        if (new RegExp(`\\b${keyword}\\b`, 'i').test(text)) {
            return getCoordinates(countryKeywords[keyword]);
        }
    }
    return null;
}

async function rebuildDay(date) {
    const file = archivePath(date);
    if (!fs.existsSync(file)) {
        console.log(`⏭️ ${date}: no archive file, skipping`);
        return false;
    }
    const poster = JSON.parse(fs.readFileSync(file, 'utf8'));
    const callsBefore = aiStats.calls;
    const failuresBefore = aiStats.failures;
    console.log(`\n🔁 ${date} (was: ${poster.bottomWord})`);

    const stories = [];
    for (const story of poster.stories) {
        let description = story.description;
        if (description.endsWith('...')) {
            description = await shortenDescriptionWithAI(story.headline, description.slice(0, -3));
        }
        const mainLocation = await findLocation(story.headline, description);
        const intensity = await analyzeIntensityWithAI(story.headline, description);
        stories.push({ ...story, description, mainLocation, intensity });
        console.log(`  • ${story.headline.slice(0, 60)} → ${mainLocation ? mainLocation.name : 'no location'}, ${intensity}`);
    }

    const bottomWord = await analyzeGlobalSentiment(stories, wordsBefore(date));

    const calls = aiStats.calls - callsBefore;
    const failures = aiStats.failures - failuresBefore;
    if (failures > 0) {
        console.error(`❌ ${date}: ${failures} of ${calls} AI requests failed, leaving this day unchanged`);
        return false;
    }

    const rebuilt = { ...poster, bottomWord, stories };
    fs.writeFileSync(file, JSON.stringify(rebuilt, null, 2));

    const latestFile = path.join(__dirname, 'latest.json');
    if (fs.existsSync(latestFile) && JSON.parse(fs.readFileSync(latestFile, 'utf8')).date === date) {
        fs.writeFileSync(latestFile, JSON.stringify(rebuilt, null, 2));
    }
    console.log(`✅ ${date}: ${bottomWord}`);
    return true;
}

async function main() {
    const [from, to = from] = process.argv.slice(2);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        console.error('Usage: node rebuild.js FROM_DATE [TO_DATE]   (dates as YYYY-MM-DD)');
        process.exit(1);
    }
    if (!process.env.ANTHROPIC_API_KEY) {
        console.error('Missing ANTHROPIC_API_KEY.');
        process.exit(1);
    }
    let failed = 0;
    // Oldest first, so each day's "avoid recent words" list sees the already rebuilt days.
    for (const date of datesBetween(from, to)) {
        if (!(await rebuildDay(date))) failed++;
    }
    if (failed > 0) {
        console.error(`\n${failed} day(s) not rebuilt.`);
        process.exitCode = 1;
    }
}

main();
