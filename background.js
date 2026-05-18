importScripts("constants.js");
importScripts("api.js");

// ============================================================
// background.js — тонкий роутер
// Получает token из storage → вызывает чистую функцию из api.js
// → маппит ошибки → отправляет ответ
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = HANDLERS[message.type];
  if (!handler) {
    sendResponse({ success: false, error: "unknown_type" });
    return;
  }
  handler(message.payload).then(sendResponse);
  return true;
});

// ---- Утилита: DI токена + обработка 401 ----
async function withToken(apiCall) {
  const { [STORAGE_KEY_TOKEN]: token } =
    await chrome.storage.local.get(STORAGE_KEY_TOKEN);
  if (!token) return { success: false, error: "unauthorized" };

  try {
    const res = await apiCall(token);
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
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: "network_error" };
  }
}

// ---- Message Handler Map ----
const HANDLERS = {
  // LOGIN — особый случай: без токена, сохраняет токен в storage
  async LOGIN({ email, password }) {
    try {
      const res = await api.login(email, password);
      if (res.status === 401)
        return { success: false, error: "invalid_credentials" };
      if (res.status === 400)
        return { success: false, error: "validation_error" };
      if (!res.ok) return { success: false, error: `http_${res.status}` };
      const data = await res.json();
      const token = data.access_token || data.accessToken;
      if (!token) return { success: false, error: "network_error" };
      await chrome.storage.local.set({ [STORAGE_KEY_TOKEN]: token });
      return { success: true };
    } catch {
      return { success: false, error: "network_error" };
    }
  },

  CHECK_AUTH() {
    return withToken((token) => api.me(token));
  },

  // GET_USERS — с кэшированием (бизнес-логика)
  async GET_USERS({
    search = "",
    status = "",
    role = "",
    forceRefresh = false,
  }) {
    const data = await chrome.storage.local.get([
      STORAGE_KEY_TOKEN,
      STORAGE_KEY_USERS_CACHE,
    ]);
    const token = data[STORAGE_KEY_TOKEN];
    if (!token) return { success: false, error: "unauthorized" };

    // Кэш: возвращаем, если нет фильтров и не forceRefresh
    if (
      !forceRefresh &&
      !search &&
      !status &&
      !role &&
      data[STORAGE_KEY_USERS_CACHE]
    ) {
      return { success: true, data: data[STORAGE_KEY_USERS_CACHE] };
    }

    try {
      const res = await api.getUsers(token, { search, status, role });
      if (res.status === 401) {
        await chrome.storage.local.remove([
          STORAGE_KEY_TOKEN,
          STORAGE_KEY_USERS_CACHE,
        ]);
        return { success: false, error: "unauthorized" };
      }
      if (!res.ok) return { success: false, error: `http_${res.status}` };

      const users = await res.json();

      // Сохраняем в кэш, если без фильтров
      if (!search && !status && !role) {
        await chrome.storage.local.set({ [STORAGE_KEY_USERS_CACHE]: users });
      }

      return { success: true, data: users };
    } catch {
      return { success: false, error: "network_error" };
    }
  },

  GET_CLASSROOM_REPORT({ forceRefresh }) {
    return withToken((token) =>
      api.getClassroomReport(token, { forceRefresh }),
    );
  },

  GET_SESSION_RUNS() {
    return withToken(api.getSessionRuns);
  },

  GET_SESSION_LEVELS() {
    return withToken(api.getSessionLevels);
  },

  GET_ACADEMIC_YEARS() {
    return withToken(api.getAcademicYears);
  },

  GET_SESSION_SUBJECTS() {
    return withToken(api.getSessionSubjects);
  },

  GET_ENROLLMENTS() {
    return withToken(api.getEnrollments);
  },

  GET_STUDENTS() {
    return withToken(api.getStudents);
  },

  UPDATE_SESSION_STATUS({ runId, status }) {
    return withToken((token) => api.updateSessionStatus(token, runId, status));
  },

  // BROADCAST_MESSAGE — текстовый ответ, не JSON
  async BROADCAST_MESSAGE(payload) {
    const { [STORAGE_KEY_TOKEN]: token } =
      await chrome.storage.local.get(STORAGE_KEY_TOKEN);
    if (!token) return { success: false, error: "unauthorized" };

    try {
      const res = await api.broadcastExtension(token, payload);
      if (res.status === 401) {
        await chrome.storage.local.remove([
          STORAGE_KEY_TOKEN,
          STORAGE_KEY_USERS_CACHE,
        ]);
        return { success: false, error: "unauthorized" };
      }
      const resultText = await res.text();
      return { success: true, data: resultText };
    } catch {
      return { success: false, error: "network_error" };
    }
  },

  // SEND_SESSION_BROADCAST — оркестрация TG + Email
  async SEND_SESSION_BROADCAST({ users, text, method }) {
    const { [STORAGE_KEY_TOKEN]: token } =
      await chrome.storage.local.get(STORAGE_KEY_TOKEN);
    if (!token) return { success: false, error: "unauthorized" };

    const errors = [];
    const results = [];

    try {
      if (method === "tg" || method === "both") {
        const tgIds = users.filter((u) => u.tgId).map((u) => u.tgId);
        if (tgIds.length > 0) {
          const res = await api.broadcastTg(token, tgIds, text);
          if (!res.ok) errors.push(`tg: http_${res.status}`);
          else results.push("tg:ok");
        }
      }

      if (method === "email" || method === "both") {
        const emails = users.filter((u) => u.email).map((u) => u.email);
        if (emails.length > 0) {
          const res = await api.broadcastEmail(token, emails, text);
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
      return { success: true, data: results.join("; ") };
    } catch {
      return { success: false, error: "network_error" };
    }
  },
};
