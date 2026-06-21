# SkillRise Notifications — Setup Guide

## Files kya hain
- `send-notifications.js` → Main script, Firestore check karta + FCM push bhejta
- `package.json` → Node dependency (firebase-admin)
- `.github/workflows/notifications.yml` → GitHub Actions cron, auto-chalata script ko

## Setup Steps

### 1. Service account key lo (Firebase)
Firebase Console → Project Settings (gear icon) → Service Accounts tab →
"Generate new private key" → JSON file download hoga.

### 2. Resend account banao (Email ke liye, free)
1. https://resend.com pe signup karo (free, no card)
2. Dashboard → API Keys → "Create API Key" → copy karo (yeh sirf ek baar dikhega)
3. Free tier: 100 emails/day, 3000/month — bilkul kafi hai
4. Default sender `onboarding@resend.dev` use hoga (apna domain verify kiye bina bhi kaam karega, free tier mein)

### 3. GitHub repo banao (agar nahi hai)
Yeh poora `skillrise-notifications` folder ek GitHub repo mein push karo
(naya repo bana lo, public ya private — dono free hain).

```bash
cd skillrise-notifications
git init
git add .
git commit -m "Add notification script"
git remote add origin <tumhara-repo-url>
git push -u origin main
```

### 4. Secrets add karo GitHub mein
Repo → Settings → Secrets and variables → Actions → "New repository secret"

Do secrets banane hain:
- Name: `FIREBASE_SERVICE_ACCOUNT` → Value: Step 1 wali JSON file ka **pura content** paste karo
- Name: `RESEND_API_KEY` → Value: Step 2 wali Resend API key paste karo

### 5. Test karo manually
Repo → Actions tab → "Send Reminder Notifications" workflow select karo →
"Run workflow" button → reminder_type mein `task` likho → Run.

Logs mein dekho kya print ho raha — har user ke liye skip/sent reason dikhega.

### 6. Schedule automatic hai
Workflow file mein already cron set hai:
- Roz 7 PM PKT → Task reminder
- Roz 8 PM PKT → Quiz reminder
- Har Sunday 9 PM PKT → Weekly report

Koi extra kaam nahi — GitHub khud chalata rahega.

## Kaise kaam karta hai (recap)
1. Script `users` collection ke sab docs fetch karta
2. Har user ka `fcmToken`, `email`, aur `notificationSettings/prefs` check karta
3. Reminder type ka toggle (task/quiz/weekly) ON hai aur condition match (e.g. pending tasks) → aage badhta
4. **Push toggle ON + token hai** → FCM push bhejta
5. **Email toggle ON + email hai** → Resend se email bhejta
6. Push ya email mein se koi ek bhi gaya ho → Firestore `notifications` subcollection mein doc likhta
   (yehi Profile screen ke "Recent" mein dikhega)

## Notes
- Push aur Email dono **independent** hain — sirf push ON ho to sirf push jayega, sirf email ON ho to sirf email
- Agar dono OFF hain ya token/email missing hai → user ke liye kuch nahi hota, Firestore doc bhi nahi likhta
- GitHub Actions free tier: 2000 minutes/month — yeh script chalne mein chand seconds lagte, bilkul free rahega
- Resend free tier: 100 emails/day — is scale ke liye kafi zyada hai
