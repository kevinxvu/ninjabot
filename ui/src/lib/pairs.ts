export const QUOTE_ASSETS = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'BTC', 'ETH', 'BNB', 'TRY', 'EUR', 'BRL'];

/** Best-effort split of a Binance symbol into base/quote when the API has no info. */
export function splitPair(pair: string) {
  const quote = QUOTE_ASSETS.find((asset) => pair.endsWith(asset) && pair !== asset) ?? 'USDT';
  return {
    asset: pair.endsWith(quote) ? pair.slice(0, -quote.length) : pair,
    quote,
  };
}

/** "BTCUSDT, ETHUSDT," → ["BTCUSDT", "ETHUSDT"] */
export function parsePairList(value: string) {
  return value
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean);
}

/** Case-insensitive prefix search with exact matches first. */
export function filterPairs(pairs: string[], search: string) {
  const term = search.trim().toLowerCase();
  if (!term) return pairs;
  return pairs
    .filter((pair) => pair.toLowerCase().startsWith(term))
    .sort((a, b) => {
      if (a.toLowerCase() === term) return -1;
      if (b.toLowerCase() === term) return 1;
      return a.localeCompare(b);
    });
}

export function coinIconUrl(asset: string) {
  return `https://assets.coincap.io/assets/icons/${asset.toLowerCase()}@2x.png`;
}
