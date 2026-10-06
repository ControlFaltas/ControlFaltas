import admin from 'firebase-admin';

const PROJECT_ID = 'control-faltas-26';
const DATABASE_URL = 'https://control-faltas-26-default-rtdb.europe-west1.firebasedatabase.app';
const APP_URL = process.env.APP_URL || './';
const MADRID_TZ = 'Europe/Madrid';

function initAdmin() {
  if (admin.apps.length) return admin.app();

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT en el entorno.');

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (error) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no contiene un JSON válido.');
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: DATABASE_URL,
    projectId: PROJECT_ID
  });
}

initAdmin();
const db = admin.database();
const messaging = admin.messaging();

function madridParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}

function madridDateKey(date = new Date()) {
  const p = madridParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function addDays(dateKey, amount) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function eventKey(task, classId = 'private') {
  return `${classId}:${task.id}:${task.dueDate}`;
}

function isEnrolled(subject, member) {
  if (!subject) return false;
  const excluded = new Set(member?.excludedSubjectIds || member?.classPersonalAttendance?.excludedSubjectIds || []);
  return !excluded.has(subject.id);
}

function safeTokens(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value)
    .map(([key, value]) => ({ key, ...(value || {}) }))
    .filter(x => typeof x.token === 'string' && x.token.length > 20);
}

async function sendToUser(uid, task, classId, member) {
  const tokenSnap = await db.ref(`users/${uid}/notificationTokens`).get();
  const tokens = safeTokens(tokenSnap.val());
  if (!tokens.length) return 0;

  const typeLabel = task.type === 'exam' ? 'Examen' : 'Entrega';
  const subject = task.subjectName || 'Asignatura';
  const title = `${typeLabel}: ${subject}`;
  const body = task.title || 'Tienes un evento próximo.';
  const notificationId = `${classId}-${task.id}-${task.dueDate}`;

  let sent = 0;
  for (const item of tokens) {
    try {
      await messaging.send({
        token: item.token,
        notification: { title, body },
        data: {
          title,
          body,
          notificationId,
          eventId: String(task.id),
          dueDate: String(task.dueDate),
          type: String(task.type || 'homework'),
          subjectId: String(task.subjectId || ''),
          url: APP_URL
        },
        webpush: {
          fcmOptions: { link: APP_URL }
        }
      });
      sent++;
    } catch (error) {
      const code = error?.errorInfo?.code || error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        await db.ref(`users/${uid}/notificationTokens/${item.key}`).remove();
      } else {
        console.error(`Error enviando a ${uid}:`, code || error.message);
      }
    }
  }
  return sent;
}

async function alreadySent(uid, notificationId) {
  const snap = await db.ref(`notificationSends/${uid}/${notificationId}`).get();
  return snap.exists();
}

async function markSent(uid, notificationId, metadata) {
  await db.ref(`notificationSends/${uid}/${notificationId}`).set({
    sentAt: admin.database.ServerValue.TIMESTAMP,
    ...metadata
  });
}

async function processUser(uid, userData, nowDateKey, sendMode) {
  const tasks = userData?.appData?.agendaTasks || [];
  const subjects = userData?.appData?.subjects || [];
  const member = userData?.classPersonalAttendance || {};
  let sent = 0;

  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!task?.id || !task?.dueDate || task.completed) continue;
    const due = String(task.dueDate);
    const targetDate = sendMode === 'day-before' ? addDays(nowDateKey, 1) : nowDateKey;
    if (due !== targetDate) continue;

    const subject = subjects.find(s => s.id === task.subjectId);
    if (!subject || !isEnrolled(subject, member)) continue;

    const notificationId = `${eventKey(task)}:${sendMode}`;
    if (await alreadySent(uid, notificationId)) continue;

    const n = await sendToUser(uid, task, 'private', member);
    if (n > 0) {
      await markSent(uid, notificationId, { mode: sendMode, dueDate: due, type: 'private' });
      sent += n;
    }
  }
  return sent;
}

async function processSharedClasses(nowDateKey, sendMode) {
  const classesSnap = await db.ref('classes').get();
  const classes = classesSnap.val() || {};
  let sent = 0;

  for (const [classId, classData] of Object.entries(classes)) {
    const tasks = classData?.appData?.agendaTasks || [];
    const subjects = classData?.appData?.subjects || [];
    const members = classData?.members || {};
    if (!Array.isArray(tasks) || !Object.keys(members).length) continue;

    for (const task of tasks) {
      if (!task?.id || !task?.dueDate || task.completed) continue;
      const targetDate = sendMode === 'day-before' ? addDays(nowDateKey, 1) : nowDateKey;
      if (String(task.dueDate) !== targetDate) continue;

      const subject = subjects.find(s => s.id === task.subjectId);
      if (!subject) continue;

      for (const uid of Object.keys(members)) {
        const personalSnap = await db.ref(`classAttendance/${classId}/${uid}`).get();
        const personal = personalSnap.val() || {};
        if ((personal.completedAgendaIds || []).includes(task.id)) continue;
        if ((personal.hiddenAgendaIds || []).includes(task.id)) continue;
        if ((personal.excludedSubjectIds || []).includes(subject.id)) continue;

        const notificationId = `${eventKey(task, classId)}:${sendMode}`;
        if (await alreadySent(uid, notificationId)) continue;

        const n = await sendToUser(uid, task, classId, personal);
        if (n > 0) {
          await markSent(uid, notificationId, {
            mode: sendMode,
            dueDate: task.dueDate,
            type: 'shared',
            classId
          });
          sent += n;
        }
      }
    }
  }
  return sent;
}

async function main() {
  const now = new Date();
  const parts = madridParts(now);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const today = madridDateKey(now);

  // GitHub Actions runs every 15 minutes. Only act during the 08:00 and 18:00 windows.
  let sendMode = null;
  if (hour === 8 && minute < 15) sendMode = 'same-day';
  if (hour === 18 && minute < 15) sendMode = 'day-before';

  if (!sendMode) {
    console.log(`Fuera de ventana de envío (${parts.hour}:${parts.minute} Madrid).`);
    return;
  }

  const usersSnap = await db.ref('users').get();
  const users = usersSnap.val() || {};
  let sent = 0;

  for (const [uid, userData] of Object.entries(users)) {
    sent += await processUser(uid, userData, today, sendMode);
  }

  sent += await processSharedClasses(today, sendMode);
  console.log(`Ventana ${sendMode}: ${sent} notificaciones enviadas.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
