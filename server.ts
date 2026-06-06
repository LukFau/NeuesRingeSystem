import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { EventEmitter } from 'events';

const app = express();
const PORT = 3000;
const DB_PATH = './beverage.db';
const scanEmitter = new EventEmitter();

// Initialize DB
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
                                         id INTEGER PRIMARY KEY AUTOINCREMENT,
                                         username TEXT UNIQUE NOT NULL,
                                         password_hash TEXT NOT NULL,
                                         role TEXT NOT NULL DEFAULT 'user'
    );

    CREATE TABLE IF NOT EXISTS colors (
                                          name TEXT PRIMARY KEY,
                                          price REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drinks (
                                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                                          barcode TEXT UNIQUE NOT NULL,
                                          name TEXT NOT NULL,
                                          color_name TEXT DEFAULT 'Rot',
                                          category TEXT DEFAULT 'Softdrinks',
                                          price REAL NOT NULL DEFAULT 0,
                                          stock INTEGER NOT NULL DEFAULT 10,
                                          min_stock INTEGER NOT NULL DEFAULT 5,
                                          is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS consumption_log (
                                                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                   user_id INTEGER NOT NULL,
                                                   drink_id INTEGER NOT NULL,
                                                   quantity INTEGER NOT NULL,
                                                   paid_via_paypal BOOLEAN DEFAULT 0,
                                                   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
                                            key TEXT PRIMARY KEY,
                                            value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS achievements (
                                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                name TEXT NOT NULL,
                                                description TEXT NOT NULL,
                                                icon TEXT NOT NULL,
                                                condition_type TEXT NOT NULL,
                                                condition_value INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
                                                     user_id INTEGER NOT NULL,
                                                     achievement_id INTEGER NOT NULL,
                                                     unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                     PRIMARY KEY (user_id, achievement_id)
        );
`);

// Insert default achievements if none exist
const currentAchievements = db.prepare('SELECT COUNT(*) as count FROM achievements').get() as {count: number};
if (currentAchievements && currentAchievements.count === 0) {
    const defaultAchievements = [
        ['First Sip', 'Buy your first drink', '🍺', 'total_drinks', 1],
        ['Thirsty', 'Buy 10 drinks', '🐪', 'total_drinks', 10],
        ['Big Spender', 'Spend 50€ in total', '💰', 'total_spent', 50]
    ];
    const insertAch = db.prepare('INSERT INTO achievements (name, description, icon, condition_type, condition_value) VALUES (?, ?, ?, ?, ?)');
    defaultAchievements.forEach(a => insertAch.run(a));
}

// Ignore errors for alter table if columns already exist
try { db.exec('ALTER TABLE drinks ADD COLUMN stock INTEGER NOT NULL DEFAULT 10'); } catch (e) {}
try { db.exec('ALTER TABLE drinks ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 5'); } catch (e) {}
try { db.exec('ALTER TABLE drinks ADD COLUMN color_name TEXT'); } catch (e) {}
try { db.exec("ALTER TABLE drinks ADD COLUMN category TEXT DEFAULT 'Softdrinks'"); } catch (e) {}
try { db.exec('ALTER TABLE drinks ADD COLUMN is_active BOOLEAN DEFAULT 1'); } catch (e) {}
try { db.exec('ALTER TABLE consumption_log ADD COLUMN paid_via_paypal BOOLEAN DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE achievements ADD COLUMN condition_target TEXT'); } catch (e) {}

const colorCount = db.prepare('SELECT COUNT(*) as c FROM colors').get() as {c: number};
if (colorCount.c === 0) {
    const insertColor = db.prepare('INSERT INTO colors (name, price) VALUES (?, ?)');
    insertColor.run('Rot', 1.0);
    insertColor.run('Braun', 1.5);
    insertColor.run('Grün', 2.0);
    insertColor.run('Schwarz', 2.5);
    insertColor.run('Blau', 3.0);
}

// Update existing drinks without color
db.exec("UPDATE drinks SET color_name = 'Rot' WHERE color_name IS NULL");

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
if (userCount.count === 0) {
    const hash = bcrypt.hashSync('admin', 10);
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
}

const guestCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE username = 'guest'").get() as { count: number };
if (guestCount.count === 0) {
    const hash = bcrypt.hashSync('guest', 10);
    db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'guest')").run('guest', hash);
}

const drinkCount = db.prepare('SELECT COUNT(*) as count FROM drinks').get() as { count: number };
if (drinkCount.count === 0) {
    const insertDrink = db.prepare('INSERT INTO drinks (barcode, name, color_name) VALUES (?, ?, ?)');
    insertDrink.run('999123', 'Club Mate', 'Rot');
    insertDrink.run('999456', 'Cola', 'Braun');
    insertDrink.run('999789', 'Water', 'Blau');
    insertDrink.run('999000', 'Beer', 'Grün');
}

function getSetting(key: string, defaultVal: string) {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as {value: string};
    return setting ? setting.value : defaultVal;
}

function getTransporter() {
    return nodemailer.createTransport({
        host: getSetting('SMTP_HOST', process.env.SMTP_HOST || 'smtp.gmail.com'),
        port: parseInt(getSetting('SMTP_PORT', process.env.SMTP_PORT || '587')),
        secure: parseInt(getSetting('SMTP_PORT', process.env.SMTP_PORT || '587')) === 465,
        auth: {
            user: getSetting('SMTP_USER', process.env.SMTP_USER || 'test@example.com'),
            pass: getSetting('SMTP_PASS', process.env.SMTP_PASS || 'password'),
        },
    });
}

app.use(express.json());

// Auth Middleware
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        res.sendStatus(401);
        return;
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            res.sendStatus(403);
            return;
        }
        (req as any).user = user;
        next();
    });
};

const isAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if ((req as any).user?.role !== 'admin') {
        res.sendStatus(403);
        return;
    }
    next();
};

// API Routes
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    try {
        const hash = bcrypt.hashSync(password, 10);
        const info = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, 'user');
        const token = jwt.sign({ id: info.lastInsertRowid, username, role: 'user' }, JWT_SECRET);
        res.json({ token, user: { id: info.lastInsertRowid, username, role: 'user' } });
    } catch (err: any) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ error: 'Username taken' });
        } else {
            res.status(500).json({ error: 'Server error' });
        }
    }
});

app.get('/api/colors', (req, res) => {
    const colors = db.prepare('SELECT * FROM colors').all();
    res.json(colors);
});

app.get('/api/drinks', (req, res) => {
    const drinks = db.prepare(`
        SELECT d.*, c.price
        FROM drinks d
                 LEFT JOIN colors c ON d.color_name = c.name
    `).all();
    res.json(drinks);
});

// Helper to get current month boundaries, with optional offset
function getMonthBoundaries(offsetMonths = 0) {
    const start = new Date();
    start.setMonth(start.getMonth() + offsetMonths);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);

    return { start: start.toISOString(), end: end.toISOString() };
}

app.get('/api/tallies/me', authenticateToken, (req, res) => {
    const userId = (req as any).user.id;
    const { start, end } = getMonthBoundaries();

    const history = db.prepare(`
        SELECT c_log.id, d.name as drink_name, d.color_name, c.price, c_log.created_at as date, c_log.quantity, c_log.paid_via_paypal
        FROM consumption_log c_log
            JOIN drinks d ON c_log.drink_id = d.id
            LEFT JOIN colors c ON d.color_name = c.name
        WHERE c_log.user_id = ? AND c_log.created_at >= ? AND c_log.created_at < ?
        ORDER BY c_log.created_at DESC
    `).all(userId, start, end) as any[];

    const colorsStats: Record<string, number> = {};
    let totalSpent = 0;

    history.forEach(log => {
        if (!colorsStats[log.color_name]) colorsStats[log.color_name] = 0;
        colorsStats[log.color_name] += log.quantity;
        if (!log.paid_via_paypal) {
            totalSpent += (log.price || 0) * log.quantity;
        }
    });

    res.json({ colors: colorsStats, totalSpent, history });
});

function checkAchievements(userId: number) {
    const achievements = db.prepare('SELECT * FROM achievements').all() as any[];
    const userAchievements = db.prepare('SELECT achievement_id FROM user_achievements WHERE user_id = ?').all(userId) as any[];
    const unlockedIds = new Set(userAchievements.map(ua => ua.achievement_id));

    // Calculate user stats
    const stats: any = db.prepare(`
        SELECT
            SUM(cl.quantity) as total_drinks,
            SUM(cl.quantity * c.price) as total_spent
        FROM consumption_log cl
                 JOIN drinks d ON cl.drink_id = d.id
                 LEFT JOIN colors c ON d.color_name = c.name
        WHERE cl.user_id = ?
    `).get(userId);

    const drinkStats = db.prepare(`
        SELECT d.id, d.name, c.name as color_name, SUM(cl.quantity) as quantity
        FROM consumption_log cl
                 JOIN drinks d ON cl.drink_id = d.id
                 LEFT JOIN colors c ON d.color_name = c.name
        WHERE cl.user_id = ?
        GROUP BY d.id
    `).all(userId) as any[];

    const colorStats: Record<string, number> = {};
    const drinkNameStats: Record<string, number> = {};
    drinkStats.forEach(ds => {
        colorStats[ds.color_name] = (colorStats[ds.color_name] || 0) + ds.quantity;
        drinkNameStats[ds.name] = (drinkNameStats[ds.name] || 0) + ds.quantity;
    });

    const checkAndUnlock = (ach: any, conditionMet: boolean) => {
        if (conditionMet && !unlockedIds.has(ach.id)) {
            db.prepare('INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)').run(userId, ach.id);
            console.log(`User ${userId} unlocked achievement ${ach.name}`);
        }
    };

    achievements.forEach(ach => {
        switch (ach.condition_type) {
            case 'total_drinks':
                checkAndUnlock(ach, (stats?.total_drinks || 0) >= ach.condition_value);
                break;
            case 'total_spent':
                checkAndUnlock(ach, (stats?.total_spent || 0) >= ach.condition_value);
                break;
            case 'color_drinks':
                checkAndUnlock(ach, (colorStats[ach.condition_target] || 0) >= ach.condition_value);
                break;
            case 'specific_drink':
                checkAndUnlock(ach, (drinkNameStats[ach.condition_target] || 0) >= ach.condition_value);
                break;
        }
    });
}

app.post('/api/tallies', authenticateToken, (req, res) => {
    const userId = (req as any).user.id;
    const { drinkId, quantity, payViaPayPal } = req.body;

    if (quantity > 0) {
        db.prepare('INSERT INTO consumption_log (user_id, drink_id, quantity, paid_via_paypal) VALUES (?, ?, ?, ?)').run(userId, drinkId, quantity, payViaPayPal ? 1 : 0);
    }

    const drinkBefore = db.prepare('SELECT name, stock, min_stock FROM drinks WHERE id = ?').get(drinkId) as any;
    db.prepare('UPDATE drinks SET stock = stock - ? WHERE id = ?').run(quantity, drinkId);
    const drinkAfter = db.prepare('SELECT name, stock, min_stock FROM drinks WHERE id = ?').get(drinkId) as any;

    if (drinkBefore && drinkAfter && drinkBefore.stock > drinkBefore.min_stock && drinkAfter.stock <= drinkAfter.min_stock) {
        sendLowStockAlert(drinkAfter.name, drinkAfter.stock, drinkAfter.min_stock).catch(console.error);
    }

    checkAchievements(userId);

    res.json({ success: true, payViaPayPal });
});

app.post('/api/guest-checkout', (req, res) => {
    const { drinkId, quantity } = req.body;
    if (drinkId && quantity) {
        const qty = parseInt(quantity as any) || 1;
        const drinkBefore = db.prepare('SELECT name, stock, min_stock FROM drinks WHERE id = ?').get(drinkId) as any;
        db.prepare('UPDATE drinks SET stock = stock - ? WHERE id = ?').run(qty, drinkId);
        const drinkAfter = db.prepare('SELECT name, stock, min_stock FROM drinks WHERE id = ?').get(drinkId) as any;

        if (drinkBefore && drinkAfter && drinkBefore.stock > drinkBefore.min_stock && drinkAfter.stock <= drinkAfter.min_stock) {
            sendLowStockAlert(drinkAfter.name, drinkAfter.stock, drinkAfter.min_stock).catch(console.error);
        }

        const guest = db.prepare("SELECT id FROM users WHERE username = 'guest'").get() as any;
        if (guest) {
            db.prepare('INSERT INTO consumption_log (user_id, drink_id, quantity, paid_via_paypal) VALUES (?, ?, ?, 1)').run(guest.id, drinkId, qty);
        }
    }
    res.json({ success: true, message: 'Guest checkout initiated' });
});

app.post('/api/scan', (req, res) => {
    const { barcode, source } = req.body;
    console.log('Received scan:', barcode);
    const drink = db.prepare(`
        SELECT d.*, c.price
        FROM drinks d
                 LEFT JOIN colors c ON d.color_name = c.name
        WHERE d.barcode = ?
    `).get(barcode) as any;

    if (drink) {
        console.log('Found drink:', drink.name);
        const scanEvent = { ...drink, type: 'known', timestamp: new Date().toISOString() };
        if (source !== 'mobile') {
            scanEmitter.emit('scan', scanEvent);
        }
        res.json({ success: true, drink: scanEvent });
    } else {
        console.log('Unknown barcode:', barcode);
        const scanEvent = { type: 'unknown', barcode, timestamp: new Date().toISOString() };
        if (source !== 'mobile') {
            scanEmitter.emit('scan', scanEvent);
        }
        res.status(404).json({ error: 'Drink not found', barcode, scanEvent });
    }
});

app.get('/api/scans/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const pingInterval = setInterval(() => { res.write(':ping\n\n'); }, 15000);
    const onScan = (drinkData: any) => { res.write(`data: ${JSON.stringify(drinkData)}\n\n`); };

    scanEmitter.on('scan', onScan);
    req.on('close', () => {
        clearInterval(pingInterval);
        scanEmitter.removeListener('scan', onScan);
    });
});

function generateAdminData(offsetMonths = 0, paidViaPaypal = 0) {
    const { start, end } = getMonthBoundaries(offsetMonths);
    const logs = db.prepare(`
        SELECT u.username, d.color_name, c.price, SUM(c_log.quantity) as qty
        FROM consumption_log c_log
                 JOIN users u ON c_log.user_id = u.id
                 JOIN drinks d ON c_log.drink_id = d.id
                 LEFT JOIN colors c ON d.color_name = c.name
        WHERE c_log.created_at >= ? AND c_log.created_at < ? AND c_log.paid_via_paypal = ?
        GROUP BY u.username, d.color_name
    `).all(start, end, paidViaPaypal) as any[];

    const userMaps: Record<string, any> = {};
    logs.forEach(row => {
        if (!userMaps[row.username]) {
            userMaps[row.username] = { username: row.username, colors: {}, totalSpent: 0 };
        }
        userMaps[row.username].colors[row.color_name] = row.qty;
        userMaps[row.username].totalSpent += (row.price || 0) * row.qty;
    });

    return Object.values(userMaps).sort((a, b) => a.username.localeCompare(b.username));
}

function generateReportText(offsetMonths = 0) {
    const bookedData = generateAdminData(offsetMonths, 0);
    const paidData = generateAdminData(offsetMonths, 1);
    const allColorsLookup = db.prepare('SELECT name FROM colors').all() as any[];
    const colorNames = allColorsLookup.map(c => c.name);

    const headers = ['Username', ...colorNames, 'Total'];

    const formatData = (data: any[], title: string) => {
        if (data.length === 0) return `=== ${title} ===\nNo drinks recorded.\n\n`;

        const colWidths = headers.map(h => h.length);
        data.forEach(row => {
            colWidths[0] = Math.max(colWidths[0], String(row.username).length);
            colorNames.forEach((c, idx) => {
                colWidths[idx+1] = Math.max(colWidths[idx+1], String(row.colors[c] || 0).length);
            });
            colWidths[colWidths.length - 1] = Math.max(colWidths[colWidths.length - 1], Number(row.totalSpent).toFixed(2).length);
        });

        const pad = (str: string, width: number, leftAlign: boolean = true) => {
            if (leftAlign) return str.padEnd(width, ' ');
            return str.padStart(width, ' ');
        };

        let txt = `=== ${title} ===\n`;
        txt += headers.map((h, i) => pad(h, colWidths[i], i === 0)).join(' | ') + '\n';
        txt += headers.map((_, i) => '-'.repeat(colWidths[i])).join('-+-') + '\n';

        data.forEach(r => {
            let rowTxt = pad(String(r.username), colWidths[0]) + ' | ';
            colorNames.forEach((c, i) => {
                rowTxt += pad(String(r.colors[c] || 0), colWidths[i+1], false) + ' | ';
            });
            rowTxt += pad(Number(r.totalSpent).toFixed(2), colWidths[colWidths.length - 1], false) + '\n';
            txt += rowTxt;
        });

        const totalSum = data.reduce((sum, r) => sum + r.totalSpent, 0);
        txt += `\nTotal Value: €${totalSum.toFixed(2)}\n\n`;
        return txt;
    }

    return formatData(bookedData, 'BOOKED (UNPAID) DRINKS') + formatData(paidData, 'DRINKS PAID VIA PAYPAL OR WERO');
}

function getAdminEmail() {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('ADMIN_EMAIL') as {value: string};
    return setting ? setting.value : (process.env.ADMIN_EMAIL || 'admin@example.com');
}

async function sendLowStockAlert(name: string, stock: number, minStock: number) {
    const transporter = getTransporter();
    const mailOptions = {
        from: getSetting('SMTP_USER', process.env.SMTP_USER || 'test@example.com'),
        to: getAdminEmail(),
        subject: `Low Stock Alert: ${name}`,
        text: `The stock for ${name} has dropped to ${stock}. The minimum stock level is set to ${minStock}. Please restock soon!`,
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Low stock alert sent for ${name}`);
    } catch (e: any) {
        if (e.message && e.message.includes('Application-specific password required')) {
            console.error('Failed to send low stock alert: Gmail requires an Application-Specific Password. Please generate one at https://myaccount.google.com/apppasswords and set it in your SMTP settings.');
        } else {
            console.error('Failed to send low stock alert:', e.message || e);
        }
    }
}

