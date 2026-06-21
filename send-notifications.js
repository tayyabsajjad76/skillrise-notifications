// send-notifications.js
// Run via: node send-notifications.js
// Checks all users' task/quiz status + their toggle prefs (push + email),
// then sends FCM push and/or email, and writes a Firestore doc for the in-app "Recent" list.

const admin = require('firebase-admin');
const { Resend } = require('resend');

// ── Init Firebase Admin using service account from env (GitHub Secret) ──
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ── Init Resend (email) ──
const resend = new Resend(process.env.RESEND_API_KEY);
// Resend free tier requires sending FROM their test domain unless you verify your own.
const EMAIL_FROM = process.env.EMAIL_FROM || 'SkillRise <onboarding@resend.dev>';

// Which reminder type to run, passed from GitHub Actions matrix/input.
// Values: "task" | "quiz" | "weekly"
const REMINDER_TYPE = process.env.REMINDER_TYPE || 'task';

async function main() {
  console.log(`Running reminder type: ${REMINDER_TYPE}`);

  const usersSnap = await db.collection('users').get();
  console.log(`Found ${usersSnap.size} users`);

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const user = userDoc.data();
    const fcmToken = user.fcmToken;
    const userEmail = user.email;

    // ── Check toggle preference ──
    const prefsDoc = await db
      .collection('users').doc(uid)
      .collection('notificationSettings').doc('prefs')
      .get();

    if (!prefsDoc.exists) {
      console.log(`Skip ${uid}: no prefs doc`);
      continue;
    }
    const prefs = prefsDoc.data();

    if (prefs[REMINDER_TYPE] !== true) {
      console.log(`Skip ${uid}: ${REMINDER_TYPE} reminder disabled`);
      continue;
    }

    // ── Decide if this user actually needs this reminder ──
    let shouldSend = false;
    let title = '';
    let body = '';
    let icon = '🔔';

    if (REMINDER_TYPE === 'task') {
      const tasksSnap = await db.collection('users').doc(uid).collection('tasks').get();
      const pendingTasks = tasksSnap.docs.filter(d => d.data().done === false);
      if (pendingTasks.length > 0) {
        shouldSend = true;
        title = 'Tasks Pending Today';
        body = `You have ${pendingTasks.length} task(s) left to complete. Keep going! 💪`;
        icon = '📋';
      }
    }

    if (REMINDER_TYPE === 'quiz') {
      const quizSnap = await db.collection('users').doc(uid).collection('quiz_history')
        .orderBy('createdAt', 'desc').limit(1).get();
      const lastQuizDate = quizSnap.empty ? null : quizSnap.docs[0].data().createdAt?.toDate();
      const daysSince = lastQuizDate
        ? (Date.now() - lastQuizDate.getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;
      if (daysSince >= 3) {
        shouldSend = true;
        title = 'Quiz Reminder';
        body = `It's been a while since your last quiz. Take one now to keep your streak! 🧠`;
        icon = '🧠';
      }
    }

    if (REMINDER_TYPE === 'weekly') {
      shouldSend = true; // weekly report always sends once a week
      const roadmapSnap = await db.collection('users').doc(uid).collection('roadmap').get();
      const total = roadmapSnap.docs.length;
      const done = roadmapSnap.docs.filter(d => d.data().done === true).length;
      const pct = total === 0 ? 0 : Math.round((done / total) * 100);
      title = 'Your Weekly Report';
      body = `You're ${pct}% through your roadmap this week. Keep it up! 📈`;
      icon = '📊';
    }

    if (!shouldSend) {
      console.log(`Skip ${uid}: condition not met for ${REMINDER_TYPE}`);
      continue;
    }

    // ── Send FCM push (only if push toggle ON + token exists) ──
    let pushSent = false;
    if (prefs.push === true && fcmToken) {
      try {
        await admin.messaging().send({
          token: fcmToken,
          notification: { title, body },
        });
        pushSent = true;
        console.log(`✅ Push sent to ${uid}`);
      } catch (err) {
        console.error(`❌ FCM send failed for ${uid}:`, err.message);
      }
    } else {
      console.log(`Push skipped for ${uid} (toggle off or no token)`);
    }

    // ── Send Email (only if email toggle ON + email exists) ──
    let emailSent = false;
    if (prefs.email === true && userEmail) {
      try {
        await resend.emails.send({
          from: EMAIL_FROM,
          to: userEmail,
          subject: title,
          html: `<p>${body}</p>`,
        });
        emailSent = true;
        console.log(`✅ Email sent to ${uid} (${userEmail})`);
      } catch (err) {
        console.error(`❌ Email send failed for ${uid}:`, err.message);
      }
    } else {
      console.log(`Email skipped for ${uid} (toggle off or no email)`);
    }

    if (!pushSent && !emailSent) {
      console.log(`Skip ${uid}: nothing sent, not writing Firestore doc`);
      continue; // nothing actually went out, skip writing the "Recent" doc
    }

    // ── Write Firestore notification doc (for in-app "Recent" list) ──
    await db.collection('users').doc(uid).collection('notifications').add({
      title,
      body,
      icon,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
