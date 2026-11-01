require('dotenv').config();

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'quickbasket_db',

    ssl: process.env.DB_SSL_CA
        ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') }
        : process.env.DB_SSL === 'true'
            ? { ca: fs.readFileSync(path.join(__dirname, 'certs', 'ca.pem'), 'utf8') }
            : undefined,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;