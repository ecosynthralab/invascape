// FLORA-SE Nigeria — shared team auth helper
// Used by Habitat Scorer and Decision Layer (not EcoPlotScribe, which stays public).

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function sanitizeTeamId(value){
  return String(value ?? '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').toLowerCase();
}

function getCurrentTeamId(){
  const saved = localStorage.getItem('invascapeTeamId');
  return sanitizeTeamId(saved || 'default');
}

function setCurrentTeamId(teamId){
  const normalized = sanitizeTeamId(teamId || 'default');
  localStorage.setItem('invascapeTeamId', normalized);
  return normalized;
}

function getTeamScopedStorageKey(baseKey, teamId = getCurrentTeamId()){
  const safeTeamId = sanitizeTeamId(teamId || 'default');
  return `${baseKey}_${safeTeamId}`;
}

function getTeamScopedDbPath(baseKey, teamId = getCurrentTeamId()){
  const safeTeamId = sanitizeTeamId(teamId || 'default');
  return `teams/${safeTeamId}/${baseKey}`;
}

function initTeamAuth(containerId, onStateChange){
  const el = document.getElementById(containerId);

  function renderSignedOut(){
    el.innerHTML = `
      <div class="card" id="teamAuthCard">
        <div class="card-title">Team Setup</div>
        <div class="helptext" style="margin-bottom:8px;">Choose a Team ID to keep this team's records separate. Firebase sync is optional and only used when you want to share data to the cloud.</div>
        <div class="field-row">
          <div class="field"><label for="teamId">Team ID</label><input type="text" id="teamId" placeholder="team-a" value="${escapeHtml(getCurrentTeamId())}" autocomplete="off"></div>
          <div class="field"><label for="teamEmail">Firebase email (optional)</label><input type="email" id="teamEmail" placeholder="team-member@domain.edu" autocomplete="username"></div>
          <div class="field"><label for="teamPassword">Firebase password (optional)</label><input type="password" id="teamPassword" placeholder="password" autocomplete="current-password"></div>
        </div>
        <div class="save-row" style="margin-top:8px;">
          <button class="btn" id="teamSetIdBtn">Save Team</button>
          <button class="btn btn-ghost" id="teamSignInBtn">Sync to Firebase</button>
        </div>
        <div class="helptext" id="teamAuthStatus" style="margin-top:8px;"></div>
      </div>
    `;

    document.getElementById('teamSetIdBtn').addEventListener('click', () => {
      const teamId = setCurrentTeamId(document.getElementById('teamId').value);
      const status = document.getElementById('teamAuthStatus');
      if(!teamId || teamId === 'default'){ status.textContent = 'Enter a unique Team ID to keep records separated.'; return; }
      status.textContent = `Team set to “${teamId}”. Local data is now separated for this team.`;
      onStateChange(false);
    });

    document.getElementById('teamSignInBtn').addEventListener('click', () => {
      const teamId = setCurrentTeamId(document.getElementById('teamId').value);
      const email = document.getElementById('teamEmail').value.trim();
      const password = document.getElementById('teamPassword').value;
      const status = document.getElementById('teamAuthStatus');
      if(!teamId || teamId === 'default'){ status.textContent = 'Enter a unique Team ID before syncing.'; return; }
      if(!email || !password){ status.textContent = 'Enter the Firebase email and password to enable cloud sync.'; return; }
      status.textContent = 'Signing in to Firebase…';
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
