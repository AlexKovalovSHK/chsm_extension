let allUsers = [];
let classroomUsersMap = {}; // email.toLowerCase() -> { tgId, firstName, lastName, email }

function applyUsersFilter() {
  const searchVal = document
    .getElementById("users-search")
    .value.trim()
    .toLowerCase();
  const roleVal = document.querySelector(
    'input[name="users-role-filter"]:checked',
  );
  const role = roleVal ? roleVal.value : "";

  let filtered = allUsers;

  if (role) {
    filtered = filtered.filter((u) => u.role === role);
  }

  if (searchVal) {
    filtered = filtered.filter((u) => {
      const fullName = [u.firstName, u.lastName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const email = (u.email || "").toLowerCase();
      const username = (u.username || "").toLowerCase();
      return (
        fullName.includes(searchVal) ||
        email.includes(searchVal) ||
        username.includes(searchVal)
      );
    });
  }

  return filtered;
}

function setGlobalLoading(isLoading) {
  const el = document.getElementById("global-loading");
  if (isLoading) {
    el.classList.remove("d-none");
  } else {
    el.classList.add("d-none");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkAuth();
});

async function checkAuth() {
  setGlobalLoading(true);
  const response = await chrome.runtime.sendMessage({ type: "CHECK_AUTH" });
  setGlobalLoading(false);

  if (response && response.success) {
    showAuthenticated(response.user);
    loadClassroom(); // Default active tab is now Classroom
  } else {
    showUnauthenticated();
  }
}

function showUnauthenticated() {
  document.getElementById("auth-login").classList.remove("d-none");
  document.getElementById("auth-active").classList.add("d-none");
  document.getElementById("main-content").classList.add("d-none");
  classroomUsersMap = {}; // сброс кэша Classroom
}

function showAuthenticated(user) {
  document.getElementById("auth-login").classList.add("d-none");
  document.getElementById("auth-active").classList.remove("d-none");
  document.getElementById("main-content").classList.remove("d-none");

  document.getElementById("active-email").value =
    user.email || user.username || "User";
}

const formLogin = document.getElementById("form-login");
const btnLogin = document.getElementById("btn-login");
const loginError = document.getElementById("login-error");

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("input-email").value;
  const password = document.getElementById("input-password").value;

  btnLogin.disabled = true;
  btnLogin.innerHTML =
    '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Вход...';
  loginError.classList.add("d-none");

  const response = await chrome.runtime.sendMessage({
    type: "LOGIN",
    payload: { email, password },
  });

  btnLogin.disabled = false;
  btnLogin.textContent = "Login";

  if (response && response.success) {
    checkAuth();
  } else {
    loginError.classList.remove("d-none");
    if (response && response.error === "invalid_credentials") {
      loginError.textContent = "Неверный логин или пароль";
    } else if (response && response.error === "validation_error") {
      loginError.textContent = "Заполните все поля";
    } else if (response && response.error === "network_error") {
      loginError.textContent = "Нет соединения с сервером";
    } else {
      loginError.textContent = "Ошибка сервера. Попробуйте позже";
    }
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await chrome.storage.local.remove(["chsm_token", "chsm_users_cache"]);
  classroomUsersMap = {}; // сброс кэша Classroom
  checkAuth();
});

document.getElementById("btn-refresh").addEventListener("click", () => {
  const activeTab = document.querySelector(".nav-link.active").id;
  if (activeTab === "users-tab") {
    loadUsers(true);
  } else if (activeTab === "classroom-tab") {
    loadClassroom(true);
  } else if (activeTab === "sessions-tab") {
    loadSessions(true);
  }
});

document
  .getElementById("classroom-tab")
  .addEventListener("shown.bs.tab", () => {
    loadClassroom();
  });

document.getElementById("users-tab").addEventListener("shown.bs.tab", () => {
  loadUsers();
});

document.getElementById("sessions-tab").addEventListener("shown.bs.tab", () => {
  loadSessions();
});

