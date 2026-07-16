import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import { Pool, types } from 'pg'; // PostgreSQL Treiber
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { EventEmitter } from 'events';


types.setTypeParser(1700, (val) => parseFloat(val));
const app = express();
const PORT = parseInt(process.env.PORT || '3000');
const scanEmitter = new EventEmitter();

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('FATAL ERROR: JWT_SECRET is not defined in production environment.');
}

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
            critical_stock INTEGER NOT NULL DEFAULT 2,
            bottles_per_crate INTEGER NOT NULL DEFAULT 20,
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

    // Run migrations for existing databases to add new columns if missing
    await db.query(`
        ALTER TABLE drinks ADD COLUMN IF NOT EXISTS bottles_per_crate INTEGER NOT NULL DEFAULT 20;
        ALTER TABLE drinks ADD COLUMN IF NOT EXISTS critical_stock INTEGER NOT NULL DEFAULT 2;
        ALTER TABLE drinks ADD COLUMN IF NOT EXISTS crate_price DECIMAL(10,2);
        ALTER TABLE consumption_log ADD COLUMN IF NOT EXISTS responsible TEXT;
        ALTER TABLE consumption_log ADD COLUMN IF NOT EXISTS is_crate BOOLEAN DEFAULT false;
        ALTER TABLE consumption_log ADD COLUMN IF NOT EXISTS price_paid DECIMAL(10,2);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(255);
    `);

    // Seed default crate prices for existing Bier and Apfelwein drinks if currently unset
    await db.query(`
        UPDATE drinks 
        SET crate_price = 15.00 
        WHERE crate_price IS NULL AND (category = 'Bier' OR category = 'Apfelwein')
    `);

    // Standard-Erfolge einfügen
    // Check if defaults have already been initialized once
    const isInitialized = await getSetting('INITIALIZED', 'false');

    if (isInitialized === 'false') {
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

        // Getränke einfügen
        const { rows: drinkCount } = await db.query('SELECT COUNT(*) as count FROM drinks');
        if (parseInt(drinkCount[0].count) === 0) {
            await db.query("INSERT INTO drinks (barcode, name, color_name) VALUES ('999123', 'Club Mate', 'Rot'), ('999456', 'Cola', 'Braun'), ('999789', 'Water', 'Blau'), ('999000', 'Beer', 'Grün') ON CONFLICT (barcode) DO NOTHING");
        }

        // Set to true so subsequent resets won't trigger re-population on server boot
        await db.query("INSERT INTO settings (key, value) VALUES ('INITIALIZED', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'");
    }

    // Farben einfügen
    const { rows: colorCount } = await db.query('SELECT COUNT(*) as c FROM colors');
    if (parseInt(colorCount[0].c) === 0) {
        await db.query("INSERT INTO colors (name, price) VALUES ('Rot', 1.0), ('Braun', 1.5), ('Grün', 2.0), ('Schwarz', 2.5), ('Blau', 3.0)");
    }

    // Admin & Guest & Bierdax Nutzer (always present)
    const adminHash = bcrypt.hashSync('admin', 10);
    await db.query("INSERT INTO users (username, password_hash, role) VALUES ('admin', $1, 'admin') ON CONFLICT (username) DO NOTHING", [adminHash]);

    const guestHash = bcrypt.hashSync('guest', 10);
    await db.query("INSERT INTO users (username, password_hash, role) VALUES ('guest', $1, 'guest') ON CONFLICT (username) DO NOTHING", [guestHash]);

    const bierdaxHash = bcrypt.hashSync('1234', 10);
    await db.query("INSERT INTO users (username, password_hash, role) VALUES ('Bierdax', $1, 'bierdax') ON CONFLICT (username) DO NOTHING", [bierdaxHash]);

    const cbHash = bcrypt.hashSync('cb_temp_pin_or_empty', 10);
    await db.query("INSERT INTO users (username, password_hash, role) VALUES ('CB', $1, 'user') ON CONFLICT (username) DO NOTHING", [cbHash]);

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

