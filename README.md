# Cloud Server to On-Premise Client File Download System

## Overview

This system allows a cloud-hosted server to download files from multiple on-premise clients that are located behind private networks. The solution uses WebSocket connections initiated by clients to maintain persistent communication channels, enabling the server to request file downloads on demand.

## Architecture

- **Server**: Cloud-hosted server with WebSocket support, REST API, and CLI interface
- **Clients**: On-premise clients that establish WebSocket connections to the server
- **Communication**: Clients initiate WebSocket connections; server sends download commands through these connections
- **File Transfer**: Files are streamed from clients to server in chunks for efficient memory usage

## Features

- ✅ WebSocket-based bidirectional communication
- ✅ REST API endpoint to trigger downloads
- ✅ CLI command support for downloads
- ✅ Multiple client support with unique client IDs
- ✅ Chunked file transfer for handling large files (100MB+)
- ✅ Connection status monitoring
- ✅ Error handling and reconnection logic

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## Installation

### Server Setup

1. Navigate to the server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
# Copy example env file
cp .env.example .env

# Edit .env file with your configuration
# For local development, default values should work fine
```

4. Start the server:
```bash
npm start
```

The server will start on:
- WebSocket: `ws://localhost:8080` (configurable via `WS_PORT`)
- REST API: `http://localhost:3000` (configurable via `API_PORT`)
- Swagger UI: `http://localhost:3000/api-docs`

### Client Setup

1. Navigate to the client directory:
```bash
cd client
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
# Copy example env file
cp .env.example .env

# Edit .env file:
# - Set CLIENT_ID (e.g., restaurant-1, restaurant-2)
# - Set SERVER_URL if server is not on localhost
# - Set FILE_PATH if file is in custom location
```

4. Generate the test file (100MB):
```bash
npm run generate-file
```

5. Start a client:
```bash
npm start
```

To start multiple clients (simulating different restaurants), you can either:

**Option 1: Use environment variables (no .env needed)**
```bash
CLIENT_ID=restaurant-1 npm start
CLIENT_ID=restaurant-2 npm start
CLIENT_ID=restaurant-3 npm start
```

**Option 2: Create separate .env files**
```bash
# Create .env.restaurant1, .env.restaurant2, etc.
# Then load specific env file when starting
```

## Usage

### Triggering Downloads

#### Method 1: Swagger UI (Recommended - Most User Friendly) ⭐

1. Ensure server is running:
   ```bash
   cd server
   npm start
   ```

2. Open browser and access:
   ```
   http://localhost:3000/api-docs
   ```

3. **View Connected Clients:**
   - Expand endpoint `GET /api/clients`
   - Click **"Try it out"** button
   - Click **"Execute"**
   - View list of connected clients

4. **Trigger Download:**
   - Expand endpoint `POST /api/download`
   - Click **"Try it out"** button
   - Edit Request body with clientId to download:
     ```json
     {
       "clientId": "restaurant-1"
     }
     ```
   - Click **"Execute"**
   - Download will start!

5. **Check Server Health:**
   - Expand endpoint `GET /health`
   - Click **"Try it out"** → **"Execute"**

**Advantages of Swagger UI:**
- ✅ Visual interface, easy to use
- ✅ No command line required
- ✅ Complete API documentation
- ✅ Test directly from browser
- ✅ View example request/response

#### Method 2: REST API (via cURL or Postman)

```bash
# Download file from a specific client
curl -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"clientId": "restaurant-1"}'

# List connected clients
curl http://localhost:3000/api/clients

# Health check
curl http://localhost:3000/health
```

**Via PowerShell:**
```powershell
# Download file
Invoke-RestMethod -Uri "http://localhost:3000/api/download" -Method Post -ContentType "application/json" -Body '{"clientId": "restaurant-1"}'

# List clients
Invoke-RestMethod -Uri "http://localhost:3000/api/clients" -Method Get
```

#### Method 3: CLI Command

```bash
cd server
node server.js download restaurant-1

# List connected clients
node server.js list
```

## Project Structure

```
.
├── README.md
├── .gitignore
├── server/
│   ├── server.js          # Main server application
│   ├── package.json       # Server dependencies
│   ├── .env.example       # Example environment variables
│   └── .env               # Your configuration (create from .env.example)
├── client/
│   ├── client.js          # Client application
│   ├── generate-file.js   # Script to generate test file
│   ├── package.json       # Client dependencies
│   ├── .env.example       # Example environment variables
│   └── .env               # Your configuration (create from .env.example)
└── downloads/             # Downloaded files (created automatically)
```

## How It Works

1. **Client Connection**: Each client establishes a WebSocket connection to the server and registers with a unique client ID
2. **Download Request**: Server receives a download request (via API or CLI) specifying a client ID
3. **File Request**: Server sends a download command to the specified client through the WebSocket connection
4. **File Transfer**: Client reads the file in chunks and streams it to the server
5. **File Storage**: Server receives chunks and writes them to disk in the `downloads/` directory

## Configuration

### Server Configuration (.env)

```bash
WS_PORT=8080
API_PORT=3000
SERVER_HOST=localhost
DOWNLOAD_DIR=./downloads
```

### Client Configuration (.env)

```bash
SERVER_URL=ws://localhost:8080
CLIENT_ID=restaurant-1
CHUNK_SIZE=65536
RECONNECT_INTERVAL=5000
```

## Testing

1. Start the server
2. Start one or more clients
3. Verify clients are connected:
   ```bash
   curl http://localhost:3000/api/clients
   ```
4. Trigger a download:
   ```bash
   curl -X POST http://localhost:3000/api/download \
     -H "Content-Type: application/json" \
     -d '{"clientId": "restaurant-1"}'
   ```
5. Check the downloaded file in `server/downloads/`

## Error Handling

- **Client Disconnection**: Server detects and removes disconnected clients
- **Reconnection**: Clients automatically attempt to reconnect on connection loss
- **File Not Found**: Server receives error message if file doesn't exist on client
- **Transfer Errors**: Both parties handle network errors gracefully

## Performance Considerations

- Files are transferred in 64KB chunks to optimize memory usage
- WebSocket provides low-latency communication
- Server can handle multiple simultaneous downloads
- Client uses streaming to handle files larger than available memory

## Security Considerations (Production Recommendations)

- Implement authentication for WebSocket connections
- Use WSS (WebSocket Secure) for encrypted communication
- Add API authentication (JWT, API keys)
- Validate and sanitize client IDs
- Implement rate limiting
- Add file integrity checks (checksums)
- Use HTTPS for REST API

## Troubleshooting

**Client can't connect to server:**
- Verify server is running
- Check firewall settings
- Ensure correct server URL in client configuration

**Download fails:**
- Verify file exists at `$HOME/file_to_download.txt`
- Check client is connected (use list command)
- Review server and client logs for errors

**File not generated:**
- Run `npm run generate-file` in client directory
- Check disk space availability

## License

MIT
