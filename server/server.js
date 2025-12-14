const WebSocket = require('ws');
const express = require('express');
const fs = require('fs');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
require('dotenv').config();

// Configuration from environment variables
const WS_PORT = process.env.WS_PORT || 8080;
const API_PORT = process.env.API_PORT || 3000;
const SERVER_HOST = process.env.SERVER_HOST || 'localhost';
const API_BASE_URL = process.env.API_BASE_URL || `http://${SERVER_HOST}:${API_PORT}`;
const WS_BASE_URL = process.env.WS_BASE_URL || `ws://${SERVER_HOST}:${WS_PORT}`;
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(__dirname, 'downloads');

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Store connected clients
const clients = new Map();

// WebSocket Server
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', (ws) => {
    console.log('New client connection established');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'register':
                    handleClientRegistration(ws, data);
                    break;
                case 'file-chunk':
                    handleFileChunk(data);
                    break;
                case 'file-complete':
                    handleFileComplete(data);
                    break;
                case 'error':
                    handleClientError(data);
                    break;
                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    ws.on('close', () => {
        // Remove client from registry
        for (const [clientId, client] of clients.entries()) {
            if (client.ws === ws) {
                console.log(`Client ${clientId} disconnected`);
                clients.delete(clientId);
                break;
            }
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

function handleClientRegistration(ws, data) {
    const clientId = data.clientId;
    clients.set(clientId, {
        ws: ws,
        id: clientId,
        connectedAt: new Date()
    });
    console.log(`Client registered: ${clientId}`);
    
    // Send acknowledgment
    ws.send(JSON.stringify({
        type: 'registered',
        clientId: clientId
    }));
}

function handleFileChunk(data) {
    const { clientId, downloadId, chunk, chunkIndex } = data;
    
    if (!clients.has(clientId)) {
        console.error(`Client ${clientId} not found`);
        return;
    }
    
    const client = clients.get(clientId);
    
    // Initialize download tracking if not exists
    if (!client.currentDownload) {
        const fileName = `${clientId}_${downloadId}_file_to_download.txt`;
        const filePath = path.join(DOWNLOAD_DIR, fileName);
        client.currentDownload = {
            id: downloadId,
            filePath: filePath,
            stream: fs.createWriteStream(filePath),
            chunksReceived: 0,
            startTime: Date.now()
        };
        console.log(`Starting download from ${clientId} to ${fileName}`);
    }
    
    // Write chunk to file
    const buffer = Buffer.from(chunk, 'base64');
    client.currentDownload.stream.write(buffer);
    client.currentDownload.chunksReceived++;
    
    // Log progress every 100 chunks
    if (client.currentDownload.chunksReceived % 100 === 0) {
        console.log(`Received ${client.currentDownload.chunksReceived} chunks from ${clientId}`);
    }
}

function handleFileComplete(data) {
    const { clientId, downloadId, totalChunks, fileSize } = data;
    
    if (!clients.has(clientId)) {
        console.error(`Client ${clientId} not found`);
        return;
    }
    
    const client = clients.get(clientId);
    
    if (client.currentDownload) {
        client.currentDownload.stream.end();
        
        const duration = (Date.now() - client.currentDownload.startTime) / 1000;
        const sizeInMB = (fileSize / (1024 * 1024)).toFixed(2);
        const speedMBps = (fileSize / (1024 * 1024) / duration).toFixed(2);
        
        console.log(`Download complete from ${clientId}:`);
        console.log(`  - File: ${client.currentDownload.filePath}`);
        console.log(`  - Size: ${sizeInMB} MB`);
        console.log(`  - Chunks: ${totalChunks}`);
        console.log(`  - Duration: ${duration.toFixed(2)}s`);
        console.log(`  - Speed: ${speedMBps} MB/s`);
        
        // Clean up
        delete client.currentDownload;
    }
}

function handleClientError(data) {
    console.error(`Error from client ${data.clientId}:`, data.error);
}

function requestFileDownload(clientId) {
    return new Promise((resolve, reject) => {
        if (!clients.has(clientId)) {
            reject(new Error(`Client ${clientId} is not connected`));
            return;
        }
        
        const client = clients.get(clientId);
        const downloadId = `download_${Date.now()}`;
        
        console.log(`Requesting file download from client ${clientId}`);
        
        // Send download request to client
        client.ws.send(JSON.stringify({
            type: 'download-request',
            downloadId: downloadId
        }));
        
        resolve({
            clientId: clientId,
            downloadId: downloadId,
            status: 'initiated'
        });
    });
}

// Swagger Documentation
const swaggerDocument = {
    openapi: '3.0.0',
    info: {
        title: 'File Download System API',
        version: '1.0.0',
        description: 'API for downloading files from on-premise clients to cloud server',
        contact: {
            name: 'API Support'
        }
    },
    servers: [
        {
            url: API_BASE_URL,
            description: 'API Server'
        }
    ],
    tags: [
        {
            name: 'Clients',
            description: 'Client management operations'
        },
        {
            name: 'Downloads',
            description: 'File download operations'
        },
        {
            name: 'Health',
            description: 'System health checks'
        }
    ],
    paths: {
        '/api/clients': {
            get: {
                tags: ['Clients'],
                summary: 'Get list of connected clients',
                description: 'Returns a list of all currently connected on-premise clients',
                responses: {
                    200: {
                        description: 'Successful response',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        count: {
                                            type: 'integer',
                                            description: 'Number of connected clients',
                                            example: 2
                                        },
                                        clients: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    id: {
                                                        type: 'string',
                                                        description: 'Unique client identifier',
                                                        example: 'restaurant-1'
                                                    },
                                                    connectedAt: {
                                                        type: 'string',
                                                        format: 'date-time',
                                                        description: 'Timestamp when client connected'
                                                    },
                                                    hasActiveDownload: {
                                                        type: 'boolean',
                                                        description: 'Whether client is currently uploading a file'
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                example: {
                                    count: 2,
                                    clients: [
                                        {
                                            id: 'restaurant-1',
                                            connectedAt: '2025-12-14T10:30:00.000Z',
                                            hasActiveDownload: false
                                        },
                                        {
                                            id: 'restaurant-2',
                                            connectedAt: '2025-12-14T10:31:00.000Z',
                                            hasActiveDownload: true
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            }
        },
        '/api/download': {
            post: {
                tags: ['Downloads'],
                summary: 'Trigger file download from a specific client',
                description: 'Initiates a file download request to a connected client. The file will be downloaded to the server\'s downloads directory.',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['clientId'],
                                properties: {
                                    clientId: {
                                        type: 'string',
                                        description: 'ID of the client to download from',
                                        example: 'restaurant-1'
                                    }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Download initiated successfully',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        success: {
                                            type: 'boolean',
                                            example: true
                                        },
                                        message: {
                                            type: 'string',
                                            example: 'Download initiated from client restaurant-1'
                                        },
                                        data: {
                                            type: 'object',
                                            properties: {
                                                clientId: {
                                                    type: 'string',
                                                    example: 'restaurant-1'
                                                },
                                                downloadId: {
                                                    type: 'string',
                                                    example: 'download_1702551234567'
                                                },
                                                status: {
                                                    type: 'string',
                                                    example: 'initiated'
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    400: {
                        description: 'Bad request - missing clientId',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        error: {
                                            type: 'string',
                                            example: 'clientId is required'
                                        }
                                    }
                                }
                            }
                        }
                    },
                    404: {
                        description: 'Client not found or not connected',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        success: {
                                            type: 'boolean',
                                            example: false
                                        },
                                        error: {
                                            type: 'string',
                                            example: 'Client restaurant-1 is not connected'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        '/health': {
            get: {
                tags: ['Health'],
                summary: 'Health check endpoint',
                description: 'Returns the current status of the server and connected clients',
                responses: {
                    200: {
                        description: 'Server is healthy',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        status: {
                                            type: 'string',
                                            example: 'healthy'
                                        },
                                        websocket: {
                                            type: 'object',
                                            properties: {
                                                port: {
                                                    type: 'integer',
                                                    example: 8083
                                                },
                                                connectedClients: {
                                                    type: 'integer',
                                                    example: 2
                                                }
                                            }
                                        },
                                        api: {
                                            type: 'object',
                                            properties: {
                                                port: {
                                                    type: 'integer',
                                                    example: 3005
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};

// Express REST API
const app = express();
app.use(express.json());

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// API: Get list of connected clients
app.get('/api/clients', (req, res) => {
    const clientList = Array.from(clients.values()).map(client => ({
        id: client.id,
        connectedAt: client.connectedAt,
        hasActiveDownload: !!client.currentDownload
    }));
    
    res.json({
        count: clientList.length,
        clients: clientList
    });
});

// API: Trigger file download from a specific client
app.post('/api/download', async (req, res) => {
    const { clientId } = req.body;
    
    if (!clientId) {
        return res.status(400).json({ error: 'clientId is required' });
    }
    
    try {
        const result = await requestFileDownload(clientId);
        res.json({
            success: true,
            message: `Download initiated from client ${clientId}`,
            data: result
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            error: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        websocket: {
            port: WS_PORT,
            connectedClients: clients.size
        },
        api: {
            port: API_PORT
        }
    });
});

// CLI Support
const args = process.argv.slice(2);
const command = args[0];

if (command === 'download' && args[1]) {
    // CLI mode: download from specific client
    const clientId = args[1];
    
    console.log('Starting server in CLI mode...');
    console.log(`WebSocket server listening on port ${WS_PORT}`);
    console.log(`Waiting for client ${clientId} to connect...`);
    
    // Wait for client to connect, then trigger download
    const checkInterval = setInterval(async () => {
        if (clients.has(clientId)) {
            console.log(`Client ${clientId} is connected. Initiating download...`);
            clearInterval(checkInterval);
            
            try {
                await requestFileDownload(clientId);
                console.log('Download initiated via CLI');
            } catch (error) {
                console.error('CLI download error:', error.message);
                process.exit(1);
            }
        }
    }, 1000);
    
} else if (command === 'list') {
    // CLI mode: list connected clients
    console.log('Starting server in CLI mode...');
    console.log(`WebSocket server listening on port ${WS_PORT}`);
    
    setTimeout(() => {
        console.log('\nConnected Clients:');
        console.log('==================');
        if (clients.size === 0) {
            console.log('No clients connected');
        } else {
            clients.forEach((client, id) => {
                console.log(`- ${id} (connected at ${client.connectedAt.toISOString()})`);
            });
        }
        process.exit(0);
    }, 2000);
    
} else {
    // Normal mode: start both WebSocket and REST API servers
    app.listen(API_PORT, () => {
        console.log('=================================');
        console.log('Server Started Successfully');
        console.log('=================================');
        console.log(`WebSocket server: ${WS_BASE_URL}`);
        console.log(`REST API server: ${API_BASE_URL}`);
        console.log(`Swagger UI: ${API_BASE_URL}/api-docs`);
        console.log(`Download directory: ${DOWNLOAD_DIR}`);
        console.log('=================================');
        console.log('\nAvailable API endpoints:');
        console.log(`  GET  ${API_BASE_URL}/api/clients - List connected clients`);
        console.log(`  POST ${API_BASE_URL}/api/download - Trigger file download`);
        console.log(`  GET  ${API_BASE_URL}/health - Health check`);
        console.log('\nSwagger Documentation:');
        console.log(`  ${API_BASE_URL}/api-docs - Interactive API documentation`);
        console.log('\nCLI commands:');
        console.log('  node server.js download <clientId> - Download from specific client');
        console.log('  node server.js list - List connected clients');
        console.log('=================================\n');
    });
}

console.log(`WebSocket server listening on port ${WS_PORT}`);
