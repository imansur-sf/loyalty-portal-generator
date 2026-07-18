// ============================================================
// generator.js — Builds complete loyalty portal HTML from state
// ============================================================

function generatePortalHTML(s) {
  const esc = (t) => (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const raw = (t) => t || '';
  const primaryLight = lightenColor(s.colors.primary, 20);
  const accentDark = darkenColor(s.colors.accent, 15);
  const menuColor = s.colors.menu || s.colors.primary;
  const menuColorLight = lightenColor(menuColor, 10);
  const programName = s.brand.programName || 'My Loyalty Perks';
  const brandAbbr = (s.brand.name || 'MY').split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,3) || 'MY';
  const logoSrc = s.brand.logoData || s.brand.logoUrl || '';
  const avatarSrc = s.member.avatarData || s.member.avatarUrl || '';
  const pointsToNext = s.tiers[1] ? Math.max(0, s.tiers[1].points - (s.member.points||0)) : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(programName)} — Loyalty Portal</title>
  <script src="https://cdn.tailwindcss.com/3.4.16"><\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style type="text/tailwindcss">
    @theme {
      --color-primary: ${s.colors.primary};
      --color-primary-light: ${primaryLight};
      --color-secondary: ${s.colors.secondary};
      --color-accent: ${s.colors.accent};
      --color-accent-dark: ${accentDark};
      --color-menu: ${menuColor};
      --color-menu-light: ${menuColorLight};
      --color-dark: ${s.colors.dark};
      --color-light: #FFFFFF;
      --color-success: #22C55E;
      --color-warning: #F59E0B;
      --color-danger: #EF4444;
      --color-muted: #6B7280;
      --color-border: #E5E7EB;
      --color-card: #FFFFFF;
      --color-page-bg: #F5F6F8;
    }
    :root {
      --brand-primary: ${s.colors.primary};
      --brand-primary-light: ${primaryLight};
      --brand-accent: ${s.colors.accent};
      --brand-menu: ${menuColor};
      --brand-dark: ${s.colors.dark};
    }
    body { font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
    .site-header { background-color: ${menuColor} !important; box-shadow: 0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06); }
    .toggle-content { max-height: 0; overflow: hidden; transition: max-height 0.4s ease-out, opacity 0.3s ease-out; opacity: 0; }
    .toggle-content.open { max-height: 2000px; opacity: 1; transition: max-height 0.5s ease-in, opacity 0.3s ease-in; }
    .chevron-icon { transition: transform 0.3s ease; }
    .chevron-icon.rotated { transform: rotate(180deg); }
    .card { background: #fff; border-radius: 14px; border: 1px solid #EAECEF; box-shadow: 0 1px 2px rgba(16,24,40,0.04); }
    .card-hover { transition: box-shadow 0.25s ease, transform 0.25s ease, border-color 0.25s ease; }
    .card-hover:hover { box-shadow: 0 10px 24px -8px rgba(16,24,40,0.12), 0 4px 8px -4px rgba(16,24,40,0.06); transform: translateY(-2px); border-color: rgba(0,0,0,0.08); }
    .voucher-card { transition: box-shadow 0.25s ease, transform 0.25s ease, border-color 0.25s ease; }
    .voucher-card:hover { box-shadow: 0 10px 24px -8px rgba(16,24,40,0.12), 0 4px 8px -4px rgba(16,24,40,0.06); transform: translateY(-2px); border-color: rgba(0,0,0,0.08); }
    .offer-card { transition: box-shadow 0.25s ease, transform 0.25s ease, border-color 0.25s ease; }
    .offer-card:hover { box-shadow: 0 14px 30px -10px rgba(16,24,40,0.14), 0 6px 12px -6px rgba(16,24,40,0.08); transform: translateY(-2px); }
    .earn-card { transition: box-shadow 0.25s ease, border-color 0.25s ease, transform 0.25s ease; }
    .earn-card:hover { box-shadow: 0 6px 16px -6px rgba(16,24,40,0.10); border-color: ${s.colors.primary}30; transform: translateY(-1px); }
    .badge-ring { box-shadow: 0 0 0 3px #fff, 0 0 0 5px currentColor, 0 8px 18px -8px rgba(16,24,40,0.35); }
    .member-hero { background: linear-gradient(135deg, ${s.colors.primary} 0%, ${darkenColor(s.colors.primary, 8)} 55%, ${lightenColor(s.colors.primary, 8)} 100%); position: relative; overflow: hidden; }
    .member-hero::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(circle at 85% 15%, rgba(255,255,255,0.10) 0%, transparent 45%), radial-gradient(circle at 15% 90%, rgba(255,255,255,0.08) 0%, transparent 40%); pointer-events: none; }
    .btn-primary { background: ${s.colors.primary}; color: #fff; transition: background 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease; box-shadow: 0 2px 8px -2px ${s.colors.primary}55; }
    .btn-primary:hover { background: ${primaryLight}; transform: translateY(-1px); box-shadow: 0 6px 16px -4px ${s.colors.primary}66; }
    .btn-ghost { background: transparent; color: ${s.colors.primary}; border: 1.5px solid ${s.colors.primary}; transition: background 0.2s ease, color 0.2s ease; }
    .btn-ghost:hover { background: ${s.colors.primary}; color: #fff; }
    .nav-link { position: relative; }
    .nav-link::after { content: ''; position: absolute; left: 50%; bottom: -6px; width: 0; height: 2px; background: ${s.colors.accent}; transition: width 0.25s ease, left 0.25s ease; }
    .nav-link:hover::after { width: 100%; left: 0; }
    .section-title { font-weight: 800; letter-spacing: -0.01em; }
    .divider-gradient { background: linear-gradient(90deg, transparent, ${s.colors.primary}20, transparent); height: 1px; }
  </style>
</head>
<body class="bg-page-bg text-dark min-h-screen">

${buildHeader(s, logoSrc, programName, brandAbbr, menuColor)}

<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <div class="flex items-end justify-between mb-6">
    <h1 class="text-3xl font-800 text-dark section-title">${esc(programName)}</h1>
  </div>

${buildMemberCard(s)}
${buildTierProgress(s, pointsToNext)}
${buildProfile(s)}
${buildBenefits(s)}

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div class="lg:col-span-2 space-y-6">
${s.sections.vouchers ? buildVouchers(s) : ''}
${s.sections.offers ? buildOffers(s) : ''}
${s.sections.earnMore ? buildEarnMore(s) : ''}
    </div>
    <div class="space-y-6">
${s.sections.profileTasks ? buildProfileTasks(s) : ''}
${s.sections.badges ? buildBadges(s) : ''}
${s.sections.clubs ? buildClubs(s) : ''}
${s.sections.upsell ? buildUpsell(s) : ''}
    </div>
  </div>
</main>

${buildFooter(s, programName, brandAbbr)}
${buildScript()}
</body>
</html>`;
}

// ---- HEADER ----
function buildHeader(s, logoSrc, programName, brandAbbr, menuColor) {
  const navLinks = (s.navLinks||[]).map(n =>
    `<a href="#" class="nav-link text-white/90 hover:text-white text-sm font-600 transition-colors">${n}</a>`
  ).join('\n            ');

  const logoHTML = logoSrc
    ? `<img src="${logoSrc}" alt="${s.brand.name}" class="h-10 w-auto object-contain" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <div class="items-center gap-1 hidden"><span class="text-xl font-800 tracking-tight text-white">${brandAbbr}</span><span class="text-lg font-800 tracking-wide text-white ml-1">PERKS</span></div>`
    : `<div class="flex items-center gap-1"><span class="text-xl font-800 tracking-tight text-white">${brandAbbr}</span><span class="text-lg font-800 tracking-wide text-white ml-1">PERKS</span></div>`;

  const menuAccent = s.colors.accent || '#4299E1';

  return `<header class="site-header sticky top-0 z-50" style="background-color: ${menuColor}; background-image: linear-gradient(180deg, ${lightenColor(menuColor, 3)} 0%, ${menuColor} 100%);">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <a href="#" class="flex items-center gap-2 shrink-0">
          ${logoHTML}
        </a>
        <nav class="hidden md:flex items-center gap-7">
            ${navLinks}
        </nav>
        <div class="flex items-center gap-3">
          <button class="hidden md:flex w-9 h-9 rounded-full items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors" title="Search">
            <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 18px; height: 18px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </button>
          <button class="md:hidden text-white"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg></button>
          <div class="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer ring-2 ring-white/20 hover:ring-white/40 transition-all" style="background-color: ${menuAccent};" title="Account">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" style="color: ${menuColor};"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          </div>
        </div>
      </div>
    </div>
  </header>`;
}

// ---- MEMBER CARD ----
function buildMemberCard(s) {
  const avatarSrc = s.member.avatarData || s.member.avatarUrl || '';
  const initials = (s.member.name||'M').split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2) || 'M';
  const avatarHTML = avatarSrc
    ? `<img src="${avatarSrc}" alt="${(s.member.name||'Member').replace(/"/g,'&quot;')}" class="w-16 h-16 rounded-full object-cover ring-2 ring-white/50 shadow-lg" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="w-16 h-16 rounded-full items-center justify-center text-xl font-800 hidden ring-2 ring-white/40" style="background-color: ${s.colors.accent}30; color: #fff; display: none;">${initials}</div>`
    : `<div class="w-16 h-16 rounded-full flex items-center justify-center text-xl font-800 ring-2 ring-white/40 shadow-lg" style="background-color: ${s.colors.accent}30; color: #fff;">${initials}</div>`;

  return `<div class="member-hero rounded-2xl p-6 mb-6 flex items-center justify-between overflow-hidden shadow-lg">
      <div class="flex items-center gap-4 relative z-10">
        ${avatarHTML}
        <div>
          <div class="text-white/70 text-[11px] font-600 tracking-[0.15em] uppercase">Loyalty Member · ${s.member.number||'000000'}</div>
          <div class="text-white text-2xl font-800 mt-1 tracking-tight">${s.member.name||'Member'}</div>
        </div>
      </div>
      <div class="flex items-center gap-6 relative z-10">
        <div class="text-right">
          <div class="text-white/70 text-[11px] font-600 tracking-[0.15em] uppercase">Perks Points</div>
          <div class="flex items-baseline gap-1 justify-end mt-1">
            <span class="text-white text-3xl font-900 tracking-tight">${(s.member.points||0).toLocaleString()}</span>
            <span class="text-white/80 text-sm font-600">Pts</span>
          </div>
        </div>
        <div class="hidden md:flex items-center gap-2" style="color: ${s.colors.accent};">
          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z"/></svg>
        </div>
      </div>
    </div>`;
}

