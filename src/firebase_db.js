// =====================================================================
// firebase_db.js — Cloud Firestore 高速單一真實資料源模組
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
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
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
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
    await ensureAuth();
    await setDoc(doc(db, "students", u), {
      ...payload,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (e) {
    console.warn("[Firestore] save error:", e);
    return false;
  }
}
