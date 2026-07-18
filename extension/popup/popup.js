const API_URL = 'https://brave-favoritos.onrender.com'; // CAMBIA esto por tu URL de Render

let state = {
  token: null,
  email: null
};

console.log('Popup iniciado');

document.getElementById('register-fields').classList.add('off');
loadState();

const tabs = document.querySelectorAll('.tab');
tabs.forEach(t => {
  t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const isLogin = t.dataset.tab === 'login';
    document.getElementById('login-fields').classList.toggle('off', !isLogin);
    document.getElementById('register-fields').classList.toggle('off', isLogin);
    document.getElementById('auth-btn').textContent = isLogin ? 'Entrar' : 'Crear cuenta';
    document.getElementById('error-msg').textContent = '';
    console.log('Tab cambiado a:', t.dataset.tab);
  });
});

document.getElementById('auth-form').addEventListener('submit', (e) => {
  console.log('Form submit detectado');
  handleAuth(e);
});
document.getElementById('sync-up-btn').addEventListener('click', syncUp);
document.getElementById('sync-down-btn').addEventListener('click', syncDown);
document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('show-list-btn').addEventListener('click', toggleBookmarkList);

async function handleAuth(e) {
  e.preventDefault();
  const errorEl = document.getElementById('error-msg');
  errorEl.textContent = '';

  const isLogin = document.querySelector('.tab.active').dataset.tab === 'login';

  if (isLogin) {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if (!email || !password) {
      errorEl.textContent = 'Completa todos los campos';
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      state.token = data.token;
      state.email = data.email;
      saveState();
      showMainView();
      triggerAutoSync();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  } else {
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    if (!email || !password || !confirm) {
      errorEl.textContent = 'Completa todos los campos';
      return;
    }
    if (password !== confirm) {
      errorEl.textContent = 'Las contraseñas no coinciden';
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      state.token = data.token;
      state.email = data.email;
      saveState();
      showMainView();
      triggerAutoSync();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  }
}

function triggerAutoSync() {
  chrome.runtime.sendMessage({ type: 'TRIGGER_SYNC' });
}

async function syncUp() {
  setStatus('Subiendo marcadores...', 'loading');
  disableButtons(true);
  try {
    const tree = await chrome.bookmarks.getTree();
    const bookmarks = flattenBookmarks(tree);
    const res = await fetch(`${API_URL}/api/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ bookmarks })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    updateCloudCount(bookmarks.length);
    setStatus(`${bookmarks.length} marcadores subidos correctamente`, 'success');
    cachedBookmarks = null;
    document.getElementById('show-list-btn').classList.remove('off');
  } catch (err) {
    setStatus('Error: ' + err.message, 'error');
  }
  disableButtons(false);
}

async function syncDown() {
  setStatus('Descargando marcadores...', 'loading');
  disableButtons(true);
  try {
    const res = await fetch(`${API_URL}/api/bookmarks`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (!data.bookmarks || data.bookmarks.length === 0) {
      setStatus('No hay marcadores en la nube', 'error');
      disableButtons(false);
      return;
    }
    const confirmReplace = confirm(
      `Se descargarán ${data.bookmarks.length} marcadores.\n` +
      '¿Reemplazar todos tus marcadores actuales?'
    );
    if (!confirmReplace) {
      setStatus('Operación cancelada', '');
      disableButtons(false);
      return;
    }
    await chrome.bookmarks.removeTree('1');
    for (const bm of data.bookmarks) {
      await restoreBookmark(bm, '1');
    }
    setStatus(`${data.bookmarks.length} marcadores restaurados`, 'success');
    updateCloudCount(data.bookmarks.length);
    cachedBookmarks = null;
  } catch (err) {
    setStatus('Error: ' + err.message, 'error');
  }
  disableButtons(false);
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

async function restoreBookmark(bm, parentId) {
  let folderId = parentId;
  if (bm.parent && bm.parent !== '' && bm.parent !== 'Otros marcadores') {
    const folders = await chrome.bookmarks.getSubTree(parentId);
    let found = false;
    if (folders[0] && folders[0].children) {
      for (const child of folders[0].children) {
        if (!child.url && child.title === bm.parent) {
          folderId = child.id;
          found = true;
          break;
        }
      }
    }
    if (!found) {
      const newFolder = await chrome.bookmarks.create({
        parentId,
        title: bm.parent
      });
      folderId = newFolder.id;
    }
  }
  await chrome.bookmarks.create({
    parentId: folderId,
    title: bm.title || 'Sin título',
    url: bm.url
  });
}

async function updateCounts() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const flat = flattenBookmarks(tree);
    document.getElementById('local-count').textContent = flat.length;
  } catch {
    document.getElementById('local-count').textContent = '?';
  }
}

async function updateCloudCount(count) {
  document.getElementById('cloud-count').textContent = count;
}

async function loadCloudCount() {
  try {
    const res = await fetch(`${API_URL}/api/bookmarks`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (res.ok && data.bookmarks) {
      document.getElementById('cloud-count').textContent = data.bookmarks.length;
      if (data.bookmarks.length > 0) {
        document.getElementById('show-list-btn').classList.remove('off');
      } else {
        document.getElementById('show-list-btn').classList.add('off');
      }
    } else {
      document.getElementById('cloud-count').textContent = '0';
      document.getElementById('show-list-btn').classList.add('off');
    }
  } catch {
    document.getElementById('cloud-count').textContent = '?';
  }
}

let cachedBookmarks = null;

async function toggleBookmarkList() {
  const list = document.getElementById('bookmark-list');
  const btn = document.getElementById('show-list-btn');
  const arrow = btn.querySelector('.arrow');

  if (list.classList.contains('off')) {
    list.classList.remove('off');
    arrow.classList.add('open');
    btn.querySelector('span').textContent = 'Ocultar marcadores';
    if (!cachedBookmarks) {
      await fetchAndRenderBookmarks();
    }
  } else {
    list.classList.add('off');
    arrow.classList.remove('open');
    btn.querySelector('span').textContent = 'Mostrar marcadores';
  }
}

async function fetchAndRenderBookmarks() {
  const container = document.getElementById('list-items');
  const count = document.getElementById('list-count');
  container.innerHTML = '<div class="list-item" style="justify-content:center;color:#888">Cargando...</div>';
  try {
    const res = await fetch(`${API_URL}/api/bookmarks`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    cachedBookmarks = data.bookmarks || [];
    renderBookmarkList(cachedBookmarks);
  } catch (err) {
    container.innerHTML = `<div class="list-item" style="justify-content:center;color:#ff3b30">Error: ${err.message}</div>`;
  }
}

function renderBookmarkList(bookmarks) {
  const container = document.getElementById('list-items');
  const count = document.getElementById('list-count');
  count.textContent = bookmarks.length;

  if (bookmarks.length === 0) {
    container.innerHTML = '<div class="list-item" style="justify-content:center;color:#888">Sin marcadores</div>';
    return;
  }

  const folders = {};
  for (const bm of bookmarks) {
    const folder = bm.parent || 'Sin carpeta';
    if (!folders[folder]) folders[folder] = [];
    folders[folder].push(bm);
  }

  let html = '';
  for (const [folder, items] of Object.entries(folders)) {
    html += `<div class="list-item" style="font-weight:600;color:#888;font-size:11px;padding:6px 14px 2px">${folder}</div>`;
    for (const bm of items) {
      const host = bm.url ? bm.url.replace('https://','').replace('http://','').split('/')[0] : '?';
      const letter = (bm.title || '?')[0].toUpperCase();
      html += `
        <a class="list-item" href="${bm.url}" title="${bm.title}">
          <div class="favicon">${letter}</div>
          <span class="title">${bm.title || 'Sin título'}</span>
          <span class="url">${host}</span>
        </a>`;
    }
  }
  container.innerHTML = html;

  container.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: a.href });
    });
  });
}

function setStatus(msg, type) {
  const el = document.getElementById('sync-status');
  el.textContent = msg;
  if (type) {
    el.className = 'status ' + type;
  } else {
    el.className = 'status off';
  }
}

function disableButtons(disabled) {
  document.getElementById('sync-up-btn').disabled = disabled;
  document.getElementById('sync-down-btn').disabled = disabled;
}

function showMainView() {
  document.getElementById('login-view').classList.add('off');
  document.getElementById('main-view').classList.remove('off');
  document.getElementById('user-email').textContent = state.email;
  updateCounts();
  loadCloudCount();
}

function logout() {
  state.token = null;
  state.email = null;
  chrome.storage.local.remove('brave_fav_state');
  document.getElementById('main-view').classList.add('off');
  document.getElementById('login-view').classList.remove('off');
  document.getElementById('email').value = '';
  document.getElementById('password').value = '';
  document.getElementById('reg-email').value = '';
  document.getElementById('reg-password').value = '';
  document.getElementById('reg-confirm').value = '';
}

function saveState() {
  chrome.storage.local.set({ brave_fav_state: { token: state.token, email: state.email } });
}

function loadState() {
  chrome.storage.local.get('brave_fav_state', (result) => {
    if (result && result.brave_fav_state && result.brave_fav_state.token) {
      state.token = result.brave_fav_state.token;
      state.email = result.brave_fav_state.email;
      showMainView();
    } else {
      document.getElementById('login-view').classList.remove('off');
    }
  });
}
