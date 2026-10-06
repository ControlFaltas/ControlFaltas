import crypto from 'node:crypto';
import admin from 'firebase-admin';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'control-faltas-26';
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://control-faltas-26-default-rtdb.europe-west1.firebasedatabase.app';
const APP_URL = process.env.APP_URL || 'https://TU-USUARIO.github.io/TU-REPOSITORIO/';
const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!SERVICE_ACCOUNT_JSON) {
  throw new Error('Falta el secreto FIREBASE_SERVICE_ACCOUNT en GitHub Actions.');
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
} catch (error) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT no contiene un JSON válido.');
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: DATABASE_URL,
    projectId: PROJECT_ID
  });
}

const db = admin.database();
const messaging = admin.messaging();

function madridNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute'))
  };
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function reminderKey(task, reminderType, scope) {
  return crypto.createHash('sha256')
    .update(`${scope}|${task.id}|${task.dueDate}|${reminderType}`)
    .digest('hex');
}

function cleanTokens(tokenNode) {
  if (!tokenNode || typeof tokenNode !== 'object') return [];
  return Object.values(tokenNode)
    .map((item) => item?.token)
    .filter((token) => typeof token === 'string' && token.length > 20);
}

function isValidTask(task) {
  return task && task.id && task.dueDate && task.title && (task.type === 'exam' || task.type !== 'exam');
}

function taskText(task, reminderType) {
  const kind = task.type === 'exam' ? 'examen' : 'deberes';
  const when = reminderType === 'day-before' ? 'mañana' : 'hoy';
  const subject = task.subjectName ? ` · ${task.subjectName}` : '';
  return {
    title: task.type === 'exam' ? '📚 Examen próximo' : '📝 Deberes próximos',
    body: `${task.title}${subject} es ${when}.`
  };
}

async function alreadySent(uid, fingerprint) {
  const snap = await db.ref(`notificationSent/${uid}/${fingerprint}`).get();
  return snap.exists();
}

async function markSent(uid, fingerprint, info) {
  await db.ref(`notificationSent/${uid}/${fingerprint}`).set({
    ...info,
    sentAt: Date.now()
  });
}

async function sendToUser(uid, tokens, task, reminderType, scope) {
  if (!tokens.length) return { sent: false, reason: 'no-tokens' };

  const fingerprint = reminderKey(task, reminderType, scope);
  if (await alreadySent(uid, fingerprint)) return { sent: false, reason: 'already-sent' };

  const text = taskText(task, reminderType);
  const url = `${APP_URL}#agenda`;
  const payload = {
    data: {
      title: text.title,
      body: text.body,
      url,
      notificationId: fingerprint,
      taskId: String(task.id),
      taskType: task.type === 'exam' ? 'exam' : 'task',
      reminderType
    }
  };

  let sentCount = 0;
  const invalidTokens = [];

  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const response = await messaging.sendEachForMulticast({ tokens: batch, ...payload });
    sentCount += response.successCount;

    response.responses.forEach((result, index) => {
      if (!result.success) {
        const code = result.error?.code || '';
        if (
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-registration-token')
        ) {
          invalidTokens.push(batch[index]);
        }
      }
    });
  }

  if (invalidTokens.length) {
    const tokenSnapshot = await db.ref(`users/${uid}/notificationTokens`).get();
    const current = tokenSnapshot.val() || {};
    const updates = {};
    for (const [hash, item] of Object.entries(current)) {
      if (invalidTokens.includes(item?.token)) updates[hash] = null;
    }
    if (Object.keys(updates).length) await db.ref(`users/${uid}/notificationTokens`).update(updates);
  }

  if (sentCount > 0) {
    await markSent(uid, fingerprint, {
      taskId: String(task.id),
      dueDate: task.dueDate,
      reminderType,
      scope,
      title: task.title
    });
    return { sent: true, sentCount };
  }

  return { sent: false, reason: 'send-failed' };
}

function shouldSend(task, today, hour) {
  if (!isValidTask(task)) return null;
  if (task.completed) return null;

  if (hour === 18 && task.dueDate === addDays(today, 1)) return 'day-before';
  if (hour === 8 && task.dueDate === today) return 'same-day';
  return null;
}

async function main() {
  const now = madridNow();
  console.log(`Hora de Madrid: ${now.date} ${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`);

  // Solo trabajamos durante las dos ventanas de envío.
  if (now.hour !== 8 && now.hour !== 18) {
    console.log('Fuera de la ventana de recordatorios.');
    return;
  }

  const [usersSnap, classesSnap, classAttendanceSnap] = await Promise.all([
    db.ref('users').get(),
    db.ref('classes').get(),
    db.ref('classAttendance').get()
  ]);

  const users = usersSnap.val() || {};
  const classes = classesSnap.val() || {};
  const classAttendance = classAttendanceSnap.val() || {};

  let sent = 0;
  let skipped = 0;

  // 1. Agenda privada: cada usuario recibe solo sus propios eventos.
  for (const [uid, userData] of Object.entries(users)) {
    const tokens = cleanTokens(userData?.notificationTokens);
    if (!tokens.length) continue;

    const tasks = Array.isArray(userData?.appData?.agendaTasks)
      ? userData.appData.agendaTasks
      : Object.values(userData?.appData?.agendaTasks || {});

    for (const task of tasks) {
      const reminderType = shouldSend(task, now.date, now.hour);
      if (!reminderType) continue;
      const result = await sendToUser(uid, tokens, task, reminderType, `private:${uid}`);
      if (result.sent) sent += result.sentCount;
      else skipped++;
    }
  }

  // 2. Clases compartidas: cada alumno recibe el evento solo si está matriculado
  // en la asignatura correspondiente y no lo ha ocultado/completado para sí mismo.
  for (const [classId, classData] of Object.entries(classes)) {
    const tasks = Array.isArray(classData?.appData?.agendaTasks)
      ? classData.appData.agendaTasks
      : Object.values(classData?.appData?.agendaTasks || {});
    if (!tasks.length) continue;

    const deleted = new Set(Object.keys(classData?.deletedAgendaTasks || {}));
    const members = classData?.members || {};

    for (const [uid] of Object.entries(members)) {
      const userData = users[uid] || {};
      const tokens = cleanTokens(userData.notificationTokens);
      if (!tokens.length) continue;

      const personal = classAttendance?.[classId]?.[uid] || {};
      const excluded = new Set(personal.excludedSubjectIds || []);
      const completed = new Set(personal.completedAgendaIds || []);
      const hidden = new Set(personal.hiddenAgendaIds || []);

      const classSubjects = Array.isArray(classData?.appData?.subjects)
        ? classData.appData.subjects
        : Object.values(classData?.appData?.subjects || {});

      for (const task of tasks) {
        if (deleted.has(String(task?.id))) continue;
        if (completed.has(String(task?.id)) || hidden.has(String(task?.id))) continue;

        const subject = classSubjects.find((s) => String(s?.id) === String(task?.subjectId));
        if (!subject) continue;
        if (excluded.has(String(subject.id))) continue;

        const reminderType = shouldSend(task, now.date, now.hour);
        if (!reminderType) continue;

        const result = await sendToUser(uid, tokens, task, reminderType, `class:${classId}`);
        if (result.sent) sent += result.sentCount;
        else skipped++;
      }
    }
  }

  console.log(`Proceso terminado. Notificaciones enviadas: ${sent}. Omitidas/repetidas: ${skipped}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
