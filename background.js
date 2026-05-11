importScripts("constants.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LOGIN") {
    handleLogin(message.payload).then(sendResponse);
    return true; // КРИТИЧНО: return true для async ответа
  }
  if (message.type === "CHECK_AUTH") {
    handleCheckAuth().then(sendResponse);
    return true;
  }
  if (message.type === "GET_USERS") {
    handleGetUsers(message.payload).then(sendResponse);
    return true;
  }
  if (message.type === "GET_CLASSROOM_REPORT") {
    handleGetClassroomReport(message.payload).then(sendResponse);
    return true;
  }
  if (message.type === "BROADCAST_MESSAGE") {
    handleBroadcastMessage(message.payload).then(sendResponse);
    return true;
  }

  // === Session API handlers ===
  if (message.type === "GET_SESSION_RUNS") {
    handleGetSessionRuns().then(sendResponse);
    return true;
  }
  if (message.type === "GET_SESSION_LEVELS") {
    handleGetSessionLevels().then(sendResponse);
    return true;
  }
  if (message.type === "GET_ACADEMIC_YEARS") {
    handleGetAcademicYears().then(sendResponse);
    return true;
  }
  if (message.type === "GET_SESSION_SUBJECTS") {
    handleGetSessionSubjects(message.payload).then(sendResponse);
    return true;
  }
  if (message.type === "GET_ENROLLMENTS") {
    handleGetEnrollments(message.payload).then(sendResponse);
    return true;
  }
  if (message.type === "GET_STUDENTS") {
    handleGetStudents().then(sendResponse);
    return true;
  }
  if (message.type === "UPDATE_SESSION_STATUS") {
    handleUpdateSessionStatus(message.payload).then(sendResponse);
    return true;
  }
  if (message.type === "SEND_SESSION_BROADCAST") {
    handleSessionBroadcast(message.payload).then(sendResponse);
    return true;
  }
});

async function handleLogin({ email, password }) {
  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (res.status === 401) {
      return { success: false, error: "invalid_credentials" };
    }
    if (res.status === 400) {
      return { success: false, error: "validation_error" };
    }
    if (!res.ok) {
      return { success: false, error: `http_${res.status}` };
    }

    const data = await res.json();
    const token = data.access_token || data.accessToken;

    if (!token) {
      return { success: false, error: "network_error" };
    }

    await chrome.storage.local.set({ [STORAGE_KEY_TOKEN]: token });
    return { success: true };
  } catch (err) {
    return { success: false, error: "network_error" };
  }
}

async function handleCheckAuth() {
  const data = await chrome.storage.local.get(STORAGE_KEY_TOKEN);
  const token = data[STORAGE_KEY_TOKEN];
  if (!token) return { success: false };

  try {
    const res = await fetch(`${BASE_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      await chrome.storage.local.remove([
        STORAGE_KEY_TOKEN,
        STORAGE_KEY_USERS_CACHE,
      ]);
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

async function handleGetUsers({
  search = "",
  status = "",
  role = "",
  forceRefresh = false,
} = {}) {
  const data = await chrome.storage.local.get([
    STORAGE_KEY_TOKEN,
    STORAGE_KEY_USERS_CACHE,
  ]);
  const token = data[STORAGE_KEY_TOKEN];

  if (!token) return { success: false, error: "unauthorized" };

  // Return from cache if available and not forcing refresh (and no active search/filters)
  if (
    !forceRefresh &&
    !search &&
    !status &&
    !role &&
    data[STORAGE_KEY_USERS_CACHE]
  ) {
    return { success: true, users: data[STORAGE_KEY_USERS_CACHE] };
  }

  const params = new URLSearchParams({ search, status, role });
  try {
    const res = await fetch(`${BASE_URL}/api/users?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      await chrome.storage.local.remove([
        STORAGE_KEY_TOKEN,
        STORAGE_KEY_USERS_CACHE,
      ]);
      return { success: false, error: "unauthorized" };
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
    return { success: false, error: "network_error" };
  }
}

async function handleGetClassroomReport({ forceRefresh = false } = {}) {
  const data = await chrome.storage.local.get(STORAGE_KEY_TOKEN);
  const token = data[STORAGE_KEY_TOKEN];

  if (!token) return { success: false, error: "unauthorized" };

  try {
    const url = new URL(`${BASE_URL}/auth/admin/live-report`);
    if (forceRefresh) {
      url.searchParams.set("refresh", "true");
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      await chrome.storage.local.remove([
        STORAGE_KEY_TOKEN,
        STORAGE_KEY_USERS_CACHE,
      ]);
      return { success: false, error: "unauthorized" };
    }

    if (!res.ok) {
      return { success: false, error: `http_${res.status}` };
    }

    const reportData = await res.json();
    // reportData format: { fetchedAt, totalCourses, courses, fromCache }
    return { success: true, data: reportData };
  } catch (err) {
    return { success: false, error: "network_error" };
  }
}

// ============================================================
// Session API Handlers
// ============================================================

async function apiFetch(url, options = {}) {
  const data = await chrome.storage.local.get(STORAGE_KEY_TOKEN);
  const token = data[STORAGE_KEY_TOKEN];
  if (!token) return { success: false, error: "unauthorized" };

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (res.status === 401) {
      await chrome.storage.local.remove([
        STORAGE_KEY_TOKEN,
        STORAGE_KEY_USERS_CACHE,
      ]);
      return { success: false, error: "unauthorized" };
    }

    if (!res.ok) {
      return { success: false, error: `http_${res.status}` };
    }

    const responseData = await res.json();
    return { success: true, data: responseData };
  } catch (err) {
    return { success: false, error: "network_error" };
  }
}

