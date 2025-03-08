const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const app = express();

// Initialize cache with 5 minute TTL
const cache = new NodeCache({ stdTTL: 300 });

// Rate limiting configuration
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

// Apply rate limiting to all routes
app.use(limiter);

// Log all requests at the very start
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

const FACEIT_API_KEY = process.env.FACEIT_API_KEY || '0b636432-33ba-4bac-bd87-86f2686ae602';
const PLAYER_NAME = process.env.PLAYER_NAME || 'piK';

// Enable CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Log the current directory and files
console.log('Current directory:', __dirname);
console.log('Files in directory:', fs.readdirSync(__dirname));

// Serve overlay.html at root and /overlay.html
app.get('/', (req, res) => {
    const filePath = path.join(__dirname, 'search.html');
    console.log('Attempting to serve:', filePath);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        console.error('File not found:', filePath);
        res.status(404).send('search.html not found');
    }
});

app.get('/test', (req, res) => {
    const filePath = path.join(__dirname, 'test.html');
    console.log('Attempting to serve:', filePath);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        console.error('File not found:', filePath);
        res.status(404).send('test.html not found');
    }
});

app.get('/overlay.html', (req, res) => {
    const filePath = path.join(__dirname, 'overlay.html');
    console.log('Attempting to serve:', filePath);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        console.error('File not found:', filePath);
        res.status(404).send('overlay.html not found');
    }
});

app.get('/overlay2.html', (req, res) => {
    const filePath = path.join(__dirname, 'overlay2.html');
    console.log('Attempting to serve:', filePath);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        console.error('File not found:', filePath);
        res.status(404).send('overlay2.html not found');
    }
});

app.get('/search.html', (req, res) => {
    const filePath = path.join(__dirname, 'search.html');
    console.log('Attempting to serve:', filePath);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        console.error('File not found:', filePath);
        res.status(404).send('search.html not found');
    }
});

// Health check
app.get('/health', (req, res) => {
    res.send('OK');
});

