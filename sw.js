const CACHE_NAME = 'faltas-app-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );

});

function guardarCambios(appData) {
  // 1. Guardar localmente (como hacías hasta ahora)
  localStorage.setItem('control_faltas_data', JSON.stringify(appData));

  // 2. Guardar automáticamente en la nube si ha iniciado sesión
  if (window.saveDataToCloud) {
    window.saveDataToCloud(appData);
  }
}

// Función auxiliar para convertir el nombre de usuario a un pseudo-email
function usernameToEmail(username) {
  // Limpiamos espacios y caracteres especiales en caso de que escriban espacios
  const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '');
  return `${cleanUsername}@mi-app-faltas.com`;
}

// Controlar estado de sesión
onAuthStateChanged(auth, async (user) => {
  const authContainer = document.getElementById('auth-container');
  const mainContent = document.getElementById('main-content');
  const userEmailDisplay = document.getElementById('user-email-display');

  if (user) {
    window.currentUser = user;
    
    // Si viene de usuario/contraseña, extraemos el nombre antes del @
    const displayName = user.displayName || user.email.split('@')[0];
    console.log("Usuario logueado:", displayName);
    
    if (authContainer) authContainer.classList.add('hidden');
    if (mainContent) mainContent.classList.remove('hidden');
    if (userEmailDisplay) userEmailDisplay.innerText = displayName;

    await loadUserDataFromCloud(user.uid);
  } else {
    window.currentUser = null;
    console.log("No hay usuario activo");
    if (authContainer) authContainer.classList.remove('hidden');
    if (mainContent) mainContent.classList.add('hidden');
    if (userEmailDisplay) userEmailDisplay.innerText = '';
  }
});

// Autenticación por Nombre de Usuario
window.iniciarSesion = function(username, password) {
  if (!username || !password) {
      if (window.showToast) window.showToast("Por favor ingresa usuario y contraseña", "warning");
      return;
  }

  const fakeEmail = usernameToEmail(username);

  signInWithEmailAndPassword(auth, fakeEmail, password)
    .then((userCredential) => {
      if (window.showToast) window.showToast("Sesión iniciada correctamente", "success");
    })
    .catch((error) => {
      console.error("Error inicio sesión:", error);
      let msg = "Error al iniciar sesión";
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        msg = "Usuario o contraseña incorrectos";
      }
      if (window.showToast) window.showToast(msg, "danger");
    });
};

window.registrarUsuario = function(username, password) {
  if (!username || !password) {
      if (window.showToast) window.showToast("Por favor ingresa usuario y contraseña", "warning");
      return;
  }

  if (username.length < 3) {
      if (window.showToast) window.showToast("El nombre de usuario debe tener al menos 3 caracteres", "warning");
      return;
  }

  const fakeEmail = usernameToEmail(username);

  createUserWithEmailAndPassword(auth, fakeEmail, password)
    .then((userCredential) => {
      if (window.showToast) window.showToast("Cuenta creada exitosamente", "success");
    })
    .catch((error) => {
      console.error("Error registro:", error);
      let msg = "Error al registrarse";
      if (error.code === 'auth/email-already-in-use') {
        msg = "Ese nombre de usuario ya está registrado, elige otro";
      } else if (error.code === 'auth/weak-password') {
        msg = "La contraseña debe tener al menos 6 caracteres";
      }
      if (window.showToast) window.showToast(msg, "danger");
    });
};

// 1. Configura tu horario semanal (Días: 0=Domingo, 1=Lunes, ..., 6=Sábado)
const horario = [
  { dia: 1, inicio: "09:00", fin: "10:30", nombre: "Matemáticas", aula: "Aula 101" },
  { dia: 1, inicio: "11:00", fin: "12:30", nombre: "Física", aula: "Lab A" },
  { dia: 1, inicio: "16:00", fin: "17:30", nombre: "Programación", aula: "Lab de Cómputo" },
  { dia: 2, inicio: "10:00", fin: "11:30", nombre: "Historia", aula: "Aula 202" },
  { dia: 3, inicio: "09:00", fin: "10:30", nombre: "Química", aula: "Lab B" },
  // Añade aquí el resto de tus clases...
];

