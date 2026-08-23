// FLORA-SE Nigeria — shared team auth helper
// Used by Habitat Scorer and Decision Layer (not EcoPlotScribe, which stays public).

function initTeamAuth(containerId, onStateChange){
  const el = document.getElementById(containerId);

  function renderSignedOut(){
    el.innerHTML = `
      <div class="card" id="teamAuthCard">
        <div class="card-title">Team Sign In</div>
        <div class="helptext" style="margin-bottom:8px;">This tool syncs to the shared database, so it needs the team login. Ask the PI for the shared credentials if you don't have them.</div>
        <div class="field-row">
          <div class="field"><label for="teamEmail">Email</label><input type="text" id="teamEmail" placeholder="ecosynthralab@gmail.com"></div>
          <div class="field"><label for="teamPassword">Password</label><input type="text" id="teamPassword" placeholder="shared password"></div>
        </div>
        <button class="btn" id="teamSignInBtn">Sign In</button>
        <div class="helptext" id="teamAuthStatus" style="margin-top:8px;"></div>
      </div>
    `;
    document.getElementById('teamSignInBtn').addEventListener('click', () => {
      const email = document.getElementById('teamEmail').value.trim();
      const password = document.getElementById('teamPassword').value;
      const status = document.getElementById('teamAuthStatus');
      status.textContent = 'Signing in…';
      fbAuth.signInWithEmailAndPassword(email, password)
        .catch(() => { status.textContent = 'Sign-in failed — check the credentials and try again.'; });
    });
  }

  function renderSignedIn(){
    el.innerHTML = `
      <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
        <div class="helptext">Signed in as team member — syncing enabled.</div>
        <button class="btn btn-ghost btn-sm" id="teamSignOutBtn">Sign out</button>
      </div>
    `;
    document.getElementById('teamSignOutBtn').addEventListener('click', () => fbAuth.signOut());
  }

  fbAuth.onAuthStateChanged(user => {
    if(user){ renderSignedIn(); onStateChange(true); }
    else { renderSignedOut(); onStateChange(false); }
  });
}