// ---- TIER PROGRESS ----
function buildTierProgress(s, pointsToNext) {
  const tierIcons = [
    `<svg style="width: 28px; height: 28px;" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
    `<svg style="width: 28px; height: 28px;" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z"/></svg>`,
    `<svg style="width: 28px; height: 28px;" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16L3 5l5.5 5L12 2l3.5 8L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>`
  ];
  const tiersHTML = s.tiers.map((t,i) => {
    const isActive = i === 0;
    const bg = isActive ? s.colors.accent : s.colors.primary + '15';
    const iconColor = isActive ? s.colors.primary : s.colors.primary + '80';
    const ring = isActive ? `box-shadow: 0 0 0 3px ${s.colors.accent}40, 0 6px 16px -6px ${s.colors.accent}80;` : '';
    return `
              <div class="flex flex-col items-center text-center">
                <div class="w-16 h-16 rounded-full flex items-center justify-center mb-2 transition-transform hover:scale-105" style="background-color: ${bg}; color: ${iconColor}; ${ring}">${tierIcons[i]||tierIcons[2]}</div>
                <span class="text-sm font-700 text-dark">${t.name}</span>
                <span class="text-[11px] text-muted mt-0.5">${(t.points||0).toLocaleString()} Tier Points</span>
              </div>`;
  }).join('');

  const nextTierName = s.tiers[1] ? s.tiers[1].name : 'next tier';

  return `<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      <div class="lg:col-span-2 card p-6">
        <div class="flex items-start justify-between gap-8">
          <div class="flex-1">
            <div class="flex items-end justify-between mb-5">${tiersHTML}</div>
            <div class="relative h-2.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
              <div class="absolute left-0 top-0 h-full rounded-full transition-all" style="width: ${s.tierProgress}%; background: linear-gradient(90deg, ${s.colors.accent}, ${s.colors.primary});"></div>
              <div class="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-md" style="left: calc(${s.tierProgress}% - 8px); background-color: ${s.colors.accent};"></div>
            </div>
            <p class="text-sm text-dark">Earn <span class="font-800" style="color: ${s.colors.primary};">${pointsToNext.toLocaleString()} points</span> to reach ${nextTierName}! <a href="#" class="font-600 hover:underline ml-2" style="color: ${s.colors.primary};">View Benefits</a></p>
          </div>
        </div>
      </div>
      <div class="space-y-4">
        <div class="card card-hover p-4 flex gap-3">
          <div class="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0"><svg class="w-5 h-5 text-warning" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div>
          <div><p class="text-sm font-700 text-dark">How to retain your ${s.tiers[0].name} tier</p><p class="text-xs text-muted mt-1 leading-relaxed">${s.tiers[0].name} membership expiring in 3 days. Retain by earning 1000 tier points.</p><a href="#" class="text-xs font-700 hover:underline mt-2 inline-block" style="color: ${s.colors.primary};">Refer Now →</a></div>
        </div>
        <div class="card card-hover p-4 flex gap-3">
          <div class="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0"><svg class="w-5 h-5 text-danger" fill="currentColor" viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg></div>
          <div><p class="text-sm font-700 text-dark">Redeem 200 pts before they expire</p><p class="text-xs text-muted mt-1 leading-relaxed">200 Perks Points are expiring in 2 days. Redeem them now before it's too late!</p><a href="#" class="text-xs font-700 hover:underline mt-2 inline-block" style="color: ${s.colors.primary};">Redeem Now →</a></div>
        </div>
      </div>
    </div>`;
}

