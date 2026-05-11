// ============================================================
// sessionsTab.js — Sessions Tab for Heizreport Extension
// ============================================================

// ---- State ----
let allSessionRuns = [];
let sessionLevelsMap = {}; // levelId -> { id, title }
let academicYearsMap = {}; // academicYearId -> { id, label }
let studentsMap = {}; // studentId -> { id, name, userId, telegramId }
let usersByIdMap = {}; // userId -> { id, email, firstName, lastName, tgId }

// ---- DTO Helpers ----
const STATUS_COLORS = {
  PLANNED: "bg-secondary",
  ACTIVE: "bg-success",
  COMPLETED: "bg-primary",
  ARCHIVED: "bg-dark",
};

// ---- Fetch helpers (through background.js) ----
async function bgFetch(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

// ---- Initialize lookup data ----
async function loadLookups() {
  const [levelsRes, yearsRes, studentsRes] = await Promise.all([
    bgFetch("GET_SESSION_LEVELS"),
    bgFetch("GET_ACADEMIC_YEARS"),
    bgFetch("GET_STUDENTS"),
  ]);

  if (levelsRes?.success) {
    levelsRes.data.forEach((l) => (sessionLevelsMap[l.id] = l));
  }
  if (yearsRes?.success) {
    yearsRes.data.forEach((y) => (academicYearsMap[y.id] = y));
  }
  if (studentsRes?.success) {
    studentsRes.data.forEach((s) => (studentsMap[s.id] = s));
  }

  // Also load Users to enrich students with email/tgId via student.userId -> user.id
  const usersRes = await bgFetch("GET_USERS", {
    search: "",
    status: "",
    role: "",
    forceRefresh: false,
  });
  if (usersRes?.success) {
    usersRes.users.forEach((u) => (usersByIdMap[u.id] = u));
  }
}

// ---- Main loader ----
async function loadSessions(forceRefresh = false) {
  const loading = document.getElementById("sessions-loading");
  const error = document.getElementById("sessions-error");
  const empty = document.getElementById("sessions-empty");
  const list = document.getElementById("sessions-list");
  const globalStatus = document.getElementById("global-status");

  loading.classList.remove("d-none");
  error.classList.add("d-none");
  empty.classList.add("d-none");
  list.innerHTML = "";
  if (globalStatus)
    globalStatus.textContent = forceRefresh ? "Обновление..." : "Загрузка...";

  try {
    await loadLookups();

    const runsRes = await bgFetch("GET_SESSION_RUNS");
    if (!runsRes?.success) {
      throw new Error(runsRes?.error || "Failed to load sessions");
    }

    allSessionRuns = runsRes.data || [];
    loading.classList.add("d-none");

    if (globalStatus)
      globalStatus.textContent = `Сессий: ${allSessionRuns.length}`;

    if (allSessionRuns.length === 0) {
      empty.classList.remove("d-none");
      return;
    }

    renderSessionAccordion();
  } catch (err) {
    loading.classList.add("d-none");
    error.classList.remove("d-none");
    error.textContent =
      "Ошибка загрузки сессий: " + (err.message || "Неизвестная ошибка");
    if (globalStatus) globalStatus.textContent = "Ошибка";
  }
}

// ---- Render Accordion ----
function renderSessionAccordion() {
  const list = document.getElementById("sessions-list");
  const accordionId = "sessions-accordion";

  list.innerHTML = `
    <div class="accordion session-accordion" id="${accordionId}">
      ${allSessionRuns
        .map((run, index) => buildAccordionItem(run, index, accordionId))
        .join("")}
    </div>
  `;
}

function buildAccordionItem(run, index, accordionId) {
  const level = sessionLevelsMap[run.levelId];
  const year = academicYearsMap[run.academicYearId];
  const levelTitle = level?.title || run.levelId || "—";
  const yearLabel = year?.label || run.academicYearId || "—";
  const courseLabel = run.classroomCourseId || "—";
  const statusColor = STATUS_COLORS[run.status] || "bg-secondary";
  const itemId = `session-item-${run.id || index}`;
  const collapseId = `session-collapse-${run.id || index}`;

  return `
    <div class="accordion-item">
      <h2 class="accordion-header" id="${itemId}-heading">
        <button
          class="accordion-button collapsed"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#${collapseId}"
          aria-expanded="false"
          aria-controls="${collapseId}"
        >
          <div class="session-header-row">
            <div class="flex-grow-1 min-width-0">
              <div class="session-title-text">${levelTitle}</div>
              <div class="session-meta-text">${yearLabel} · Курс: ${courseLabel}</div>
            </div>
            <span class="badge ${statusColor} session-status-badge">${run.status}</span>
          </div>
        </button>
      </h2>
      <div
        id="${collapseId}"
        class="accordion-collapse collapse"
        aria-labelledby="${itemId}-heading"
        data-bs-parent="#${accordionId}"
      >
        <div class="accordion-body">
          ${buildSessionBody(run, itemId)}
        </div>
      </div>
    </div>
  `;
}

// ---- Build accordion body with nested tabs ----
function buildSessionBody(run, itemId) {
  const studentsTabId = `${itemId}-students`;
  const subjectsTabId = `${itemId}-subjects`;

  return `
    <div class="border-bottom px-2 py-1 bg-light d-flex align-items-center justify-content-between" style="font-size:0.75rem;">
      <div>
        <strong>ID:</strong> ${run.id} &nbsp;
        <strong>Статус:</strong>
        <select class="status-select-dropdown" data-run-id="${run.id}">
          ${["PLANNED", "ACTIVE", "COMPLETED", "ARCHIVED"]
            .map(
              (s) =>
                `<option value="${s}" ${s === run.status ? "selected" : ""}>${s}</option>`,
            )
            .join("")}
        </select>
      </div>
      <div class="session-actions">
        <button class="btn btn-outline-primary btn-edit-session" data-run-id="${run.id}">Edit</button>
        <button class="btn btn-outline-danger btn-delete-session" data-run-id="${run.id}">Delete</button>
      </div>
    </div>

    <ul class="nav nav-tabs session-detail-tabs" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" id="${studentsTabId}-tab" data-bs-toggle="tab" data-bs-target="#${studentsTabId}" type="button" role="tab" aria-controls="${studentsTabId}" aria-selected="true">Students</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="${subjectsTabId}-tab" data-bs-toggle="tab" data-bs-target="#${subjectsTabId}" type="button" role="tab" aria-controls="${subjectsTabId}" aria-selected="false">Subjects</button>
      </li>
    </ul>

    <div class="tab-content session-detail-tabs">
      <div class="tab-pane fade show active" id="${studentsTabId}" role="tabpanel" aria-labelledby="${studentsTabId}-tab">
        <div id="${itemId}-students-content">
          <div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span> Загрузка...</div>
        </div>
      </div>
      <div class="tab-pane fade" id="${subjectsTabId}" role="tabpanel" aria-labelledby="${subjectsTabId}-tab">
        <div id="${itemId}-subjects-content">
          <div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span> Загрузка...</div>
        </div>
      </div>
    </div>
  `;
}

// ---- Data loaders for nested tabs ----
// Cache all subjects and enrollments for client-side filtering
let allSubjectsCache = [];
let allEnrollmentsCache = [];

async function ensureDataCached() {
  if (allSubjectsCache.length === 0) {
    const res = await bgFetch("GET_SESSION_SUBJECTS");
    if (res?.success) allSubjectsCache = res.data || [];
  }
  if (allEnrollmentsCache.length === 0) {
    const res = await bgFetch("GET_ENROLLMENTS");
    if (res?.success) allEnrollmentsCache = res.data || [];
  }
}

async function loadStudentsForRun(runId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    await ensureDataCached();

    const enrollments = allEnrollmentsCache.filter(
      (enr) => enr.sessionRunId === runId,
    );
    const enrollmentsWithStudents = enrollments
      .map((enr) => {
        const student = studentsMap[enr.studentId];
        return { enrollment: enr, student };
      })
      .filter((e) => e.student);

    if (enrollmentsWithStudents.length === 0) {
      container.innerHTML =
        '<div class="text-center text-muted py-3 small">Нет студентов</div>';
      return;
    }

    // Build full broadcast UI with student checkboxes
    const studentCheckboxesHtml = enrollmentsWithStudents
      .map(({ student }) => {
        // Enrich with User data via student.userId -> usersByIdMap
        const user = usersByIdMap[student.userId] || {};
        const fullName =
          student.name ||
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          [student.firstName, student.lastName].filter(Boolean).join(" ") ||
          "—";
        const hasTelegram = !!(student.telegramId || student.tgId || user.tgId);
        const tgId = student.telegramId || student.tgId || user.tgId || "";
        const email = student.email || user.email || "";
        return `
      <div class="list-group-item d-flex align-items-center bg-transparent border-0 py-1 px-1">
        <div class="form-check d-flex align-items-center w-100">
          <input class="form-check-input me-2 student-checkbox" type="checkbox"
                 data-student-id="${student.id}"
                 data-email="${email}"
                 data-tg-id="${tgId}"
                 id="scheck-${student.id}">
          <label class="form-check-label small text-truncate" for="scheck-${student.id}" style="cursor:pointer;">
            <span class="fw-semibold">${fullName}</span>
            <br>
            <span class="text-muted" style="font-size:0.7rem;">${email || "—"}</span>
          </label>
        </div>
        <span class="tg-dot ${hasTelegram ? "active" : "inactive"} flex-shrink-0"></span>
      </div>
    `;
      })
      .join("");

    container.innerHTML = `
      <div class="p-2">
        <!-- Top bar: Select All + Delivery method -->
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div class="form-check">
            <input class="form-check-input select-all-student" type="checkbox" id="select-all-${runId}">
            <label class="form-check-label small" for="select-all-${runId}" style="cursor:pointer;">Выбрать всех</label>
          </div>
          <div class="d-flex align-items-center gap-1" style="font-size:0.7rem;">
            <span class="text-muted">Доставка:</span>
            <div class="btn-group btn-group-sm" role="group">
              <input type="checkbox" class="btn-check delivery-check" id="del-tg-${runId}" data-method="tg" autocomplete="off">
              <label class="btn btn-outline-secondary py-0 px-1" for="del-tg-${runId}" style="font-size:0.7rem;">TG</label>
              <input type="checkbox" class="btn-check delivery-check" id="del-email-${runId}" data-method="email" autocomplete="off">
              <label class="btn btn-outline-secondary py-0 px-1" for="del-email-${runId}" style="font-size:0.7rem;">Email</label>
            </div>
          </div>
        </div>

        <!-- Student list -->
        <div class="list-group list-group-flush mb-2 border rounded bg-white" style="max-height:150px;overflow-y:auto;">
          ${studentCheckboxesHtml}
        </div>

        <!-- Message textarea -->
        <textarea class="form-control form-control-sm mb-2 session-broadcast-text" data-run-id="${runId}" rows="2" placeholder="Введите сообщение..."></textarea>

        <!-- Send button -->
        <button class="btn btn-primary btn-sm w-100 btn-send-session-broadcast" data-run-id="${runId}">Send</button>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="text-danger small p-2">Ошибка загрузки студентов</div>`;
    console.error("Failed to load students for run", runId, err);
  }
}