async function loadUsers(forceRefresh = false) {
  const usersLoading = document.getElementById("users-loading");
  const usersError = document.getElementById("users-error");
  const usersEmpty = document.getElementById("users-empty");
  const usersList = document.getElementById("users-list");
  const globalStatus = document.getElementById("global-status");

  usersLoading.classList.remove("d-none");
  usersError.classList.add("d-none");
  usersEmpty.classList.add("d-none");
  usersList.innerHTML = "";
  if (globalStatus)
    globalStatus.textContent = forceRefresh ? "Обновление..." : "Загрузка...";

  const response = await chrome.runtime.sendMessage({
    type: "GET_USERS",
    payload: { search: "", status: "", role: "", forceRefresh },
  });

  usersLoading.classList.add("d-none");

  if (!response || !response.success) {
    if (response && response.error === "unauthorized") {
      checkAuth(); // token expired
    } else {
      usersError.classList.remove("d-none");
      usersError.textContent = "Ошибка загрузки пользователей";
    }
    return;
  }

  allUsers = response.users || [];

  if (allUsers.length === 0) {
    usersEmpty.classList.remove("d-none");
    if (globalStatus) globalStatus.textContent = "Нет пользователей";
    return;
  }

  renderFilteredUsers(globalStatus);
}

function renderFilteredUsers(globalStatus) {
  const filtered = applyUsersFilter();
  const usersList = document.getElementById("users-list");
  const usersEmpty = document.getElementById("users-empty");

  if (globalStatus)
    globalStatus.textContent = `Всего: ${allUsers.length}${filtered.length < allUsers.length ? ` (показано ${filtered.length})` : ""}`;

  usersList.innerHTML = `
    <div class="p-2 border-bottom bg-light">
      <div class="d-flex justify-content-between align-items-center">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="users-select-all">
          <label class="form-check-label small" for="users-select-all" style="cursor:pointer;">Выбрать всех</label>
        </div>
        <div class="d-flex align-items-center gap-1" style="font-size:0.7rem;">
          <span class="text-muted">Доставка:</span>
          <div class="btn-group btn-group-sm" role="group">
            <input type="checkbox" class="btn-check users-delivery-check" id="users-del-tg" data-method="tg" autocomplete="off">
            <label class="btn btn-outline-secondary py-0 px-1" for="users-del-tg" style="font-size:0.7rem;">TG</label>
            <input type="checkbox" class="btn-check users-delivery-check" id="users-del-email" data-method="email" autocomplete="off">
            <label class="btn btn-outline-secondary py-0 px-1" for="users-del-email" style="font-size:0.7rem;">Email</label>
          </div>
        </div>
      </div>
    </div>
    <div style="max-height:280px;overflow-y:auto;">
      ${
        filtered.length === 0
          ? '<div class="text-center text-muted py-4 small">Нет пользователей по заданным фильтрам</div>'
          : filtered
              .map((user) => {
                const fullName =
                  [user.firstName, user.lastName].filter(Boolean).join(" ") ||
                  user.username ||
                  "Без имени";
                const roleClasses = {
                  admin: "bg-danger",
                  teacher: "bg-warning text-dark",
                  student: "bg-primary",
                };
                const roleBadge = `<span class="badge ${roleClasses[user.role] || "bg-secondary"}">${user.role || "user"}</span>`;
                const tgId = user.tgId || "";
                const email = user.email || "";

                return `
        <div class="list-group-item list-group-item-action user-card d-flex align-items-center p-2">
          <div class="form-check d-flex align-items-center w-100" style="gap:0.5rem;">
            <input class="form-check-input users-student-checkbox" type="checkbox"
                   data-email="${email}"
                   data-tg-id="${tgId}"
                   id="ucheck-${user.id}">
            <label class="form-check-label flex-grow-1" for="ucheck-${user.id}" style="cursor:pointer;">
              <div class="d-flex justify-content-between align-items-center">
                <div class="fw-semibold text-truncate small">${fullName}</div>
                ${roleBadge}
              </div>
              <div class="d-flex align-items-center gap-1">
                <span class="text-muted text-truncate" style="font-size:0.75rem;">${email || "—"}</span>
                ${email ? `<button class="btn-copy-email btn btn-sm p-0 border-0 text-secondary" style="font-size:0.7rem;line-height:1;flex-shrink:0;" data-email="${email}" title="Копировать email">📋</button>` : ""}
              </div>
            </label>
          </div>
        </div>
      `;
              })
              .join("")
      }
    </div>
    <div class="p-2 border-top bg-light">
      <textarea class="form-control form-control-sm mb-2 users-broadcast-text" rows="2" placeholder="Введите сообщение..."></textarea>
      <button class="btn btn-primary btn-sm w-100 btn-users-send-broadcast">Send</button>
    </div>
  `;
}

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ============================================================
// Classroom — обогащение студентов tgId через матчинг по email
// ============================================================

