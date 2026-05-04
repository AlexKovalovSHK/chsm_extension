const PAGE_SIZE = 10;
let currentPage = 0;
let allUsers = [];

function setGlobalLoading(isLoading) {
  const el = document.getElementById('global-loading');
  if (isLoading) {
    el.classList.remove('d-none');
  } else {
    el.classList.add('d-none');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
});

async function checkAuth() {
  setGlobalLoading(true);
  const response = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
  setGlobalLoading(false);

  if (response && response.success) {
    showAuthenticated(response.user);
    loadClassroom(); // Default active tab is now Classroom
  } else {
    showUnauthenticated();
  }
}

function showUnauthenticated() {
  document.getElementById('auth-login').classList.remove('d-none');
  document.getElementById('auth-active').classList.add('d-none');
  document.getElementById('main-content').classList.add('d-none');
}

function showAuthenticated(user) {
  document.getElementById('auth-login').classList.add('d-none');
  document.getElementById('auth-active').classList.remove('d-none');
  document.getElementById('main-content').classList.remove('d-none');
  
  document.getElementById('active-email').value = user.email || user.username || 'User';
}

const formLogin = document.getElementById('form-login');
const btnLogin = document.getElementById('btn-login');
const loginError = document.getElementById('login-error');

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('input-email').value;
  const password = document.getElementById('input-password').value;

  btnLogin.disabled = true;
  btnLogin.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Вход...';
  loginError.classList.add('d-none');

  const response = await chrome.runtime.sendMessage({
    type: 'LOGIN',
    payload: { email, password }
  });

  btnLogin.disabled = false;
  btnLogin.textContent = 'Login';

  if (response && response.success) {
    checkAuth();
  } else {
    loginError.classList.remove('d-none');
    if (response && response.error === 'invalid_credentials') {
      loginError.textContent = 'Неверный логин или пароль';
    } else if (response && response.error === 'validation_error') {
      loginError.textContent = 'Заполните все поля';
    } else if (response && response.error === 'network_error') {
      loginError.textContent = 'Нет соединения с сервером';
    } else {
      loginError.textContent = 'Ошибка сервера. Попробуйте позже';
    }
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await chrome.storage.local.remove([
    'chsm_token', 
    'chsm_users_cache', 
    'chsm_classroom_cache'
  ]);
  checkAuth();
});

document.getElementById('btn-refresh').addEventListener('click', () => {
  const activeTab = document.querySelector('.nav-link.active').id;
  if (activeTab === 'users-tab') {
    loadUsers(true);
  } else if (activeTab === 'classroom-tab') {
    loadClassroom(true);
  }
});

document.getElementById('classroom-tab').addEventListener('shown.bs.tab', () => {
  loadClassroom();
});

document.getElementById('users-tab').addEventListener('shown.bs.tab', () => {
  loadUsers();
});

async function loadUsers(forceRefresh = false) {
  const usersLoading = document.getElementById('users-loading');
  const usersError = document.getElementById('users-error');
  const usersEmpty = document.getElementById('users-empty');
  const usersList = document.getElementById('users-list');
  const globalStatus = document.getElementById('global-status');
  
  usersLoading.classList.remove('d-none');
  usersError.classList.add('d-none');
  usersEmpty.classList.add('d-none');
  usersList.innerHTML = '';
  if (globalStatus) globalStatus.textContent = forceRefresh ? 'Обновление...' : 'Загрузка...';
  
  const response = await chrome.runtime.sendMessage({
    type: 'GET_USERS',
    payload: { search: '', status: '', role: '', forceRefresh }
  });

  usersLoading.classList.add('d-none');

  if (!response || !response.success) {
    if (response && response.error === 'unauthorized') {
      checkAuth(); // token expired
    } else {
      usersError.classList.remove('d-none');
      usersError.textContent = 'Ошибка загрузки пользователей';
    }
    return;
  }

  allUsers = response.users || [];
  if (globalStatus) globalStatus.textContent = `Всего: ${allUsers.length}`;

  if (allUsers.length === 0) {
    usersEmpty.classList.remove('d-none');
    return;
  }

  currentPage = 0;
  renderUsersPage();
}

function renderUsersPage() {
  const start = currentPage * PAGE_SIZE;
  const chunk = allUsers.slice(start, start + PAGE_SIZE);
  
  const usersList = document.getElementById('users-list');
  usersList.innerHTML = chunk.map(user => {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Без имени';
    const initial = (user.firstName?.[0] || user.username?.[0] || '?').toUpperCase();
    const roleClasses = { admin: 'bg-danger', manager: 'bg-warning text-dark', student: 'bg-primary' };
    const roleBadge = `<span class="badge ${roleClasses[user.role] || 'bg-secondary'}">${user.role || 'user'}</span>`;
    
    return `
      <div class="list-group-item list-group-item-action user-card d-flex align-items-center p-2">
        <div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center flex-shrink-0 me-2" style="width:32px;height:32px;font-size:0.8rem;font-weight:600;">
          ${initial}
        </div>
        <div class="flex-grow-1 overflow-hidden">
          <div class="d-flex justify-content-between align-items-center">
            <div class="fw-semibold text-truncate">${fullName}</div>
            ${roleBadge}
          </div>
          <div class="text-muted text-truncate" style="font-size: 0.75rem;">${user.email || '—'}</div>
        </div>
      </div>
    `;
  }).join('');
  
  renderPagination();
}

