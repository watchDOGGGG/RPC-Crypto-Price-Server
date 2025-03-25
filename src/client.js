import Hyperswarm from 'hyperswarm';
import Crypto from 'crypto';
import DHT from 'hyperdht';
import {
    generateECDHKeys,
    generateSigningKeys,
    deriveSharedSecret,
    createSecureMessage,
    encryptForPeer,
    processSecureMessage,
    decryptMessage,
} from "./crypto-utils.js";

const SERVICE_NAME = "client-service";
const DISCOVERY_TOPIC = "global-discovery-v1";

// Initialize DHT & Hyperswarm
const dht = new DHT();
const swarm = new Hyperswarm();
const topicHash = Crypto.createHash('sha256').update(DISCOVERY_TOPIC).digest();

const { publicKey, privateKey, ecdh } = generateECDHKeys();
const { publicKey: signPublicKey, privateKey: signPrivateKey } = generateSigningKeys();

async function startClient() {
    console.log(`[${SERVICE_NAME}] Starting client...`);

    // Connect to a DHT peer
    const socket = dht.connect(topicHash);
    socket.on('open', () => {
        console.log(`[${SERVICE_NAME}] Connected to server via DHT!`);

        setTimeout(() => {
            console.log("Requesting latest prices...");
            const secureMessage = createSecureMessage({ type: "getLatestPrices" }, signPrivateKey);
            const encryptedMessage = encryptForPeer(secureMessage, publicKey);
            socket.write(encryptedMessage);

            const from = Date.now() - 3600000; // 1 hour ago
            const to = Date.now();
            console.log("Requesting historical prices...");
            const secureHistoryMessage = createSecureMessage({ type: "getHistoricalPrices", from, to }, signPrivateKey);
            const encryptedHistoryMessage = encryptForPeer(secureHistoryMessage, publicKey);
            socket.write(encryptedHistoryMessage);
        }, 2000); // Wait 2 seconds before sending
    });

    socket.on("data", (data) => {
        const decryptedMessage = decryptMessage(data, privateKey);
        if (!decryptedMessage) return;

        const { type, payload } = processSecureMessage(decryptedMessage, signPublicKey);
        console.log(`[${SERVICE_NAME}] Received:`, type, payload);
    });

    socket.on("error", (err) => console.log(`[${SERVICE_NAME}] DHT error:`, err));
    socket.on("close", () => console.log(`[${SERVICE_NAME}] Connection closed`));

    // Connect via Hyperswarm
    swarm.join(topicHash, { lookup: true, announce: false });
    await swarm.flush();
    console.log(`[${SERVICE_NAME}] Looking for peers on Hyperswarm...`);

    swarm.on("connection", (peer) => {
        console.log(`[${SERVICE_NAME}] Connected to a peer via Hyperswarm!`);

        setTimeout(() => {
            console.log("Requesting latest prices...");
            const secureMessage = createSecureMessage({ type: "getLatestPrices" }, signPrivateKey);
            const encryptedMessage = encryptForPeer(secureMessage, publicKey);
            peer.write(encryptedMessage);

            const from = Date.now() - 3600000;
            const to = Date.now();
            console.log("Requesting historical prices...");
            const secureHistoryMessage = createSecureMessage({ type: "getHistoricalPrices", from, to }, signPrivateKey);
            const encryptedHistoryMessage = encryptForPeer(secureHistoryMessage, publicKey);
            peer.write(encryptedHistoryMessage);
        }, 2000);

        peer.on("data", (data) => {
            const decryptedMessage = decryptMessage(data, privateKey);
            if (!decryptedMessage) return;

            const { type, payload } = processSecureMessage(decryptedMessage, signPublicKey);
            console.log(`[${SERVICE_NAME}] Received from peer:`, type, payload);
        });

        peer.on("error", err => console.log(`[${SERVICE_NAME}] Peer error:`, err));
        peer.on("close", () => console.log(`[${SERVICE_NAME}] Peer disconnected`));
    });
}

// Start Client
startClient();
