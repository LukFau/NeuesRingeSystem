import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { createServer as createViteServer } from 'vite';
import { Pool } from 'pg'; // PostgreSQL Treiber
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { EventEmitter } from 'events';

const app = express();
const PORT = parseInt(process.env.PORT || '3000');
const scanEmitter = new EventEmitter();

// ==========================================
// 1. DATENBANK INITIALISIERUNG
// ==========================================
const poolConfig = process.env.INSTANCE_UNIX_SOCKET
    ? {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        host: process.env.INSTANCE_UNIX_SOCKET,
    }
    : {
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '08Lukas06!', // Nur lokal!
        database: process.env.DB_NAME || 'beverage_db',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
    };

const db = new Pool(poolConfig);

async function initDb() {
    // Tabellen erstellen (komplett mit allen Feldern, keine ALTER TABLE Hacks mehr nötig)
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'user'
        );

        CREATE TABLE IF NOT EXISTS colors (
            name VARCHAR(50) PRIMARY KEY,
            price DECIMAL(10, 2) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS drinks (
            id SERIAL PRIMARY KEY,
            barcode VARCHAR(255) UNIQUE NOT NULL,
            name VARCHAR(255) NOT NULL,
            color_name VARCHAR(50) DEFAULT 'Rot',
            category VARCHAR(100) DEFAULT 'Softdrinks',
            price DECIMAL(10, 2) NOT NULL DEFAULT 0,
            stock INTEGER NOT NULL DEFAULT 10,
            min_stock INTEGER NOT NULL DEFAULT 5,
            is_active BOOLEAN DEFAULT true
        );

        CREATE TABLE IF NOT EXISTS consumption_log (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            drink_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            paid_via_paypal BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS settings (
            key VARCHAR(255) PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS achievements (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            icon VARCHAR(50) NOT NULL,
            condition_type VARCHAR(100) NOT NULL,
            condition_value INTEGER NOT NULL,
            condition_target VARCHAR(255)
        );

        CREATE TABLE IF NOT EXISTS user_achievements (
            user_id INTEGER NOT NULL,
            achievement_id INTEGER NOT NULL,
            unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, achievement_id)
        );
    `);

    // Standard-Erfolge einfügen
    const { rows: currentAchievements } = await db.query('SELECT COUNT(*) as count FROM achievements');
    if (parseInt(currentAchievements[0].count) === 0) {
        const defaultAchievements = [
            ['First Sip', 'Buy your first drink', '🍺', 'total_drinks', 1],
            ['Thirsty', 'Buy 10 drinks', '🐪', 'total_drinks', 10],
            ['Big Spender', 'Spend 50€ in total', '💰', 'total_spent', 50]
        ];
        for (const a of defaultAchievements) {
            await db.query(
                'INSERT INTO achievements (name, description, icon, condition_type, condition_value) VALUES ($1, $2, $3, $4, $5)',
                a
            );
        }
    }

    // Farben einfügen
    const { rows: colorCount } = await db.query('SELECT COUNT(*) as c FROM colors');
    if (parseInt(colorCount[0].c) === 0) {
        await db.query("INSERT INTO colors (name, price) VALUES ('Rot', 1.0), ('Braun', 1.5), ('Grün', 2.0), ('Schwarz', 2.5), ('Blau', 3.0)");
    }

    // Admin & Guest Nutzer
    const adminHash = bcrypt.hashSync('admin', 10);
    await db.query("INSERT INTO users (username, password_hash, role) VALUES ('admin', $1, 'admin') ON CONFLICT (username) DO NOTHING", [adminHash]);

    const guestHash = bcrypt.hashSync('guest', 10);
    await db.query("INSERT INTO users (username, password_hash, role) VALUES ('guest', $1, 'guest') ON CONFLICT (username) DO NOTHING", [guestHash]);

    // Getränke einfügen
    const { rows: drinkCount } = await db.query('SELECT COUNT(*) as count FROM drinks');
    if (parseInt(drinkCount[0].count) === 0) {
        await db.query("INSERT INTO drinks (barcode, name, color_name) VALUES ('999123', 'Club Mate', 'Rot'), ('999456', 'Cola', 'Braun'), ('999789', 'Water', 'Blau'), ('999000', 'Beer', 'Grün') ON CONFLICT (barcode) DO NOTHING");
    }

    console.log('Datenbank (PostgreSQL) erfolgreich initialisiert.');
}

// ==========================================
// 2. HILFSFUNKTIONEN (Jetzt Asynchron)
// ==========================================
async function getSetting(key: string, defaultVal: string) {
    const { rows } = await db.query('SELECT value FROM settings WHERE key = $1', [key]);
    return rows.length > 0 ? rows[0].value : defaultVal;
}

async function getTransporter() {
    const host = await getSetting('SMTP_HOST', process.env.SMTP_HOST || 'smtp.gmail.com');
    const port = parseInt(await getSetting('SMTP_PORT', process.env.SMTP_PORT || '587'));
    const secure = port === 465;
    const user = await getSetting('SMTP_USER', process.env.SMTP_USER || 'test@example.com');
    const pass = await getSetting('SMTP_PASS', process.env.SMTP_PASS || 'password');

    return nodemailer.createTransport({
        host, port, secure,
        auth: { user, pass },
    });
}

function getMonthBoundaries(offsetMonths = 0) {
    const start = new Date();
    start.setMonth(start.getMonth() + offsetMonths);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);

    return { start: start.toISOString(), end: end.toISOString() };
}

// ==========================================
// 3. MIDDLEWARE
// ==========================================
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) { res.sendStatus(401); return; }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) { res.sendStatus(403); return; }
        (req as any).user = user;
        next();
    });
};

const isAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if ((req as any).user?.role !== 'admin') { res.sendStatus(403); return; }
    next();
};

// ==========================================
// 4. API ROUTEN
// ==========================================

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = rows[0];

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
        res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hash = bcrypt.hashSync(password, 10);
        // RETURNING id gibt die eingefügte ID zurück (wie lastInsertRowid)
        const { rows } = await db.query(
            'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
            [username, hash, 'user']
        );
        const newId = rows[0].id;
        const token = jwt.sign({ id: newId, username, role: 'user' }, JWT_SECRET);
        res.json({ token, user: { id: newId, username, role: 'user' } });
    } catch (err: any) {
        if (err.code === '23505') { // Postgres Unique Constraint Violation
            res.status(400).json({ error: 'Username taken' });
        } else {
            res.status(500).json({ error: 'Server error' });
        }
    }
});

app.get('/api/colors', async (req, res) => {
    const { rows } = await db.query('SELECT * FROM colors');
    res.json(rows);
});

app.get('/api/drinks', async (req, res) => {
    const { rows } = await db.query(`
        SELECT d.*, c.price
        FROM drinks d
        LEFT JOIN colors c ON d.color_name = c.name
    `);
    res.json(rows);
});

app.get('/api/tallies/me', authenticateToken, async (req, res) => {
    const userId = (req as any).user.id;
    const { start, end } = getMonthBoundaries();

    const { rows: history } = await db.query(`
        SELECT c_log.id, d.name as drink_name, d.color_name, c.price, c_log.created_at as date, c_log.quantity, c_log.paid_via_paypal
        FROM consumption_log c_log
        JOIN drinks d ON c_log.drink_id = d.id
        LEFT JOIN colors c ON d.color_name = c.name
        WHERE c_log.user_id = $1 AND c_log.created_at >= $2 AND c_log.created_at < $3
        ORDER BY c_log.created_at DESC
    `, [userId, start, end]);

    const colorsStats: Record<string, number> = {};
    let totalSpent = 0;

    history.forEach(log => {
        if (!colorsStats[log.color_name]) colorsStats[log.color_name] = 0;
        colorsStats[log.color_name] += log.quantity;
        if (!log.paid_via_paypal) {
            totalSpent += (Number(log.price) || 0) * log.quantity;
        }
    });

    res.json({ colors: colorsStats, totalSpent, history });
});

async function checkAchievements(userId: number) {
    const { rows: achievements } = await db.query('SELECT * FROM achievements');
    const { rows: userAchievements } = await db.query('SELECT achievement_id FROM user_achievements WHERE user_id = $1', [userId]);
    const unlockedIds = new Set(userAchievements.map(ua => ua.achievement_id));

    const { rows: statsRows } = await db.query(`
        SELECT
            SUM(cl.quantity) as total_drinks,
            SUM(cl.quantity * c.price) as total_spent
        FROM consumption_log cl
        JOIN drinks d ON cl.drink_id = d.id
        LEFT JOIN colors c ON d.color_name = c.name
        WHERE cl.user_id = $1
    `, [userId]);
    const stats = statsRows[0];

    const { rows: drinkStats } = await db.query(`
        SELECT d.id, d.name, c.name as color_name, SUM(cl.quantity) as quantity
        FROM consumption_log cl
        JOIN drinks d ON cl.drink_id = d.id
        LEFT JOIN colors c ON d.color_name = c.name
        WHERE cl.user_id = $1
        GROUP BY d.id, c.name
    `, [userId]);

    const colorStats: Record<string, number> = {};
    const drinkNameStats: Record<string, number> = {};
    drinkStats.forEach(ds => {
        colorStats[ds.color_name] = (colorStats[ds.color_name] || 0) + Number(ds.quantity);
        drinkNameStats[ds.name] = (drinkNameStats[ds.name] || 0) + Number(ds.quantity);
    });

    const checkAndUnlock = async (ach: any, conditionMet: boolean) => {
        if (conditionMet && !unlockedIds.has(ach.id)) {
            await db.query('INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2)', [userId, ach.id]);
            console.log(`User ${userId} unlocked achievement ${ach.name}`);
        }
    };

    for (const ach of achievements) {
        switch (ach.condition_type) {
            case 'total_drinks': await checkAndUnlock(ach, (Number(stats?.total_drinks) || 0) >= ach.condition_value); break;
            case 'total_spent': await checkAndUnlock(ach, (Number(stats?.total_spent) || 0) >= ach.condition_value); break;
            case 'color_drinks': await checkAndUnlock(ach, (colorStats[ach.condition_target] || 0) >= ach.condition_value); break;
            case 'specific_drink': await checkAndUnlock(ach, (drinkNameStats[ach.condition_target] || 0) >= ach.condition_value); break;
        }
    }
}

app.post('/api/tallies', authenticateToken, async (req, res) => {
    const userId = (req as any).user.id;
    const { drinkId, quantity, payViaPayPal } = req.body;

    if (quantity > 0) {
        await db.query(
            'INSERT INTO consumption_log (user_id, drink_id, quantity, paid_via_paypal) VALUES ($1, $2, $3, $4)',
            [userId, drinkId, quantity, payViaPayPal ? true : false]
        );
    }

    const { rows: beforeRows } = await db.query('SELECT name, stock, min_stock FROM drinks WHERE id = $1', [drinkId]);
    const drinkBefore = beforeRows[0];

    await db.query('UPDATE drinks SET stock = stock - $1 WHERE id = $2', [quantity, drinkId]);

    const { rows: afterRows } = await db.query('SELECT name, stock, min_stock FROM drinks WHERE id = $1', [drinkId]);
    const drinkAfter = afterRows[0];

    if (drinkBefore && drinkAfter && drinkBefore.stock > drinkBefore.min_stock && drinkAfter.stock <= drinkAfter.min_stock) {
        sendLowStockAlert(drinkAfter.name, drinkAfter.stock, drinkAfter.min_stock).catch(console.error);
    }

    await checkAchievements(userId);
    res.json({ success: true, payViaPayPal });
});

app.post('/api/guest-checkout', async (req, res) => {
    const { drinkId, quantity } = req.body;
    if (drinkId && quantity) {
        const qty = parseInt(quantity as any) || 1;
        const { rows: beforeRows } = await db.query('SELECT name, stock, min_stock FROM drinks WHERE id = $1', [drinkId]);
        const drinkBefore = beforeRows[0];

        await db.query('UPDATE drinks SET stock = stock - $1 WHERE id = $2', [qty, drinkId]);

        const { rows: afterRows } = await db.query('SELECT name, stock, min_stock FROM drinks WHERE id = $1', [drinkId]);
        const drinkAfter = afterRows[0];

        if (drinkBefore && drinkAfter && drinkBefore.stock > drinkBefore.min_stock && drinkAfter.stock <= drinkAfter.min_stock) {
            sendLowStockAlert(drinkAfter.name, drinkAfter.stock, drinkAfter.min_stock).catch(console.error);
        }

        const { rows: guestRows } = await db.query("SELECT id FROM users WHERE username = 'guest'");
        const guest = guestRows[0];
        if (guest) {
            await db.query('INSERT INTO consumption_log (user_id, drink_id, quantity, paid_via_paypal) VALUES ($1, $2, $3, true)', [guest.id, drinkId, qty]);
        }
    }
    res.json({ success: true, message: 'Guest checkout initiated' });
});

app.post('/api/scan', async (req, res) => {
    const { barcode, source } = req.body;
    console.log('Received scan:', barcode);

    const { rows } = await db.query(`
        SELECT d.*, c.price
        FROM drinks d
        LEFT JOIN colors c ON d.color_name = c.name
        WHERE d.barcode = $1
    `, [barcode]);
    const drink = rows[0];

    if (drink) {
        console.log('Found drink:', drink.name);
        const scanEvent = { ...drink, type: 'known', timestamp: new Date().toISOString() };
        if (source !== 'mobile') scanEmitter.emit('scan', scanEvent);
        res.json({ success: true, drink: scanEvent });
    } else {
        console.log('Unknown barcode:', barcode);
        const scanEvent = { type: 'unknown', barcode, timestamp: new Date().toISOString() };
        if (source !== 'mobile') scanEmitter.emit('scan', scanEvent);
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

async function generateAdminData(offsetMonths = 0, paidViaPaypal = false) {
    const { start, end } = getMonthBoundaries(offsetMonths);
    const { rows: logs } = await db.query(`
        SELECT u.username, d.color_name, c.price, SUM(c_log.quantity) as qty
        FROM consumption_log c_log
        JOIN users u ON c_log.user_id = u.id
        JOIN drinks d ON c_log.drink_id = d.id
        LEFT JOIN colors c ON d.color_name = c.name
        WHERE c_log.created_at >= $1 AND c_log.created_at < $2 AND c_log.paid_via_paypal = $3
        GROUP BY u.username, d.color_name, c.price
    `, [start, end, paidViaPaypal]);

    const userMaps: Record<string, any> = {};
    logs.forEach(row => {
        if (!userMaps[row.username]) {
            userMaps[row.username] = { username: row.username, colors: {}, totalSpent: 0 };
        }
        userMaps[row.username].colors[row.color_name] = Number(row.qty);
        userMaps[row.username].totalSpent += (Number(row.price) || 0) * Number(row.qty);
    });

    return Object.values(userMaps).sort((a, b) => a.username.localeCompare(b.username));
}

async function generateReportText(offsetMonths = 0) {
    const bookedData = await generateAdminData(offsetMonths, false);
    const paidData = await generateAdminData(offsetMonths, true);
    const { rows: allColorsLookup } = await db.query('SELECT name FROM colors');
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

async function getAdminEmail() {
    return await getSetting('ADMIN_EMAIL', process.env.ADMIN_EMAIL || 'admin@example.com');
}

async function sendLowStockAlert(name: string, stock: number, minStock: number) {
    const transporter = await getTransporter();
    const mailOptions = {
        from: await getSetting('SMTP_USER', process.env.SMTP_USER || 'test@example.com'),
        to: await getAdminEmail(),
        subject: `Low Stock Alert: ${name}`,
        text: `The stock for ${name} has dropped to ${stock}. The minimum stock level is set to ${minStock}. Please restock soon!`,
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Low stock alert sent for ${name}`);
    } catch (e: any) {
        console.error('Failed to send low stock alert:', e.message || e);
    }
}

