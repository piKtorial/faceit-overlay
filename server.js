const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
require('dotenv').config();
const app = express();

// Initialize cache with different TTLs for different types of data
const cache = new NodeCache({ 
    stdTTL: 300,  // 5 minutes default TTL
    checkperiod: 60,  // Check for expired keys every 60 seconds
    useClones: false  // Don't clone data, improves performance
});

// Rate limiting configuration
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later' }
});

// Apply rate limiting to all routes
app.use(limiter);

// Basic request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Environment variables check
const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
if (!FACEIT_API_KEY) {
    console.error('FACEIT_API_KEY environment variable is required');
    process.exit(1);
}
const PLAYER_NAME = process.env.PLAYER_NAME || 'default';

// Enable CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Log the current directory and files
console.log('Current directory:', __dirname);
console.log('Files in directory:', fs.readdirSync(__dirname));

// Serve static files
app.use(express.static(__dirname));

// Serve search.html at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'search.html'));
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

        // Get lifetime stats first for total matches
        const statsResponse = await axios.get(
            `https://open.faceit.com/data/v4/players/${playerId}/stats/cs2`,
            {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            }
        );

        // Get total matches from lifetime stats
        const totalMatches = statsResponse.data.lifetime ? parseInt(statsResponse.data.lifetime.Matches) : 0;

        // Get last 30 matches for calculating recent stats
        const matchHistoryResponse = await axios.get(
            `https://open.faceit.com/data/v4/players/${playerId}/history?game=cs2&offset=0&limit=30`,
            {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            }
        );
        
        const matches = matchHistoryResponse.data.items || [];
        
        // Calculate today's win/loss from match history
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
        
        // Filter matches from last 24 hours
        const todayMatches = matches.filter(match => {
            const matchDate = new Date(match.finished_at * 1000);
            return matchDate >= twentyFourHoursAgo;
        });

        // Calculate W/L for today's matches
        let todayWins = 0;
        let todayLosses = 0;
        
        for (const match of todayMatches) {
            if (match.results && match.results.score) {
                const scores = match.results.score.split(' / ');
                const playerTeamIndex = match.teams.faction1.players.some(p => p.player_id === playerId) ? 0 : 1;
                const playerScore = parseInt(scores[playerTeamIndex]);
                const opponentScore = parseInt(scores[1 - playerTeamIndex]);
                
                if (playerScore > opponentScore) {
                    todayWins++;
                } else {
                    todayLosses++;
                }
            }
        }

        // Get detailed stats for last 30 matches for averages
        const matchStatsResponse = await axios.get(
            `https://open.faceit.com/data/v4/players/${playerId}/games/cs2/stats?offset=0&limit=30`,
            {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            }
        );
        
        let totalKills = 0;
        let totalADR = 0;
        const recentMatches = matchStatsResponse.data.items || [];
        for (const match of recentMatches) {
            const kills = parseInt(match.stats.Kills || 0);
            const adr = parseFloat(match.stats.ADR || 0);
            totalKills += kills;
            totalADR += adr;
        }

        const avgKills = recentMatches.length > 0 ? (totalKills / recentMatches.length).toFixed(1) : '0';
        const avgADR = recentMatches.length > 0 ? (totalADR / recentMatches.length).toFixed(1) : '0';

        // Calculate win streak from recent matches
        let streak = 0;
        for (const match of recentMatches) {
            if (match.stats.Result === '1') {
                streak++;
            } else {
                break;
            }
        }

        // Calculate average K/D
        const avgKD = recentMatches.length > 0 
            ? (recentMatches.reduce((sum, match) => sum + parseFloat(match.stats['K/D Ratio'] || 0), 0) / recentMatches.length).toFixed(2)
            : '0.00';

        const LEVEL_ICONS = {
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
            username: playerResponse.data.nickname,
            avatar: playerResponse.data.avatar,
            level,
            levelImg: LEVEL_ICONS[level],
            elo,
            matches: totalMatches,
            todayWins,
            todayLosses,
            avgKD,
            avgKills,
            avgADR,
            streak
        };

        // Cache the response for 5 minutes
        cache.set(cacheKey, responseData);
        res.json(responseData);

    } catch (error) {
        console.error('Error in /api/stats:', error.message);
        res.status(500).json({ error: 'Failed to fetch player stats' });
    }
});

// Search users endpoint
app.get('/api/search-users', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.length < 2) {
            return res.json({ result: [] });
        }

        const cacheKey = `search_${query}`;
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json({ result: cachedData });
        }

        const LEVEL_ICONS = {
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

        const response = await axios.get(
            `https://open.faceit.com/data/v4/search/players?nickname=${query}&offset=0&limit=5&game=cs2`,
            {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            }
        );

        // Get detailed player data for each search result to get ELO
        const playerPromises = response.data.items.map(async player => {
            const playerResponse = await axios.get(
                `https://open.faceit.com/data/v4/players/${player.player_id}`,
                {
                    headers: {
                        'Authorization': `Bearer ${FACEIT_API_KEY}`
                    }
                }
            );

            const cs2Game = player.games.find(game => game.name === 'cs2');
            const level = cs2Game ? parseInt(cs2Game.skill_level) : 1;
            const cs2Data = playerResponse.data.games.cs2;
            const elo = cs2Data ? cs2Data.faceit_elo : '-';
            
            return {
                nickname: player.nickname,
                avatar: player.avatar,
                level: level,
                levelImg: LEVEL_ICONS[level],
                elo: elo
            };
        });

        const players = await Promise.all(playerPromises);
        cache.set(cacheKey, players);
        res.json({ result: players });

    } catch (error) {
        console.error('Error in /api/search-users:', error.message);
        res.status(500).json({ error: 'Failed to search users' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// Handle 404
app.use((req, res) => {
    console.log('404 for path:', req.path);
    res.status(404).send('Not found');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 