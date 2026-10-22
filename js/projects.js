// Shared SaaSy Accounts cloud projects and per-tab browser draft recovery.
const SAASY_TOOL = 'lpg';
const MAX_PROJECT_BYTES = 19 * 1024 * 1024; // Leave room in the 20 MB request for metadata.
let currentProjectId = null, currentProjectName = '', currentProjectRevision = null;
let workspaceOwner = '', projectEpoch = 0, projectSaveInFlight = false;
let projectSaveAttempt = null, lastCloudSnapshot = '', editorDefaults;
let draftReady = false, draftPending = null, draftTimer, draftDatabase;
let draftTabKey = '', draftWrites = Promise.resolve(), draftGeneration = 0;
let lastDraftJSON = '', projectLoadSequence = 0, projectListSequence = 0;

const cloneProject = value => JSON.parse(JSON.stringify(value));
const projectEmail = () => String(window.SaasyAuth?.getEmail() || '').toLowerCase();
const projectElement = id => document.getElementById(id);
function projectStatus(message) { projectElement('project-status').textContent = message ? message + ' ' : ''; }
function draftStatus(message) { projectElement('draft-status').textContent = message; }
function projectError(error) {
  const code = error.code || error.message;
  return ({
    revision_conflict: 'This project changed in another tab. Save as New to keep your edits, or load the latest version.',
    account_changed: 'The signed-in account changed. Your draft was kept. Sign in with the original account or choose Save as New.',
    session_refresh_cancelled: 'Complete email sign-in, then try saving again. Your draft was kept.',
    payload_too_large: 'This project contains too much image data. Remove some images and try again.',
    project_payload_too_large: 'This project contains too much image data. Remove some images and try again.',
    sign_in_service_unavailable: 'The sign-in service is unavailable. Your draft was kept. Please try again.'
  })[code] || error.message || 'The request failed. Please try again.';
}
async function requireProjectAuth(expectedEmail) {
  await window.saasyAuthReady;
  if (!SaasyAuth.isSignedIn()) await SaasyAuth.signIn({ expectedEmail });
  if (expectedEmail && projectEmail() !== expectedEmail) throw new Error('account_changed');
  syncAuthUI();
}
async function accountsAction(action, owner = projectEmail()) {
  if (projectEmail() !== owner) throw new Error('account_changed');
  try {
    const result = await action();
    if (projectEmail() !== owner) throw new Error('account_changed');
    return result;
  }
  catch (error) {
    if (!['invalid_token', 'missing_token'].includes(error.code || error.message)) throw error;
    try { await SaasyAuth.signIn({ expectedEmail: owner }); }
    catch (error) { syncAuthUI(); throw new Error(error.code === 'account_changed' ? 'account_changed' : 'session_refresh_cancelled'); }
    syncAuthUI();
    if (projectEmail() !== owner) throw new Error('account_changed');
    return action();
  }
}
function positionAccountPopover(panel) {
  if (!panel || panel.hidden || panel.classList.contains('hidden')) return;
  const rect = projectElement('btn-auth').getBoundingClientRect();
  const width = Math.min(panel.id === 'account-menu' ? 320 : 400, window.innerWidth - 32);
  const top = Math.max(16, Math.min(rect.bottom + 10, window.innerHeight - 100));
  panel.style.width = width + 'px';
  panel.style.left = Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)) + 'px';
  panel.style.top = top + 'px';
  panel.style.maxHeight = Math.max(80, window.innerHeight - top - 16) + 'px';
}
function closeAccountMenu(restoreFocus = true) {
  const panel = projectElement('account-menu');
  const hadFocus = panel?.contains?.(document.activeElement);
  if (panel) panel.hidden = true;
  projectElement('btn-auth')?.setAttribute?.('aria-expanded', 'false');
  if (restoreFocus && hadFocus) projectElement('btn-auth')?.focus();
}
function syncAuthUI() {
  const signedIn = Boolean(window.SaasyAuth?.isSignedIn()), email = signedIn ? projectEmail() : '';
  if (projectElement('auth-email').textContent !== email || !signedIn) { closeAccountMenu(false); closeMyProjects(false); }
  projectElement('auth-email').textContent = email;
  projectElement('auth-email').classList.toggle('hidden', !signedIn);
  projectElement('account-name').textContent = signedIn ? email.split('@')[0] : 'Sign In';
  projectElement('account-avatar').textContent = email.slice(0, 1).toUpperCase();
  projectElement('account-avatar').hidden = !signedIn;
  projectElement('account-chevron').hidden = !signedIn;
  const trigger = projectElement('btn-auth');
  trigger.setAttribute?.('aria-label', signedIn ? 'Account for ' + email : 'Sign In');
  if (signedIn) {
    trigger.setAttribute?.('aria-controls', 'account-menu my-projects-panel');
    trigger.setAttribute?.('aria-expanded', String(!projectElement('account-menu').hidden || !projectElement('my-projects-panel').classList.contains('hidden')));
  } else { trigger.removeAttribute?.('aria-controls'); trigger.removeAttribute?.('aria-expanded'); }
}
async function onAuthButtonClick() {
  try {
    await window.saasyAuthReady;
    if (!SaasyAuth.isSignedIn()) { await requireProjectAuth(); return; }
    syncAuthUI();
    const panel = projectElement('account-menu');
    if (!panel.hidden) { closeAccountMenu(); return; }
    closeMyProjects(false);
    panel.hidden = false;
    projectElement('btn-auth').setAttribute('aria-expanded', 'true');
    positionAccountPopover(panel);
    projectElement('my-projects-trigger').focus();
  } catch (error) {
    if ((error.code || error.message) !== 'cancelled') projectStatus(projectError(error));
  }
}
async function signOutProjectAccount() {
  try {
    await window.saasyAuthReady;
    SaasyAuth.signOut();
    resetProjectIdentity(false);
    closeAccountMenu(false); closeMyProjects(false); syncAuthUI();
    window.LPGFeedback?.refreshSession(true);
    projectStatus('Signed out. Your current work is still in the editor.');
    projectElement('btn-auth').focus();
  } catch (error) { projectStatus(projectError(error)); }
}
function resetProjectIdentity(clearOwner = true) {
  currentProjectId = null; currentProjectName = ''; currentProjectRevision = null;
  if (clearOwner) workspaceOwner = '';
  projectSaveAttempt = null; lastCloudSnapshot = ''; projectEpoch++;
  projectLoadSequence++;
  closeMyProjects();
  projectStatus('New portal · not saved online.');
}
function buildProjectPayload() {
  const payload = cloneProject(state);
  payload._lpgEditor = { version: 1, step: currentStep, sourceUrl: projectElement('quickstart-url').value };
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > MAX_PROJECT_BYTES) throw new Error('project_payload_too_large');
  return payload;
}
function validatePortalPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('This is not a saved loyalty portal.');
  for (const key of ['brand', 'colors', 'member', 'sections']) {
    if (!payload[key] || typeof payload[key] !== 'object' || Array.isArray(payload[key])) throw new Error('This saved portal is incomplete.');
  }
  for (const key of ['tiers', 'vouchers', 'offers', 'badges', 'clubs', 'earnMore', 'benefits', 'profileTasks', 'navLinks']) {
    if (payload[key] !== undefined && !Array.isArray(payload[key])) throw new Error('This saved portal has invalid content.');
  }
  if (!Array.isArray(payload.tiers)) throw new Error('This saved portal has invalid tiers.');
  return payload;
}
function hydratePortal(payload) {
  validatePortalPayload(payload);
  const copy = window.LPGRequirements && window.LPGProgram ? window.LPGRequirements.migratePayload(payload, window.LPGProgram) : cloneProject(payload), editor = copy._lpgEditor || {};
  delete copy._lpgEditor;
  // Accept older saved portals while filling newer optional fields with defaults.
  const restored = Object.assign(cloneProject(editorDefaults), copy);
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, restored);
  if (window.LPGContentContract) Object.assign(state,window.LPGContentContract.ensure(state));
  window.LPGImages?.invalidate();
  populateFormFromState(); renderDynamicSections();
  for (const [name, src] of [['logo', state.brand.logoData || state.brand.logoUrl], ['avatar', state.member.avatarData || state.member.avatarUrl]]) {
    const preview = projectElement('preview-' + name);
    if (preview) { preview.src = src || ''; preview.classList.toggle('hidden', !src); }
  }
  projectElement('quickstart-url').value = editor.sourceUrl || '';
  goToStep(Number.isInteger(editor.step) && editor.step >= 0 && editor.step < totalSteps ? editor.step : 0);
  schedulePreview();
}
async function saveCurrentProject() {
  const epoch = projectEpoch;
  try {
    await requireProjectAuth();
    if (epoch !== projectEpoch) return;
    projectElement('save-project-name').value = currentProjectName || state.brand.name || 'Untitled Portal';
    projectElement('save-project-error').textContent = '';
    const sameOwner = !workspaceOwner || workspaceOwner === projectEmail();
    projectElement('save-project-update').hidden = !sameOwner;
    projectElement('save-project-update').textContent = currentProjectId ? 'Update Project' : 'Save Project';
    projectElement('save-project-copy').hidden = !currentProjectId && sameOwner;
    projectElement('save-project-dialog').showModal();
  } catch (error) { projectStatus(projectError(error)); }
}
function closeSaveProjectDialog() {
  if (!projectSaveInFlight) projectElement('save-project-dialog').close();
}
function canonicalProject(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalProject).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalProject(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
async function saveProjectAttempt(options, owner) {
  try { return await accountsAction(() => SaasyAuth.saveProject(options), owner); }
  catch (error) {
    // An update may have committed even if its response was lost. Recognize
    // that exact save without overwriting edits from another tab.
    if ((error.code || error.message) === 'revision_conflict' && options.id && projectEmail() === owner) {
      const saved = await accountsAction(() => SaasyAuth.loadProject(options.id), owner);
      if (projectEmail() !== owner) throw new Error('account_changed');
      if (saved.tool === SAASY_TOOL && saved.name === options.name && saved.source_url === (options.sourceUrl || null) && canonicalProject(saved.payload) === canonicalProject(options.payload)) return saved;
    }
    throw error;
  }
}
async function confirmSaveProject(asNew = false) {
  if (projectSaveInFlight) return;
  const input = projectElement('save-project-name');
  if (!input.reportValidity()) return;
  const owner = projectEmail(), epoch = projectEpoch;
  projectSaveInFlight = true;
  const controls = [...projectElement('save-project-form').querySelectorAll('button, input')];
  controls.forEach(control => { control.disabled = true; });
  projectElement('save-project-error').textContent = 'Saving…';
  try {
    await requireProjectAuth(owner);
    if (epoch !== projectEpoch) throw new Error('The editor changed. Save the current portal again.');
    if (!asNew && workspaceOwner && workspaceOwner !== owner) throw new Error('account_changed');
    const payload = buildProjectPayload();
    const options = { tool: SAASY_TOOL, name: input.value.trim() || 'Untitled Portal', payload,
      id: asNew ? null : currentProjectId, sourceUrl: payload._lpgEditor.sourceUrl,
      expectedRevision: !asNew && currentProjectId ? (currentProjectRevision ?? undefined) : undefined };
    const signature = JSON.stringify({ options, owner });
    if (!projectSaveAttempt || projectSaveAttempt.signature !== signature) {
      options.idempotencyKey = 'lpg_save_' + crypto.randomUUID();
      projectSaveAttempt = { signature, options };
    }
    const project = await saveProjectAttempt(projectSaveAttempt.options, owner);
    if (projectEmail() !== owner) throw new Error('account_changed');
    if (epoch !== projectEpoch) throw new Error('The earlier portal was saved. The current editor was not replaced.');
    currentProjectId = project.id; currentProjectName = project.name;
    currentProjectRevision = project.revision; workspaceOwner = owner;
    lastCloudSnapshot = JSON.stringify(payload); projectSaveAttempt = null;
    const newerEdits = lastCloudSnapshot !== JSON.stringify(buildProjectPayload());
    projectStatus('Saved online: ' + project.name + '.' + (newerEdits ? ' Newer edits still need saving.' : ''));
    await persistDraftRecovery();
    projectElement('save-project-dialog').close();
  } catch (error) { projectElement('save-project-error').textContent = projectError(error); }
  finally { projectSaveInFlight = false; controls.forEach(control => { control.disabled = false; }); syncAuthUI(); }
}
async function openMyProjects() {
  const panel = projectElement('my-projects-panel');
  if (!panel.classList.contains('hidden')) return closeMyProjects();
  const epoch = projectEpoch;
  try {
    await requireProjectAuth();
    if (epoch !== projectEpoch) return;
    const owner = projectEmail(), request = ++projectListSequence;
    closeAccountMenu(false);
    panel.classList.remove('hidden');
    positionAccountPopover(panel);
    projectElement('btn-auth').setAttribute('aria-expanded', 'true');
    projectElement('my-projects-trigger')?.setAttribute('aria-expanded', 'true');
    panel.querySelector('button')?.focus();
    if (panel.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      panel.animate([{ opacity: 0, transform: 'scale(.98) translateY(-4px)' }, { opacity: 1, transform: 'scale(1) translateY(0)' }], { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    const list = projectElement('my-projects-list');
    list.textContent = 'Loading…';
    const projects = await accountsAction(() => SaasyAuth.listProjects({ tool: SAASY_TOOL }), owner);
    if (request !== projectListSequence || epoch !== projectEpoch || projectEmail() !== owner) return;
    list.textContent = projects.length ? '' : 'No saved projects yet.';
    projects.forEach(project => {
      const row = document.createElement('div'); row.className = 'project-list-entry';
      const info = document.createElement('div'); info.className = 'project-list-info';
      const title = document.createElement('strong'); title.textContent = project.name; title.title = project.name;
      const date = document.createElement('span');
      const savedAt = new Date(project.updatedAt || project.updated_at || project.createdAt || project.created_at || '');
      date.textContent = Number.isNaN(savedAt.getTime()) ? '' : savedAt.toLocaleDateString();
      info.append(title, date); row.appendChild(info);
      const actions = document.createElement('div'); actions.className = 'project-list-actions';
      for (const action of ['Load', 'Delete']) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = action;
        button.setAttribute('aria-label', action + ' ' + project.name);
        button.onclick = () => action === 'Load' ? loadProjectAndHydrate(project.id) : deleteProjectFromList(project.id, row, owner);
        actions.appendChild(button);
      }
      row.appendChild(actions);
      list.appendChild(row);
    });
  } catch (error) { projectStatus(projectError(error)); syncAuthUI(); }
}
function closeMyProjects(restoreFocus = true) {
  projectListSequence++;
  const panel = projectElement('my-projects-panel');
  const hadFocus = panel?.contains?.(document.activeElement);
  panel?.classList.add('hidden');
  projectElement('my-projects-list')?.replaceChildren?.();
  projectElement('my-projects-trigger')?.setAttribute('aria-expanded', 'false');
  if (projectElement('account-menu')?.hidden) projectElement('btn-auth')?.setAttribute?.('aria-expanded', 'false');
  if (restoreFocus && hadFocus) projectElement('btn-auth')?.focus();
}
document.addEventListener('keydown', event => {
  const panel = projectElement('my-projects-panel');
  if (event.key === 'Escape' && !projectElement('account-menu')?.hidden) { closeAccountMenu(); event.preventDefault(); }
  if (event.key === 'Escape' && panel && !panel.classList.contains('hidden')) {
    closeMyProjects(); event.preventDefault();
  }
});
document.addEventListener('click', event => {
  const panel = projectElement('my-projects-panel');
  const trigger = projectElement('btn-auth'), accountMenu = projectElement('account-menu');
  if (accountMenu && !accountMenu.hidden && !accountMenu.contains(event.target) && !trigger?.contains(event.target)) closeAccountMenu(false);
  if (panel && !panel.classList.contains('hidden') && !panel.contains(event.target) && !trigger?.contains(event.target) && !projectElement('my-projects-trigger')?.contains(event.target)) closeMyProjects(false);
});
async function deleteProjectFromList(id, row, owner = projectEmail()) {
  if (!confirm('Delete this saved project?')) return;
  try {
    await requireProjectAuth(owner);
    await accountsAction(() => SaasyAuth.deleteProject(id), owner);
    if (projectEmail() !== owner) return;
    row.remove();
    if (!projectElement('my-projects-list').children.length) projectElement('my-projects-list').textContent = 'No saved projects yet.';
    if (String(id) === String(currentProjectId)) resetProjectIdentity(false);
    await persistDraftRecovery();
  } catch (error) { projectStatus(projectError(error)); }
}
async function loadProjectAndHydrate(id, confirmReplace = true) {
  const request = ++projectLoadSequence, epoch = projectEpoch;
  const snapshot = JSON.stringify(state);
  const source = projectElement('quickstart-url').value, step = currentStep;
  if (confirmReplace && !confirm('Load this project and replace the current editor contents?')) return false;
  try {
    await requireProjectAuth();
    const owner = projectEmail();
    const project = await accountsAction(() => SaasyAuth.loadProject(id), owner);
    if (projectEmail() !== owner) throw new Error('account_changed');
    if (request !== projectLoadSequence || epoch !== projectEpoch || snapshot !== JSON.stringify(state) || source !== projectElement('quickstart-url').value || step !== currentStep) throw new Error('The editor changed while loading. Your current work was kept. Try loading again.');
    if (project.tool !== SAASY_TOOL) throw new Error('This project belongs to another app. Open a Loyalty Portal project.');
    validatePortalPayload(project.payload);
    currentProjectId = project.id; currentProjectName = project.name; currentProjectRevision = project.revision;
    workspaceOwner = owner; projectEpoch++; projectSaveAttempt = null;
    draftPending = null; projectElement('draft-actions').hidden = true;
    hydratePortal(project.payload); lastCloudSnapshot = JSON.stringify(buildProjectPayload());
    closeMyProjects(); projectStatus('Opened: ' + project.name + '.');
    await persistDraftRecovery();
    return true;
  } catch (error) { projectStatus(projectError(error)); return false; }
}

// Browser backup is independent of cloud saves and contains no credentials.
function openDraftDatabase() {
  if (draftDatabase) return draftDatabase;
  draftTabKey = sessionStorage.getItem('lpg-draft-tab') || crypto.randomUUID();
  sessionStorage.setItem('lpg-draft-tab', draftTabKey);
  draftDatabase = new Promise((resolve, reject) => {
    const request = indexedDB.open('lpg-recovery-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Browser backup storage is busy.'));
  });
  return draftDatabase;
}
async function draftStorage(method, value) {
  const db = await openDraftDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', method === 'get' ? 'readonly' : 'readwrite');
    const request = transaction.objectStore('drafts')[method](...(method === 'put' ? [value, draftTabKey] : [draftTabKey]));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
function scheduleDraftRecovery() {
  if (!draftReady || draftPending) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(persistDraftRecovery, 600);
}
async function persistDraftRecovery() {
  clearTimeout(draftTimer);
  if (!draftReady || draftPending) return false;
  const generation = draftGeneration;
  const record = { version: 1, payload: cloneProject(state), step: currentStep,
    sourceUrl: projectElement('quickstart-url').value, owner: workspaceOwner || projectEmail(),
    project: { id: currentProjectId, name: currentProjectName, revision: currentProjectRevision } };
  const json = JSON.stringify(record);
  const task = draftWrites.catch(() => {}).then(async () => {
    if (generation !== draftGeneration || json === lastDraftJSON) return;
    await draftStorage('put', record); lastDraftJSON = json;
  });
  draftWrites = task;
  try {
    await task;
    if (generation === draftGeneration) draftStatus('Draft backed up in this browser tab · not an online save.');
    return true;
  } catch (_) { draftStatus('Browser backup unavailable. Save online or download HTML before leaving.'); return false; }
}
async function discardDraftRecovery(announce = true) {
  draftPending = null; draftGeneration++; lastDraftJSON = '';
  clearTimeout(draftTimer); projectElement('draft-actions').hidden = true;
  const task = draftWrites.catch(() => {}).then(() => draftStorage('delete'));
  draftWrites = task;
  try { await task; if (announce) draftStatus('Browser backup discarded.'); }
  catch (_) { draftStatus('Could not clear the browser backup.'); }
}
async function restoreDraftRecovery() {
  const record = draftPending;
  if (!record) return;
  try {
    if (record.owner) await requireProjectAuth(record.owner);
    if (draftPending !== record) return;
    if (!confirm('Restore this draft and replace the current editor contents?')) return;
    validatePortalPayload(record.payload);
    currentProjectId = record.project?.id || null; currentProjectName = record.project?.name || '';
    currentProjectRevision = record.project?.revision || null; workspaceOwner = record.owner || '';
    projectEpoch++; projectLoadSequence++; projectSaveAttempt = null;
    draftPending = null; projectElement('draft-actions').hidden = true;
    hydratePortal({ ...record.payload, _lpgEditor: { step: record.step, sourceUrl: record.sourceUrl } });
    projectStatus('Browser draft restored · save online to keep it across devices.');
    await persistDraftRecovery();
  } catch (error) { projectStatus(projectError(error)); }
}
async function initializeProjects() {
  editorDefaults = cloneProject(state);
  projectElement('save-project-form').addEventListener('submit', event => { event.preventDefault(); confirmSaveProject(false); });
  projectElement('save-project-dialog').addEventListener('cancel', event => { if (projectSaveInFlight) event.preventDefault(); });
  document.addEventListener('input', scheduleDraftRecovery);
  document.addEventListener('change', scheduleDraftRecovery);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistDraftRecovery(); });
  window.addEventListener('pagehide', () => persistDraftRecovery());
  window.addEventListener('storage', event => {
    if (['saasy_auth_token', 'saasy_auth_email'].includes(event.key)) {
      syncAuthUI(); projectLoadSequence++;
      if (workspaceOwner && projectEmail() !== workspaceOwner) projectStatus('Account changed. Your draft remains in the editor.');
    }
  });
  window.addEventListener('beforeunload', event => {
    if (JSON.stringify(state) === JSON.stringify(editorDefaults)) return;
    let saved = false;
    try { saved = lastCloudSnapshot === JSON.stringify(buildProjectPayload()); } catch (_) { /* oversized draft */ }
    if (!saved) { persistDraftRecovery(); event.preventDefault(); event.returnValue = ''; }
  });
  try {
    const record = await draftStorage('get');
    if (record?.version === 1) {
      validatePortalPayload(record.payload); draftPending = record;
      projectElement('draft-actions').hidden = false;
      draftStatus('A browser draft is available.');
    }
  } catch (_) { draftStatus('Browser backup unavailable. Save online or download HTML to keep your work.'); }
  draftReady = true;
  try { await window.saasyAuthReady; syncAuthUI(); }
  catch (error) { projectStatus(projectError(error)); return; }
  const id = new URLSearchParams(location.search).get('projectId');
  if (id) {
    if (!draftPending || confirm('Open the linked cloud project instead of the available browser draft?')) await loadProjectAndHydrate(id, false);
  }
}

function repositionAccountPopovers(event) {
  for (const id of ['account-menu', 'my-projects-panel']) {
    const panel = projectElement(id);
    if (event?.type === 'scroll' && panel?.contains?.(event.target)) continue;
    positionAccountPopover(panel);
  }
}
window.addEventListener('resize', repositionAccountPopovers);
document.addEventListener('scroll', repositionAccountPopovers, true);