async function sendReportEmail(offsetMonths = 0) {
    const transporter = getTransporter();
    const reportText = generateReportText(offsetMonths);

    const lowStockDrinks = db.prepare('SELECT name, stock, min_stock FROM drinks WHERE stock <= min_stock').all() as any[];
    let lowStockText = '';
    if (lowStockDrinks.length > 0) {
        lowStockText = '\n\nLOW STOCK ALERT:\n' + lowStockDrinks.map(d => `- ${d.name}: ${d.stock} remaining (min: ${d.min_stock})`).join('\n');
    }

    const mailOptions = {
        from: getSetting('SMTP_USER', process.env.SMTP_USER || 'test@example.com'),
        to: getAdminEmail(),
        subject: 'Monthly Beverage Tally Report',
        text: 'Attached is the beverage consumption report.' + lowStockText,
        attachments: [
            {
                filename: `tally_report_${new Date().toISOString().split('T')[0]}.txt`,
                content: reportText
            }
        ]
    };
    try {
        await transporter.sendMail(mailOptions);
    } catch (e: any) {
        if (e.message && e.message.includes('Application-specific password required')) {
            console.error('Failed to send report email: Gmail requires an Application-Specific Password. Please generate one at https://myaccount.google.com/apppasswords and set it in your SMTP settings.');
        } else {
            console.error('Failed to send report email:', e.message || e);
        }
    }
}

