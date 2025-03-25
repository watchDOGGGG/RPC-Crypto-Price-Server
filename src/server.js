import Hyperswarm from 'hyperswarm';
import Crypto from 'crypto';
import DHT from 'hyperdht';
import Hypercore from 'hypercore';
import Hyperbee from 'hyperbee';
import cron from 'node-cron';
import { fetchTopCryptos, fetchTopExchanges, fetchCryptoPrices, storeHistoricalPrices, getHistoricalPrices } from './utils.js';
import {
    generateECDHKeys,
    generateSigningKeys,
    createSecureMessage,
    encryptForPeer,
    processSecureMessage,
    decryptMessage,
} from "./crypto-utils.js";

const SERVICE_NAME = "server-service";
const DISCOVERY_TOPIC = "global-discovery-v1";


const dht = new DHT();
const swarm = new Hyperswarm();
const topicHash = Crypto.createHash('sha256').update(DISCOVERY_TOPIC).digest();

const { publicKey, privateKey, ecdh } = generateECDHKeys()
const { publicKey: signPublicKey, privateKey: signPrivateKey } = generateSigningKeys()

const core = new Hypercore('./db');
const db = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'json' });
await core.ready();
console.log("Hyperbee storage initialized.");

async function startServer() {
    console.log(`[${SERVICE_NAME}] Starting server...`);

    const server = dht.createServer(async (socket) => {
        console.log(`[${SERVICE_NAME}] Incoming DHT connection`);

        socket.on('data', async (data) => {
            const decryptedMessage = decryptMessage(data, privateKey);
            if (!decryptedMessage) return;

            const { type, payload } = processSecureMessage(decryptedMessage, signPublicKey);
            console.log(`[${SERVICE_NAME}] Received:`, type, payload);

            if (type === "getLatestPrices") {
                const prices = await fetchAndStorePrices();
                const secureResponse = createSecureMessage({ type: "prices", data: prices }, signPrivateKey);
                const encryptedResponse = encryptForPeer(secureResponse, publicKey);
                socket.write(encryptedResponse);
            } else if (type === "getHistoricalPrices") {
                const { from, to } = payload;
                const historicalPrices = await getHistoricalPrices(db, Number(from), Number(to));
                const secureResponse = createSecureMessage({ type: "historical", data: historicalPrices }, signPrivateKey);
                const encryptedResponse = encryptForPeer(secureResponse, publicKey);
                socket.write(encryptedResponse);
            }
        });
    });

    await server.listen();
    await dht.announce(topicHash, server.address());
    console.log(`[${SERVICE_NAME}] Announced on DHT topic:`, topicHash.toString('hex'));

    swarm.join(topicHash, { lookup: true, announce: true });
    await swarm.flush();
    console.log(`[${SERVICE_NAME}] Hyperswarm listening on topic:`, topicHash.toString('hex'));

    swarm.on("connection", (socket) => {
        console.log(`[${SERVICE_NAME}] Connected to a peer via Hyperswarm!`);

        socket.on("data", async (data) => {
            const decryptedMessage = decryptMessage(data, privateKey);
            if (!decryptedMessage) return;

            const { type, payload } = processSecureMessage(decryptedMessage, signPublicKey);
            console.log(`[${SERVICE_NAME}] Received from peer:`, type, payload);

            if (type === "getLatestPrices") {
                const prices = await fetchAndStorePrices();
                const secureResponse = createSecureMessage({ type: "prices", data: prices }, signPrivateKey);
                const encryptedResponse = encryptForPeer(secureResponse, publicKey);
                socket.write(encryptedResponse);
            } else if (type === "getHistoricalPrices") {
                const { from, to } = payload;
                const historicalPrices = await getHistoricalPrices(db, Number(from), Number(to));
                const secureResponse = createSecureMessage({ type: "historical", data: historicalPrices }, signPrivateKey);
                const encryptedResponse = encryptForPeer(secureResponse, publicKey);
                socket.write(encryptedResponse);
            }
        });

        socket.on("error", err => console.log(`[${SERVICE_NAME}] Hyperswarm error`, err));
        socket.on("close", () => console.log(`[${SERVICE_NAME}] Peer disconnected`));
    });
}

async function fetchAndStorePrices() {
    console.log("[CRON] Fetching latest crypto prices...");
    const topCryptos = await fetchTopCryptos(db);
    const topExchanges = await fetchTopExchanges(db);
    const prices = await fetchCryptoPrices(db, topCryptos, topExchanges);

    await storeHistoricalPrices(db, prices);
    console.log("[CRON] Prices updated:", prices);
    return prices;
}

cron.schedule("*/30 * * * * *", fetchAndStorePrices);

startServer();

async function cleanup() {
    console.log("\nShutting down server...");
    await swarm.leave(topicHash);
    await swarm.destroy();
    console.log("Server disconnected from all peers");
    process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
