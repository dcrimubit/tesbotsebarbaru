const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '..', 'activity.log');

function log(message) {
    const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(logMessage.trim());
    fs.appendFileSync(logFile, logMessage);
}

module.exports = { log };
