// Builds tools/growth-qa/index.html = growth/index.html + the dev-only fixture adapter.
const fs = require('fs'), path = require('path'), root = path.resolve(__dirname, '../..');
let s = fs.readFileSync(path.join(root, 'growth/index.html'), 'utf8').replace(/(src|href)="\.\.\//g, '$1="../../').replace(/(src|href)="(growth-[a-z-]+\.(?:js|css)[^"]*)"/g, '$1="../../growth/$2"');
s = s.replace('<script src="../../growth/growth-shell.js', '<script src="fixture-adapter.js"></script>\n<script src="../../growth/growth-shell.js').replace('<title>DGL Growth OS</title>', '<title>DGL Growth OS · QA fixture</title>');
fs.writeFileSync(path.join(__dirname, 'index.html'), s); console.log('ok');
