const API_URL = 'https://brave-favoritos.onrender.com'; // CAMBIA esto por tu URL de Render

chrome.alarms.create('sync', { periodInMinutes: 2880 }); // cada 2 días

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sync') autoSync();
});

async function autoSync() {
  const result = await chrome.storage.local.get('brave_fav_state');
  if (!result.brave_fav_state?.token) return;
  const token = result.brave_fav_state.token;

  try {
    const [cloudRes, localTree] = await Promise.all([
      fetch(`${API_URL}/api/bookmarks`, { headers: { 'Authorization': `Bearer ${token}` } }),
      chrome.bookmarks.getTree()
    ]);

    if (!cloudRes.ok) return;
    const cloudData = await cloudRes.json();
    const cloudBookmarks = cloudData.bookmarks || [];
    const localBookmarks = flattenBookmarks(localTree);

    const syncState = await chrome.storage.local.get('brave_sync_state');
    const lastSyncVersion = syncState.brave_sync_state?.version || 0;

    if (cloudData.version > lastSyncVersion && cloudBookmarks.length >= localBookmarks.length) {
      await restoreAll(cloudBookmarks);
      await chrome.storage.local.set({
        brave_sync_state: { version: cloudData.version, lastSync: Date.now() }
      });
    }

    const updatedTree = await chrome.bookmarks.getTree();
    const updatedLocal = flattenBookmarks(updatedTree);
    await fetch(`${API_URL}/api/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ bookmarks: updatedLocal })
    });
  } catch (err) {
    console.error('Auto-sync error:', err.message);
  }
}

async function restoreAll(bookmarks) {
  const roots = await chrome.bookmarks.getTree();
  const bookmarkBarId = roots[0].children[0]?.id || '1';
  const otherId = roots[0].children[1]?.id || '2';

  const existing = await chrome.bookmarks.getSubTree(bookmarkBarId);
  for (const child of (existing[0]?.children || [])) {
    try { await chrome.bookmarks.removeTree(child.id); } catch {}
  }
  const existing2 = await chrome.bookmarks.getSubTree(otherId);
  for (const child of (existing2[0]?.children || [])) {
    try { await chrome.bookmarks.removeTree(child.id); } catch {}
  }

  for (const bm of bookmarks) {
    const parent = bm.parent === 'Barra de favoritos' || bm.parent === '' ? bookmarkBarId : otherId;
    let folderId = parent;
    if (bm.parent && bm.parent !== 'Barra de favoritos' && bm.parent !== 'Otros marcadores' && bm.parent !== '') {
      const children = await chrome.bookmarks.getChildren(parent);
      let found = children.find(c => !c.url && c.title === bm.parent);
      if (found) {
        folderId = found.id;
      } else {
        const f = await chrome.bookmarks.create({ parentId: parent, title: bm.parent });
        folderId = f.id;
      }
    }
    await chrome.bookmarks.create({ parentId: folderId, title: bm.title || '', url: bm.url });
  }
}

function flattenBookmarks(nodes, parent) {
  let result = [];
  for (const node of nodes) {
    if (node.url) result.push({ title: node.title, url: node.url, parent: parent || '' });
    if (node.children) result = result.concat(flattenBookmarks(node.children, node.title || ''));
  }
  return result;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TRIGGER_SYNC') autoSync();
});

autoSync();
