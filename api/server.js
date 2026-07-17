// /home/github-actions/infrastructure/a1_api/api/server.js
const express = require('express');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

app.use(express.json());

// Crucial for reverse proxies: trust the X-Forwarded-* headers Caddy sends
app.set('trust proxy', true);

// Base health check entry point
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' 
    });
});

// Sample Resource Route Loop
app.get('/data', async (req, res) => {
    try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        res.json({ message: "Hello from the permanent A1 API endpoint!", collections });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Database Connection with exponential backoff retry loop logic
const connectWithRetry = () => {
    console.log('Attempting MongoDB connection footprint setup...');
    mongoose.connect(MONGO_URI)
        .then(() => console.log('🚀 MongoDB connected successfully.'))
        .catch(err => {
            console.error('❌ Database connection failure. Retrying in 5 seconds...', err);
            setTimeout(connectWithRetry, 5000);
        });
};
connectWithRetry();

app.listen(PORT, () => {
    console.log(`Server running in production footprint on port ${PORT}`);
});