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