const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    console.log('Request:', req.url);

    if (req.url.startsWith('/r/')) {
        const filename = req.url.substring(3);
        const filepath = path.join('./public/r', filename);

        try {
            const content = fs.readFileSync(filepath, 'utf8');
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(content);
        } catch (err) {
            res.writeHead(404);
            res.end('Not found');
        }
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(8082, () => {
    console.log('Registry server running on http://localhost:8082');
}); 