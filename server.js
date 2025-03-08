const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const app = express();

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
        // Get username from query parameter or use default
        const username = req.query.username || PLAYER_NAME;
        
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

        res.json({
            username: username,
            elo: elo,
            level: level,
            levelImg: levelIcons[level] || levelIcons[1],
            matches: statsResponse.data.lifetime.Matches,
            winRate: statsResponse.data.lifetime['Win Rate %'],
            avgKD: statsResponse.data.lifetime['Average K/D Ratio'],
            streak: statsResponse.data.lifetime['Current Win Streak']
        });
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
                
                return {
                    nickname: player.nickname,
                    level: level,
                    levelImg: levelIcons[level] || levelIcons[1],
                    elo: elo,
                    avatar: player.avatar || ''
                };
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