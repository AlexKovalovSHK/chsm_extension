// ============================================================
// api.js — чистые HTTP-функции
// Все функции принимают token первым аргументом (кроме login)
// Возвращают Promise<Response> — нативный fetch-ответ
// НЕ трогают chrome.storage, chrome.runtime
// НЕ маппят ошибки в { success, error }
// НЕ кэшируют
// ============================================================

const X_ORG_ID = "9550e896-0f07-411f-aca4-c23d5a418720";

// Вспомогательная функция для формирования заголовков с x-org-id
function getHeaders(token = null, additionalHeaders = {}) {
  const headers = {
    "x-org-id": X_ORG_ID,
    ...additionalHeaders,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

self.api = {
  // ---- Auth ----

  async login(email, password) {
    return fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: getHeaders(null, { "Content-Type": "application/json" }),
      body: JSON.stringify({ email, password }),
    });
  },

  async me(token) {
    return fetch(`${BASE_URL}/api/users/me`, {
      headers: getHeaders(token),
    });
  },

  // ---- Users ----

  async getUsers(token, { search = "", status = "", role = "" } = {}) {
    const params = new URLSearchParams({ search, status, role });
    return fetch(`${BASE_URL}/api/users?${params}`, {
      headers: getHeaders(token),
    });
  },

  // ---- Classroom ----

  async getClassroomReport(token, { forceRefresh = false } = {}) {
    const url = new URL(`${BASE_URL}/auth/admin/live-report`);
    if (forceRefresh) url.searchParams.set("refresh", "true");
    return fetch(url.toString(), {
      headers: getHeaders(token),
    });
  },

  // ---- Session Runs ----

  async getSessionRuns(token) {
    return fetch(`${BASE_URL}/session-runs`, {
      headers: getHeaders(token, { "Content-Type": "application/json" }),
    });
  },

  async getSessionLevels(token) {
    return fetch(`${BASE_URL}/session-levels`, {
      headers: getHeaders(token, { "Content-Type": "application/json" }),
    });
  },

  async getAcademicYears(token) {
    return fetch(`${BASE_URL}/academic-years`, {
      headers: getHeaders(token, { "Content-Type": "application/json" }),
    });
  },

  async getSessionSubjects(token) {
    return fetch(`${BASE_URL}/subjects`, {
      headers: getHeaders(token, { "Content-Type": "application/json" }),
    });
  },

  async getEnrollments(token) {
    return fetch(`${BASE_URL}/enrollments`, {
      headers: getHeaders(token, { "Content-Type": "application/json" }),
    });
  },

  async getStudents(token) {
    return fetch(`${BASE_URL}/students`, {
      headers: getHeaders(token, { "Content-Type": "application/json" }),
    });
  },

  async updateSessionStatus(token, runId, status) {
    return fetch(
      `${BASE_URL}/session-runs/${encodeURIComponent(runId)}`,
      {
        method: "PATCH",
        headers: getHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      },
    );
  },

  // ---- Broadcast ----

  async broadcastExtension(token, payload) {
    return fetch(`${BASE_URL}/internal/users/broadcast-extension`, {
      method: "POST",
      headers: getHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
  },

  async broadcastTg(token, tgIds, text) {
    return fetch(`${BASE_URL}/internal/users/broadcast`, {
      method: "POST",
      headers: getHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ users: tgIds, text }),
    });
  },

  async broadcastEmail(token, emails, text) {
    return fetch(`${BASE_URL}/auth/broadcast-email`, {
      method: "POST",
      headers: getHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ users: emails, text }),
    });
  },
};