function obtenerProximasClases() {
  const ahora = new Date();
  const diaActual = ahora.getDay(); 
  const minutosActuales = ahora.getHours() * 60 + ahora.getMinutes();

  // Mapeamos el horario a minutos desde el inicio de la semana para ordenar fácilmente
  const clasesProcesadas = horario.map(clase => {
    const [horas, mins] = clase.inicio.split(':').map(Number);
    const minutosInicioSemana = (clase.dia * 24 * 60) + (horas * 60) + mins;
    return { ...clase, minutosInicioSemana };
  });

  const minutosAhoraSemana = (diaActual * 24 * 60) + minutosActuales;

  // Filtrar clases que aún no han comenzado esta semana
  let futuras = clasesProcesadas.filter(c => c.minutosInicioSemana > minutosAhoraSemana);

  // Ordenar cronológicamente
  futuras.sort((a, b) => a.minutosInicioSemana - b.minutosInicioSemana);

  // Si no quedan suficientes clases esta semana, tomamos las primeras del inicio de la semana siguiente
  if (futuras.length < 2) {
    const clasesComienzoSemana = [...clasesProcesadas].sort((a, b) => a.minutosInicioSemana - b.minutosInicioSemana);
    futuras = futuras.concat(clasesComienzoSemana);
  }

  // Retornar solo las 2 primeras
  return futuras.slice(0, 2);
}

function renderizarProximasClases() {
  const contenedor = document.getElementById('contenedor-proximas');
  const proximas = obtenerProximasClases();
  
  const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  if (proximas.length === 0) {
    contenedor.innerHTML = '<div class="sin-clases">No hay clases programadas.</div>';
    return;
  }

  contenedor.innerHTML = proximas.map(clase => `
    <div class="tarjeta-clase">
      <h3>${clase.nombre}</h3>
      <p><strong>Día:</strong> ${diasSemana[clase.dia]}</p>
      <p><strong>Horario:</strong> ${clase.inicio} - ${clase.fin}</p>
      <p><strong>Lugar:</strong> ${clase.aula}</p>
    </div>
  `).join('');
}

// Ejecutar al cargar la página
document.addEventListener('DOMContentLoaded', renderizarProximasClases);
function renderWeekHeaderDates() {
    const monday = getMondayOfWeek(new Date(), currentWeekOffset);
    const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4);

    const formatShort = (d) => `${d.getDate()}/${d.getMonth() + 1}`;
    
    let label = "";
    if (currentWeekOffset === 0) {
        label = `Semana Actual (${formatShort(monday)} al ${formatShort(friday)})`;
    } else if (currentWeekOffset === -1) {
        label = `Semana Pasada (${formatShort(monday)} al ${formatShort(friday)})`;
    } else if (currentWeekOffset === 1) {
        label = `Semana Siguiente (${formatShort(monday)} al ${formatShort(friday)})`;
    } else if (currentWeekOffset < -1) {
        label = `Hace ${Math.abs(currentWeekOffset)} semanas (${formatShort(monday)} al ${formatShort(friday)})`;
    } else {
        label = `En ${currentWeekOffset} semanas (${formatShort(monday)} al ${formatShort(friday)})`;
    }

    // Actualiza tanto en la pestaña de Horario como en la pestaña de Faltas
    const mainLabel = document.getElementById('currentWeekRangeLabel');
    if (mainLabel) mainLabel.textContent = label;
    
    const faltasLabel = document.getElementById('currentWeekRangeLabelFaltas');
    if (faltasLabel) faltasLabel.textContent = label;

    for (let i = 0; i < 5; i++) {
        const d = getDateOfWeekDay(i, currentWeekOffset);
        const textDate = `${d.getDate()} / ${d.getMonth() + 1}`;
        
        const dayEl = document.getElementById(`dayDate_${i}`);
        if (dayEl) dayEl.textContent = textDate;

        const dayFaltasEl = document.getElementById(`faltas_dayDate_${i}`);
        if (dayFaltasEl) dayFaltasEl.textContent = textDate;
    }
}

