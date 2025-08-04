const db = require('../db');

async function getAllUsers() {
    const [rows] = await db.query('SELECT * FROM users');
    return rows;
}

async function findUserByEmail(email) {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0]; // return user or undefined
}

async function createUser({ name, email, hashedPassword }) {
    const [result] = await db.query(
        'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
        [name, email, hashedPassword]
    );
    return result.insertId;
}


module.exports = {
    getAllUsers,
    findUserByEmail,
    createUser
};