async function loadSubjectsForRun(runId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    await ensureDataCached();

    const subjects = allSubjectsCache.filter(
      (subj) => subj.sessionRunId === runId,
    );

    if (subjects.length === 0) {
      container.innerHTML =
        '<div class="text-center text-muted py-3 small">Нет предметов</div>';
      return;
    }

    container.innerHTML = subjects
      .map(
        (subj) => `
      <div class="subject-row">
        <div class="flex-grow-1 min-width-0" style="overflow:hidden;">
          <div class="subject-name">${subj.title || subj.name}</div>
          ${subj.description ? `<div class="subject-desc">${subj.description}</div>` : ""}
        </div>
      </div>
    `,
      )
      .join("");
  } catch (err) {
    container.innerHTML = `<div class="text-danger small p-2">Ошибка загрузки предметов</div>`;
    console.error("Failed to load subjects for run", runId, err);
  }
}

// ---- Event delegation for the sessions list ----
document.addEventListener("click", async (e) => {
  // Edit stub
  const editBtn = e.target.closest(".btn-edit-session");
  if (editBtn) {
    const runId = editBtn.getAttribute("data-run-id");
    console.log("STUB: Edit session run", runId);
    alert(`STUB: Edit Session Run ${runId} — будет реализовано позже`);
    return;
  }

  // Delete stub
  const deleteBtn = e.target.closest(".btn-delete-session");
  if (deleteBtn) {
    const runId = deleteBtn.getAttribute("data-run-id");
    console.log("STUB: Delete session run", runId);
    alert(`STUB: Delete Session Run ${runId} — будет реализовано позже`);
    return;
  }
});