function renderScheduleTable() {
    const tbody = document.getElementById('scheduleTableBody');
    const tbodyFaltas = document.getElementById('scheduleTableBodyFaltas');
    
    if (tbody) tbody.innerHTML = '';
    if (tbodyFaltas) tbodyFaltas.innerHTML = '';

    if (window.appData.timeSlots.length === 0) {
        const emptyRow = `
            <tr>
                <td colspan="6" class="p-8 text-center text-slate-400 text-sm">
                    No hay tramos horarios ni recreos configurados.
                </td>
            </tr>`;
        if (tbody) tbody.innerHTML = emptyRow;
        if (tbodyFaltas) tbodyFaltas.innerHTML = emptyRow;
        return;
    }

    window.appData.timeSlots.forEach((slot) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 dark:border-slate-700/60";

        let timeColumnHtml = `
            <td class="p-3 text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap align-middle">
                <div class="flex items-center justify-between gap-1">
                    <span class="truncate max-w-[100px]" title="${escapeHtml(slot.label)}">${escapeHtml(slot.label)}</span>
                    ${isEditScheduleMode ? `
                        <div class="flex items-center space-x-1 shrink-0">
                            <button onclick="openSlotModal('${slot.id}')" title="Editar hora" class="w-6 h-6 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-100 hover:text-indigo-600 flex items-center justify-center text-[10px]">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button onclick="deleteTimeSlot('${slot.id}')" title="Eliminar hora" class="w-6 h-6 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-rose-100 hover:text-rose-600 flex items-center justify-center text-[10px]">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
            </td>
        `;

        if (slot.isBreak) {
            tr.innerHTML = timeColumnHtml + `
                <td colspan="5" class="p-2 text-center">
                    <div class="w-full py-2.5 px-4 rounded-2xl bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/80 dark:border-amber-800/40 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center justify-center space-x-2">
                        <i class="fa-solid fa-mug-hot text-amber-500"></i>
                        <span>${escapeHtml(slot.label)}</span>
                    </div>
                </td>
            `;
        } else {
            let daysCellsHtml = '';
            for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
                const cellKey = `${dayIdx}_${slot.id}`;
                const subjectId = window.appData.schedule[cellKey];
                const subject = window.appData.subjects.find(s => s.id === subjectId);

                if (subject) {
                    const dateObj = getDateOfWeekDay(dayIdx, currentWeekOffset);
                    const dateStr = formatDateKey(dateObj);
                    
                    const isAbsent = window.appData.absenceLogs.some(l => 
                        l.dateString === dateStr && 
                        l.subjectId === subjectId && 
                        l.slotLabel === slot.label
                    );

                    if (isAbsent && !isEditScheduleMode) {
                        daysCellsHtml += `
                            <td class="p-2 text-center">
                                <button onclick="handleCellClick(${dayIdx}, '${slot.id}')" 
                                    class="w-full h-16 p-2 rounded-2xl bg-rose-600 text-white border border-rose-700 text-xs font-semibold flex flex-col items-center justify-center transition active:scale-95 shadow-md hover:bg-rose-700">
                                    <span class="truncate max-w-[110px] font-bold">${escapeHtml(subject.name)}</span>
                                    <span class="text-[9px] bg-rose-800/80 text-white px-2 py-0.5 rounded-full mt-1 font-extrabold flex items-center gap-1">
                                        <i class="fa-solid fa-circle-xmark"></i> FALTA
                                    </span>
                                </button>
                            </td>
                        `;
                    } else {
                        const colorClass = getSubjectColorClass(subject.id);
                        daysCellsHtml += `
                            <td class="p-2 text-center">
                                <button onclick="handleCellClick(${dayIdx}, '${slot.id}')" 
                                    class="w-full h-16 p-2 rounded-2xl border text-xs font-semibold flex flex-col items-center justify-center transition active:scale-95 shadow-sm hover:shadow ${colorClass} ${isEditScheduleMode ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}">
                                    <span class="truncate max-w-[110px] font-bold">${escapeHtml(subject.name)}</span>
                                    <span class="text-[10px] opacity-80 mt-1">
                                        <i class="fa-solid fa-clock text-[9px] mr-1"></i>${subject.absences}h faltadas
                                    </span>
                                </button>
                            </td>
                        `;
                    }
                } else {
                    daysCellsHtml += `
                        <td class="p-2 text-center">
                            <button onclick="handleCellClick(${dayIdx}, '${slot.id}')" 
                                class="w-full h-16 p-2 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700/80 text-slate-300 dark:text-slate-600 text-xs font-medium hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-400 transition flex items-center justify-center">
                                ${isEditScheduleMode ? '<i class="fa-solid fa-plus mr-1"></i> Asignar' : '<span class="text-[11px] opacity-60">Sin clase</span>'}
                            </button>
                        </td>
                    `;
                }
            }

            tr.innerHTML = timeColumnHtml + daysCellsHtml;
        }

        if (tbody) tbody.appendChild(tr.cloneNode(true));
        if (tbodyFaltas) tbodyFaltas.appendChild(tr);
    });
}