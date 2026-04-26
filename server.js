require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

let config = {};
if (fs.existsSync('./config.json')) {
    config = require('./config.json');
}

const app = express();
const PORT = process.env.PORT || config.port || 3000;
const STORAGE_PATH = process.env.STORAGE_FILE || config.storageFile || 'data.json';
const DATA_FILE = path.isAbsolute(STORAGE_PATH) ? STORAGE_PATH : path.join(__dirname, STORAGE_PATH);

console.log(`Using data file: ${DATA_FILE}`);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main UI
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ensure data file exists
if (!fs.existsSync(DATA_FILE)) {
    console.log('Data file does not exist. Creating it...');
    const initialData = { guns: [], ammo: {} };
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
        console.log('Data file created successfully.');
    } catch (err) {
        console.error(`Error creating data file at ${DATA_FILE}:`, err);
    }
}

// Get data
app.get('/api/data', (req, res) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading data');
        res.json(JSON.parse(data));
    });
});

// Save data
app.post('/api/data', (req, res) => {
    const newData = req.body;
    fs.writeFile(DATA_FILE, JSON.stringify(newData, null, 2), (err) => {
        if (err) return res.status(500).send('Error saving data');
        res.sendStatus(200);
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
