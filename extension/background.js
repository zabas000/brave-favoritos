const API_URL = 'http://localhost:3000';

chrome.alarms.create('sync-check', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sync-check') {
    autoSync();
  }
});

async function autoSync() {
  const result = await chrome.storage.local.get('brave_fav_state');
  if (!result || !result.brave_fav_state || !result.brave_fav_state.token) return;

  const token = result.brave_fav_state.token;
  if (!token) return;

  try {
    const tree = await chrome.bookmarks.getTree();
    const bookmarks = flattenBookmarks(tree);

    const res = await fetch(`${API_URL}/api/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ bookmarks })
    });

    if (!res.ok) {
      console.error('Auto-sync failed:', await res.text());
    }
  } catch (err) {
    console.error('Auto-sync error:', err.message);
  }
}

function flattenBookmarks(nodes, parent) {
  let result = [];
  for (const node of nodes) {
    if (node.url) {
      result.push({
        title: node.title,
        url: node.url,
        parent: parent || 'Otros marcadores'
      });
    }
    if (node.children) {
      const folderName = node.title || 'Otros marcadores';
      result = result.concat(flattenBookmarks(node.children, folderName));
    }
  }
  return result;
}