// ---- MY PROFILE (Expandable) ----
function buildProfile(s) {
  return `<div class="card mb-3 overflow-hidden">
      <button onclick="toggleSection('profile')" class="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50/60 transition-colors">
        <span class="text-base font-700 text-dark">My Profile</span>
        <svg id="profile-chevron" class="w-5 h-5 text-muted chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </button>
      <div id="profile-content" class="toggle-content">
        <div class="px-6 pb-6 border-t border-border pt-5">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div><span class="text-[10px] text-muted uppercase tracking-[0.15em] font-700">Name</span><p class="text-sm font-700 text-dark mt-1.5">${s.member.name||'Member'}</p></div>
            <div><span class="text-[10px] text-muted uppercase tracking-[0.15em] font-700">Join Date</span><p class="text-sm font-700 text-dark mt-1.5">${s.member.joinDate||'—'}</p></div>
            <div><span class="text-[10px] text-muted uppercase tracking-[0.15em] font-700">Phone</span><p class="text-sm font-700 text-dark mt-1.5">${s.member.phone||'—'}</p></div>
            <div><span class="text-[10px] text-muted uppercase tracking-[0.15em] font-700">Email</span><p class="text-sm font-700 text-dark mt-1.5 truncate">${s.member.email||'—'}</p></div>
          </div>
          <p class="text-xs text-muted mt-5">* Complete your profile to see customized offers & earn perks. <a href="#" class="font-700 hover:underline" style="color: ${s.colors.primary};">Edit Profile →</a></p>
        </div>
      </div>
    </div>`;
}