async function ensureClassroomUsersLoaded(forceRefresh = false) {
  if (!forceRefresh && Object.keys(classroomUsersMap).length > 0) return;

  const response = await chrome.runtime.sendMessage({
    type: "GET_USERS",
    payload: { search: "", status: "", role: "", forceRefresh },
  });

  if (!response || !response.success) return;

  const users = response.users || [];
  classroomUsersMap = {};
  users.forEach((user) => {
    if (user.email) {
      classroomUsersMap[user.email.toLowerCase()] = {
        tgId: user.tgId || "",
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email,
      };
    }
  });
}

function enrichStudentsWithTg(students) {
  return students.map((student) => {
    if (!student.email) return { ...student, tgId: "" };
    const matchedUser = classroomUsersMap[student.email.toLowerCase()];
    return {
      ...student,
      tgId: matchedUser?.tgId || "",
    };
  });
}

async function loadClassroom(forceRefresh = false) {
  const loading = document.getElementById("classroom-loading");
  const error = document.getElementById("classroom-error");
  const empty = document.getElementById("classroom-empty");
  const list = document.getElementById("classroom-list");
  const globalStatus = document.getElementById("global-status");

  loading.classList.remove("d-none");
  error.classList.add("d-none");
  empty.classList.add("d-none");
  list.innerHTML = "";
  if (globalStatus)
    globalStatus.textContent = forceRefresh ? "Обновление..." : "Загрузка...";

  // === Обогащение: загружаем пользователей для матчинга по email ===
  await ensureClassroomUsersLoaded(forceRefresh);

  const response = await chrome.runtime.sendMessage({
    type: "GET_CLASSROOM_REPORT",
    payload: { forceRefresh },
  });
  loading.classList.add("d-none");

  if (!response || !response.success) {
    error.classList.remove("d-none");
    if (response && response.error === "unauthorized") {
      checkAuth();
      return;
    }
    error.textContent = "Ошибка загрузки данных Classroom";
    if (globalStatus) globalStatus.textContent = "Ошибка";
    return;
  }

  let {
    courses = [],
    fromCache = false,
    fetchedAt = null,
  } = response.data || {};

  // === Обогащение: добавляем tgId к каждому студенту ===
  courses = courses.map((course) => ({
    ...course,
    students: enrichStudentsWithTg(course.students || []),
  }));

  if (globalStatus) {
    if (fromCache && fetchedAt) {
      globalStatus.textContent = `Курсов: ${courses.length} (из кэша ${formatTime(fetchedAt)})`;
    } else {
      globalStatus.textContent = `Курсов: ${courses.length} (обновлено сейчас)`;
    }
  }

  if (courses.length === 0) {
    empty.classList.remove("d-none");
    return;
  }

  renderClassroom(courses);
}

function renderClassroom(courses) {
  const list = document.getElementById("classroom-list");
  list.innerHTML = courses
    .map((course, index) => {
      const studentCount = course.students ? course.students.length : 0;
      const teacherNames = course.teachers
        ? course.teachers.map((t) => t.name).join(", ")
        : "—";
      const collapseId = `course-collapse-${course.id || index}`;

      const studentsHtml = course.students
        ? course.students
            .map((student) => {
              const hasTelegram = !!student.tgId;
              return `
      <div class="list-group-item d-flex align-items-center bg-transparent border-0 py-1 px-1">
        <div class="form-check d-flex align-items-center w-100">
          <input class="form-check-input me-2 student-checkbox" type="checkbox"
                 data-student-id="${student.id}"
                 data-name="${student.name}"
                 data-email="${student.email}"
                 data-tg-id="${student.tgId || ""}">
          <label class="form-check-label small text-truncate" style="cursor: pointer;">
            <span class="fw-semibold">${student.name}</span>
            <br>
            <span class="text-muted" style="font-size: 0.7rem;">${student.email}</span>
          </label>
        </div>
        <span class="tg-dot ${hasTelegram ? "active" : "inactive"}" title="${hasTelegram ? "Есть Telegram" : "Нет Telegram"}"></span>
      </div>
    `;
            })
            .join("")
        : '<div class="small text-muted p-2">Нет студентов</div>';

      return `
      <div class="list-group-item p-0 border-bottom">
        <!-- Course Header (Clickable) -->
        <div class="p-2 d-flex justify-content-between align-items-center"
             style="cursor: pointer;"
             data-bs-toggle="collapse"
             data-bs-target="#${collapseId}">
          <div class="flex-grow-1 overflow-hidden">
            <div class="fw-bold text-truncate" style="font-size: 0.9rem;" title="${course.name}">${course.name}</div>
            <div class="text-muted text-truncate" style="font-size: 0.75rem;">${teacherNames}</div>
          </div>
          <div class="d-flex align-items-center">
            <span class="badge bg-info text-dark me-2">${studentCount}</span>
            <span class="small text-muted">▼</span>
          </div>
        </div>

        <!-- Collapsible Students List -->
        <div class="collapse" id="${collapseId}" data-course-name="${course.name}">
          <div class="p-2 bg-light border-top">
            <!-- Select All + Delivery method -->
            <div class="d-flex justify-content-between align-items-center mb-2 px-1">
              <div class="form-check">
                <input class="form-check-input select-all-checkbox" type="checkbox" id="select-all-${collapseId}" data-target="${collapseId}">
                <label class="form-check-label small" for="select-all-${collapseId}" style="cursor: pointer;">Выбрать всех</label>
              </div>
              <div class="d-flex align-items-center gap-1" style="font-size:0.7rem;">
                <span class="text-muted">Доставка:</span>
                <div class="btn-group btn-group-sm" role="group">
                  <input type="checkbox" class="btn-check classroom-delivery-check" id="del-tg-${collapseId}" data-method="tg" autocomplete="off">
                  <label class="btn btn-outline-secondary py-0 px-1" for="del-tg-${collapseId}" style="font-size:0.7rem;">TG</label>
                  <input type="checkbox" class="btn-check classroom-delivery-check" id="del-email-${collapseId}" data-method="email" autocomplete="off">
                  <label class="btn btn-outline-secondary py-0 px-1" for="del-email-${collapseId}" style="font-size:0.7rem;">Email</label>
                </div>
              </div>
            </div>

            <div class="list-group list-group-flush mb-2 border rounded bg-white" style="max-height: 180px; overflow-y: auto;">
              ${studentsHtml}
            </div>

            <textarea class="form-control form-control-sm mb-2 broadcast-message-text" rows="2" placeholder="Введите сообщение..."></textarea>

            <button class="btn btn-primary btn-sm w-100 btn-send-classroom"
                    data-course-id="${course.id}"
                    data-course-target="${collapseId}">
              Send
            </button>
          </div>
        </div>
      </div>
    `;
    })
    .join("");
}

