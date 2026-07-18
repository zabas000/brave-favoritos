const API_URL = 'https://brave-favoritos.onrender.com'; // CAMBIA esto por tu URL de Render

let state = {
  token: null,
  email: null
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('register-fields').classList.add('hidden');
  loadState();

  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const isLogin = t.dataset.tab === 'login';
      document.getElementById('login-fields').classList.toggle('hidden', !isLogin);
      document.getElementById('register-fields').classList.toggle('hidden', isLogin);
      document.getElementById('auth-btn').textContent = isLogin ? 'Iniciar Sesión' : 'Registrarse';
      document.getElementById('error-msg').textContent = '';
    });
  });

  document.getElementById('auth-form').addEventListener('submit', handleAuth);
  document.getElementById('sync-up-btn').addEventListener('click', syncUp);
  document.getElementById('sync-down-btn').addEventListener('click', syncDown);
  document.getElementById('logout-btn').addEventListener('click', logout);
});

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
    } catch (err) {
      errorEl.textContent = err.message;
    }
  }
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
    } else {
      document.getElementById('cloud-count').textContent = '0';
    }
  } catch {
    document.getElementById('cloud-count').textContent = '?';
  }
}

function setStatus(msg, type) {
  const el = document.getElementById('sync-status');
  el.textContent = msg;
  el.className = 'status' + (type ? ' ' + type : '');
}

function disableButtons(disabled) {
  document.getElementById('sync-up-btn').disabled = disabled;
  document.getElementById('sync-down-btn').disabled = disabled;
}

function showMainView() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('main-view').classList.remove('hidden');
  document.getElementById('user-email').textContent = state.email;
  updateCounts();
  loadCloudCount();
}

function logout() {
  state.token = null;
  state.email = null;
  chrome.storage.local.remove('brave_fav_state');
  document.getElementById('main-view').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
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
      document.getElementById('login-view').classList.remove('hidden');
    }
  });
}