// ---- MY BENEFITS (Expandable) ----
function buildBenefits(s) {
  const items = (s.benefits||[]).map(b => `
            <div class="flex items-center gap-3 p-3 rounded-xl bg-page-bg transition-colors hover:bg-gray-100">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background-color: ${s.colors.primary}12;"><span class="text-lg">${b.emoji}</span></div>
              <div><p class="text-sm font-700 text-dark">${b.name}</p></div>
            </div>`).join('');

  return `<div class="card mb-8 overflow-hidden">
      <button onclick="toggleSection('benefits')" class="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50/60 transition-colors">
        <span class="text-base font-700 text-dark">My Benefits</span>
        <svg id="benefits-chevron" class="w-5 h-5 text-muted chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </button>
      <div id="benefits-content" class="toggle-content">
        <div class="px-6 pb-6 border-t border-border pt-5">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">${items}</div>
          <p class="text-xs text-muted mt-5">Upgrade to enjoy better benefits and exclusive offers. <a href="#" class="font-700 hover:underline" style="color: ${s.colors.primary};">View All Benefits →</a></p>
        </div>
      </div>
    </div>`;
}

// ---- MY VOUCHERS ----
function buildVouchers(s) {
  if (!s.vouchers || s.vouchers.length === 0) return '';
  const cards = s.vouchers.map((v,i) => {
    const imgSrc = v.imageData || v.imageUrl || '';
    const grad = v.gradient || VOUCHER_GRADIENTS[i % VOUCHER_GRADIENTS.length];
    const expiryText = (v.expiry||'').toLowerCase();
    const isExpiring = expiryText.includes('today') || expiryText.includes('expire');
    const expiryStyle = isExpiring ? 'color: #DC2626;' : 'color: #059669;';
    let actionHTML = '';
    if (v.actionType === 'points') {
      actionHTML = `<button class="btn-primary px-4 py-1.5 text-xs font-700 rounded-full">${v.actionValue||'Redeem'}</button>`;
    } else if (v.actionType === 'code') {
      actionHTML = `<div class="px-4 py-1.5 text-xs font-700 rounded-full text-white tracking-wider" style="background-color: ${s.colors.dark};">${v.actionValue||'CODE'}</div>`;
    } else {
      actionHTML = `<button class="btn-primary px-4 py-1.5 text-xs font-700 rounded-full">QR Code</button>`;
    }
    return `<div class="voucher-card card p-4 flex gap-4 cursor-pointer">
              <div class="w-20 h-20 rounded-xl bg-gradient-to-br from-${grad[0]} to-${grad[1]} flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                ${imgSrc ? `<img src="${imgSrc}" alt="${v.title}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><span class="text-3xl hidden">${v.emoji||'🎁'}</span>` : `<span class="text-3xl">${v.emoji||'🎁'}</span>`}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between"><div><h3 class="text-sm font-700 text-dark leading-tight">${v.title}</h3><p class="text-xs text-muted mt-1">${v.vendor||''}</p></div></div>
                ${v.expiry ? `<p class="text-[11px] font-700 mt-2 flex items-center gap-1" style="${expiryStyle}"><svg style="width: 12px; height: 12px;" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/></svg>${v.expiry}</p>` : ''}
                <div class="flex items-center gap-2 mt-3">${actionHTML}
                  <button class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors" title="Copy code"><svg class="w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg></button>
                </div>
              </div>
            </div>`;
  }).join('\n');

  return `<section id="section-vouchers">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-800 text-dark flex items-center gap-2.5 section-title"><span class="w-1 h-6 rounded-full" style="background-color: ${s.colors.primary};"></span>My Vouchers</h2>
            <a href="#" class="text-sm font-700 hover:underline transition-colors" style="color: ${s.colors.primary};">View All →</a>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${cards}</div>
        </section>`;
}

// ---- MY OFFERS ----
function buildOffers(s) {
  if (!s.offers || s.offers.length === 0) return '';
  const cards = s.offers.map((o,i) => {
    const imgSrc = o.imageData || o.imageUrl || '';
    const grad = o.gradient || OFFER_GRADIENTS[i % OFFER_GRADIENTS.length];
    const meta = [];
    if (o.playerCount) meta.push(`<span class="flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>${o.playerCount}</span>`);
    if (o.expiry) meta.push(`<span class="flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>${o.expiry}</span>`);
    return `<div class="offer-card card overflow-hidden flex">
              <div class="w-48 h-40 bg-gradient-to-br from-${grad[0]} to-${grad[1]} flex items-center justify-center shrink-0 overflow-hidden relative">
                ${imgSrc ? `<img src="${imgSrc}" alt="${o.title}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><span class="text-5xl hidden">${o.emoji||'🎯'}</span>` : `<span class="text-6xl drop-shadow-lg">${o.emoji||'🎯'}</span>`}
                <div class="absolute inset-0" style="background: linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.25) 100%);"></div>
              </div>
              <div class="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 class="text-base font-800 text-dark leading-tight">${o.title}</h3>
                  <p class="text-sm text-muted mt-1.5 leading-relaxed">${o.description||''}</p>
                  ${meta.length ? `<div class="flex items-center gap-4 mt-3 text-[11px] font-600 text-muted">${meta.join('')}</div>` : ''}
                </div>
                <button class="btn-primary self-start mt-4 px-6 py-2 text-sm font-700 rounded-full">${o.cta||'Learn More'}</button>
              </div>
            </div>`;
  }).join('\n');

  return `<section id="section-offers">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-800 text-dark flex items-center gap-2.5 section-title"><span class="w-1 h-6 rounded-full" style="background-color: ${s.colors.primary};"></span>My Offers &amp; Promotions</h2>
            <a href="#" class="text-sm font-700 hover:underline" style="color: ${s.colors.primary};">View All →</a>
          </div>
          <div class="space-y-4">${cards}</div>
        </section>`;
}

// ---- EARN MORE ----
function buildEarnMore(s) {
  if (!s.earnMore || s.earnMore.length === 0) return '';
  const icons = [
    '<svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>',
    '<svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
    '<svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    '<svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>'
  ];
  const cards = s.earnMore.map((e,i) => {
    if (e.hasCodeInput) {
      return `<div class="earn-card card p-4 cursor-pointer">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style="background-color: ${s.colors.primary}15; color: ${s.colors.primary};">${icons[i%icons.length]}</div>
                <div class="flex-1"><h3 class="text-sm font-700 text-dark">${e.title}</h3></div>
              </div>
              <div class="flex items-center gap-2 mt-3">
                <input type="text" placeholder="Enter your code" class="flex-1 px-3 py-2 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                <button class="px-4 py-2 text-white text-xs font-700 rounded-lg transition-colors" style="background-color: ${s.colors.dark};" onmouseover="this.style.opacity=0.9" onmouseout="this.style.opacity=1">Enter</button>
              </div>
            </div>`;
    }
    return `<div class="earn-card card p-4 flex items-start gap-3 cursor-pointer">
              <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style="background-color: ${s.colors.primary}15; color: ${s.colors.primary};">${icons[i%icons.length]}</div>
              <div class="flex-1"><h3 class="text-sm font-700 text-dark leading-tight">${e.title}</h3><p class="text-xs text-muted mt-1 leading-relaxed">${e.description||''}</p></div>
              <svg class="w-5 h-5 text-muted shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </div>`;
  }).join('\n');

  return `<section id="section-earn-more">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-800 text-dark flex items-center gap-2.5 section-title"><span class="w-1 h-6 rounded-full" style="background-color: ${s.colors.primary};"></span>Earn More</h2>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${cards}</div>
        </section>`;
}

