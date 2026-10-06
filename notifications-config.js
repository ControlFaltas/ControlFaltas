/*
 * Configuración y lógica de las notificaciones push.
 */

// 1. Clave PÚBLICA VAPID de Firebase Cloud Messaging
window.NOTIFICATIONS_VAPID_KEY = 'BAgug2pz8IY1Qv7fgR4K2JYu9GfObUMiYS7OH-o4EJKOKaXWZ-xUsqQmhimxKtfUyjmvSUtYj5q2ekaq2kV9OVU';

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

// Guardaremos el usuario actual cuando Firebase confirme la sesión
let currentUser = null;

// 2. Escuchar el estado de autenticación de forma asíncrona
export function initNotificationAuthListener(app) {
  const auth = getAuth(app);
  
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log("Usuario autenticado detectado:", user.uid);
      currentUser = user;
      
      // Actualizar UI: Ocultar aviso de iniciar sesión / Habilitar botón de activar
      const messageEl = document.getElementById('notification-message');
      const btnActivar = document.getElementById('btn-activar-notificaciones');

      if (messageEl) {
        messageEl.textContent = "Recibirás avisos en el móvil sobre exámenes y deberes. El sistema avisa el día anterior y el mismo día.";
      }
      if (btnActivar) {
        btnActivar.disabled = false;
        btnActivar.onclick = () => solicitarPermisoNotificaciones(app);
      }
    } else {
      console.warn("No hay ningún usuario autenticado.");
      currentUser = null;

      const messageEl = document.getElementById('notification-message');
      const btnActivar = document.getElementById('btn-activar-notificaciones');

      if (messageEl) {
        messageEl.textContent = "Inicia sesión para activar las notificaciones.";
      }
      if (btnActivar) {
        btnActivar.disabled = true;
      }
    }
  });
}

// 3. Función para solicitar el permiso e inscribir el Token
export async function solicitarPermisoNotificaciones(app) {
  if (!currentUser) {
    alert("Inicia sesión para activar las notificaciones.");
    return;
  }

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    alert("Tu navegador o entorno móvil no soporta notificaciones push.");
    return;
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      // Registrar el Service Worker explícitamente
      const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
      const messaging = getMessaging(app);

      // Obtener token FCM
      const token = await getToken(messaging, {
        vapidKey: window.NOTIFICATIONS_VAPID_KEY,
        serviceWorkerRegistration: registration
      });

      if (token) {
        console.log("Token FCM obtenido correctamente:", token);
        alert("¡Notificaciones activadas con éxito!");
        
        // AQUÍ: Guarda el 'token' en tu base de datos (Firestore / Backend)
        // junto al 'currentUser.uid'
      } else {
        alert("No se pudo obtener el token de notificación.");
      }
    } else if (permission === 'denied') {
      alert("Permiso denegado. Habilita las notificaciones en la configuración de tu navegador o móvil.");
    }
  } catch (error) {
    console.error("Error al activar notificaciones:", error);
    alert("Error: " + error.message);
  }
}
