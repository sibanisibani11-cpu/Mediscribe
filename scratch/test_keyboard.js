const fs = require('fs');
const path = require('path');
const { uIOhook } = require('uiohook-napi');

const logPath = path.join(__dirname, 'keyboard_test_log.txt');
fs.writeFileSync(logPath, 'Starting keyboard capture test (10 seconds)...\n');

function log(msg) {
    console.log(msg);
    fs.appendFileSync(logPath, msg + '\n');
}

uIOhook.on('keydown', (e) => {
    log(`[KEYDOWN] event: ${JSON.stringify(e)}`);
});

uIOhook.on('keyup', (e) => {
    log(`[KEYUP] event: ${JSON.stringify(e)}`);
});

try {
    uIOhook.start();
    log('uIOhook started successfully. Please type some characters (e.g. "ht ") now...');
} catch (err) {
    log(`Error starting uIOhook: ${err.message}`);
}

setTimeout(() => {
    log('10 seconds elapsed. Stopping uIOhook...');
    try {
        uIOhook.stop();
    } catch (err) {
        log(`Error stopping: ${err.message}`);
    }
    process.exit(0);
}, 10000);