// API endpoint
app.get('/api/stats', async (req, res) => {
    try {
        const username = req.query.username || PLAYER_NAME;
        
        // Check cache first
        const cacheKey = `stats_${username}`;
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }

        const playerResponse = await axios.get(
            `https://open.faceit.com/data/v4/players?nickname=${username}`,
            {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            }
        );

        const playerId = playerResponse.data.player_id;
        const cs2Data = playerResponse.data.games.cs2;
        const level = cs2Data ? parseInt(cs2Data.skill_level) : 1;
        const elo = cs2Data ? cs2Data.faceit_elo : '-';

        const statsResponse = await axios.get(
            `https://open.faceit.com/data/v4/players/${playerId}/stats/cs2`,
            {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            }
        );

        console.log('Player lifetime stats:', statsResponse.data.lifetime);

        // Get last 30 matches
        const matchHistoryResponse = await axios.get(
            `https://open.faceit.com/data/v4/players/${playerId}/games/cs2/stats?offset=0&limit=30`,
            {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            }
        );

        console.log('Number of matches found:', matchHistoryResponse.data.items.length);
        
        let totalKills = 0;
        let totalADR = 0;
        const matches = matchHistoryResponse.data.items || [];
        for (const match of matches) {
            console.log(`Match ${match.matchId || match.stats['Match Id']} stats:`, match.stats);
            const kills = parseInt(match.stats.Kills || 0);
            const adr = parseFloat(match.stats.ADR || 0);
            totalKills += kills;
            totalADR += adr;
            console.log(`Match ${match.matchId || match.stats['Match Id']}: ${kills} kills, total now: ${totalKills}`);
        }

        const avgKills = matches.length > 0 ? (totalKills / matches.length).toFixed(1) : '0';
        const avgADR = matches.length > 0 ? (totalADR / matches.length).toFixed(1) : '0';
        console.log('Final average kills:', avgKills);
        console.log('Final average ADR:', avgADR);

        // Calculate session win/loss from match stats
        const SESSION_WINDOW = 6 * 60 * 60; // 6 hours in seconds
        
        // Get 24 hours ago instead of today's midnight
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
        console.log('\n=== Session Tracking Debug ===');
        console.log('24 hours ago:', twentyFourHoursAgo.toISOString());
        
        // Filter matches from last 24 hours
        console.log('\nFiltering matches from last 24 hours:');
        const recentMatches = matches.filter(match => {
            const matchTimestamp = parseInt(match.stats['Match Finished At']) / 1000;
            const matchDate = new Date(matchTimestamp * 1000);
            const isRecent = matchDate >= twentyFourHoursAgo;
            console.log(`Match ${match.matchId || match.stats['Match Id']}: ${matchDate.toISOString()} - isRecent: ${isRecent}`);
            return isRecent;
        });

        console.log(`\nFound ${recentMatches.length} matches in last 24 hours`);

        // Sort matches by timestamp (oldest to newest)
        recentMatches.sort((a, b) => {
            return parseInt(a.stats['Match Finished At']) - parseInt(b.stats['Match Finished At']);
        });

        console.log('\nMatches in chronological order:');
        recentMatches.forEach(match => {
            const matchTime = new Date(parseInt(match.stats['Match Finished At']) * 1000);
            console.log(`Match ${match.matchId || match.stats['Match Id']}: ${matchTime.toISOString()}`);
        });

        // Find the longest chain of matches within 6 hours of each other
        let longestChain = [];
        let currentChain = [];
        let lastMatchTimestamp = null;

        console.log('\nFinding longest chain of matches:');
        for (const match of recentMatches) {
            const matchTimestamp = parseInt(match.stats['Match Finished At']) / 1000;
            const matchTime = new Date(matchTimestamp * 1000);
            
            if (lastMatchTimestamp === null) {
                currentChain = [match];
                lastMatchTimestamp = matchTimestamp;
                console.log(`Starting new chain with match ${match.matchId || match.stats['Match Id']} (${matchTime.toISOString()})`);
            } else {
                const timeDiffHours = (matchTimestamp - lastMatchTimestamp) / 3600;
                console.log(`\nChecking match ${match.matchId || match.stats['Match Id']}:`);
                console.log(`Time: ${matchTime.toISOString()}`);
                console.log(`Time since last match: ${timeDiffHours.toFixed(2)} hours`);
                
                if (timeDiffHours < 6) {
                    currentChain.push(match);
                    lastMatchTimestamp = matchTimestamp;
                    console.log('Added to current chain (within 6 hours of previous match)');
                } else {
                    console.log('Gap larger than 6 hours, starting new chain');
                    // If this chain is longer than our longest, save it
                    if (currentChain.length > longestChain.length) {
                        console.log(`New longest chain found: ${currentChain.length} matches`);
                        longestChain = [...currentChain];
                    }
                    // Start new chain with current match
                    currentChain = [match];
                    lastMatchTimestamp = matchTimestamp;
                }
            }
        }

        // Check if the last chain is the longest
        if (currentChain.length > longestChain.length) {
            console.log(`Final chain is longest: ${currentChain.length} matches`);
            longestChain = [...currentChain];
        }

        // Use the longest chain as our session
        const sessionMatches = longestChain;

        console.log('\nFinal session matches:');
        sessionMatches.forEach(match => {
            const matchTimestamp = parseInt(match.stats['Match Finished At']) / 1000;
            const matchTime = new Date(matchTimestamp * 1000);
            console.log(`Match ${match.matchId || match.stats['Match Id']}: ${matchTime.toISOString()}, Result: ${match.stats.Result === '1' ? 'Win' : 'Loss'}`);
        });

        const sessionWins = sessionMatches.filter(match => match.stats.Result === '1').length;
        const sessionLosses = sessionMatches.filter(match => match.stats.Result === '0').length;

        console.log(`\nFinal counts - Recent matches: ${recentMatches.length}, Session matches: ${sessionMatches.length}`);
        console.log(`Session W/L: ${sessionWins}:${sessionLosses}`);
        console.log('=== End Session Tracking Debug ===\n');

        // Calculate win streak
        let streak = 0;
        for (const match of matches) {
            if (match.stats.Result === '1') {
                streak++;
            } else {
                break;
            }
        }

        // Use the same level icons as defined in the frontend
        const levelIcons = {
            1: 'https://support.faceit.com/hc/article_attachments/10525200575516',
            2: 'https://support.faceit.com/hc/article_attachments/10525189649308',
            3: 'https://support.faceit.com/hc/article_attachments/10525200576796',
            4: 'https://support.faceit.com/hc/article_attachments/10525185037724',
            5: 'https://support.faceit.com/hc/article_attachments/10525215800860',
            6: 'https://support.faceit.com/hc/article_attachments/10525245409692',
            7: 'https://support.faceit.com/hc/article_attachments/10525185034012',
            8: 'https://support.faceit.com/hc/article_attachments/10525189648796',
            9: 'https://support.faceit.com/hc/article_attachments/10525200576028',
            10: 'https://support.faceit.com/hc/article_attachments/10525189646876'
        };

        const responseData = {
            username: username,
            elo: elo,
            level: level,
            levelImg: levelIcons[level] || levelIcons[1],
            avatar: playerResponse.data.avatar,
            matches: statsResponse.data.lifetime.Matches,
            todayWins: sessionWins,      // Use session stats for W/L
            todayLosses: sessionLosses,  // Use session stats for W/L
            avgKD: statsResponse.data.lifetime['Average K/D Ratio'],
            avgKills: avgKills,
            avgADR: avgADR,
            streak: streak
        };

        // Cache the response
        cache.set(cacheKey, responseData);

        res.json(responseData);
    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to fetch FACEIT stats',
            details: error.response?.data?.message || error.message
        });
    }
});