const isAdminOrBierdax = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const role = (req as any).user?.role;
    if (role !== 'admin' && role !== 'bierdax') { res.sendStatus(403); return; }
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

        if (username && username.toLowerCase() === 'guest') {
            res.status(403).json({ error: 'System accounts cannot log in directly' });
            return;
        }

        if (username && username.toUpperCase() === 'CB') {
            const { rows } = await db.query("SELECT * FROM users WHERE username = 'CB'");
            const user = rows[0];
            if (user) {
                const token = jwt.sign({ id: user.id, username: user.username, role: 'cb' }, JWT_SECRET);
                res.json({ token, user: { id: user.id, username: user.username, role: 'cb' } });
                return;
            }
        }

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
        res.json({ token, user: { id: user.id, username: user.username, role: user.role, avatar: user.avatar } });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { username, password, avatar } = req.body;
    try {
        const hash = bcrypt.hashSync(password, 10);
        // RETURNING id gibt die eingefügte ID zurück (wie lastInsertRowid)
        const { rows } = await db.query(
            'INSERT INTO users (username, password_hash, role, avatar) VALUES ($1, $2, $3, $4) RETURNING id',
            [username, hash, 'user', avatar || null]
        );
        const newId = rows[0].id;
        const token = jwt.sign({ id: newId, username, role: 'user' }, JWT_SECRET);
        res.json({ token, user: { id: newId, username, role: 'user', avatar: avatar || null } });
    } catch (err: any) {
        if (err.code === '23505') { // Postgres Unique Constraint Violation
            res.status(400).json({ error: 'Username taken' });
        } else {
            res.status(500).json({ error: 'Server error' });
        }
    }
});

