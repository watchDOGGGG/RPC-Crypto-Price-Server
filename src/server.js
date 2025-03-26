import crypto from 'crypto';
import DHT from 'hyperdht';
import RPC from '@hyperswarm/rpc';
import Hypercore from 'hypercore';
import Hyperbee from 'hyperbee';
import cron from 'node-cron';
import {
    fetchTopCryptos,
    fetchTopExchanges,
    fetchCryptoPrices,
    storeHistoricalPrices,
    getHistoricalPrices
} from './utils.js';
import {
    generateECDHKeys,
    deriveSharedKey,
    encryptMessage,
    decryptMessage,
    signMessage,
    verifyMessage
} from './crypto-utils.js';

const SERVICE_NAME = "crypto-price-service";
const BOOTSTRAP_NODES = [
    '88.99.3.86@node1.hyperdht.org:49737',
    '142.93.90.113@node2.hyperdht.org:49737',
    '138.68.147.8@node3.hyperdht.org:49737'
];

const clientKeys = new Map();

// Initialize storage
const core = new Hypercore('./db');
const db = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'json' });
await core.ready();
console.log("Hyperbee storage initialized.");

async function startServer() {
    console.log(`[${SERVICE_NAME}] Starting server...`);

    let dhtSeed;
    const dhtSeedEntry = await db.get("dht-seed");
    if (!dhtSeedEntry) {
        dhtSeed = crypto.randomBytes(32);
        await db.put("dht-seed", dhtSeed);
        console.log(`[${SERVICE_NAME}] Generated new DHT seed`);
    } else {
        dhtSeed = Buffer.from(dhtSeedEntry.value);
    }

    const keyPair = DHT.keyPair(dhtSeed);
    const dht = new DHT({
        keyPair,
        bootstrap: BOOTSTRAP_NODES
    });
    await dht.ready();
    console.log(`[${SERVICE_NAME}] DHT initialized with bootstrap nodes:`, BOOTSTRAP_NODES);

    const server = dht.createServer();
    await server.listen();
    console.log(`[${SERVICE_NAME}] Server announced on DHT with key: ${keyPair.publicKey.toString("hex")}`);

    let rpcSeed;
    const rpcSeedEntry = await db.get("rpc-seed");
    if (!rpcSeedEntry) {
        rpcSeed = crypto.randomBytes(32);
        await db.put("rpc-seed", rpcSeed);
        console.log(`[${SERVICE_NAME}] Generated new RPC seed`);
    } else {
        rpcSeed = Buffer.from(rpcSeedEntry.value);
    }

    const rpc = new RPC({ seed: rpcSeed, dht });
    const rpcServer = rpc.createServer();
    await rpcServer.listen();

    const publicKeyHex = rpcServer.publicKey.toString("hex");
    console.log(`[${SERVICE_NAME}] RPC server listening on public key: ${publicKeyHex}`);
    await db.put("server-public-key", publicKeyHex);

    const { ecdhInstance, publicKey: serverECDHPublicKey } = generateECDHKeys();
    console.log(`[${SERVICE_NAME}] Server ECDH public key: ${serverECDHPublicKey}`);

    rpcServer.respond("exchangeKeys", async (reqRaw) => {
        try {
            const req = JSON.parse(reqRaw.toString("utf-8"));
            const { clientId, clientPublicKey } = req;

            if (!clientId || !clientPublicKey) {
                return Buffer.from(JSON.stringify({ error: "Invalid request" }), "utf-8");
            }

            const sharedKey = deriveSharedKey(ecdhInstance, clientPublicKey);

            clientKeys.set(clientId, {
                clientPublicKey,
                sharedKey
            });

            console.log(`[${SERVICE_NAME}] Key exchange completed with client: ${clientId}`);

            return Buffer.from(JSON.stringify({
                serverPublicKey: serverECDHPublicKey
            }), "utf-8");
        } catch (error) {
            console.error(`[${SERVICE_NAME}] Error in key exchange:`, error);
            return Buffer.from(JSON.stringify({ error: error.message }), "utf-8");
        }
    });

    rpcServer.respond("getLatestPrices", async (reqRaw) => {
        console.log(`[${SERVICE_NAME}] Received getLatestPrices request`);
        try {
            const encryptedReq = JSON.parse(reqRaw.toString("utf-8"));
            const { clientId, encryptedData, signature } = encryptedReq;

            const clientInfo = clientKeys.get(clientId);
            if (!clientInfo) {
                return Buffer.from(JSON.stringify({ error: "Client not authenticated" }), "utf-8");
            }

            if (!verifyMessage(encryptedData, signature, clientInfo.sharedKey)) {
                return Buffer.from(JSON.stringify({ error: "Invalid signature" }), "utf-8");
            }

            const decryptedReq = decryptMessage(encryptedData, clientInfo.sharedKey);
            const req = JSON.parse(decryptedReq);

            const { pairs = [] } = req;
            const prices = await fetchAndStorePrices();
            let result = prices;
            if (pairs.length > 0) {
                result = Object.fromEntries(
                    Object.entries(prices).filter(([id, _]) =>
                        pairs.some(pair => id.toLowerCase().includes(pair.toLowerCase()))
                    )
                );
            }

            const responseData = JSON.stringify({
                timestamp: Date.now(),
                data: result
            });

            const encryptedResponse = encryptMessage(responseData, clientInfo.sharedKey);

            const responseSignature = signMessage(encryptedResponse, clientInfo.sharedKey);

            return Buffer.from(JSON.stringify({
                encryptedData: encryptedResponse,
                signature: responseSignature
            }), "utf-8");
        } catch (error) {
            console.error(`[${SERVICE_NAME}] Error processing getLatestPrices:`, error);
            return Buffer.from(JSON.stringify({ error: error.message }), "utf-8");
        }
    });

    rpcServer.respond("getHistoricalPrices", async (reqRaw) => {
        console.log(`[${SERVICE_NAME}] Received getHistoricalPrices request`);
        try {
            const encryptedReq = JSON.parse(reqRaw.toString("utf-8"));
            const { clientId, encryptedData, signature } = encryptedReq;

            const clientInfo = clientKeys.get(clientId);
            if (!clientInfo) {
                return Buffer.from(JSON.stringify({ error: "Client not authenticated" }), "utf-8");
            }

            if (!verifyMessage(encryptedData, signature, clientInfo.sharedKey)) {
                return Buffer.from(JSON.stringify({ error: "Invalid signature" }), "utf-8");
            }

            const decryptedReq = decryptMessage(encryptedData, clientInfo.sharedKey);
            const req = JSON.parse(decryptedReq);

            const { from, to, pairs = [] } = req;
            const historicalPrices = await getHistoricalPrices(db, from, to, pairs);

            const responseData = JSON.stringify({
                timestamp: Date.now(),
                data: historicalPrices
            });

            const encryptedResponse = encryptMessage(responseData, clientInfo.sharedKey);

            const responseSignature = signMessage(encryptedResponse, clientInfo.sharedKey);

            return Buffer.from(JSON.stringify({
                encryptedData: encryptedResponse,
                signature: responseSignature
            }), "utf-8");
        } catch (error) {
            console.error(`[${SERVICE_NAME}] Error processing getHistoricalPrices:`, error);
            return Buffer.from(JSON.stringify({ error: error.message }), "utf-8");
        }
    });

    rpcServer.respond("ping", async () => {
        console.log(`[${SERVICE_NAME}] Ping request received`);
        return Buffer.from(JSON.stringify({ pong: true, timestamp: Date.now(), service: SERVICE_NAME }), "utf-8");
    });
}

async function fetchAndStorePrices() {
    console.log("[CRON] Fetching latest crypto prices...");
    try {
        const topCryptos = await fetchTopCryptos(db);
        const topExchanges = await fetchTopExchanges(db);
        const prices = await fetchCryptoPrices(db, topCryptos, topExchanges);
        await storeHistoricalPrices(db, prices);
        console.log(`[CRON] Prices updated for ${Object.keys(prices).length} cryptos`);
        return prices;
    } catch (error) {
        console.error("[CRON] Error fetching prices:", error);
        const cachedData = await db.get("cryptoPrices");
        return cachedData?.value ? JSON.parse(cachedData.value) : {};
    }
}

cron.schedule("*/30 * * * * *", fetchAndStorePrices);
startServer().catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
});

async function cleanup() {
    console.log("\nShutting down server...");
    try {
        await core.close();
        console.log("Database closed");
        process.exit(0);
    } catch (error) {
        console.error("Error during shutdown:", error);
        process.exit(1);
    }
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);