// Search users endpoint
app.get('/api/search-users', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.length < 2) {
            return res.json({ result: [] });
        }

        // Check cache first
        const cacheKey = `search_${query}`;
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json({ result: cachedData });
        }

        const searchResponse = await axios.get(
            `https://open.faceit.com/data/v4/search/players?nickname=${query}&offset=0&limit=5`,
            {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            }
        );

        // Get detailed player info for each result
        const playerPromises = searchResponse.data.items.map(async player => {
            // Check player cache first
            const playerCacheKey = `player_${player.player_id}`;
            const cachedPlayer = cache.get(playerCacheKey);
            if (cachedPlayer) {
                return cachedPlayer;
            }

            try {
                const playerResponse = await axios.get(
                    `https://open.faceit.com/data/v4/players/${player.player_id}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${FACEIT_API_KEY}`
                        }
                    }
                );
                
                const cs2Data = playerResponse.data.games.cs2;
                const level = cs2Data ? parseInt(cs2Data.skill_level) : 1;
                const elo = cs2Data ? cs2Data.faceit_elo : '-';
                
                // Use the same level icons as defined in the frontend
                const levelIcons = {
                    1: 'https://support.faceit.com/hc/article_attachments/10525200575516',
                    2: 'https://support.faceit.com/hc/article_attachments/10525189649308',
                    3: 'https://support.faceit.com/hc/article_attachments/10525200576796',
                    4: 'https://support.faceit.com/hc/article_attachments/10525185037724',
                    5: 'https://support.faceit.com/hc/article_attachments/10525215800860',
                    6: 'https://support.faceit.com/hc/article_attachments/10525245409692',
                    7: 'https://support.faceit.com/hc/article_attachments/10525185034012',
                    8: 'https://support.faceit.com/hc/article_attachments/10525189648796',
                    9: 'https://support.faceit.com/hc/article_attachments/10525200576028',
                    10: 'https://support.faceit.com/hc/article_attachments/10525189646876'
                };
                
                const playerData = {
                    nickname: player.nickname,
                    level: level,
                    levelImg: levelIcons[level] || levelIcons[1],
                    elo: elo,
                    avatar: player.avatar || ''
                };

                // Cache individual player data
                cache.set(playerCacheKey, playerData);
                return playerData;
            } catch (error) {
                console.error(`Error fetching player ${player.player_id}:`, error.message);
                return {
                    nickname: player.nickname,
                    level: 1,
                    levelImg: 'https://support.faceit.com/hc/article_attachments/10525200575516',
                    elo: '-',
                    avatar: player.avatar || ''
                };
            }
        });

        const suggestions = await Promise.all(playerPromises);

        // Sort results to prioritize exact matches while preserving case
        suggestions.sort((a, b) => {
            const aStartsWithQuery = a.nickname.toLowerCase().startsWith(query.toLowerCase());
            const bStartsWithQuery = b.nickname.toLowerCase().startsWith(query.toLowerCase());
            
            if (aStartsWithQuery && !bStartsWithQuery) return -1;
            if (!aStartsWithQuery && bStartsWithQuery) return 1;
            
            const aExactMatch = a.nickname.toLowerCase() === query.toLowerCase();
            const bExactMatch = b.nickname.toLowerCase() === query.toLowerCase();
            
            if (aExactMatch && !bExactMatch) return -1;
            if (!aExactMatch && bExactMatch) return 1;
            
            return a.nickname.localeCompare(b.nickname);
        });

        // Cache the search results
        cache.set(cacheKey, suggestions);

        res.json({ result: suggestions });
    } catch (error) {
        console.error('Search API Error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to fetch player suggestions',
            details: error.response?.data?.message || error.message
        });
    }
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).send('Something broke!');
});

// Handle 404
app.use((req, res) => {
    console.log('404 for path:', req.path);
    res.status(404).send('Not found');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 