async function sendReportEmail(offsetMonths = 0) {
    const transporter = await getTransporter();
    const reportText = await generateReportText(offsetMonths);

    const { rows: lowStockDrinks } = await db.query('SELECT name, stock, min_stock FROM drinks WHERE stock <= min_stock');
    let lowStockText = '';
    if (lowStockDrinks.length > 0) {
        lowStockText = '\n\nLOW STOCK ALERT:\n' + lowStockDrinks.map(d => `- ${d.name}: ${d.stock} remaining (min: ${d.min_stock})`).join('\n');
    }

    const mailOptions = {
        from: await getSetting('SMTP_USER', process.env.SMTP_USER || 'test@example.com'),
        to: await getAdminEmail(),
        subject: 'Monthly Beverage Tally Report',
        text: 'Attached is the beverage consumption report.' + lowStockText,
        attachments: [
            { filename: `tally_report_${new Date().toISOString().split('T')[0]}.txt`, content: reportText }
        ]
    };
    try {
        await transporter.sendMail(mailOptions);
    } catch (e: any) {
        console.error('Failed to send report email:', e.message || e);
    }
}

// ==========================================
// 5. ADMIN ROUTEN
// ==========================================

app.put('/api/admin/colors/:name', authenticateToken, isAdmin, async (req, res) => {
    const { name } = req.params;
    const { price } = req.body;
    if (price !== undefined) {
        await db.query('UPDATE colors SET price = $1 WHERE name = $2', [Number(price), name]);
    }
    res.json({ success: true });
});

