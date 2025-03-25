import Hypercore from "hypercore";
import Hyperbee from "hyperbee";
import fs from "fs";


const feed = new Hypercore("./crypto-data", { valueEncoding: "json" });
const db = new Hyperbee(feed, { keyEncoding: "utf-8", valueEncoding: "json" });

async function initializeStorage() {
    await db.ready();
    console.log("Hyperbee storage initialized.");
}

async function storePrices(data) {
    const timestamp = Date.now();
    for (const [crypto, priceData] of Object.entries(data)) {
        await db.put(`${crypto}:${timestamp}`, priceData);
    }
}

async function getLatestPrices(pairs) {
    let results = {};
    for (const pair of pairs) {
        for await (const { key, value } of db.createReadStream({ reverse: true })) {
            if (key.startsWith(pair)) {
                results[pair] = value;
                break;
            }
        }
    }
    return results;
}

async function getHistoricalPrices(pairs, from, to) {
    let results = {};
    for (const pair of pairs) {
        let history = [];
        for await (const { key, value } of db.createReadStream()) {
            const [, timestamp] = key.split(":");
            if (timestamp >= from && timestamp <= to) history.push(value);
        }
        results[pair] = history;
    }
    return results;
}

export { initializeStorage, storePrices, getLatestPrices, getHistoricalPrices };
