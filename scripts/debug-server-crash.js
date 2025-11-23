
const { spawn } = require('child_process');
const http = require('http');

console.log('Starting server...');
const server = spawn('npm', ['run', 'dev'], {
    cwd: '/Users/eric/Documents/github/multi-user-test-fest-issue-tracker',
    env: { ...process.env, PORT: '3001' } // Use a different port to avoid conflicts
});

server.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
    if (data.toString().includes('Test Fest Tracker running')) {
        console.log('Server started. Making request...');
        makeRequest();
    }
});

server.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
});

function makeRequest() {
    http.get('http://localhost:3001/api/rooms', (res) => {
        console.log(`Response status: ${res.statusCode}`);
        res.resume();
        server.kill();
    }).on('error', (e) => {
        console.error(`Request error: ${e.message}`);
        server.kill();
    });
}

setTimeout(() => {
    console.log('Timeout. Killing server.');
    server.kill();
}, 10000);
