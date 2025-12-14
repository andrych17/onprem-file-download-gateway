const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

// Configuration from environment variables
const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:8080';
const CLIENT_ID = process.env.CLIENT_ID || `client-${Math.random().toString(36).substr(2, 9)}`;
const FILE_PATH = process.env.FILE_PATH || path.join(os.homedir(), 'file_to_download.txt');
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE) || 64 * 1024; // 64KB chunks
const RECONNECT_INTERVAL = parseInt(process.env.RECONNECT_INTERVAL) || 5000; // 5 seconds

let ws = null;
let reconnectInterval = null;

function connect() {
    console.log(`Connecting to server at ${SERVER_URL}...`);
    
    ws = new WebSocket(SERVER_URL);
    
    ws.on('open', () => {
        console.log('Connected to server');
        
        // Clear reconnect interval if exists
        if (reconnectInterval) {
            clearInterval(reconnectInterval);
            reconnectInterval = null;
        }
        
        // Register with the server
        ws.send(JSON.stringify({
            type: 'register',
            clientId: CLIENT_ID
        }));
    });
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'registered':
                    console.log(`Successfully registered as ${data.clientId}`);
                    console.log('Waiting for download requests...');
                    break;
                case 'download-request':
                    handleDownloadRequest(data);
                    break;
                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('Disconnected from server');
        attemptReconnect();
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
    });
}

function attemptReconnect() {
    if (!reconnectInterval) {
        console.log(`Attempting to reconnect in ${RECONNECT_INTERVAL / 1000} seconds...`);
        reconnectInterval = setInterval(() => {
            console.log('Reconnecting...');
            connect();
        }, RECONNECT_INTERVAL);
    }
}

async function handleDownloadRequest(data) {
    const downloadId = data.downloadId;
    console.log(`\nReceived download request (ID: ${downloadId})`);
    console.log(`File path: ${FILE_PATH}`);
    
    // Check if file exists
    if (!fs.existsSync(FILE_PATH)) {
        console.error(`File not found: ${FILE_PATH}`);
        ws.send(JSON.stringify({
            type: 'error',
            clientId: CLIENT_ID,
            downloadId: downloadId,
            error: 'File not found'
        }));
        return;
    }
    
    try {
        const stats = fs.statSync(FILE_PATH);
        const fileSize = stats.size;
        const fileSizeInMB = (fileSize / (1024 * 1024)).toFixed(2);
        
        console.log(`File size: ${fileSizeInMB} MB`);
        console.log('Starting file transfer...');
        
        const startTime = Date.now();
        let chunkIndex = 0;
        let totalBytesSent = 0;
        
        // Create read stream
        const readStream = fs.createReadStream(FILE_PATH, {
            highWaterMark: CHUNK_SIZE
        });
        
        readStream.on('data', (chunk) => {
            // Pause stream while sending chunk
            readStream.pause();
            
            // Convert chunk to base64 for safe transmission
            const base64Chunk = chunk.toString('base64');
            
            // Send chunk to server
            ws.send(JSON.stringify({
                type: 'file-chunk',
                clientId: CLIENT_ID,
                downloadId: downloadId,
                chunk: base64Chunk,
                chunkIndex: chunkIndex
            }), (error) => {
                if (error) {
                    console.error('Error sending chunk:', error);
                    readStream.destroy();
                } else {
                    totalBytesSent += chunk.length;
                    chunkIndex++;
                    
                    // Log progress every 100 chunks
                    if (chunkIndex % 100 === 0) {
                        const progress = ((totalBytesSent / fileSize) * 100).toFixed(1);
                        console.log(`Progress: ${progress}% (${chunkIndex} chunks sent)`);
                    }
                    
                    // Resume stream
                    readStream.resume();
                }
            });
        });
        
        readStream.on('end', () => {
            const duration = (Date.now() - startTime) / 1000;
            const speedMBps = (fileSize / (1024 * 1024) / duration).toFixed(2);
            
            console.log(`\nFile transfer complete:`);
            console.log(`  - Total chunks: ${chunkIndex}`);
            console.log(`  - Total size: ${fileSizeInMB} MB`);
            console.log(`  - Duration: ${duration.toFixed(2)}s`);
            console.log(`  - Speed: ${speedMBps} MB/s`);
            
            // Send completion message
            ws.send(JSON.stringify({
                type: 'file-complete',
                clientId: CLIENT_ID,
                downloadId: downloadId,
                totalChunks: chunkIndex,
                fileSize: fileSize
            }));
            
            console.log('Waiting for next download request...\n');
        });
        
        readStream.on('error', (error) => {
            console.error('Error reading file:', error);
            ws.send(JSON.stringify({
                type: 'error',
                clientId: CLIENT_ID,
                downloadId: downloadId,
                error: error.message
            }));
        });
        
    } catch (error) {
        console.error('Error handling download request:', error);
        ws.send(JSON.stringify({
            type: 'error',
            clientId: CLIENT_ID,
            downloadId: downloadId,
            error: error.message
        }));
    }
}

// Start the client
console.log('=================================');
console.log('File Download Client');
console.log('=================================');
console.log(`Client ID: ${CLIENT_ID}`);
console.log(`Server URL: ${SERVER_URL}`);
console.log(`File path: ${FILE_PATH}`);
console.log('=================================\n');

// Check if file exists before connecting
if (!fs.existsSync(FILE_PATH)) {
    console.warn(`WARNING: File not found at ${FILE_PATH}`);
    console.warn('Please run "npm run generate-file" to create the test file');
    console.warn('Connecting anyway to register with server...\n');
}

connect();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down client...');
    if (ws) {
        ws.close();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down client...');
    if (ws) {
        ws.close();
    }
    process.exit(0);
});