app.put('/api/users/me/avatar', authenticateToken, async (req, res) => {
    const userId = (req as any).user.id;
    const { avatar } = req.body;
    try {
        await db.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatar, userId]);
        res.json({ success: true, avatar });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update avatar' });
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
    const offset = parseInt(req.query.offset as string) || 0;
    const { start, end } = getMonthBoundaries(offset);

    const { rows: history } = await db.query(`
        SELECT c_log.id, d.name as drink_name, d.color_name, c.price, c_log.created_at as date, c_log.quantity, c_log.paid_via_paypal, c_log.responsible, c_log.is_crate, c_log.price_paid
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
            if (log.is_crate) {
                totalSpent += Number(log.price_paid) || 0;
            } else {
                totalSpent += (Number(log.price) || 0) * log.quantity;
            }
        }
    });

    res.json({ colors: colorsStats, totalSpent, history });
});

async function checkAchievements(userId: number) {
    const { rows: missingAchievements } = await db.query(`
        SELECT * FROM achievements 
        WHERE id NOT IN (SELECT achievement_id FROM user_achievements WHERE user_id = $1)
    `, [userId]);

    if (missingAchievements.length === 0) return;

    const { rows: statsRows } = await db.query(`
        SELECT
            SUM(cl.quantity) as total_drinks,
            SUM(cl.quantity * COALESCE(c.price, 0)) as total_spent
        FROM consumption_log cl
        JOIN drinks d ON cl.drink_id = d.id
        LEFT JOIN colors c ON d.color_name = c.name
        WHERE cl.user_id = $1 AND cl.is_crate = false
    `, [userId]);
    // Added is_crate = false so it only calculates individual drinks or adjust as needed
    // (Actually crate prices are stored differently, but stats logic usually relies on normal price). Let's just use what was there.
    // Wait, the previous logic was SUM(cl.quantity * c.price) without is_crate check. I'll just use what was there to avoid regressions.
    
    // Better query:
    const { rows: statsRowsFixed } = await db.query(`
        SELECT
            SUM(cl.quantity) as total_drinks,
            SUM(CASE WHEN cl.is_crate = true THEN COALESCE(cl.price_paid, 0) ELSE cl.quantity * COALESCE(c.price, 0) END) as total_spent
        FROM consumption_log cl
        JOIN drinks d ON cl.drink_id = d.id
        LEFT JOIN colors c ON d.color_name = c.name
        WHERE cl.user_id = $1
    `, [userId]);

    const stats = statsRowsFixed[0];

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

    for (const ach of missingAchievements) {
        let conditionMet = false;
        switch (ach.condition_type) {
            case 'total_drinks': conditionMet = (Number(stats?.total_drinks) || 0) >= ach.condition_value; break;
            case 'total_spent': conditionMet = (Number(stats?.total_spent) || 0) >= ach.condition_value; break;
            case 'color_drinks': conditionMet = (colorStats[ach.condition_target] || 0) >= ach.condition_value; break;
            case 'specific_drink': conditionMet = (drinkNameStats[ach.condition_target] || 0) >= ach.condition_value; break;
        }

        if (conditionMet) {
            await db.query('INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, ach.id]);
            console.log(`User ${userId} unlocked achievement ${ach.name}`);
        }
    }
}

app.post('/api/tallies', authenticateToken, async (req, res) => {
    const userId = (req as any).user.id;
    const { drinkId, quantity, payViaPayPal } = req.body;
    let logId: number | null = null;
    const qty = parseInt(quantity as any) || 1;

    const { rows: updateRows } = await db.query(
        'UPDATE drinks SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING *',
        [qty, drinkId]
    );
    const drinkAfter = updateRows[0];

    if (!drinkAfter) {
        const { rows: checkRows } = await db.query('SELECT stock, name FROM drinks WHERE id = $1', [drinkId]);
        if (checkRows.length === 0) { res.status(404).json({ error: 'Drink not found' }); return; }
        res.status(400).json({ error: `Insufficient stock for ${checkRows[0].name}. Available: ${checkRows[0].stock}` });
        return;
    }

    if (qty > 0) {
        const { rows } = await db.query(
            'INSERT INTO consumption_log (user_id, drink_id, quantity, paid_via_paypal) VALUES ($1, $2, $3, $4) RETURNING id',
            [userId, drinkId, qty, payViaPayPal ? true : false]
        );
        logId = rows[0]?.id ?? null;
    }

    const beforeStock = drinkAfter.stock + qty;
    if (beforeStock > drinkAfter.min_stock && drinkAfter.stock <= drinkAfter.min_stock) {
        sendLowStockAlert(drinkAfter.name, drinkAfter.stock, drinkAfter.min_stock).catch(console.error);
    }
    if (beforeStock > drinkAfter.critical_stock && drinkAfter.stock <= drinkAfter.critical_stock) {
        sendCriticalStockAlert(drinkAfter.name, drinkAfter.stock, drinkAfter.critical_stock).catch(console.error);
    }

    // Run achievements async without blocking
    checkAchievements(userId).catch(console.error);
    res.json({ success: true, payViaPayPal, logId });
});

app.delete('/api/tallies/:id', authenticateToken, async (req, res) => {
    const userId = (req as any).user.id;
    const role = (req as any).user.role;
    const logId = Number(req.params.id);

    try {
        const { rows } = await db.query(
            'SELECT *, EXTRACT(EPOCH FROM (NOW() - created_at)) AS age_seconds FROM consumption_log WHERE id = $1',
            [logId]
        );
        const entry = rows[0];
        if (!entry) { res.status(404).json({ error: 'Entry not found' }); return; }

        // Users can only undo their own entries created in the last 60 seconds
        if (role !== 'admin') {
            if (entry.user_id !== userId) { res.status(403).json({ error: 'Not your entry' }); return; }
            const ageSeconds = Number(entry.age_seconds);
            if (isNaN(ageSeconds) || ageSeconds > 60) { res.status(403).json({ error: 'Undo window expired (60s)' }); return; }
        }

        // Delete entry and restore stock
        await db.query('DELETE FROM consumption_log WHERE id = $1', [logId]);
        await db.query('UPDATE drinks SET stock = stock + $1 WHERE id = $2', [entry.quantity, entry.drink_id]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to undo entry' });
    }
});

app.post('/api/guest-checkout', async (req, res) => {
    const { drinkId, quantity } = req.body;
    if (drinkId && quantity) {
        const qty = parseInt(quantity as any) || 1;

        const { rows: updateRows } = await db.query(
            'UPDATE drinks SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING *',
            [qty, drinkId]
        );
        const drinkAfter = updateRows[0];

        if (!drinkAfter) {
            const { rows: checkRows } = await db.query('SELECT stock, name FROM drinks WHERE id = $1', [drinkId]);
            if (checkRows.length === 0) { res.status(404).json({ error: 'Drink not found' }); return; }
            res.status(400).json({ error: `Insufficient stock for ${checkRows[0].name}. Available: ${checkRows[0].stock}` });
            return;
        }

        const beforeStock = drinkAfter.stock + qty;
        if (beforeStock > drinkAfter.min_stock && drinkAfter.stock <= drinkAfter.min_stock) {
            sendLowStockAlert(drinkAfter.name, drinkAfter.stock, drinkAfter.min_stock).catch(console.error);
        }
        if (beforeStock > drinkAfter.critical_stock && drinkAfter.stock <= drinkAfter.critical_stock) {
            sendCriticalStockAlert(drinkAfter.name, drinkAfter.stock, drinkAfter.critical_stock).catch(console.error);
        }

        const { rows: guestRows } = await db.query("SELECT id FROM users WHERE username = 'guest'");
        const guest = guestRows[0];
        if (guest) {
            await db.query('INSERT INTO consumption_log (user_id, drink_id, quantity, paid_via_paypal) VALUES ($1, $2, $3, true)', [guest.id, drinkId, qty]);
        }
    }
    res.json({ success: true, message: 'Guest checkout initiated' });
});

app.post('/api/cb-checkout', async (req, res) => {
    const { drinkId, quantity, responsible } = req.body;
    
    if (!responsible || responsible.trim() === '') {
        res.status(400).json({ error: 'A responsible person is required for CB booking.' });
        return;
    }

    if (drinkId && quantity) {
        const qty = parseInt(quantity as any) || 1;
        
        // We still need to check color_name before updating. We can do a SELECT first just for color, or do it in the UPDATE.
        // It's safer to SELECT first for the color and existence, but we don't rely on the SELECT for stock > qty.
        const { rows: colorRows } = await db.query('SELECT color_name, name FROM drinks WHERE id = $1', [drinkId]);
        const drinkColorInfo = colorRows[0];
        if (!drinkColorInfo) { res.status(404).json({ error: 'Drink not found' }); return; }

        if (drinkColorInfo.color_name !== 'Schwarz' && drinkColorInfo.color_name !== 'Blau') {
            res.status(400).json({ error: `CB can only book Black and Blue ring drinks. ${drinkColorInfo.name} is a ${drinkColorInfo.color_name} ring.` });
            return;
        }

        const { rows: updateRows } = await db.query(
            'UPDATE drinks SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING *',
            [qty, drinkId]
        );
        const drinkAfter = updateRows[0];

        if (!drinkAfter) {
            const { rows: checkRows } = await db.query('SELECT stock, name FROM drinks WHERE id = $1', [drinkId]);
            res.status(400).json({ error: `Insufficient stock for ${checkRows[0].name}. Available: ${checkRows[0].stock}` });
            return;
        }

        const beforeStock = drinkAfter.stock + qty;
        if (beforeStock > drinkAfter.min_stock && drinkAfter.stock <= drinkAfter.min_stock) {
            sendLowStockAlert(drinkAfter.name, drinkAfter.stock, drinkAfter.min_stock).catch(console.error);
        }
        if (beforeStock > drinkAfter.critical_stock && drinkAfter.stock <= drinkAfter.critical_stock) {
            sendCriticalStockAlert(drinkAfter.name, drinkAfter.stock, drinkAfter.critical_stock).catch(console.error);
        }

        const { rows: cbRows } = await db.query("SELECT id FROM users WHERE username = 'CB'");
        const cb = cbRows[0];
        if (cb) {
            await db.query('INSERT INTO consumption_log (user_id, drink_id, quantity, paid_via_paypal, responsible) VALUES ($1, $2, $3, false, $4)', [cb.id, drinkId, qty, responsible]);
        }
    }
    res.json({ success: true, message: 'CB checkout completed' });
});

app.post('/api/tallies/crate', authenticateToken, async (req, res) => {
    const { drinkId } = req.body;
    const userId = (req as any).user.id;
    const role = (req as any).user.role;

    if (role !== 'philister' && role !== 'admin') {
        res.status(403).json({ error: 'Only Philisters or Administrators can book a Kasten.' });
        return;
    }

    if (!drinkId) {
        res.status(400).json({ error: 'Missing drinkId parameter.' });
        return;
    }

    try {
        const { rows: infoRows } = await db.query('SELECT name, bottles_per_crate, crate_price FROM drinks WHERE id = $1', [drinkId]);
        const drinkInfo = infoRows[0];
        if (!drinkInfo) {
            res.status(404).json({ error: 'Drink not found' });
            return;
        }

        if (!drinkInfo.crate_price || Number(drinkInfo.crate_price) <= 0) {
            res.status(400).json({ error: `No Kasten price configured for ${drinkInfo.name}.` });
            return;
        }

        const qty = Number(drinkInfo.bottles_per_crate) || 20;

        const { rows: updateRows } = await db.query(
            'UPDATE drinks SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING *',
            [qty, drinkId]
        );
        const drinkAfter = updateRows[0];

        if (!drinkAfter) {
            const { rows: checkRows } = await db.query('SELECT stock, name FROM drinks WHERE id = $1', [drinkId]);
            res.status(400).json({ error: `Insufficient stock. Only ${checkRows[0].stock} bottles of ${checkRows[0].name} left.` });
            return;
        }

        const beforeStock = drinkAfter.stock + qty;
        if (beforeStock > drinkAfter.min_stock && drinkAfter.stock <= drinkAfter.min_stock) {
            sendLowStockAlert(drinkAfter.name, drinkAfter.stock, drinkAfter.min_stock).catch(console.error);
        }
        if (beforeStock > drinkAfter.critical_stock && drinkAfter.stock <= drinkAfter.critical_stock) {
            sendCriticalStockAlert(drinkAfter.name, drinkAfter.stock, drinkAfter.critical_stock).catch(console.error);
        }

        const { rows: logRows } = await db.query(
            'INSERT INTO consumption_log (user_id, drink_id, quantity, paid_via_paypal, is_crate, price_paid) VALUES ($1, $2, $3, false, true, $4) RETURNING id',
            [userId, drinkId, qty, drinkInfo.crate_price]
        );

        res.json({ success: true, logId: logRows[0].id });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to book Kasten' });
    }
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
    const token = req.query.token as string;
    if (!token) { res.status(401).end(); return; }

    jwt.verify(token, JWT_SECRET, (err) => {
        if (err) { res.status(403).end(); return; }

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
});

async function generateAdminData(offsetMonths = 0, paidViaPaypal = false) {
    const { start, end } = getMonthBoundaries(offsetMonths);

    const { rows: colorAggs } = await db.query(`
        SELECT u.username, d.color_name, SUM(c_log.quantity) as qty
        FROM consumption_log c_log
        JOIN users u ON c_log.user_id = u.id
        JOIN drinks d ON c_log.drink_id = d.id
        WHERE c_log.created_at >= $1 AND c_log.created_at < $2 AND c_log.paid_via_paypal = $3
        GROUP BY u.username, d.color_name
    `, [start, end, paidViaPaypal]);

    const { rows: spendAggs } = await db.query(`
        SELECT u.username,
               SUM(CASE WHEN c_log.is_crate = true THEN COALESCE(c_log.price_paid, 0)
                        ELSE COALESCE(c.price, 0) * c_log.quantity END) as total_spent
        FROM consumption_log c_log
        JOIN users u ON c_log.user_id = u.id
        JOIN drinks d ON c_log.drink_id = d.id
        LEFT JOIN colors c ON d.color_name = c.name
        WHERE c_log.created_at >= $1 AND c_log.created_at < $2 AND c_log.paid_via_paypal = $3
        GROUP BY u.username
    `, [start, end, paidViaPaypal]);

    const userMaps: Record<string, any> = {};

    colorAggs.forEach(row => {
        if (!userMaps[row.username]) userMaps[row.username] = { username: row.username, colors: {}, totalSpent: 0 };
        userMaps[row.username].colors[row.color_name] = Number(row.qty);
    });

    spendAggs.forEach(row => {
        if (!userMaps[row.username]) userMaps[row.username] = { username: row.username, colors: {}, totalSpent: 0 };
        userMaps[row.username].totalSpent = Number(row.total_spent);
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
    const disabled = await getSetting('DISABLE_LOW_STOCK_ALERTS', 'false');
    if (disabled === 'true') {
        console.log(`Low stock alert skipped for ${name} because DISABLE_LOW_STOCK_ALERTS is true.`);
        return;
    }

    const { rows } = await db.query('SELECT is_active FROM drinks WHERE name = $1', [name]);
    if (rows[0] && !rows[0].is_active) {
        console.log(`Low stock alert skipped for ${name} because the drink is inactive/disabled.`);
        return;
    }

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

async function sendCriticalStockAlert(name: string, stock: number, criticalStock: number) {
    const disabled = await getSetting('DISABLE_LOW_STOCK_ALERTS', 'false');
    if (disabled === 'true') {
        console.log(`Critical low stock alert skipped for ${name} because DISABLE_LOW_STOCK_ALERTS is true.`);
        return;
    }

    const { rows } = await db.query('SELECT is_active FROM drinks WHERE name = $1', [name]);
    if (rows[0] && !rows[0].is_active) {
        console.log(`Critical low stock alert skipped for ${name} because the drink is inactive/disabled.`);
        return;
    }

    const transporter = await getTransporter();
    const mailOptions = {
        from: await getSetting('SMTP_USER', process.env.SMTP_USER || 'test@example.com'),
        to: await getAdminEmail(),
        subject: `CRITICAL Low Stock Alert: ${name}`,
        text: `CRITICAL WARNING: The stock for ${name} has reached ${stock}! The critical stock limit is set to ${criticalStock}. Restock immediately!`,
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Critical low stock alert sent for ${name}`);
    } catch (e: any) {
        console.error('Failed to send critical low stock alert:', e.message || e);
    }
}

