import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import pg from 'pg';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

const CHUNK_SIZE = 1000;
const RECHARGE_TIME_MS = 10000; // For ONE charge

// Charge update
async function getUserState(userId) {
    const res = await pgPool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (res.rows.length === 0) return null;
    let user = res.rows[0];
    
    // Charge counting
    const now = Date.now();
    const lastUpdate = new Date(user.last_charge_update).getTime();
    const diffMs = now - lastUpdate;
    const recovered = Math.floor(diffMs / RECHARGE_TIME_MS);
    
    let currentCharges = user.current_charges || user.max_charges; // Current charges in Redis, but it's test now.
    
    if (recovered > 0) {
        currentCharges = Math.min(user.max_charges, currentCharges + recovered);
        await pgPool.query('UPDATE users SET last_charge_update = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
    }
    
    return { ...user, currentCharges };
}

// REST: Lazy Chunk Loading
app.get('/api/chunk/:x/:y', async (req, res) => {
    const { x, y } = req.params;
    const chunkKey = `chunk:${x}:${y}`;
    
    let buffer = await redisClient.getCommandOptions({ returnBuffers: true }).get(chunkKey);
    
    if (!buffer) {
        // If chunk is empty, just agree with it.
        buffer = Buffer.alloc(CHUNK_SIZE * CHUNK_SIZE, 0);
        await redisClient.set(chunkKey, buffer);
    }
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(buffer);
});

// REST: Shop
app.post('/api/shop/max-charges', async (req, res) => {
    const { userId } = req.body; // From JWT, but it's just test now
    const user = await getUserState(userId);
    
    if (user.droplets >= 500) {
        await pgPool.query('UPDATE users SET droplets = droplets - 500, max_charges = max_charges + 10 WHERE id = $1', [userId]);
        res.json({ success: true, message: "+10 Max Charges" });
    } else {
        res.status(400).json({ error: "Недостаточно капелек" });
    }
});

// WebSocket real-time render
io.on('connection', (socket) => {
    socket.on('place_pixel', async (data) => {
        const { userId, globalX, globalY, colorId } = data;
        
        // 1. Charges
        const user = await getUserState(userId);
        if (!user || user.currentCharges < 1) {
            socket.emit('error', 'Нет зарядов');
            return;
        }

        // 2. Global and local coordinates
        const chunkX = Math.floor(globalX / CHUNK_SIZE);
        const chunkY = Math.floor(globalY / CHUNK_SIZE);
        const localX = globalX % CHUNK_SIZE;
        const localY = globalY % CHUNK_SIZE;
        
        // 3. Pixel saving
        const offset = (localY * CHUNK_SIZE) + localX;
        const chunkKey = `chunk:${chunkX}:${chunkY}`;
        const colorBuffer = Buffer.from([colorId]);
        
        await redisClient.setRange(chunkKey, offset, colorBuffer);
        
        // 4. + Drops
        const xpThreshold = user.level * 1000; // Level formula
        let newLevel = user.level;
        let droplets = user.droplets + 2;
        
        if (droplets >= xpThreshold) {
            newLevel++;
            droplets += 1000; // Reward
            await pgPool.query('UPDATE users SET max_charges = max_charges + 2 WHERE id = $1', [userId]);
        }
        
        await pgPool.query('UPDATE users SET droplets = $1, level = $2 WHERE id = $3', [droplets, newLevel, userId]);
        
        // 5. Update
        io.emit('pixel_update', { globalX, globalY, colorId });
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
