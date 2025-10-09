// pages/api/dex/kamiyo.js
export default async function handler(req, res) {
    const { pair } = req.query;

    try {
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate'); // Cache API response for 60s

        // Step 1: Attempt to fetch data from Moonshot API
        const moonshotResponse = await fetch(`https://api.moonshot.cc/pools/${pair}`);
        if (moonshotResponse.ok) {
            const moonshotData = await moonshotResponse.json();
            return res.status(200).json({ source: 'moonshot', data: moonshotData });
        }

        // Step 2: Fallback to Dexscreener if Moonshot data is unavailable
        const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${pair}`);
        if (dexResponse.ok) {
            const dexData = await dexResponse.json();
            return res.status(200).json({ source: 'dex', data: dexData });
        }

        res.status(404).json({ error: 'No data found for the specified pair' });
    } catch (error) {
        console.error('Error fetching data:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}