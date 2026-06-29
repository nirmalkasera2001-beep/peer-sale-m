let auth = null;
let currentUser = null;
function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();

  auth.signInWithPopup(provider)
    .then((result) => {
      currentUser = result.user;
      showToast(`Welcome ${currentUser.displayName}!`, "success");
    })
    .catch((error) => {
      console.error(error);
      showToast("Google Sign-In failed.", "danger");
    });
}
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    console.log("Logged in as:", user.displayName);
  } else {
    currentUser = null;
    console.log("User signed out");
  }
});
window.auth = auth;
window.currentUser = currentUser;
window.signInWithGoogle = signInWithGoogle;