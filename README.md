# 🗣️ Foro en vivo

Web app for phones (iOS and Android, no install) for a forum:

- Each person opens the link, types their name and picks **👍 A favor** or **👎 En contra**.
- Both groups show up **in real time** on every phone, with counts and a balance bar.
- **✋ Alzar la mano** gives that person the floor for **20 seconds**, and everyone sees who is speaking with a countdown. When time runs out (or they tap "ceder la palabra"), someone else can raise their hand.

## Link (GitHub Pages)

**https://jpm144.github.io/aw/**

- Separate rooms for different forums: `https://jpm144.github.io/aw/?sala=forum2`
- Real-time sync uses a free public MQTT broker (EMQX, with HiveMQ and Mosquitto as fallbacks). It needs no account or server of your own.
- Turn the link into a QR code and put it on screen for people to join.

## Local version with your own server (optional)

Requires Node.js 18+. No dependencies to install.

```bash
node server.js
```

The console shows a link like `http://192.168.1.20:3000`. Share it (or turn it into a QR code) and anyone on the same WiFi can join.

## Deploy it online (public link)

The repo includes `render.yaml`. In [Render](https://render.com) choose **New → Blueprint**, select this repository, and you get a public URL `https://foro-en-vivo-xxxx.onrender.com`.