app.put('/api/admin/drinks/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { color_name, stock, is_active, category } = req.body;
    try {
        const updates = [];
        const params = [];

        if (color_name !== undefined) { params.push(color_name); updates.push(`color_name = $${params.length}`); }
        if (category !== undefined) { params.push(category); updates.push(`category = $${params.length}`); }
        if (stock !== undefined) { params.push(Number(stock)); updates.push(`stock = $${params.length}`); }
        if (is_active !== undefined) { params.push(is_active); updates.push(`is_active = $${params.length}`); }

        if (updates.length === 0) return res.json({ success: true });

        params.push(Number(id));
        const query = `UPDATE drinks SET ${updates.join(', ')} WHERE id = $${params.length}`;

        await db.query(query, params);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Database update failed' });
    }
});

app.delete('/api/admin/drinks/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM drinks WHERE id = $1', [Number(req.params.id)]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Database delete failed' });
    }
});

app.post('/api/admin/drinks', authenticateToken, isAdmin, async (req, res) => {
    const { name, color_name, category, stock, barcode } = req.body;
    try {
        const { rows } = await db.query(
            'INSERT INTO drinks (barcode, name, color_name, category, stock, price) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [barcode || String(Date.now()), name, color_name || 'Rot', category || 'Softdrinks', Number(stock || 0), 0]
        );
        res.json({ success: true, id: rows[0].id });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to create drink' });
    }
});

