import RPC from "@hyperswarm/rpc";
import DHT from "hyperdht";
import crypto from "crypto";
import Hyperbee from "hyperbee"
import Hypercore from "hypercore";
import {
    generateECDHKeys,
    deriveSharedKey,
    encryptMessage,
    decryptMessage,
    signMessage,
    verifyMessage
} from './crypto-utils.js';
import fs from 'fs'

const clientId = crypto.randomBytes(16).toString('hex');

async function getServerPublicKey() {
    const core = new Hypercore("./db/rpc-client")
    const db = new Hyperbee(core, { keyEncoding: "utf-8", valueEncoding: "json" })
    await core.ready()

    let serverKeyEntry = await db.get("server-public-key")

    if (!serverKeyEntry) {
        if (!fs.existsSync('server-public-key.txt')) {
            console.error("Error: No stored public key found. Run the server first.")
            process.exit(1)
        }

        const fileKeyHex = fs.readFileSync('server-public-key.txt', 'utf8').trim()
        const serverPublicKey = fileKeyHex

        await core.close()
        return serverPublicKey
    }

    await core.close()
    return serverKeyEntry.value
}

async function connectToServer(serverPublicKey, options = {}) {
    const { retries = 3, retryDelay = 2000, bootstrapNodes = [] } = options;
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const dht = new DHT({ bootstrap: bootstrapNodes.length > 0 ? bootstrapNodes : undefined });
            await dht.ready();
            const seed = crypto.randomBytes(32);
            const rpc = new RPC({ dht, seed, timeout: 10000 });
            await new Promise(resolve => setTimeout(resolve, 2000));
            const serverKeyBuffer = Buffer.from(serverPublicKey, 'hex');
            const socket = rpc.connect(serverKeyBuffer, { timeout: 10000 });
            socket.on('error', (err) => console.error('Socket error:', err));
            socket.on('close', () => console.log('Socket closed'));


            const { ecdhInstance, publicKey: clientECDHPublicKey } = generateECDHKeys();

            const keyExchangeRequest = Buffer.from(JSON.stringify({
                clientId,
                clientPublicKey: clientECDHPublicKey
            }), 'utf-8');

            const keyExchangeResponse = await socket.request('exchangeKeys', keyExchangeRequest);
            const { serverPublicKey: serverECDHPublicKey, error } = JSON.parse(keyExchangeResponse.toString('utf-8'));

            if (error) {
                throw new Error(`Key exchange failed: ${error}`);
            }


            const sharedKey = deriveSharedKey(ecdhInstance, serverECDHPublicKey);
            console.log("Key exchange completed successfully");


            const pingRequest = Buffer.from(JSON.stringify({ message: 'ping' }), 'utf-8');
            const pingPromise = socket.request('ping', pingRequest);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Ping request timed out')), 10000));
            const pingResult = await Promise.race([pingPromise, timeoutPromise]);
            const pingResponse = JSON.parse(pingResult.toString('utf-8'));

            return { socket, rpc, dht, sharedKey, clientId };
        } catch (error) {
            lastError = error;
            if (attempt < retries) await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
    throw new Error(`Failed to connect after ${retries} attempts: ${lastError.message}`);
}

async function getLatestPrices(socket, sharedKey, clientId, pairs = []) {
    try {

        const requestData = JSON.stringify({ pairs });


        const encryptedData = encryptMessage(requestData, sharedKey);


        const signature = signMessage(encryptedData, sharedKey);

        const secureRequest = {
            clientId,
            encryptedData,
            signature
        };

        const requestBuffer = Buffer.from(JSON.stringify(secureRequest), 'utf-8');
        const response = await socket.request('getLatestPrices', requestBuffer);
        const secureResponse = JSON.parse(response.toString('utf-8'));

        if (secureResponse.error) {
            throw new Error(secureResponse.error);
        }

        const { encryptedData: encryptedResponse, signature: responseSignature } = secureResponse;


        if (!verifyMessage(encryptedResponse, responseSignature, sharedKey)) {
            throw new Error("Invalid server signature");
        }


        const decryptedResponse = decryptMessage(encryptedResponse, sharedKey);
        return JSON.parse(decryptedResponse);
    } catch (error) {
        throw error;
    }
}

async function getHistoricalPrices(socket, sharedKey, clientId, from, to, pairs = []) {
    try {

        const requestData = JSON.stringify({ pairs, from, to });

        const encryptedData = encryptMessage(requestData, sharedKey);

        const signature = signMessage(encryptedData, sharedKey);

        const secureRequest = {
            clientId,
            encryptedData,
            signature
        };

        const requestBuffer = Buffer.from(JSON.stringify(secureRequest), 'utf-8');
        const response = await socket.request('getHistoricalPrices', requestBuffer);
        const secureResponse = JSON.parse(response.toString('utf-8'));

        if (secureResponse.error) {
            throw new Error(secureResponse.error);
        }

        const { encryptedData: encryptedResponse, signature: responseSignature } = secureResponse;

        if (!verifyMessage(encryptedResponse, responseSignature, sharedKey)) {
            throw new Error("Invalid server signature");
        }

        const decryptedResponse = decryptMessage(encryptedResponse, sharedKey);
        return JSON.parse(decryptedResponse);
    } catch (error) {
        throw error;
    }
}

const main = async () => {
    try {
        const serverPublicKey = await getServerPublicKey()
        console.log("Retrieved server public key from Hyperbee:", serverPublicKey)

        const { socket, rpc, dht, sharedKey, clientId } = await connectToServer(serverPublicKey, {
            retries: 3,
            retryDelay: 3000,
            bootstrapNodes: []
        });

        console.log("Connected to server with secure channel established");

        const prices = await getLatestPrices(socket, sharedKey, clientId);
        console.log("Latest prices (securely retrieved):", prices);

        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        const historicalPrices = await getHistoricalPrices(socket, sharedKey, clientId, oneDayAgo, now);
        console.log("Historical prices (securely retrieved):", historicalPrices);

        socket.destroy();
        await rpc.destroy();
        await dht.destroy();
    } catch (error) {
        console.error("Error in main:", error.message);
    }
};

main();
export { connectToServer, getLatestPrices, getHistoricalPrices };