function renderPagination() {
  const total = Math.ceil(allUsers.length / PAGE_SIZE);
  const ul = document.getElementById('users-pagination');
  
  if (total <= 1) {
    ul.innerHTML = '';
    return;
  }
  
  ul.innerHTML = `
    <li class="page-item ${currentPage === 0 ? 'disabled' : ''}">
      <button class="page-link px-2 py-1" data-delta="-1">‹</button>
    </li>
    <li class="page-item disabled">
      <span class="page-link px-2 py-1">${currentPage + 1} / ${total}</span>
    </li>
    <li class="page-item ${currentPage >= total - 1 ? 'disabled' : ''}">
      <button class="page-link px-2 py-1" data-delta="1">›</button>
    </li>
  `;
}

document.getElementById('users-pagination').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-delta]');
  if (!btn) return;
  const delta = parseInt(btn.getAttribute('data-delta'), 10);
  const total = Math.ceil(allUsers.length / PAGE_SIZE);
  currentPage = Math.max(0, Math.min(currentPage + delta, total - 1));
  renderUsersPage();
});

async function loadClassroom(forceRefresh = false) {
  const loading = document.getElementById('classroom-loading');
  const error = document.getElementById('classroom-error');
  const empty = document.getElementById('classroom-empty');
  const list = document.getElementById('classroom-list');
  const globalStatus = document.getElementById('global-status');
  
  loading.classList.remove('d-none');
  error.classList.add('d-none');
  empty.classList.add('d-none');
  list.innerHTML = '';
  if (globalStatus) globalStatus.textContent = forceRefresh ? 'Обновление...' : 'Загрузка...';
  
  const response = await chrome.runtime.sendMessage({ 
    type: 'GET_CLASSROOM_REPORT',
    payload: { forceRefresh }
  });
  loading.classList.add('d-none');
  
  if (!response || !response.success) {
    error.classList.remove('d-none');
    error.textContent = 'Ошибка загрузки данных Classroom';
    if (globalStatus) globalStatus.textContent = 'Ошибка';
    return;
  }
  
  const courses = response.data.courses || [];
  if (globalStatus) globalStatus.textContent = `Курсов: ${courses.length}`;
  if (courses.length === 0) {
    empty.classList.remove('d-none');
    return;
  }
  
  renderClassroom(courses);
}

function renderClassroom(courses) {
  const list = document.getElementById('classroom-list');
  list.innerHTML = courses.map((course, index) => {
    const studentCount = course.students ? course.students.length : 0;
    const teacherNames = course.teachers ? course.teachers.map(t => t.name).join(', ') : '—';
    const collapseId = `course-collapse-${course.id || index}`;
    
    const studentsHtml = course.students ? course.students.map(student => `
      <div class="list-group-item d-flex align-items-center bg-transparent border-0 py-1 px-1">
        <div class="form-check d-flex align-items-center w-100">
          <input class="form-check-input me-2 student-checkbox" type="checkbox" 
                 data-student-id="${student.id}" data-name="${student.name}" data-email="${student.email}">
          <label class="form-check-label small text-truncate" style="cursor: pointer;">
            <span class="fw-semibold">${student.name}</span>
            <br>
            <span class="text-muted" style="font-size: 0.7rem;">${student.email}</span>
          </label>
        </div>
      </div>
    `).join('') : '<div class="small text-muted p-2">Нет студентов</div>';

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
            <!-- Select All & Message -->
            <div class="d-flex justify-content-between align-items-center mb-2 px-1">
              <div class="form-check">
                <input class="form-check-input select-all-checkbox" type="checkbox" id="select-all-${collapseId}" data-target="${collapseId}">
                <label class="form-check-label small" for="select-all-${collapseId}" style="cursor: pointer;">Выбрать всех</label>
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
  }).join('');
}

// Add event delegation for the Send button and Select All
document.getElementById('classroom-list').addEventListener('click', async (e) => {
  // Handle Select All
  if (e.target.classList.contains('select-all-checkbox')) {
    const collapseId = e.target.getAttribute('data-target');
    const collapseEl = document.getElementById(collapseId);
    const checkboxes = collapseEl.querySelectorAll('.student-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
    return;
  }

  const btn = e.target.closest('.btn-send-classroom');
  if (!btn) return;

  const collapseId = btn.getAttribute('data-course-target');
  const collapseEl = document.getElementById(collapseId);
  const courseName = collapseEl.getAttribute('data-course-name');
  const messageText = collapseEl.querySelector('.broadcast-message-text').value.trim();
  
  if (!messageText) {
    alert('Введите текст сообщения');
    return;
  }

  // Find all checked checkboxes in this specific collapse section
  const selectedEmails = [];
  const checkboxes = collapseEl.querySelectorAll('.student-checkbox:checked');
  
  checkboxes.forEach(cb => {
    selectedEmails.push(cb.getAttribute('data-email'));
  });

  if (selectedEmails.length === 0) {
    alert('Выберите хотя бы одного студента');
    return;
  }

  // Visual feedback
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';

  const response = await chrome.runtime.sendMessage({
    type: 'BROADCAST_MESSAGE',
    payload: {
      users: selectedEmails,
      text: messageText
    }
  });

  btn.disabled = false;
  btn.textContent = originalText;

  if (response && response.success) {
    console.log(`Success for "${courseName}":`, response.result);
    //alert(`Сообщение успешно отправлено ${selectedEmails.length} пользователям курса "${courseName}"`);
    // Clear message after success
    collapseEl.querySelector('.broadcast-message-text').value = '';
    // Uncheck all checkboxes
    checkboxes.forEach(cb => cb.checked = false);
    const selectAllCb = collapseEl.querySelector('.select-all-checkbox');
    if (selectAllCb) selectAllCb.checked = false;
  } else {
    console.error('Broadcast Error:', response.error);
    alert('Ошибка при отправке сообщения: ' + (response.error || 'Unknown error'));
  }
});
