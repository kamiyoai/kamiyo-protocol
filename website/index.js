// /index.js
console.log("Kami agent running");

import http from 'http';

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Greetings, traveller. May grace and light be bestowed.\n');
});

server.listen(3000, () => {
    console.log('Server running on port 3000');
});