// ---- COMPLETE PROFILE & EARN ----
function buildProfileTasks(s) {
  if (!s.profileTasks || s.profileTasks.length === 0) return '';
  const tasks = s.profileTasks.map(t => `
            <div class="flex items-start justify-between gap-3">
              <p class="text-xs text-muted flex-1 leading-relaxed">${t.description}</p>
              <button class="btn-ghost px-4 py-1.5 text-xs font-700 rounded-full shrink-0">${t.cta}</button>
            </div>`).join('');

  return `<section id="section-profile-tasks" class="card p-5">
          <h3 class="text-base font-800 text-dark mb-4 section-title">Complete Profile &amp; Earn</h3>
          <div class="mb-2">
            <div class="flex items-center justify-between text-xs text-muted mb-1.5"><span>Your profile is <span class="font-800" style="color: ${s.colors.primary};">60%</span> completed</span></div>
            <div class="h-2 bg-gray-100 rounded-full overflow-hidden"><div class="h-full rounded-full transition-all" style="width: 60%; background: linear-gradient(90deg, ${s.colors.accent}, ${s.colors.primary});"></div></div>
          </div>
          <div class="space-y-4 mt-5">${tasks}</div>
        </section>`;
}

// ---- MY BADGES ----
function buildBadges(s) {
  if (!s.badges || s.badges.length === 0) return '';
  const items = s.badges.map(b => {
    const c = b.color || 'amber';
    return `<div class="flex flex-col items-center gap-2 group">
              <div class="w-16 h-16 rounded-full bg-gradient-to-br from-${c}-400 to-${c}-600 flex items-center justify-center transition-transform group-hover:scale-105" style="box-shadow: 0 0 0 3px #fff, 0 0 0 5px rgb(var(--tw-${c}-300, 251 191 36 / 0.7) / 0.6), 0 8px 16px -6px rgba(0,0,0,0.15);"><span class="text-2xl drop-shadow-sm">${b.emoji||'⭐'}</span></div>
              <span class="text-[11px] font-700 text-center text-dark leading-tight">${(b.name||'Badge').replace(/ /g,'<br>')}</span>
            </div>`;
  }).join('');

  return `<section id="section-badges">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-800 text-dark section-title">My Badges (${s.badges.length})</h3>
            <a href="#" class="text-sm font-700 hover:underline" style="color: ${s.colors.primary};">View All →</a>
          </div>
          <div class="flex items-center justify-start gap-6 flex-wrap">${items}</div>
        </section>`;
}

