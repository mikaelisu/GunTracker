# ArmorLog (GunTracker) Project Context

## Project Overview
ArmorLog is a firearms maintenance and ammunition inventory tracker. It has been upgraded from a local-only application to a client-server model to support physical file storage on the host machine.

- **Main Technologies:** Node.js (Express), HTML5, Vanilla JavaScript.
- **Persistence:** Data is saved to a physical JSON file on disk, as defined in `config.json`.
- **Architecture:** 
    - **Frontend:** `guntracker.html` (serves as the UI).
    - **Backend:** `server.js` (Node.js Express server).
    - **Config:** `config.json` (defines storage path and port).

## Getting Started

### Prerequisites
- Node.js installed.

### Building and Running
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
   *Note: If you use VS Code, the server will automatically start when you open the folder.*
3. Access the application in your browser at `http://localhost:3000`.

### Configuration
The application uses a hybrid configuration approach to protect privacy:

1.  **Environment Variables (`.env`):** Recommended for sensitive information like absolute file paths. This file is ignored by Git.
    ```env
    STORAGE_FILE=/Users/yourname/Documents/data.json
    PORT=3000
    ```
2.  **Config File (`config.json`):** Used for non-sensitive defaults. (Also ignored by Git to prevent accidental leaks).
3.  **Example Config (`config.json.example`):** A template for creating your own configuration.

The server prioritizes values in this order: `.env` > `config.json` > Defaults.

### Testing
- **Backend:** Verify that `data.json` is created/updated upon saving.
- **Frontend:** Ensure the UI correctly reflects data fetched from the `/api/data` endpoint.

## Development Conventions
- **Client-Server Communication:** The frontend uses `fetch()` to interact with the backend API (`/api/data`).
- **Data Integrity:** The backend ensures the storage file exists and handles JSON serialization.
- **Syncing:** Any state change in the frontend must trigger a `save()` call to persist changes to the server.
