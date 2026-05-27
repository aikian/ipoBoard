export const store = {
  ipos: [],
  subscriptions: [],
  alerts: [],
  favorites: new Set(),
  lastSyncedAt: null
};

export function upsertIpos(nextIpos) {
  const byKey = new Map(store.ipos.map((ipo) => [String(ipo.no38 || ipo.detailUrl || ipo.name), ipo]));

  for (const ipo of nextIpos) {
    const key = String(ipo.no38 || ipo.detailUrl || ipo.name);
    byKey.set(key, {
      ...byKey.get(key),
      ...ipo,
      updatedAt: new Date().toISOString()
    });
  }

  store.ipos = Array.from(byKey.values()).sort((a, b) => {
    const aDate = a.subscriptionStart || a.listingDate || '9999-12-31';
    const bDate = b.subscriptionStart || b.listingDate || '9999-12-31';
    return String(aDate).localeCompare(String(bDate));
  });

  store.lastSyncedAt = new Date().toISOString();
  return store.ipos;
}

export function getIpos() {
  return store.ipos;
}

export function addSubscription(subscription) {
  const exists = store.subscriptions.some((item) => item.endpoint === subscription.endpoint);
  if (!exists) store.subscriptions.push(subscription);
  return store.subscriptions.length;
}

export function toggleFavorite(no38) {
  const key = String(no38);
  if (store.favorites.has(key)) {
    store.favorites.delete(key);
    return false;
  }
  store.favorites.add(key);
  return true;
}

export function isFavorite(no38) {
  return store.favorites.has(String(no38));
}