async function sendWeeklyOrderReport() {
    try {
        const { rows: drinksToOrder } = await db.query(
            'SELECT name, stock, min_stock, bottles_per_crate FROM drinks WHERE is_active = true AND stock < min_stock'
        );

        if (drinksToOrder.length === 0) {
            console.log('No drinks need ordering today.');
            return;
        }

        const transporter = await getTransporter();
        let body = 'Weekly Beverage Restock Order Report\n';
        body += '=====================================\n\n';
        body += 'The following drinks are below their minimum stock limit and need to be ordered:\n\n';

        drinksToOrder.forEach(d => {
            const missing = d.min_stock - d.stock;
            const bottlesPerCrate = d.bottles_per_crate || 20;
            const crates = Math.ceil(missing / bottlesPerCrate);
            body += `- ${d.name}:\n`;
            body += `  Current Stock: ${d.stock} (Min limit: ${d.min_stock})\n`;
            body += `  Missing: ${missing} bottles\n`;
            body += `  Crate size: ${bottlesPerCrate} bottles/crate\n`;
            body += `  => SUGGESTED ORDER: ${crates} Kasten (crate${crates > 1 ? 's' : ''})\n\n`;
        });

        body += '\nPlease process this restock as soon as possible.';

        const mailOptions = {
            from: await getSetting('SMTP_USER', process.env.SMTP_USER || 'test@example.com'),
            to: await getAdminEmail(),
            subject: 'Weekly Beverage Restock Order Report',
            text: body
        };

        await transporter.sendMail(mailOptions);
        console.log('Weekly order report email sent successfully.');
    } catch (err: any) {
        console.error('Failed to run weekly order report:', err.message || err);
    }
}

