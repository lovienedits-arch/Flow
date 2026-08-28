import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDo482Rc0T2BaX2zyTX589BfenbYXPpvD0",
  authDomain: "flow-nasai.firebaseapp.com",
  projectId: "flow-nasai",
  storageBucket: "flow-nasai.firebasestorage.app",
  messagingSenderId: "1035391569323",
  appId: "1:1035391569323:web:6109ee843524c6c377d6ee"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

window.googleLogin = async function () {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    console.log("Google login successful:", user.email);

    // Save user info for your existing FLOW UI
    localStorage.setItem("flowUser", JSON.stringify({
      name: user.displayName,
      email: user.email,
      photo: user.photoURL
    }));

    // Continue to your existing dashboard
    window.location.href = "/";
  } catch (error) {
    console.error("Google login failed:", error);
    alert("Google sign-in failed: " + error.message);
  }
};

window.flowLogout = async function () {
  await signOut(auth);
  localStorage.removeItem("flowUser");
};
