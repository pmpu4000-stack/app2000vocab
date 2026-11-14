// =====================================================================
// firebase_db.js — Cloud Firestore 高速單一真實資料源模組
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
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
let _authReady = null;
function ensureAuth() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (!_authReady) {
    _authReady = signInAnonymously(auth).catch(() => null);
  }
  return _authReady;
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