async function sendReportEmail(offsetMonths = 0) {
    const transporter = await getTransporter();
    const reportText = await generateReportText(offsetMonths);

    const { rows: lowStockDrinks } = await db.query('SELECT name, stock, min_stock FROM drinks WHERE is_active = true AND stock <= min_stock');
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

app.put('/api/admin/drinks/:id', authenticateToken, isAdminOrBierdax, async (req, res) => {
    const { id } = req.params;
    const { color_name, stock, is_active, category, min_stock, critical_stock, crate_price } = req.body;
    try {
        const updates = [];
        const params = [];

        if (color_name !== undefined) { params.push(color_name); updates.push(`color_name = $${params.length}`); }
        if (category !== undefined) { params.push(category); updates.push(`category = $${params.length}`); }
        if (stock !== undefined) { params.push(Number(stock)); updates.push(`stock = $${params.length}`); }
        if (min_stock !== undefined) { params.push(Number(min_stock)); updates.push(`min_stock = $${params.length}`); }
        if (critical_stock !== undefined) { params.push(Number(critical_stock)); updates.push(`critical_stock = $${params.length}`); }
        if (is_active !== undefined) { params.push(is_active); updates.push(`is_active = $${params.length}`); }
        if (crate_price !== undefined) { params.push(crate_price === null ? null : Number(crate_price)); updates.push(`crate_price = $${params.length}`); }

        if (updates.length === 0) return res.json({ success: true });

        params.push(Number(id));
        const query = `UPDATE drinks SET ${updates.join(', ')} WHERE id = $${params.length}`;

        await db.query(query, params);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Database update failed' });
    }
});

app.delete('/api/admin/drinks/:id', authenticateToken, isAdminOrBierdax, async (req, res) => {
    try {
        await db.query('DELETE FROM drinks WHERE id = $1', [Number(req.params.id)]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Database delete failed' });
    }
});

app.post('/api/admin/drinks', authenticateToken, isAdminOrBierdax, async (req, res) => {
    const { name, color_name, category, stock, barcode, min_stock, critical_stock, bottles_per_crate, crate_price } = req.body;
    try {
        let initialCratePrice = crate_price !== undefined ? (crate_price === null ? null : Number(crate_price)) : null;
        if (initialCratePrice === null && (category === 'Bier' || category === 'Apfelwein')) {
            initialCratePrice = 15.00;
        }

        const { rows } = await db.query(
            'INSERT INTO drinks (barcode, name, color_name, category, stock, price, min_stock, critical_stock, bottles_per_crate, crate_price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
            [
                barcode || String(Date.now()),
                name,
                color_name || 'Rot',
                category || 'Softdrinks',
                Number(stock || 0),
                0,
                Number(min_stock !== undefined ? min_stock : 5),
                Number(critical_stock !== undefined ? critical_stock : 2),
                Number(bottles_per_crate !== undefined ? bottles_per_crate : 20),
                initialCratePrice
            ]
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

app.post('/api/admin/debug/wipe-all', authenticateToken, isAdmin, async (req, res) => {
    const { password } = req.body;
    const adminUserId = (req as any).user.id;

    try {
        const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [adminUserId]);
        const user = rows[0];
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            res.status(401).json({ error: 'Incorrect administrator password' });
            return;
        }

        await db.query('DELETE FROM consumption_log');
        await db.query('DELETE FROM user_achievements');
        await db.query('DELETE FROM achievements');
        await db.query('DELETE FROM drinks');
        await db.query("DELETE FROM users WHERE username NOT IN ('admin', 'guest', 'Bierdax', 'CB')");

        await db.query(
            "INSERT INTO settings (key, value) VALUES ('INITIALIZED', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'"
        );

        res.json({ success: true, message: 'System reset completed successfully' });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to wipe database' });
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
    const offset = parseInt(req.query.offset as string) || 0;
    const { start, end } = getMonthBoundaries(offset);
    const category = req.query.category as string;

    let query = `
        SELECT u.username, u.avatar, SUM(c_log.quantity) as total_drinks
        FROM consumption_log c_log
        JOIN users u ON c_log.user_id = u.id
        JOIN drinks d ON c_log.drink_id = d.id
        WHERE c_log.created_at >= $1 AND c_log.created_at < $2 AND u.role != 'admin' AND u.username NOT IN ('guest', 'CB')
    `;
    const params: any[] = [start, end];

    if (category && category !== 'All') {
        params.push(category);
        query += ` AND d.category = $${params.length}`;
    }

    query += ` GROUP BY u.username, u.avatar ORDER BY total_drinks DESC LIMIT 10`;

    const { rows } = await db.query(query, params);
    res.json(rows);
});

app.get('/api/admin/consumption-log', authenticateToken, isAdmin, async (req, res) => {
    const offset = parseInt(req.query.offset as string) || 0;
    const { start, end } = getMonthBoundaries(offset);
    try {
        const { rows } = await db.query(`
            SELECT c_log.id, u.username, d.name as drink_name, d.color_name, c.price,
                   c_log.quantity, c_log.paid_via_paypal, c_log.created_at as date,
                   c_log.is_crate, c_log.price_paid, c_log.responsible
            FROM consumption_log c_log
            JOIN users u ON c_log.user_id = u.id
            JOIN drinks d ON c_log.drink_id = d.id
            LEFT JOIN colors c ON d.color_name = c.name
            WHERE c_log.created_at >= $1 AND c_log.created_at < $2
            ORDER BY c_log.created_at DESC
            LIMIT 100
        `, [start, end]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch consumption log' });
    }
});

app.get('/api/admin/tallies', authenticateToken, isAdmin, async (req, res) => {
    const booked = await generateAdminData(0, false);
    const paid = await generateAdminData(0, true);

    const totalBookedValue = booked.reduce((acc, user) => acc + user.totalSpent, 0);
    const totalPaidValue = paid.reduce((acc, user) => acc + user.totalSpent, 0);

    res.json({ booked, paid, totalBookedValue, totalPaidValue });
});

app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    const { rows } = await db.query('SELECT id, username, role, avatar FROM users');
    res.json(rows);
});

app.put('/api/admin/users/:id/avatar', authenticateToken, isAdmin, async (req, res) => {
    const userId = req.params.id;
    const { avatar } = req.body;
    try {
        await db.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatar, userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update avatar' });
    }
});

// ==========================================
// 6. SETTINGS & ACHIEVEMENTS
// ==========================================

app.get('/api/settings/public', async (req, res) => {
    const paypalUsername = await getSetting('PAYPAL_USERNAME', process.env.VITE_PAYPAL_USERNAME || '');
    const weroUsername = await getSetting('WERO_USERNAME', '');
    const disableLowStock = await getSetting('DISABLE_LOW_STOCK_ALERTS', 'false');
    res.json({ 
        paypal_username: paypalUsername, 
        wero_username: weroUsername, 
        disable_low_stock_alerts: disableLowStock === 'true'
    });
});

app.put('/api/admin/settings/low-stock-alert', authenticateToken, isAdminOrBierdax, async (req, res) => {
    const { disable } = req.body;
    const val = disable ? 'true' : 'false';
    await db.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        ['DISABLE_LOW_STOCK_ALERTS', val]
    );
    res.json({ success: true, disable_low_stock_alerts: disable });
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

app.put('/api/admin/users/:id/role', authenticateToken, isAdmin, async (req, res) => {
    const { role } = req.body;
    if (role !== 'user' && role !== 'admin' && role !== 'bierdax' && role !== 'philister') {
        res.status(400).json({ error: 'Invalid role' });
        return;
    }
    try {
        await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, Number(req.params.id)]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update user role' });
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

// Run weekly order restock report every Friday at 12:00 PM
cron.schedule('0 12 * * 5', async () => {
    console.log('Running weekly restock order report...');
    try {
        await sendWeeklyOrderReport();
    } catch (error) {
        console.error('Weekly CRON job failed:', error);
    }
});

async function startServer() {
    // 1. Warte, bis die Datenbank-Tabellen fertig geladen sind
    await initDb();

    // 2. Erstelle den Server ZUERST, damit Vite ihn für HMR nutzen kann
    const keyPath = path.join(process.cwd(), 'server.key');
    const certPath = path.join(process.cwd(), 'server.cert');
    const useHttps = fs.existsSync(keyPath) && fs.existsSync(certPath);

    let server;
    if (useHttps) {
        const httpsOptions = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
        server = https.createServer(httpsOptions, app);
    } else {
        server = http.createServer(app);
    }

    // 3. Lade das Frontend / Vite
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { 
                middlewareMode: true,
                hmr: { server }
            },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        app.use(express.static(path.join(process.cwd(), 'dist')));
        app.get('*', (req, res) => {
            res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
        });
    }

    // 4. Starte den Server
    server.listen(PORT, '0.0.0.0', () => {
        if (useHttps) {
            console.log(`HTTPS Server running at https://0.0.0.0:${PORT}`);
        } else {
            console.log(`HTTP Server running at http://0.0.0.0:${PORT}`);
        }
    });
}

startServer();