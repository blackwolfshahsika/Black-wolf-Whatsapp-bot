const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");

const { upload } = require("./mega"); // Your mega upload function

const router = express.Router();

function removeFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { recursive: true, force: true });
  }
}

function randomMegaId(length = 6, numberLength = 4) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  const number = Math.floor(Math.random() * Math.pow(10, numberLength));
  return `${result}${number}`;
}

router.get("/", async (req, res) => {
  let num = req.query.number;
  if (!num) {
    return res.status(400).send({ error: "Missing 'number' query parameter" });
  }

  num = num.replace(/[^0-9]/g, ""); // sanitize number

  const sessionDir = path.join(__dirname, "session", num); // unique folder per number

  async function RobinPair() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    try {
      const RobinPairWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: Browsers.macOS("Safari"),
      });

      if (!RobinPairWeb.authState.creds.registered) {
        await delay(1500);
        const pairingCode = await RobinPairWeb.requestPairingCode(num);
        if (!res.headersSent) {
          res.json({ pairingCode });
        }
      }

      RobinPairWeb.ev.on("creds.update", saveCreds);

      RobinPairWeb.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
          try {
            await delay(10000);

            const user_jid = jidNormalizedUser(RobinPairWeb.user.id);
            const credsPath = path.join(sessionDir, "creds.json");

            if (!fs.existsSync(credsPath)) throw new Error("creds.json not found");

            // Upload creds.json to Mega.nz with random filename
            const mega_url = await upload(fs.createReadStream(credsPath), `${randomMegaId()}.json`);

            const string_session = mega_url.replace("https://mega.nz/file/", "");

            // Prepare formatted message with session id and contact link
            const contactNumber = "94776907496";

            const sid = `┏━━━◥◣◆◢◤━━━━┓
           Black wolf ﮩ٨ـﮩﮩ٨ـsl bot
       ╰┈➤ ❝ [powered by Shashika]

┗━━━◢◤◆◥◣━━━━┛


°•.•╔✿════๏⊙๏════✿╗•.•°
💀 *Session ID* 💀
.•°•.•. .•.•°•.
🖇️ This is your session id 🖇️
📍 Copy this id 👉 paste into config.js file 📍

*${string_session}*

.•°•╚✿════๏⊙๏════✿╝•°•.

╔════▣◎▣════╗
Contact us ~
╚════▣◎▣════╝

👉 https://wa.me/${contactNumber}

°•.•╔✿════๏⊙๏════✿╗•.•°

Thank you for joining  
*Black Wolf*  
✿༻༺✿·.━⋅━⋅━╯
`;

            const mg = `🛑 *Do not share this code with anyone* 🛑`;

            const imageMessage = {
              image: {
                url: "https://raw.githubusercontent.com/blackwolfshahsika/Black-wolf-Whatsapp-bot/main/IMG-20250803-WA0027.jpg",
              },
              caption: sid,
            };

            // Send formatted image + session ID message + warning
            await RobinPairWeb.sendMessage(user_jid, imageMessage);
            await RobinPairWeb.sendMessage(user_jid, { text: mg });

            // Clean up session folder after short delay
            await delay(500);
            removeFile(sessionDir);

            // Optionally: close socket connection gracefully
            await RobinPairWeb.logout();
          } catch (error) {
            console.error("Error after connection open:", error);
            exec("pm2 restart prabath");
          }
        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode !== 401
        ) {
          console.log("Connection closed unexpectedly, retrying...");
          await delay(10000);
          RobinPair();
        }
      });
    } catch (err) {
      console.error("Error in RobinPair:", err);
      exec("pm2 restart Robin-md");
      if (!res.headersSent) {
        res.status(503).json({ error: "Service Unavailable" });
      }
      removeFile(sessionDir);
    }
  }

  return RobinPair();
});

process.on("uncaughtException", function (err) {
  console.error("Caught exception:", err);
  exec("pm2 restart Robin");
});

module.exports = router;
  