app.put('/api/admin/colors/:name', authenticateToken, isAdmin, (req, res) => {
    const { name } = req.params;
    const { price } = req.body;
    if (price !== undefined) {
        db.prepare('UPDATE colors SET price = ? WHERE name = ?').run(Number(price), name);
    }
    res.json({ success: true });
});

app.put('/api/admin/drinks/:id', authenticateToken, isAdmin, (req, res) => {
    const { id } = req.params;
    const { color_name, stock, is_active, category } = req.body;
    try {
        let query = 'UPDATE drinks SET ';
        const params: any[] = [];
        if (color_name !== undefined) {
            query += 'color_name = ?';
            params.push(color_name);
        }
        if (category !== undefined) {
            if (params.length > 0) query += ', ';
            query += 'category = ?';
            params.push(category);
        }
        if (stock !== undefined) {
            if (params.length > 0) query += ', ';
            query += 'stock = ?';
            params.push(Number(stock));
        }
        if (is_active !== undefined) {
            if (params.length > 0) query += ', ';
            query += 'is_active = ?';
            params.push(is_active ? 1 : 0);
        }
        if (params.length === 0) return res.json({ success: true });

        query += ' WHERE id = ?';
        params.push(Number(id));

        db.prepare(query).run(...params);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Database update failed' });
    }
});