// Add event delegation for the Send button and Select All
document
  .getElementById("classroom-list")
  .addEventListener("click", async (e) => {
    // Handle Select All
    if (e.target.classList.contains("select-all-checkbox")) {
      const collapseId = e.target.getAttribute("data-target");
      const collapseEl = document.getElementById(collapseId);
      const checkboxes = collapseEl.querySelectorAll(".student-checkbox");
      checkboxes.forEach((cb) => (cb.checked = e.target.checked));
      return;
    }

    const btn = e.target.closest(".btn-send-classroom");
    if (!btn) return;

    const collapseId = btn.getAttribute("data-course-target");
    const collapseEl = document.getElementById(collapseId);
    const courseName = collapseEl.getAttribute("data-course-name");
    const messageText = collapseEl
      .querySelector(".broadcast-message-text")
      .value.trim();

    if (!messageText) {
      alert("Введите текст сообщения");
      return;
    }

    // Find all checked checkboxes in this specific collapse section
    // Determine delivery method
    const deliveryChecks = collapseEl.querySelectorAll(
      ".classroom-delivery-check:checked",
    );
    const methods = Array.from(deliveryChecks).map((cb) =>
      cb.getAttribute("data-method"),
    );
    if (methods.length === 0) {
      alert("Выберите способ доставки (TG или Email)");
      return;
    }
    const method =
      methods.includes("tg") && methods.includes("email") ? "both" : methods[0];

    // Collect checked students with tgId + email
    const checkboxes = collapseEl.querySelectorAll(".student-checkbox:checked");

    if (checkboxes.length === 0) {
      alert("Выберите хотя бы одного студента");
      return;
    }

    // Build users array — filter by method
    const users = Array.from(checkboxes)
      .map((cb) => ({
        tgId: cb.getAttribute("data-tg-id"),
        email: cb.getAttribute("data-email"),
      }))
      .filter((u) => {
        if (method === "tg") return u.tgId;
        if (method === "email") return u.email;
        return u.tgId || u.email;
      });

    if (users.length === 0) {
      alert(
        "Ни у одного из выбранных студентов нет контакта для выбранного способа доставки",
      );
      return;
    }

    // Visual feedback
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm"></span> Sending...';

    const response = await chrome.runtime.sendMessage({
      type: "SEND_SESSION_BROADCAST",
      payload: {
        users,
        text: messageText,
        method,
      },
    });

    btn.disabled = false;
    btn.textContent = originalText;

    const globalStatus = document.getElementById("global-status");

    if (response && response.success) {
      console.log(`Broadcast success for "${courseName}":`, response.result);
      if (globalStatus) globalStatus.textContent = "Сообщение отправлено";
      // Clear message after success
      collapseEl.querySelector(".broadcast-message-text").value = "";
      // Uncheck all checkboxes
      checkboxes.forEach((cb) => (cb.checked = false));
      const selectAllCb = collapseEl.querySelector(".select-all-checkbox");
      if (selectAllCb) selectAllCb.checked = false;
    } else {
      console.error("Broadcast Error:", response?.error);
      alert("Ошибка при отправке: " + (response?.error || "Unknown error"));
      if (globalStatus) globalStatus.textContent = "Ошибка отправки";
    }
  });