// Handle Select All for session students
document.addEventListener("change", (e) => {
  const selectAll = e.target.closest(".select-all-student");
  if (!selectAll) return;

  const container = selectAll.closest(".p-2");
  if (!container) return;
  const checkboxes = container.querySelectorAll(".student-checkbox");
  checkboxes.forEach((cb) => (cb.checked = selectAll.checked));
});

// Handle Send Session Broadcast
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-send-session-broadcast");
  if (!btn) return;

  const runId = btn.getAttribute("data-run-id");
  const container = btn.closest(".p-2");
  if (!container) return;

  // Get message
  const messageText = container
    .querySelector(".session-broadcast-text")
    .value.trim();
  if (!messageText) {
    alert("Введите текст сообщения");
    return;
  }

  // Get delivery method
  const deliveryChecks = container.querySelectorAll(".delivery-check:checked");
  const methods = Array.from(deliveryChecks).map((cb) =>
    cb.getAttribute("data-method"),
  );
  if (methods.length === 0) {
    alert("Выберите способ доставки (TG или Email)");
    return;
  }
  // Determine method: if both checked -> "both", otherwise the single one
  const method =
    methods.includes("tg") && methods.includes("email") ? "both" : methods[0];

  // Get selected students
  const checkedBoxes = container.querySelectorAll(".student-checkbox:checked");
  if (checkedBoxes.length === 0) {
    alert("Выберите хотя бы одного студента");
    return;
  }

  const originalText = btn.textContent;

  // Build users array — only include students with contact info matching the method
  const users = Array.from(checkedBoxes)
    .map((cb) => ({
      tgId: cb.getAttribute("data-tg-id"),
      email: cb.getAttribute("data-email"),
    }))
    .filter((u) => {
      if (method === "tg") return u.tgId;
      if (method === "email") return u.email;
      return u.tgId || u.email; // "both" — нужен хотя бы один канал
    });

  if (users.length === 0) {
    alert(
      "Ни у одного из выбранных студентов нет контакта для выбранного способа доставки",
    );
    btn.disabled = false;
    btn.textContent = originalText;
    return;
  }

  // Visual feedback
  btn.disabled = true;
  btn.innerHTML =
    '<span class="spinner-border spinner-border-sm"></span> Sending...';

  const response = await bgFetch("SEND_SESSION_BROADCAST", {
    users,
    text: messageText,
    method,
  });

  btn.disabled = false;
  btn.textContent = originalText;

  const globalStatus = document.getElementById("global-status");

  if (response && response.success) {
    console.log(`Broadcast success for run ${runId}:`, response.result);
    if (globalStatus) globalStatus.textContent = "Сообщение отправлено";
    // Clear message and uncheck
    container.querySelector(".session-broadcast-text").value = "";
    checkedBoxes.forEach((cb) => (cb.checked = false));
    const selectAllCb = container.querySelector(".select-all-student");
    if (selectAllCb) selectAllCb.checked = false;
  } else {
    console.error("Broadcast Error:", response?.error);
    alert("Ошибка при отправке: " + (response?.error || "Unknown error"));
    if (globalStatus) globalStatus.textContent = "Ошибка отправки";
  }
});

