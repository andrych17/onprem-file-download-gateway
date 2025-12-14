const fs = require('fs');
const path = require('path');
const os = require('os');

const FILE_PATH = path.join(os.homedir(), 'file_to_download.txt');
const FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const CHUNK_SIZE = 1024 * 1024; // 1 MB chunks for generation

console.log('Generating 100 MB test file...');
console.log(`Target path: ${FILE_PATH}`);

const stream = fs.createWriteStream(FILE_PATH);

// Generate random content
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\n';
let bytesWritten = 0;

function writeChunk() {
    let canContinue = true;
    
    while (bytesWritten < FILE_SIZE && canContinue) {
        const remainingBytes = FILE_SIZE - bytesWritten;
        const chunkSize = Math.min(CHUNK_SIZE, remainingBytes);
        
        // Generate random string chunk
        let chunk = '';
        for (let i = 0; i < chunkSize; i++) {
            chunk += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        // Write chunk
        canContinue = stream.write(chunk);
        bytesWritten += chunkSize;
        
        // Log progress
        const progress = ((bytesWritten / FILE_SIZE) * 100).toFixed(1);
        if (bytesWritten % (10 * 1024 * 1024) === 0 || bytesWritten === FILE_SIZE) {
            console.log(`Progress: ${progress}% (${(bytesWritten / (1024 * 1024)).toFixed(2)} MB)`);
        }
    }
    
    if (bytesWritten < FILE_SIZE) {
        // Wait for drain event
        stream.once('drain', writeChunk);
    } else {
        // Finished writing
        stream.end();
    }
}

stream.on('finish', () => {
    console.log(`\nFile generated successfully!`);
    console.log(`Location: ${FILE_PATH}`);
    console.log(`Size: ${(FILE_SIZE / (1024 * 1024)).toFixed(2)} MB`);
});

stream.on('error', (error) => {
    console.error('Error generating file:', error);
    process.exit(1);
});

// Start writing
writeChunk();