app.get('/api/admin/debug/report', authenticateToken, isAdmin, async (req, res) => {
    const offset = parseInt(req.query.offset as string) || 0;
    const txt = await generateReportText(offset);
    res.json({ report: txt });
});

app.delete('/api/admin/debug/wipe', authenticateToken, isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM consumption_log');
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

app.get('/api/leaderboard', authenticateToken, async (req, res) => {
    const { start, end } = getMonthBoundaries();
    const category = req.query.category as string;

    let query = `
        SELECT u.username, SUM(c_log.quantity) as total_drinks
        FROM consumption_log c_log
        JOIN users u ON c_log.user_id = u.id
        JOIN drinks d ON c_log.drink_id = d.id
        WHERE c_log.created_at >= $1 AND c_log.created_at < $2 AND u.role != 'admin'
    `;
    const params: any[] = [start, end];

    if (category && category !== 'All') {
        params.push(category);
        query += ` AND d.category = $${params.length}`;
    }

    query += ` GROUP BY u.username ORDER BY total_drinks DESC LIMIT 10`;

    const { rows } = await db.query(query, params);
    res.json(rows);
});

app.get('/api/admin/tallies', authenticateToken, isAdmin, async (req, res) => {
    const booked = await generateAdminData(0, false);
    const paid = await generateAdminData(0, true);

    const totalBookedValue = booked.reduce((acc, user) => acc + user.totalSpent, 0);
    const totalPaidValue = paid.reduce((acc, user) => acc + user.totalSpent, 0);

    res.json({ booked, paid, totalBookedValue, totalPaidValue });
});

app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    const { rows } = await db.query('SELECT id, username, role FROM users');
    res.json(rows);
});

