const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const app = express();

const FACEIT_API_KEY = process.env.FACEIT_API_KEY || '0b636432-33ba-4bac-bd87-86f2686ae602';
const PLAYER_NAME = process.env.PLAYER_NAME || 'piK';

// Enable CORS for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Serve static files
app.use(express.static(__dirname));

// Root route handler
app.get('/', (req, res) => {
    const overlayPath = path.join(__dirname, 'overlay.html');
    if (fs.existsSync(overlayPath)) {
        res.sendFile(overlayPath);
    } else {
        res.send('overlay.html not found. Files in directory: ' + fs.readdirSync(__dirname).join(', '));
    }
});

// Test route to see directory contents
app.get('/test', (req, res) => {
    const files = fs.readdirSync(__dirname);
    res.json({
        currentDirectory: __dirname,
        files: files
    });
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.send('OK');
});

// API endpoint to get all stats
app.get('/api/stats', async (req, res) => {
    try {
        // Get player details
        const playerResponse = await axios.get(
            `https://open.faceit.com/data/v4/players?nickname=${PLAYER_NAME}`,
            {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            }
        );

        const playerId = playerResponse.data.player_id;
        const games = playerResponse.data.games;
        const level = games.cs2?.skill_level || 1;
        const elo = games.cs2?.faceit_elo || '-';

        // Get stats
        const statsResponse = await axios.get(
            `https://open.faceit.com/data/v4/players/${playerId}/stats/cs2`,
            {
                headers: {
                    'Authorization': `Bearer ${FACEIT_API_KEY}`
                }
            }
        );

        // Send combined stats
        res.json({
            elo: elo,
            level: level,
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Directory contents:', fs.readdirSync(__dirname));
}); 