app.delete('/api/admin/drinks/:id', authenticateToken, isAdmin, (req, res) => {
    const { id } = req.params;
    try {
        db.prepare('DELETE FROM drinks WHERE id = ?').run(Number(id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Database delete failed' });
    }
});

app.post('/api/admin/drinks', authenticateToken, isAdmin, (req, res) => {
    const { name, color_name, category, stock, barcode } = req.body;
    try {
        const result = db.prepare('INSERT INTO drinks (barcode, name, color_name, category, stock, price) VALUES (?, ?, ?, ?, ?, ?)').run(
            barcode || String(Date.now()),
            name,
            color_name || 'Rot',
            category || 'Softdrinks',
            Number(stock || 0),
            0
        );
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (err: any) {
        console.error('Drinks Create Error:', err);
        res.status(500).json({ error: err.message || 'Failed to create drink' });
    }
});

app.get('/api/admin/debug/report', authenticateToken, isAdmin, (req, res) => {
    const offset = parseInt(req.query.offset as string) || 0;
    const txt = generateReportText(offset);
    res.json({ report: txt });
});

app.delete('/api/admin/debug/wipe', authenticateToken, isAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM consumption_log').run();
        res.json({ success: true, message: 'All consumption data wiped' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to wipe data' });
    }
});

app.post('/api/admin/export', authenticateToken, isAdmin, async (req, res) => {
    try {
        await sendReportEmail();
        res.json({ success: true, message: 'Export emailed successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send email' });
    }
});

app.get('/api/leaderboard', authenticateToken, (req, res) => {
    const { start, end } = getMonthBoundaries();
    const category = req.query.category as string;

    let query = `
        SELECT u.username, SUM(c_log.quantity) as total_drinks
        FROM consumption_log c_log
                 JOIN users u ON c_log.user_id = u.id
                 JOIN drinks d ON c_log.drink_id = d.id
        WHERE c_log.created_at >= ? AND c_log.created_at < ? AND u.role != 'admin'
    `;
    const params: any[] = [start, end];

    if (category && category !== 'All') {
        query += ` AND d.category = ?`;
        params.push(category);
    }

    query += `
        GROUP BY u.username
        ORDER BY total_drinks DESC
        LIMIT 10
    `;

    const ranking = db.prepare(query).all(...params);
    res.json(ranking);
});

app.get('/api/admin/tallies', authenticateToken, isAdmin, (req, res) => {
    const booked = generateAdminData(0, 0);
    const paid = generateAdminData(0, 1);

    const totalBookedValue = booked.reduce((acc, user) => acc + user.totalSpent, 0);
    const totalPaidValue = paid.reduce((acc, user) => acc + user.totalSpent, 0);

    res.json({ booked, paid, totalBookedValue, totalPaidValue });
});

app.get('/api/admin/users', authenticateToken, isAdmin, (req, res) => {
    const users = db.prepare('SELECT id, username, role FROM users').all();
    res.json(users);
});

// Settings endpoints
app.get('/api/settings/public', (req, res) => {
    const paypalSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('PAYPAL_USERNAME') as {value: string};
    const weroSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('WERO_USERNAME') as {value: string};
    res.json({
        paypal_username: paypalSetting ? paypalSetting.value : (process.env.VITE_PAYPAL_USERNAME || ''),
        wero_username: weroSetting ? weroSetting.value : ''
    });
});

app.get('/api/admin/settings', authenticateToken, isAdmin, (req, res) => {
    const settings = db.prepare('SELECT * FROM settings').all();
    res.json(settings);
});

app.put('/api/admin/settings', authenticateToken, isAdmin, (req, res) => {
    const { key, value } = req.body;
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
    res.json({ success: true });
});

// Achievements admin endpoints
app.get('/api/admin/achievements', authenticateToken, isAdmin, (req, res) => {
    const achievements = db.prepare('SELECT * FROM achievements').all();
    res.json(achievements);
});

app.post('/api/admin/achievements', authenticateToken, isAdmin, (req, res) => {
    const { name, description, icon, condition_type, condition_value, condition_target } = req.body;
    try {
        const result = db.prepare('INSERT INTO achievements (name, description, icon, condition_type, condition_value, condition_target) VALUES (?, ?, ?, ?, ?, ?)').run(name, description, icon, condition_type, condition_value, condition_target || null);
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create achievement' });
    }
});

app.put('/api/admin/achievements/:id', authenticateToken, isAdmin, (req, res) => {
    const { id } = req.params;
    const { name, description, icon, condition_type, condition_value, condition_target } = req.body;
    try {
        db.prepare('UPDATE achievements SET name = ?, description = ?, icon = ?, condition_type = ?, condition_value = ?, condition_target = ? WHERE id = ?').run(name, description, icon, condition_type, condition_value, condition_target || null, Number(id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update achievement' });
    }
});

app.delete('/api/admin/achievements/:id', authenticateToken, isAdmin, (req, res) => {
    const { id } = req.params;
    try {
        db.prepare('DELETE FROM achievements WHERE id = ?').run(Number(id));
        db.prepare('DELETE FROM user_achievements WHERE achievement_id = ?').run(Number(id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete achievement' });
    }
});

// User achievement endpoint
app.get('/api/users/achievements', authenticateToken, (req, res) => {
    const userId = (req as any).user.id;
    const achievements = db.prepare('SELECT * FROM achievements').all() as any[];
    const unlocked = db.prepare('SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?').all(userId) as any[];

    // Map unlocked info
    const unlockedMap = new Map(unlocked.map(u => [u.achievement_id, u.unlocked_at]));

    const result = achievements.map(ach => ({
        ...ach,
        unlocked: unlockedMap.has(ach.id),
        unlocked_at: unlockedMap.get(ach.id) || null
    }));

    res.json(result);
});

app.put('/api/admin/users/:id/password', authenticateToken, isAdmin, (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;
    try {
        const hash = bcrypt.hashSync(newPassword, 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, Number(id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update password' });
    }
});

app.post('/api/admin/users', authenticateToken, isAdmin, (req, res) => {
    const { username, password, role } = req.body;
    try {
        const hash = bcrypt.hashSync(password, 10);
        const result = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, role || 'user');
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        if ((err as Error).message.includes('UNIQUE constraint failed')) {
            res.status(400).json({ error: 'Username already exists' });
        } else {
            res.status(500).json({ error: 'Failed to create user' });
        }
    }
});

app.delete('/api/admin/users/:id', authenticateToken, isAdmin, (req, res) => {
    const { id } = req.params;
    try {
        db.prepare('DELETE FROM users WHERE id = ?').run(Number(id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

cron.schedule('0 0 1 * *', async () => {
    console.log('Running monthly tally report...');
    try {
        // Send report for the previous month (-1) since we are at the 1st of the new month
        await sendReportEmail(-1);
    } catch (error) {
        console.error('Monthly CRON job failed:', error);
    }
});

async function startServer() {
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        app.use(express.static(path.join(process.cwd(), 'dist')));
        app.get('*', (req, res) => {
            res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
        });
    }

    const keyPath = path.join(process.cwd(), 'server.key');
    const certPath = path.join(process.cwd(), 'server.cert');

    const useHttps = fs.existsSync(keyPath) && fs.existsSync(certPath);

    if (useHttps) {
        const httpsOptions = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
        };
        const server = https.createServer(httpsOptions, app);
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`HTTPS Server running at https://0.0.0.0:${PORT}`);
        });
    } else {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running at http://0.0.0.0:${PORT}`);
        });
    }
}

startServer();
