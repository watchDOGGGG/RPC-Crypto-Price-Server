import axios from 'axios';

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
        const { data } = await axios.get(`https://api.coingecko.com/api/v3/coins/markets`, {
            params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: limit, page: 1 }
        });

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
        const { data } = await axios.get(`https://api.coingecko.com/api/v3/exchanges`, {
            params: { per_page: limit, page: 1 }
        });

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
    if (!cryptos?.length || !exchanges?.length) return {};

    const cacheKey = "cryptoPrices";
    let cachedData = await getFromCache(db, cacheKey);
    if (cachedData) return cachedData;

    console.log("Fetching crypto prices from top exchanges...");
    const prices = {};

    // Helper function for exponential backoff retry
    const fetchWithRetry = async (url, params, maxRetries = 3, initialDelay = 1000) => {
        let retries = 0;

        while (retries < maxRetries) {
            try {
                return await axios.get(url, { params });
            } catch (error) {
                retries++;

                // Check if it's a rate limit error (usually 429 status code)
                const isRateLimit = error.response?.status === 429;

                if (isRateLimit && retries < maxRetries) {
                    // Calculate exponential backoff delay
                    const delay = initialDelay * Math.pow(2, retries - 1);
                    console.log(`Rate limited. Retrying in ${delay}ms (attempt ${retries}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else if (retries >= maxRetries) {
                    console.error(`Max retries reached for ${url}`);
                    throw error;
                } else {
                    throw error;
                }
            }
        }
    };

    // Process each crypto in sequence to avoid overwhelming the API
    for (const crypto of cryptos) {
        try {
            let exchangePrices = [];

            // Process exchanges with a small delay between each
            for (const exchange of exchanges) {
                try {
                    const { data } = await fetchWithRetry(
                        `https://api.coingecko.com/api/v3/exchanges/${exchange.id}/tickers`,
                        { coin_ids: crypto.id, include_exchange_logo: false, depth: 1 }
                    );

                    if (!data.tickers?.length) {
                        console.warn(`No tickers found for ${crypto.id} on ${exchange.id}`);
                        continue;
                    }

                    const ticker = data.tickers.find(t => t.target === "USD") ||
                        data.tickers.find(t => t.target === "USDT") ||
                        data.tickers.find(t => t.target === "USDC");

                    if (ticker?.last) {
                        exchangePrices.push(ticker.last);
                        console.log(`Found price for ${crypto.id} on ${exchange.id}: ${ticker.last} ${ticker.target}`);
                    }

                    // Add a small delay between exchange requests to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 300));
                } catch (err) {
                    // More detailed error logging
                    const statusCode = err.response?.status;
                    const errorMessage = err.response?.data?.error || err.message;
                    console.error(`Error fetching ${crypto.id} price from ${exchange.id}: [${statusCode}] ${errorMessage}`);
                    // Continue with other exchanges despite this error
                }
            }

            if (exchangePrices.length > 0) {
                const avgPrice = exchangePrices.reduce((a, b) => a + b, 0) / exchangePrices.length;
                prices[crypto.id] = {
                    avgPrice,
                    sources: exchangePrices,
                    timestamp: Date.now()
                };
            } else {
                console.warn(`Could not find any prices for ${crypto.id} on any exchange`);
            }
        } catch (err) {
            console.error(`Failed to process crypto ${crypto.id}:`, err.message);
            // Continue with other cryptos despite this error
        }
    }

    // Only cache if we have data
    if (Object.keys(prices).length) {
        try {
            await storeInCache(db, cacheKey, prices);
        } catch (cacheErr) {
            console.error("Failed to store prices in cache:", cacheErr.message);
            // Continue despite cache error - returning the data is more important
        }
    } else {
        console.warn("No prices were fetched for any cryptocurrency");
    }

    return prices;
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
    try {
        for await (const { key, value } of db.createReadStream({
            gt: `prices:${from}`,
            lt: `prices:${to}`
        })) {
            historicalPrices[key] = JSON.parse(value);
        }
        return historicalPrices;
    } catch (err) {
        console.error("Error retrieving historical prices:", err);
        return {};
    }
}

