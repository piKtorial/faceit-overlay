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

        const statsResponse = await axios.get(
            `https://open.faceit.com/data/v4/players/${playerId}/stats/cs2`,
            {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            }
        );

        // Get last 30 matches
        const matchHistoryResponse = await axios.get(
            `https://open.faceit.com/data/v4/players/${playerId}/games/cs2/stats?offset=0&limit=30`,
            {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            }
        );
        
        let totalKills = 0;
        let totalADR = 0;
        const matches = matchHistoryResponse.data.items || [];
        for (const match of matches) {
            const kills = parseInt(match.stats.Kills || 0);
            const adr = parseFloat(match.stats.ADR || 0);
            totalKills += kills;
            totalADR += adr;
        }

        const avgKills = matches.length > 0 ? (totalKills / matches.length).toFixed(1) : '0';
        const avgADR = matches.length > 0 ? (totalADR / matches.length).toFixed(1) : '0';

        // Calculate session win/loss from match stats
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
        
        // Filter matches from last 24 hours
        const recentMatches = matches.filter(match => {
            const matchTimestamp = parseInt(match.stats['Match Finished At']) / 1000;
            const matchDate = new Date(matchTimestamp * 1000);
            return matchDate >= twentyFourHoursAgo;
        });

        // Sort matches by timestamp (oldest to newest)
        recentMatches.sort((a, b) => {
            return parseInt(a.stats['Match Finished At']) - parseInt(b.stats['Match Finished At']);
        });

        // Find the longest chain of matches within 6 hours of each other
        let longestChain = [];
        let currentChain = [];
        let lastMatchTimestamp = null;

        for (const match of recentMatches) {
            const matchTimestamp = parseInt(match.stats['Match Finished At']) / 1000;
            
            if (lastMatchTimestamp === null) {
                currentChain = [match];
                lastMatchTimestamp = matchTimestamp;
            } else {
                const timeDiffHours = (matchTimestamp - lastMatchTimestamp) / 3600;
                
                if (timeDiffHours < 6) {
                    currentChain.push(match);
                    lastMatchTimestamp = matchTimestamp;
                } else {
                    if (currentChain.length > longestChain.length) {
                        longestChain = [...currentChain];
                    }
                    currentChain = [match];
                    lastMatchTimestamp = matchTimestamp;
                }
            }
        }

        // Check if the last chain is the longest
        if (currentChain.length > longestChain.length) {
            longestChain = [...currentChain];
        }

        // Use the longest chain as our session
        const sessionMatches = longestChain;
        const sessionWins = sessionMatches.filter(match => match.stats.Result === '1').length;
        const sessionLosses = sessionMatches.filter(match => match.stats.Result === '0').length;

        // Calculate win streak
        let streak = 0;
        for (const match of matches) {
            if (match.stats.Result === '1') {
                streak++;
            } else {
                break;
            }
        }

        // Calculate average K/D
        const avgKD = matches.length > 0 
            ? (matches.reduce((sum, match) => sum + parseFloat(match.stats['K/D Ratio'] || 0), 0) / matches.length).toFixed(2)
            : '0.00';

        const responseData = {
            username: playerResponse.data.nickname,
            avatar: playerResponse.data.avatar,
            level,
            levelImg: `https://cdn.faceit.com/frontend/291/assets/images/skill-icons/skill_level_${level}_svg.svg`,
            elo,
            matches: matches.length,
            todayWins: sessionWins,
            todayLosses: sessionLosses,
            avgKD,
            avgKills,
            avgADR,
            streak
        };

        // Cache the response
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

        const response = await axios.get(
            `https://open.faceit.com/data/v4/search/players?nickname=${query}&offset=0&limit=5&game=cs2`,
            {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            }
        );

        const players = response.data.items.map(player => ({
            nickname: player.nickname,
            avatar: player.avatar,
            level: player.games.cs2 ? player.games.cs2.skill_level : 1,
            levelImg: `https://cdn.faceit.com/frontend/291/assets/images/skill-icons/skill_level_${player.games.cs2 ? player.games.cs2.skill_level : 1}_svg.svg`,
            elo: player.games.cs2 ? player.games.cs2.faceit_elo : '-'
        }));

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