// ==========================================
// 6. SETTINGS & ACHIEVEMENTS
// ==========================================

app.get('/api/settings/public', async (req, res) => {
    const paypalUsername = await getSetting('PAYPAL_USERNAME', process.env.VITE_PAYPAL_USERNAME || '');
    const weroUsername = await getSetting('WERO_USERNAME', '');
    res.json({ paypal_username: paypalUsername, wero_username: weroUsername });
});

app.get('/api/admin/settings', authenticateToken, isAdmin, async (req, res) => {
    const { rows } = await db.query('SELECT * FROM settings');
    res.json(rows);
});

app.put('/api/admin/settings', authenticateToken, isAdmin, async (req, res) => {
    const { key, value } = req.body;
    await db.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [key, value]
    );
    res.json({ success: true });
});

app.get('/api/admin/achievements', authenticateToken, isAdmin, async (req, res) => {
    const { rows } = await db.query('SELECT * FROM achievements');
    res.json(rows);
});

app.post('/api/admin/achievements', authenticateToken, isAdmin, async (req, res) => {
    const { name, description, icon, condition_type, condition_value, condition_target } = req.body;
    try {
        const { rows } = await db.query(
            'INSERT INTO achievements (name, description, icon, condition_type, condition_value, condition_target) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [name, description, icon, condition_type, condition_value, condition_target || null]
        );
        res.json({ success: true, id: rows[0].id });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create achievement' });
    }
});

