import fetch from 'node-fetch';

export async function getFromCache(db, key) {
    try {
        const entry = await db.get(key);
        return entry ? JSON.parse(entry.value) : null;
    } catch (error) {
        console.error(`Error getting from cache (${key}):`, error);
        return null;
    }
}

export async function storeInCache(db, key, value) {
    try {
        await db.put(key, JSON.stringify(value));
    } catch (err) {
        console.error(`Error storing in cache (${key}):`, err);
    }
}

export async function fetchTopCryptos(db, limit = 5) {
    const cacheKey = `topCryptos:${limit}`;
    let cachedData = await getFromCache(db, cacheKey);
    if (cachedData) return cachedData;

    try {
        console.log(`Fetching top ${limit} cryptocurrencies from CoinGecko`);
        const response = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1`);
        const data = await response.json();

        if (data.length) {
            await storeInCache(db, cacheKey, data);
        }
        return data;
    } catch (err) {
        console.error("Error fetching top cryptos:", err);
        return [];
    }
}

export async function fetchTopExchanges(db, limit = 3) {
    const cacheKey = `topExchanges:${limit}`;
    let cachedData = await getFromCache(db, cacheKey);
    if (cachedData) return cachedData;

    try {
        console.log(`Fetching top ${limit} exchanges from CoinGecko`);
        const response = await fetch(`https://api.coingecko.com/api/v3/exchanges?per_page=${limit}&page=1`);
        const data = await response.json();

        if (data.length) {
            await storeInCache(db, cacheKey, data);
        }
        return data;
    } catch (err) {
        console.error("Error fetching top exchanges:", err);
        return [];
    }
}

export async function fetchCryptoPrices(db, cryptos, exchanges) {
    if (!cryptos || cryptos.length === 0 || !exchanges || exchanges.length === 0) return {};

    const cacheKey = "cryptoPrices";
    let cachedData = await getFromCache(db, cacheKey);
    if (cachedData) return cachedData;

    try {
        console.log("Fetching crypto prices from top exchanges...");
        let prices = {};

        for (const crypto of cryptos) {
            let exchangePrices = [];
            for (const exchange of exchanges) {
                const response = await fetch(`https://api.coingecko.com/api/v3/exchanges/${exchange.id}/tickers?coin_ids=${crypto.id}&include_exchange_logo=false&depth=1`);
                const data = await response.json();
                const ticker = data.tickers.find(t => t.target === "USD");
                if (ticker) exchangePrices.push(ticker.last);
            }
            if (exchangePrices.length > 0) {
                const avgPrice = exchangePrices.reduce((a, b) => a + b, 0) / exchangePrices.length;
                prices[crypto.id] = { avgPrice, sources: exchangePrices };
            }
        }

        if (Object.keys(prices).length) {
            await storeInCache(db, cacheKey, prices);
        }
        return prices;
    } catch (err) {
        console.error("Error fetching crypto prices:", err);
        return {};
    }
}

export async function storeHistoricalPrices(db, prices) {
    const timestamp = Date.now();
    try {
        await db.put(`prices:${timestamp}`, JSON.stringify(prices));
        console.log("Stored historical prices at:", timestamp);
    } catch (err) {
        console.error("Error storing historical prices:", err);
    }
}

export async function getHistoricalPrices(db, from, to) {
    const historicalPrices = {};
    for await (const { key, value } of db.createReadStream({ gt: `prices:${from}`, lt: `prices:${to}` })) {
        historicalPrices[key] = JSON.parse(value);
    }
    return historicalPrices;
}