// ---- MY SOCIAL CLUBS ----
function buildClubs(s) {
  if (!s.clubs || s.clubs.length === 0) return '';
  const items = s.clubs.map((c,i) => {
    const imgSrc = c.imageData || c.imageUrl || '';
    const grad = c.gradient || CLUB_GRADIENTS[i % CLUB_GRADIENTS.length];
    return `<div class="card card-hover p-4 flex gap-3 cursor-pointer">
              <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-${grad[0]} to-${grad[1]} flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                ${imgSrc ? `<img src="${imgSrc}" alt="${c.name}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><span class="text-2xl hidden">${c.emoji||'👥'}</span>` : `<span class="text-2xl drop-shadow">${c.emoji||'👥'}</span>`}
              </div>
              <div class="min-w-0">
                <h4 class="text-sm font-800 text-dark leading-tight">${c.name}</h4>
                <p class="text-xs text-muted mt-1 leading-relaxed line-clamp-2">${c.description||''}</p>
                <p class="text-[11px] text-muted mt-2 flex items-center gap-1 font-600"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>${(c.memberCount||0).toLocaleString()} Members</p>
              </div>
            </div>`;
  }).join('');

  return `<section id="section-clubs">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-800 text-dark section-title">My Social Clubs (${s.clubs.length})</h3>
            <a href="#" class="text-sm font-700 hover:underline" style="color: ${s.colors.primary};">View All →</a>
          </div>
          <div class="space-y-4">${items}</div>
        </section>`;
}

// ---- UPSELL BANNER ----
function buildUpsell(s) {
  if (!s.upsell || !s.upsell.title) return '';
  const u = s.upsell;
  return `<section id="section-upsell" class="card overflow-hidden">
          <div class="relative p-7 text-center overflow-hidden" style="background: linear-gradient(135deg, #7C1D1D 0%, #4A0E0E 100%);">
            <div class="absolute inset-0 opacity-20" style="background-image: radial-gradient(circle at 20% 20%, rgba(255,255,255,0.2), transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.15), transparent 40%);"></div>
            <div class="relative">
              <div class="text-2xl font-900 mb-1 italic" style="color: ${s.colors.accent}; font-family: 'Georgia', serif; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">${u.title}</div>
              <div class="text-white text-xs font-800 uppercase tracking-[0.2em] mt-2">${u.subtitle||''}</div>
              <div class="mt-4 text-white flex items-start justify-center gap-1"><span class="text-2xl font-700 mt-2">$</span><span class="text-6xl font-900 leading-none">${(u.price||'$29').replace(/^\$/,'')}</span></div>
              <div class="text-white/80 text-[11px] mt-2 uppercase tracking-[0.15em] font-700">${u.period||'Monthly'}</div>
            </div>
          </div>
          <div class="p-5 text-center">
            <p class="text-sm text-dark font-500 mb-4 leading-relaxed">${u.tagline||''}</p>
            <button class="btn-primary w-full py-3 text-sm font-800 rounded-full uppercase tracking-wider">${u.cta||'Upgrade'}</button>
            <div class="flex items-center justify-center gap-2 mt-4"><div class="w-6 h-1.5 rounded-full" style="background-color: ${s.colors.primary};"></div><div class="w-1.5 h-1.5 rounded-full bg-gray-300"></div><div class="w-1.5 h-1.5 rounded-full bg-gray-300"></div></div>
          </div>
        </section>`;
}

// ---- PAYMENT ICONS (inline SVG, brand-accurate) ----
function paymentIconsHTML() {
  const wrap = (svg) => `<div class="h-8 w-12 rounded-md bg-white border border-gray-200 flex items-center justify-center shadow-sm hover:shadow transition-shadow" style="padding: 4px;">${svg}</div>`;
  const visa = `<svg viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;"><rect width="40" height="24" fill="#fff"/><path d="M17.5 15.6h-2.3l1.4-8.9h2.3l-1.4 8.9zm-4.2-8.9l-2.2 6.1-.3-1.3-.8-4c-.1-.6-.5-.7-1-.8H5.4l-.1.2c.9.2 1.7.5 2.4.9l2 7.8H12l3.7-8.9h-2.4zm18.6 8.9h2.1L32.1 6.7h-1.8c-.4 0-.7.1-.9.5l-3.5 8.4h2.4l.5-1.4h3l.3 1.4zm-2.7-3.2l1.3-3.4.7 3.4h-2zm-3.5-3.4l.3-1.9c-.4-.2-1.1-.4-1.9-.4-2.1 0-3.6 1.1-3.6 2.7 0 1.2 1.1 1.8 1.9 2.2.9.4 1.1.7 1.1 1 0 .5-.7.8-1.3.8-.9 0-1.4-.1-2.1-.4l-.3-.1-.3 2c.5.2 1.5.4 2.5.4 2.2 0 3.6-1.1 3.6-2.8 0-.9-.5-1.6-1.7-2.2-.7-.4-1.2-.6-1.2-1 0-.3.4-.7 1.2-.7.7 0 1.2.2 1.5.3l.3.1z" fill="#1A1F71"/></svg>`;
  const mc = `<svg viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;"><rect width="40" height="24" fill="#fff"/><circle cx="16" cy="12" r="7" fill="#EB001B"/><circle cx="24" cy="12" r="7" fill="#F79E1B"/><path d="M20 6.7A6.98 6.98 0 0 1 22.7 12c0 2.1-.9 4-2.4 5.3A6.98 6.98 0 0 1 17.3 12c0-2.1 1.1-4 2.7-5.3z" fill="#FF5F00"/></svg>`;
  const amex = `<svg viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;"><rect width="40" height="24" rx="2" fill="#2E77BC"/><text x="20" y="15" text-anchor="middle" font-family="Arial,sans-serif" font-size="6" font-weight="900" fill="#fff" letter-spacing="0.5">AMEX</text></svg>`;
  const discover = `<svg viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;"><rect width="40" height="24" fill="#fff"/><path d="M22 4h18v20H22z" fill="#F58220"/><circle cx="30" cy="14" r="4" fill="#F58220"/><text x="12" y="15" text-anchor="middle" font-family="Arial,sans-serif" font-size="5" font-weight="800" fill="#231F20">DISCOVER</text></svg>`;
  const paypal = `<svg viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;"><rect width="40" height="24" fill="#fff"/><path d="M14 8h4.2c2 0 3.2 1 2.9 2.9-.4 2.3-2 3.1-4 3.1h-1.4l-.4 2.5h-1.9L14 8z" fill="#003087"/><path d="M20 8.5h4.2c2 0 3.2 1 2.9 2.9-.4 2.3-2 3.1-4 3.1H21.7l-.4 2.5h-1.9L20 8.5z" fill="#009CDE"/></svg>`;
  const applepay = `<svg viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;"><rect width="40" height="24" rx="3" fill="#000"/><path d="M12.5 9.7c.3-.4.5-.9.4-1.4-.4 0-.9.3-1.2.7-.3.3-.5.8-.4 1.3.5 0 .9-.2 1.2-.6zm.4.6c-.7 0-1.2.4-1.6.4-.4 0-.9-.4-1.4-.4-.7 0-1.4.4-1.8 1.1-.8 1.3-.2 3.2.5 4.3.4.5.9 1.1 1.5 1.1s.8-.4 1.4-.4c.7 0 .8.4 1.4.4.6 0 1-.5 1.4-1.1.4-.6.6-1.1.6-1.2-.1 0-1.1-.4-1.1-1.7 0-1.1.9-1.6.9-1.6-.5-.7-1.3-.8-1.6-.9zM19 8.2v8h1.2v-2.7h1.7c1.6 0 2.7-1.1 2.7-2.7 0-1.5-1.1-2.6-2.6-2.6H19zm1.2 1h1.4c1 0 1.6.5 1.6 1.6 0 1-.6 1.6-1.6 1.6h-1.4V9.2zm7.6 7.1c.7 0 1.4-.4 1.7-1h.1v.9h1.1v-3.9c0-1.1-.9-1.9-2.3-1.9-1.3 0-2.2.7-2.3 1.8h1.1c.1-.5.5-.8 1.2-.8s1.1.3 1.1 1v.4l-1.5.1c-1.4.1-2.2.7-2.2 1.7 0 1 .8 1.7 2 1.7zm.4-.9c-.6 0-1.1-.3-1.1-.8s.4-.8 1.1-.9l1.4-.1v.5c0 .8-.6 1.3-1.4 1.3zm4.5 3c1.2 0 1.8-.5 2.3-1.9l2.1-6h-1.2l-1.4 4.6-1.4-4.6h-1.3l2.1 5.8-.1.4c-.2.6-.5.8-1 .8-.1 0-.3 0-.4-.1v.9c.1.1.3.1.5.1z" fill="#fff"/></svg>`;
  const googlepay = `<svg viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;"><rect width="40" height="24" rx="3" fill="#fff" stroke="#e5e7eb" stroke-width="1"/><path d="M18.6 12.1v2.1h2.9c-.1.7-.5 1.3-1 1.7-.5.4-1.2.6-1.9.6-1.5 0-2.8-1-3.2-2.4-.1-.4-.2-.7-.2-1.1 0-.4.1-.8.2-1.1.4-1.4 1.7-2.4 3.2-2.4.8 0 1.5.3 2.1.8l1.5-1.5c-1-.9-2.2-1.5-3.6-1.5-2.1 0-3.9 1.2-4.7 2.9-.3.7-.5 1.5-.5 2.3 0 .8.2 1.6.5 2.3.8 1.7 2.6 2.9 4.7 2.9 1.4 0 2.6-.5 3.5-1.3 1-.9 1.6-2.3 1.6-3.9 0-.3 0-.6-.1-.9h-5V12h.1z" fill="#4285F4"/><path d="M26.8 10.3c-.4 0-.8.1-1.2.3-.4.2-.6.5-.7.9h-.1v-1h-1v6.9h1v-2.6h.1c.2.3.4.5.7.7.3.1.7.2 1.1.2.9 0 1.6-.3 2.1-1s.8-1.5.8-2.5-.3-1.9-.8-2.5c-.5-.7-1.2-1-2-1.4zm-.2 5.5c-.5 0-.9-.2-1.3-.6-.3-.4-.5-.9-.5-1.6 0-.7.2-1.2.5-1.6.3-.4.8-.6 1.3-.6.5 0 1 .2 1.3.6.3.4.5.9.5 1.6 0 .7-.2 1.2-.5 1.6-.3.4-.7.6-1.3.6z" fill="#EA4335"/></svg>`;
  return [visa, mc, amex, discover, paypal, applepay, googlepay].map(wrap).join('');
}

// ---- SOCIAL ICONS ----
function socialIconsHTML(primaryColor) {
  const dot = (svg) => `<a href="#" class="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:-translate-y-0.5" style="background-color: #1F2937; color: #fff;" onmouseover="this.style.backgroundColor='${primaryColor}';" onmouseout="this.style.backgroundColor='#1F2937';">${svg}</a>`;
  const instagram = `<svg class="w-4.5 h-4.5" style="width: 18px; height: 18px;" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`;
  const facebook = `<svg class="w-4.5 h-4.5" style="width: 18px; height: 18px;" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`;
  const twitter = `<svg class="w-4.5 h-4.5" style="width: 18px; height: 18px;" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;
  const youtube = `<svg class="w-4.5 h-4.5" style="width: 18px; height: 18px;" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
  const linkedin = `<svg class="w-4.5 h-4.5" style="width: 18px; height: 18px;" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`;
  return [instagram, facebook, twitter, youtube, linkedin].map(dot).join('');
}

// ---- FOOTER ----
function buildFooter(s, programName, brandAbbr) {
  const fl = s.footerLinks || {};
  const cols = [fl.col1, fl.col2, fl.col3].filter(Boolean);
  const colsHTML = cols.map(col => `
        <div>
          <h4 class="text-[11px] font-800 text-dark uppercase tracking-[0.15em] mb-4">${col.title||'Links'}</h4>
          <ul class="space-y-2.5">${(col.links||[]).map(l => `<li><a href="#" class="text-xs text-muted hover:text-primary transition-colors">${l}</a></li>`).join('')}</ul>
        </div>`).join('');

  return `<footer class="bg-white border-t border-gray-200 mt-16">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div class="text-center mb-10">
        <h3 class="text-xs font-800 text-dark uppercase tracking-[0.2em] mb-5">Follow Us</h3>
        <div class="flex items-center justify-center gap-4">
          ${socialIconsHTML(s.colors.primary)}
        </div>
      </div>
      <div class="divider-gradient mb-10"></div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
        ${colsHTML}
        <div class="flex items-center justify-center">
          <div class="relative w-28 h-28 rounded-full flex items-center justify-center text-center" style="background: radial-gradient(circle, #fff 60%, transparent 61%); border: 2px dashed ${s.colors.primary}30;">
            <div>
              <div class="text-[10px] font-700 text-primary uppercase tracking-wider">2 Year</div>
              <div class="text-[9px] text-muted italic mt-0.5">Guarantee</div>
            </div>
          </div>
        </div>
      </div>
      <div class="divider-gradient mb-6"></div>
      <div class="flex items-center justify-center gap-2 mb-8 flex-wrap">
        ${paymentIconsHTML()}
      </div>
      <div class="border-t border-gray-100 pt-6 text-center">
        <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[10px] text-muted uppercase tracking-[0.15em] font-600">
          <a href="#" class="hover:text-primary transition-colors">${programName}</a><span class="text-gray-300">|</span>
          <a href="#" class="hover:text-primary transition-colors">Site Map</a><span class="text-gray-300">|</span>
          <a href="#" class="hover:text-primary transition-colors">Terms &amp; Conditions</a><span class="text-gray-300">|</span>
          <a href="#" class="hover:text-primary transition-colors">Privacy Policy</a><span class="text-gray-300">|</span>
          <a href="#" class="hover:text-primary transition-colors">Cookie Preferences</a>
        </div>
        <p class="text-[10px] text-gray-400 mt-4">© ${new Date().getFullYear()} ${esc(s.brand.name || programName)}. All rights reserved.</p>
      </div>
      <div class="mt-4 text-center">
        <p class="text-[10px] text-gray-400 font-500">Powered by <span class="font-600 text-gray-500">Imran Mansur</span> &amp; <span class="font-600 text-gray-500">Miles Toolin</span></p>
      </div>
    </div>
  </footer>`;
}

// ---- SCRIPT ----
function buildScript() {
  return `<script>
    function toggleSection(id) {
      const c = document.getElementById(id + '-content');
      const ch = document.getElementById(id + '-chevron');
      if (c.classList.contains('open')) { c.classList.remove('open'); ch.classList.remove('rotated'); }
      else { c.classList.add('open'); ch.classList.add('rotated'); }
    }
    document.querySelectorAll('[title="Copy code"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.voucher-card');
        const codeEl = card?.querySelector('.bg-dark');
        if (codeEl) {
          navigator.clipboard?.writeText(codeEl.textContent.trim());
          btn.innerHTML = '<svg class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
          setTimeout(() => { btn.innerHTML = '<svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>'; }, 2000);
        }
      });
    });
  <\/script>`;
}