app.put('/api/admin/achievements/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, description, icon, condition_type, condition_value, condition_target } = req.body;
    try {
        await db.query(
            'UPDATE achievements SET name = $1, description = $2, icon = $3, condition_type = $4, condition_value = $5, condition_target = $6 WHERE id = $7',
            [name, description, icon, condition_type, condition_value, condition_target || null, Number(id)]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update achievement' });
    }
});

app.delete('/api/admin/achievements/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM achievements WHERE id = $1', [Number(req.params.id)]);
        await db.query('DELETE FROM user_achievements WHERE achievement_id = $1', [Number(req.params.id)]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete achievement' });
    }
});

app.get('/api/users/achievements', authenticateToken, async (req, res) => {
    const userId = (req as any).user.id;
    const { rows: achievements } = await db.query('SELECT * FROM achievements');
    const { rows: unlocked } = await db.query('SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = $1', [userId]);

    const unlockedMap = new Map(unlocked.map(u => [u.achievement_id, u.unlocked_at]));
    const result = achievements.map(ach => ({
        ...ach,
        unlocked: unlockedMap.has(ach.id),
        unlocked_at: unlockedMap.get(ach.id) || null
    }));

    res.json(result);
});

app.put('/api/admin/users/:id/password', authenticateToken, isAdmin, async (req, res) => {
    try {
        const hash = bcrypt.hashSync(req.body.newPassword, 10);
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, Number(req.params.id)]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update password' });
    }
});

app.post('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    try {
        const hash = bcrypt.hashSync(password, 10);
        const { rows } = await db.query(
            'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
            [username, hash, role || 'user']
        );
        res.json({ success: true, id: rows[0].id });
    } catch (err: any) {
        if (err.code === '23505') {
            res.status(400).json({ error: 'Username already exists' });
        } else {
            res.status(500).json({ error: 'Failed to create user' });
        }
    }
});

app.delete('/api/admin/users/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM users WHERE id = $1', [Number(req.params.id)]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// ==========================================
// 7. CRON & SERVER START
// ==========================================

cron.schedule('0 0 1 * *', async () => {
    console.log('Running monthly tally report...');
    try {
        await sendReportEmail(-1);
    } catch (error) {
        console.error('Monthly CRON job failed:', error);
    }
});

async function startServer() {
    // 1. Warte, bis die Datenbank-Tabellen fertig geladen sind
    await initDb();

    // 2. Lade das Frontend / Vite
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

    // 3. Starte den Server
    const keyPath = path.join(process.cwd(), 'server.key');
    const certPath = path.join(process.cwd(), 'server.cert');
    const useHttps = fs.existsSync(keyPath) && fs.existsSync(certPath);

    if (useHttps) {
        const httpsOptions = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
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