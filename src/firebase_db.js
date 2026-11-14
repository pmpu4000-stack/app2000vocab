// =====================================================================
// firebase_db.js — Cloud Firestore 高速單一真實資料源模組
// =====================================================================
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAoT6VH_jwOvI65N8JehrMZAa8AxcbjS_k",
  authDomain: "spellingagent.firebaseapp.com",
  projectId: "spellingagent",
  storageBucket: "spellingagent.firebasestorage.app",
  messagingSenderId: "997152148801",
  appId: "1:997152148801:web:7343355cbe135c402ee5c0",
  measurementId: "G-351EWG42EF"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
const auth = getAuth(app);
export async function loginWithFirebaseAuth(username, password) {
  const u = String(username || "").trim().toLowerCase();
  if (!u || !password) return null;
  const email = `${u}@vocab.app`;
  const pwd = String(password).length < 6 ? `${password}_v26app` : String(password);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pwd);
    return cred.user;
  } catch (e) {
    console.warn("[FirebaseAuth] signIn error:", e?.code, e?.message);
    return null;
  }
}

function ensureAuth() {
  return Promise.resolve(auth.currentUser || null);
}

/**
 * 從 Firestore 讀取學生完整學習紀錄
 * @param {string} username
 */
export async function loadStudentFromFirestore(username) {
  const u = String(username || "").trim().toLowerCase();
  if (!u) return null;
  try {
    await ensureAuth();
    const snap = await getDoc(doc(db, "students", u));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn("[Firestore] load error:", e);
    return null;
  }
}

/**
 * 將學生完整學習紀錄寫入 Firestore（毫秒級背景同步）
 * @param {string} username
 * @param {object} payload
 */
export async function saveStudentToFirestore(username, payload) {
  const u = String(username || "").trim().toLowerCase();
  if (!u || !payload) return false;
  try {
    const user = await ensureAuth();
    let devId = localStorage.getItem("app_device_id");
    if (!devId) {
      devId = "dev_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem("app_device_id", devId);
    }
    await setDoc(doc(db, "students", u), {
      ...payload,
      ownerUid: user ? user.uid : "",
      lastDeviceId: devId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    try {
      const devRef = doc(db, "devices", devId);
      const devSnap = await getDoc(devRef);
      const prevList = (devSnap.exists() && Array.isArray(devSnap.data().accounts)) ? devSnap.data().accounts : [];
      const nextList = prevList.includes(u) ? prevList : [...prevList, u];
      await setDoc(devRef, {
        accounts: nextList,
        sharedDevice: nextList.length >= 2,
        ua: (typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : ""),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (_) {}
    return true;
  } catch (e) {
    console.warn("[Firestore] save error:", e);
    return false;
  }
}

export async function getUserProfileFromFirestore(username) {
  const u = String(username || "").trim().toLowerCase();
  if (!u) return null;
  try {
    await ensureAuth();
    const snap = await getDoc(doc(db, "users", u));
    return snap.exists() ? snap.data() : null;
  } catch (_) { return null; }
}

export async function saveUserProfileToFirestore(username, profile) {
  const u = String(username || "").trim().toLowerCase();
  if (!u || !profile) return false;
  try {
    await ensureAuth();
    await setDoc(doc(db, "users", u), { ...profile, updatedAt: new Date().toISOString() }, { merge: true });
    return true;
  } catch (_) { return false; }
}

export async function getDailyTaskFromFirestore(classKey) {
  const k = String(classKey || "default").trim();
  try {
    await ensureAuth();
    const snap = await getDoc(doc(db, "tasks", k));
    return snap.exists() ? snap.data() : null;
  } catch (_) { return null; }
}

export async function saveDailyTaskToFirestore(classKey, taskObj) {
  const k = String(classKey || "default").trim();
  try {
    await ensureAuth();
    await setDoc(doc(db, "tasks", k), { ...taskObj, updatedAt: new Date().toISOString() }, { merge: true });
    return true;
  } catch (_) { return false; }
}

export async function getTimeSettingsFromFirestore(docKey = "global") {
  try {
    await ensureAuth();
    const snap = await getDoc(doc(db, "settings", docKey));
    return snap.exists() ? snap.data() : null;
  } catch (_) { return null; }
}

export async function saveTimeSettingsToFirestore(docKey = "global", settingsObj) {
  try {
    await ensureAuth();
    await setDoc(doc(db, "settings", docKey), { ...settingsObj, updatedAt: new Date().toISOString() }, { merge: true });
    return true;
  } catch (_) { return false; }
}

export async function createAccountInFirebase(username, password, profile = {}) {
  const u = String(username || "").trim().toLowerCase();
  if (!u) return { ok: false, error: "帳號不可為空" };
  try {
    if (password) {
      const email = `${u}@vocab.app`;
      const pwd = String(password).length < 6 ? `${password}_v26app` : String(password);
      const secApp = getApps().find(a => a.name === "accountCreator") || initializeApp(firebaseConfig, "accountCreator");
      const secAuth = getAuth(secApp);
      try {
        await createUserWithEmailAndPassword(secAuth, email, pwd);
      } catch (e) {
        if (e?.code !== "auth/email-already-in-use") {
          return { ok: false, error: e?.message || "建立 Auth 失敗" };
        }
      } finally {
        await signOut(secAuth).catch(() => {});
      }
    }
    const updateData = { username: u, updatedAt: new Date().toISOString() };
    if (profile.role) updateData.role = profile.role;
    if (profile.realName) updateData.realName = profile.realName;
    if (profile.className !== undefined && profile.className !== "") updateData.className = profile.className;
    await setDoc(doc(db, "users", u), updateData, { merge: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "寫入失敗" };
  }
}

export async function listUsersFromFirestore() {
  try {
    await ensureAuth();
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (_) { return []; }
}

if (typeof window !== "undefined") {
  window.FirebaseDB = Object.assign(window.FirebaseDB || {}, {
    loginWithFirebaseAuth,
    loadStudentFromFirestore,
    saveStudentToFirestore,
    getUserProfileFromFirestore,
    saveUserProfileToFirestore,
    getDailyTaskFromFirestore,
    saveDailyTaskToFirestore,
    getTimeSettingsFromFirestore,
    saveTimeSettingsToFirestore,
    createAccountInFirebase,
    listUsersFromFirestore
  });
}