// Copy email to clipboard
document.getElementById("users-list").addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-copy-email");
  if (!btn) return;

  const email = btn.getAttribute("data-email");
  if (!email) return;

  try {
    await navigator.clipboard.writeText(email);
    // Brief visual feedback
    const originalText = btn.textContent;
    btn.textContent = "✓";
    btn.classList.remove("text-secondary");
    btn.classList.add("text-success");
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove("text-success");
      btn.classList.add("text-secondary");
    }, 1000);
  } catch (err) {
    console.error("Failed to copy email:", err);
  }
});

// ---- Users Tab: Search, Filter & Broadcast Handlers ----

// Search input — debounced
document.getElementById("users-search").addEventListener("input", () => {
  renderFilteredUsers(document.getElementById("global-status"));
});

// Role filter radio buttons
document
  .querySelectorAll('input[name="users-role-filter"]')
  .forEach((radio) => {
    radio.addEventListener("change", () => {
      renderFilteredUsers(document.getElementById("global-status"));
    });
  });

// Select All for users
document.getElementById("users-list").addEventListener("change", (e) => {
  if (e.target.id !== "users-select-all") return;
  const container = document.getElementById("users-list");
  const checkboxes = container.querySelectorAll(".users-student-checkbox");
  checkboxes.forEach((cb) => (cb.checked = e.target.checked));
});

// Send broadcast from Users tab
document.getElementById("users-list").addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-users-send-broadcast");
  if (!btn) return;

  const container = document.getElementById("users-list");

  // Get message
  const messageText = container
    .querySelector(".users-broadcast-text")
    .value.trim();
  if (!messageText) {
    alert("Введите текст сообщения");
    return;
  }

  // Get delivery method
  const deliveryChecks = container.querySelectorAll(
    ".users-delivery-check:checked",
  );
  const methods = Array.from(deliveryChecks).map((cb) =>
    cb.getAttribute("data-method"),
  );
  if (methods.length === 0) {
    alert("Выберите способ доставки (TG или Email)");
    return;
  }
  const method =
    methods.includes("tg") && methods.includes("email") ? "both" : methods[0];

  // Get selected users
  const checkedBoxes = container.querySelectorAll(
    ".users-student-checkbox:checked",
  );
  if (checkedBoxes.length === 0) {
    alert("Выберите хотя бы одного пользователя");
    return;
  }

  const originalText = btn.textContent;

  // Build users array — filter by method
  const users = Array.from(checkedBoxes)
    .map((cb) => ({
      tgId: cb.getAttribute("data-tg-id"),
      email: cb.getAttribute("data-email"),
    }))
    .filter((u) => {
      if (method === "tg") return u.tgId;
      if (method === "email") return u.email;
      return u.tgId || u.email;
    });

  if (users.length === 0) {
    alert(
      "Ни у одного из выбранных пользователей нет контакта для выбранного способа доставки",
    );
    return;
  }

  // Visual feedback
  btn.disabled = true;
  btn.innerHTML =
    '<span class="spinner-border spinner-border-sm"></span> Sending...';

  const response = await chrome.runtime.sendMessage({
    type: "SEND_SESSION_BROADCAST",
    payload: { users, text: messageText, method },
  });

  btn.disabled = false;
  btn.textContent = originalText;

  const globalStatus = document.getElementById("global-status");

  if (response && response.success) {
    console.log("Users broadcast success:", response.result);
    if (globalStatus) globalStatus.textContent = "Сообщение отправлено";
    container.querySelector(".users-broadcast-text").value = "";
    checkedBoxes.forEach((cb) => (cb.checked = false));
    const selectAll = document.getElementById("users-select-all");
    if (selectAll) selectAll.checked = false;
  } else {
    console.error("Users Broadcast Error:", response?.error);
    alert("Ошибка при отправке: " + (response?.error || "Unknown error"));
    if (globalStatus) globalStatus.textContent = "Ошибка отправки";
  }
});
