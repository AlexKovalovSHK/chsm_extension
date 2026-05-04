importScripts('constants.js');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LOGIN') {
    handleLogin(message.payload).then(sendResponse);
    return true; // КРИТИЧНО: return true для async ответа
  }
  if (message.type === 'CHECK_AUTH') {
    handleCheckAuth().then(sendResponse);
    return true;
  }
  if (message.type === 'GET_USERS') {
    handleGetUsers(message.payload).then(sendResponse);
    return true;
  }
  if (message.type === 'GET_CLASSROOM_REPORT') {
    handleGetClassroomReport().then(sendResponse);
    return true;
  }
  if (message.type === 'BROADCAST_MESSAGE') {
    handleBroadcastMessage(message.payload).then(sendResponse);
    return true;
  }
});

async function handleLogin({ email, password }) {
  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (res.status === 401) {
      return { success: false, error: 'invalid_credentials' };
    }
    if (res.status === 400) {
      return { success: false, error: 'validation_error' };
    }
    if (!res.ok) {
      return { success: false, error: `http_${res.status}` };
    }

    const data = await res.json();
    const token = data.access_token || data.accessToken;

    if (!token) {
      return { success: false, error: 'network_error' };
    }

    await chrome.storage.local.set({ [STORAGE_KEY_TOKEN]: token });
    return { success: true };

  } catch (err) {
    return { success: false, error: 'network_error' };
  }
}

async function handleCheckAuth() {
  const data = await chrome.storage.local.get(STORAGE_KEY_TOKEN);
  const token = data[STORAGE_KEY_TOKEN];
  if (!token) return { success: false };

  try {
    const res = await fetch(`${BASE_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 401) {
      await chrome.storage.local.remove([STORAGE_KEY_TOKEN, STORAGE_KEY_USERS_CACHE, STORAGE_KEY_CLASSROOM_CACHE]);
      return { success: false };
    }
    if (!res.ok) {
      return { success: false };
    }
    const user = await res.json();
    return { success: true, user };
  } catch (err) {
    return { success: false };
  }
}

async function handleGetUsers({ search = '', status = '', role = '', forceRefresh = false } = {}) {
  const data = await chrome.storage.local.get([STORAGE_KEY_TOKEN, STORAGE_KEY_USERS_CACHE]);
  const token = data[STORAGE_KEY_TOKEN];
  
  if (!token) return { success: false, error: 'unauthorized' };

  // Return from cache if available and not forcing refresh (and no active search/filters)
  if (!forceRefresh && !search && !status && !role && data[STORAGE_KEY_USERS_CACHE]) {
    return { success: true, users: data[STORAGE_KEY_USERS_CACHE] };
  }

  const params = new URLSearchParams({ search, status, role });
  try {
    const res = await fetch(`${BASE_URL}/api/users?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 401) {
      await chrome.storage.local.remove([STORAGE_KEY_TOKEN, STORAGE_KEY_USERS_CACHE, STORAGE_KEY_CLASSROOM_CACHE]);
      return { success: false, error: 'unauthorized' };
    }

    if (!res.ok) {
      return { success: false, error: `http_${res.status}` };
    }

    const users = await res.json();
    
    // Save to cache if no search filters were applied
    if (!search && !status && !role) {
      await chrome.storage.local.set({ [STORAGE_KEY_USERS_CACHE]: users });
    }

    return { success: true, users };
  } catch (err) {
    return { success: false, error: 'network_error' };
  }
}

async function handleGetClassroomReport({ forceRefresh = false } = {}) {
  const data = await chrome.storage.local.get([STORAGE_KEY_TOKEN, STORAGE_KEY_CLASSROOM_CACHE]);
  const token = data[STORAGE_KEY_TOKEN];
  
  if (!token) return { success: false, error: 'unauthorized' };

  if (!forceRefresh && data[STORAGE_KEY_CLASSROOM_CACHE]) {
    return { success: true, data: data[STORAGE_KEY_CLASSROOM_CACHE] };
  }

  try {
    const res = await fetch(`${BASE_URL}/auth/admin/live-report`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 401) {
      await chrome.storage.local.remove([STORAGE_KEY_TOKEN, STORAGE_KEY_USERS_CACHE, STORAGE_KEY_CLASSROOM_CACHE]);
      return { success: false, error: 'unauthorized' };
    }

    if (!res.ok) {
      return { success: false, error: `http_${res.status}` };
    }

    const reportData = await res.json();
    await chrome.storage.local.set({ [STORAGE_KEY_CLASSROOM_CACHE]: reportData });
    return { success: true, data: reportData };
  } catch (err) {
    return { success: false, error: 'network_error' };
  }
}

async function handleBroadcastMessage(payload) {
  const data = await chrome.storage.local.get(STORAGE_KEY_TOKEN);
  const token = data[STORAGE_KEY_TOKEN];
  
  if (!token) return { success: false, error: 'unauthorized' };

  try {
    const res = await fetch(`${BASE_URL}/internal/users/broadcast-extension`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 401) {
      await chrome.storage.local.remove([STORAGE_KEY_TOKEN, STORAGE_KEY_USERS_CACHE, STORAGE_KEY_CLASSROOM_CACHE]);
      return { success: false, error: 'unauthorized' };
    }

    const resultText = await res.text();
    return { success: true, result: resultText };
  } catch (err) {
    return { success: false, error: 'network_error' };
  }
}