async function handleGetSessionRuns() {
  return apiFetch(`${BASE_URL}/session-runs`);
}

async function handleGetSessionLevels() {
  return apiFetch(`${BASE_URL}/session-levels`);
}

async function handleGetAcademicYears() {
  return apiFetch(`${BASE_URL}/academic-years`);
}

async function handleGetSessionSubjects() {
  return apiFetch(`${BASE_URL}/subjects`);
}

async function handleGetEnrollments() {
  return apiFetch(`${BASE_URL}/enrollments`);
}

async function handleGetStudents() {
  return apiFetch(`${BASE_URL}/students`);
}

async function handleUpdateSessionStatus({ runId, status }) {
  return apiFetch(`${BASE_URL}/session-runs/${encodeURIComponent(runId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// ============================================================
// Broadcast
// ============================================================

async function handleBroadcastMessage(payload) {
  const data = await chrome.storage.local.get(STORAGE_KEY_TOKEN);
  const token = data[STORAGE_KEY_TOKEN];

  if (!token) return { success: false, error: "unauthorized" };

  try {
    const res = await fetch(`${BASE_URL}/internal/users/broadcast-extension`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      await chrome.storage.local.remove([
        STORAGE_KEY_TOKEN,
        STORAGE_KEY_USERS_CACHE,
      ]);
      return { success: false, error: "unauthorized" };
    }

    const resultText = await res.text();
    return { success: true, result: resultText };
  } catch (err) {
    return { success: false, error: "network_error" };
  }
}

async function handleSessionBroadcast(payload) {
  const data = await chrome.storage.local.get(STORAGE_KEY_TOKEN);
  const token = data[STORAGE_KEY_TOKEN];
  if (!token) return { success: false, error: "unauthorized" };

  const { users, text, method } = payload;
  const errors = [];
  let results = [];

  try {
    if (method === "tg" || method === "both") {
      // Send via Telegram by tgId
      const tgIds = users.filter((u) => u.tgId).map((u) => u.tgId);
      if (tgIds.length > 0) {
        const res = await fetch(`${BASE_URL}/internal/users/broadcast`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ users: tgIds, text }),
        });
        if (!res.ok) errors.push(`tg: http_${res.status}`);
        else results.push("tg:ok");
      }
    }

    if (method === "email" || method === "both") {
      // Send via Email
      const emails = users.filter((u) => u.email).map((u) => u.email);
      if (emails.length > 0) {
        const res = await fetch(`${BASE_URL}/auth/broadcast-email`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ users: emails, text }),
        });
        if (!res.ok) errors.push(`email: http_${res.status}`);
        else results.push("email:ok");
      }
    }

    if (results.length === 0 && errors.length === 0) {
      return { success: false, error: "no_recipients" };
    }
    if (errors.length > 0) {
      return { success: false, error: errors.join("; ") };
    }
    return { success: true, result: results.join("; ") };
  } catch (err) {
    return { success: false, error: "network_error" };
  }
}