// Handle status change
document.addEventListener("change", async (e) => {
  const select = e.target.closest(".status-select-dropdown");
  if (!select) return;

  const runId = select.getAttribute("data-run-id");
  const newStatus = select.value;
  const globalStatus = document.getElementById("global-status");

  select.disabled = true;

  try {
    const res = await bgFetch("UPDATE_SESSION_STATUS", {
      runId,
      status: newStatus,
    });
    if (res?.success) {
      console.log(`Status updated for run ${runId} → ${newStatus}`);
      if (globalStatus) globalStatus.textContent = "Статус обновлён";
      // Refresh the whole list to get the new status badge
      await loadSessions(true);
    } else {
      console.error("Failed to update status", res?.error);
      if (globalStatus) globalStatus.textContent = "Ошибка обновления статуса";
      select.value = select.getAttribute("data-previous") || select.value;
    }
  } catch (err) {
    console.error("Failed to update status", err);
    if (globalStatus) globalStatus.textContent = "Ошибка обновления статуса";
  } finally {
    select.disabled = false;
  }
});

// Handle accordion expand — load Students & Subjects on first expand
document.addEventListener("shown.bs.collapse", async (e) => {
  const collapseEl = e.target;
  if (!collapseEl.id || !collapseEl.id.startsWith("session-collapse-")) return;

  const itemId = collapseEl.id.replace("session-collapse-", "session-item-");

  // Load students and subjects only once
  const studentsContent = document.getElementById(`${itemId}-students-content`);
  const subjectsContent = document.getElementById(`${itemId}-subjects-content`);

  // Skip if already loaded (content is not the loading placeholder)
  if (studentsContent && studentsContent.innerHTML.includes("spinner-border")) {
    const runId = collapseEl.id.replace("session-collapse-", "");
    loadStudentsForRun(runId, `${itemId}-students-content`);
  }
  if (subjectsContent && subjectsContent.innerHTML.includes("spinner-border")) {
    const runId = collapseEl.id.replace("session-collapse-", "");
    loadSubjectsForRun(runId, `${itemId}-subjects-content`);
  }
});
