// ============================================================
// generator.js — Builds complete loyalty portal HTML from state
// ============================================================

function generatePortalHTML(s) {
  const esc = (t) => (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const raw = (t) => t || '';
  const primaryLight = lightenColor(s.colors.primary, 20);
  const accentDark = darkenColor(s.colors.accent, 15);
  const programName = s.brand.programName || (s.brand.name + ' Perks');
  const brandAbbr = s.brand.name.split(' ').map(w=>w[0]).join('').toUpperCase();
  const logoSrc = s.brand.logoData || s.brand.logoUrl || '';
  const pointsToNext = s.tiers[1] ? Math.max(0, s.tiers[1].points - (s.member.points||0)) : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My ${esc(programName)} — Loyalty Portal</title>
  <script src="https://cdn.tailwindcss.com/3.4.16"><\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style type="text/tailwindcss">
    @theme {
      --color-primary: ${s.colors.primary};
      --color-primary-light: ${primaryLight};
      --color-secondary: ${s.colors.secondary};
      --color-accent: ${s.colors.accent};
      --color-accent-dark: ${accentDark};
      --color-dark: ${s.colors.dark};
      --color-light: #FFFFFF;
      --color-success: #22C55E;
      --color-warning: #F59E0B;
      --color-danger: #EF4444;
      --color-muted: #6B7280;
      --color-border: #E5E7EB;
      --color-card: #FFFFFF;
      --color-page-bg: #FAFAFA;
    }
    body { font-family: 'Inter', sans-serif; }
    .toggle-content { max-height: 0; overflow: hidden; transition: max-height 0.4s ease-out, opacity 0.3s ease-out; opacity: 0; }
    .toggle-content.open { max-height: 2000px; opacity: 1; transition: max-height 0.5s ease-in, opacity 0.3s ease-in; }
    .chevron-icon { transition: transform 0.3s ease; }
    .chevron-icon.rotated { transform: rotate(180deg); }
    .voucher-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); transform: translateY(-2px); transition: all 0.2s ease; }
    .offer-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
    .earn-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  </style>
</head>
<body class="bg-page-bg text-dark min-h-screen">

${buildHeader(s, logoSrc, programName, brandAbbr)}

<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
  <h1 class="text-2xl font-700 text-dark mb-5">My ${esc(programName)}</h1>

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
function buildHeader(s, logoSrc, programName, brandAbbr) {
  const navLinks = (s.navLinks||[]).map(n =>
    `<a href="#" class="text-light/90 hover:text-accent transition-colors">${n}</a>`
  ).join('\n          ');

  const logoHTML = logoSrc
    ? `<img src="${logoSrc}" alt="${s.brand.name}" class="h-10 w-auto object-contain" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <div class="items-center gap-1 hidden"><span class="text-xl font-800 tracking-tight text-light">${brandAbbr}</span><span class="text-lg font-800 tracking-wide text-light ml-1">PERKS</span></div>`
    : `<div class="flex items-center gap-1"><span class="text-xl font-800 tracking-tight text-light">${brandAbbr}</span><span class="text-lg font-800 tracking-wide text-light ml-1">PERKS</span></div>`;

  return `<header class="bg-primary text-light sticky top-0 z-50 shadow-md">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <a href="#" class="flex items-center gap-2 shrink-0">
          ${logoHTML}
        </a>
        <nav class="hidden md:flex items-center gap-6 text-sm font-500">
          ${navLinks}
        </nav>
        <div class="flex items-center gap-3">
          <button class="md:hidden text-light"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg></button>
          <div class="w-9 h-9 rounded-full bg-accent flex items-center justify-center cursor-pointer"><svg class="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>
        </div>
      </div>
    </div>
  </header>`;
}

// ---- MEMBER CARD ----
function buildMemberCard(s) {
  return `<div class="bg-primary rounded-xl p-5 mb-6 flex items-center justify-between relative overflow-hidden">
      <div class="flex items-center gap-4 z-10">
        <div class="w-14 h-14 rounded-full bg-accent/30 border-2 border-accent flex items-center justify-center text-2xl">👤</div>
        <div>
          <div class="text-light/70 text-xs font-500 tracking-wider uppercase">Loyalty Member | ${s.member.number||'000000'}</div>
          <div class="text-light text-xl font-700 mt-0.5">${s.member.name||'Member'}</div>
        </div>
      </div>
      <div class="flex items-center gap-8 z-10">
        <div class="text-right">
          <div class="text-light/70 text-xs font-500 tracking-wider uppercase">Perks Points</div>
          <div class="text-light text-2xl font-800 mt-0.5">${s.member.points||0} Pts</div>
        </div>
        <div class="flex items-center gap-2 text-accent">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z"/></svg>
          <span class="text-light/40">·</span>
          <svg class="w-4 h-4 text-light/40" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </div>
      </div>
      <div class="absolute right-0 top-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4"></div>
      <div class="absolute right-16 bottom-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2"></div>
    </div>`;
}

// ---- TIER PROGRESS ----
function buildTierProgress(s, pointsToNext) {
  const tierIcons = [
    `<svg class="w-8 h-8 text-accent" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
    `<svg class="w-8 h-8 text-primary/50" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z"/></svg>`,
    `<svg class="w-8 h-8 text-accent/50" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16L3 5l5.5 5L12 2l3.5 8L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>`
  ];
  const tierStyles = [
    'bg-accent/20 border-2 border-accent',
    'bg-primary/10 border-2 border-primary/30',
    'bg-accent/10 border-2 border-accent/30'
  ];
  const tiersHTML = s.tiers.map((t,i) => `
              <div class="flex flex-col items-center text-center">
                <div class="w-16 h-16 rounded-full ${tierStyles[i]||tierStyles[2]} flex items-center justify-center mb-2">${tierIcons[i]||tierIcons[2]}</div>
                <span class="text-sm font-600 text-dark">${t.name}</span>
                <span class="text-xs text-muted">${t.points} Tier Points</span>
              </div>`).join('');

  const nextTierName = s.tiers[1] ? s.tiers[1].name : 'next tier';

  return `<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      <div class="lg:col-span-2 bg-card rounded-xl border border-border p-6">
        <div class="flex items-start justify-between gap-8">
          <div class="flex-1">
            <div class="flex items-end justify-between mb-4">${tiersHTML}</div>
            <div class="relative h-2 bg-gray-200 rounded-full mb-3">
              <div class="absolute left-0 top-0 h-full bg-gradient-to-r from-accent to-primary rounded-full" style="width: ${s.tierProgress}%"></div>
              <div class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-accent rounded-full border-2 border-light shadow" style="left: ${s.tierProgress}%"></div>
            </div>
            <p class="text-sm text-dark">Earn <span class="font-700 text-primary">${pointsToNext} points</span> to reach ${nextTierName}! <a href="#" class="text-primary font-600 hover:underline ml-2">View Benefits</a></p>
          </div>
        </div>
      </div>
      <div class="space-y-4">
        <div class="bg-card rounded-xl border border-border p-4 flex gap-3">
          <div class="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0"><svg class="w-5 h-5 text-warning" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div>
          <div><p class="text-sm font-600 text-dark">How to retain your ${s.tiers[0].name} tier</p><p class="text-xs text-muted mt-1">${s.tiers[0].name} membership expiring in 3 days. Retain by earning 1000 tier points.</p><a href="#" class="text-xs font-600 text-primary hover:underline mt-1 inline-block">Refer Now</a></div>
        </div>
        <div class="bg-card rounded-xl border border-border p-4 flex gap-3">
          <div class="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0"><svg class="w-5 h-5 text-danger" fill="currentColor" viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg></div>
          <div><p class="text-sm font-600 text-dark">Redeem 200 pts before they expire</p><p class="text-xs text-muted mt-1">200 Perks Points are expiring in 2 days. Redeem them now before it's too late!</p><a href="#" class="text-xs font-600 text-primary hover:underline mt-1 inline-block">Redeem Now</a></div>
        </div>
      </div>
    </div>`;
}

// ---- MY PROFILE (Expandable) ----
function buildProfile(s) {
  return `<div class="bg-card rounded-xl border border-border mb-3 overflow-hidden">
      <button onclick="toggleSection('profile')" class="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
        <span class="text-base font-600 text-dark">My Profile</span>
        <svg id="profile-chevron" class="w-5 h-5 text-muted chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </button>
      <div id="profile-content" class="toggle-content">
        <div class="px-6 pb-5 border-t border-border pt-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div><span class="text-xs text-muted uppercase tracking-wider">My Name</span><p class="text-sm font-600 text-dark mt-1">${s.member.name||'Member'}</p></div>
            <div><span class="text-xs text-muted uppercase tracking-wider">Join Date</span><p class="text-sm font-600 text-dark mt-1">${s.member.joinDate||'N/A'}</p></div>
            <div><span class="text-xs text-muted uppercase tracking-wider">Phone</span><p class="text-sm font-600 text-dark mt-1">${s.member.phone||'N/A'}</p></div>
            <div><span class="text-xs text-muted uppercase tracking-wider">Email</span><p class="text-sm font-600 text-dark mt-1">${s.member.email||'N/A'}</p></div>
          </div>
          <p class="text-xs text-muted mt-4">* Complete your profile to see customized offers & earn perks. <a href="#" class="text-primary font-600 hover:underline">Edit Profile</a></p>
        </div>
      </div>
    </div>`;
}

// ---- MY BENEFITS (Expandable) ----
function buildBenefits(s) {
  const items = (s.benefits||[]).map(b => `
            <div class="flex items-center gap-3 p-3 rounded-lg bg-page-bg">
              <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><span class="text-lg">${b.emoji}</span></div>
              <div><p class="text-sm font-600 text-dark">${b.name}</p></div>
            </div>`).join('');

  return `<div class="bg-card rounded-xl border border-border mb-6 overflow-hidden">
      <button onclick="toggleSection('benefits')" class="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
        <span class="text-base font-600 text-dark">My Benefits</span>
        <svg id="benefits-chevron" class="w-5 h-5 text-muted chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </button>
      <div id="benefits-content" class="toggle-content">
        <div class="px-6 pb-5 border-t border-border pt-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">${items}</div>
          <p class="text-xs text-muted mt-4">Upgrade to enjoy better benefits and exclusive offers. <a href="#" class="text-primary font-600 hover:underline">View All Benefits</a></p>
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
    const expiryClass = (v.expiry||'').toLowerCase().includes('today') || (v.expiry||'').toLowerCase().includes('expire') ? 'text-danger' : 'text-success';
    let actionHTML = '';
    if (v.actionType === 'points') {
      actionHTML = `<button class="px-4 py-1.5 bg-primary text-light text-xs font-600 rounded-full hover:bg-primary-light transition-colors">${v.actionValue||'Redeem'}</button>`;
    } else if (v.actionType === 'code') {
      actionHTML = `<div class="px-4 py-1.5 bg-dark text-light text-xs font-600 rounded-full">${v.actionValue||'CODE'}</div>`;
    } else {
      actionHTML = `<button class="px-4 py-1.5 bg-primary text-light text-xs font-600 rounded-full hover:bg-primary-light transition-colors">QR Code</button>`;
    }
    return `<div class="voucher-card bg-card rounded-xl border border-border p-4 flex gap-4 transition-all cursor-pointer">
              <div class="w-20 h-20 rounded-lg bg-gradient-to-br from-${grad[0]} to-${grad[1]} flex items-center justify-center shrink-0 overflow-hidden">
                ${imgSrc ? `<img src="${imgSrc}" alt="${v.title}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><span class="text-3xl hidden">${v.emoji||'🎁'}</span>` : `<span class="text-3xl">${v.emoji||'🎁'}</span>`}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between"><div><h3 class="text-sm font-700 text-dark">${v.title}</h3><p class="text-xs text-muted mt-0.5">${v.vendor||''}</p></div></div>
                ${v.expiry ? `<p class="text-xs ${expiryClass} font-600 mt-2">${v.expiry}</p>` : ''}
                <div class="flex items-center gap-2 mt-2">${actionHTML}
                  <button class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors" title="Copy code"><svg class="w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg></button>
                </div>
              </div>
            </div>`;
  }).join('\n');

  return `<section id="section-vouchers">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-700 text-dark flex items-center gap-2"><span class="w-1 h-6 bg-primary rounded-full"></span>My Vouchers</h2>
            <a href="#" class="text-sm font-600 text-primary hover:underline">View All</a>
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
    return `<div class="offer-card bg-card rounded-xl border border-border overflow-hidden flex transition-all">
              <div class="w-48 h-36 bg-gradient-to-br from-${grad[0]} to-${grad[1]} flex items-center justify-center shrink-0 overflow-hidden">
                ${imgSrc ? `<img src="${imgSrc}" alt="${o.title}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><span class="text-5xl hidden">${o.emoji||'🎯'}</span>` : `<span class="text-5xl">${o.emoji||'🎯'}</span>`}
              </div>
              <div class="p-5 flex-1">
                <h3 class="text-base font-700 text-dark">${o.title}</h3>
                <p class="text-sm text-muted mt-1">${o.description||''}</p>
                ${meta.length ? `<div class="flex items-center gap-4 mt-2 text-xs text-muted">${meta.join('')}</div>` : ''}
                <button class="mt-3 px-6 py-2 bg-primary text-light text-sm font-600 rounded-full hover:bg-primary-light transition-colors">${o.cta||'Learn More'}</button>
              </div>
            </div>`;
  }).join('\n');

  return `<section id="section-offers">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-700 text-dark flex items-center gap-2"><span class="w-1 h-6 bg-primary rounded-full"></span>My Offers &amp; Promotions</h2>
            <a href="#" class="text-sm font-600 text-primary hover:underline">View All</a>
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
      return `<div class="earn-card bg-card rounded-xl border border-border p-4 cursor-pointer transition-all hover:border-primary/30">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">${icons[i%icons.length]}</div>
                <div class="flex-1"><h3 class="text-sm font-600 text-dark">${e.title}</h3></div>
              </div>
              <div class="flex items-center gap-2 mt-3 ml-13">
                <input type="text" placeholder="Enter your code" class="flex-1 px-3 py-2 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                <button class="px-4 py-2 bg-dark text-light text-xs font-600 rounded-lg hover:bg-gray-800 transition-colors">Enter</button>
              </div>
            </div>`;
    }
    return `<div class="earn-card bg-card rounded-xl border border-border p-4 flex items-start gap-3 cursor-pointer transition-all hover:border-primary/30">
              <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">${icons[i%icons.length]}</div>
              <div class="flex-1"><h3 class="text-sm font-600 text-dark">${e.title}</h3><p class="text-xs text-muted mt-1">${e.description||''}</p></div>
              <svg class="w-5 h-5 text-muted shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </div>`;
  }).join('\n');

  return `<section id="section-earn-more">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-700 text-dark flex items-center gap-2"><span class="w-1 h-6 bg-primary rounded-full"></span>Earn More</h2>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${cards}</div>
        </section>`;
}

// ---- COMPLETE PROFILE & EARN ----
function buildProfileTasks(s) {
  if (!s.profileTasks || s.profileTasks.length === 0) return '';
  const tasks = s.profileTasks.map(t => `
            <div class="flex items-start justify-between gap-3">
              <p class="text-xs text-muted flex-1">${t.description}</p>
              <button class="px-4 py-1.5 border-2 border-primary text-primary text-xs font-600 rounded-full hover:bg-primary hover:text-light transition-colors shrink-0">${t.cta}</button>
            </div>`).join('');

  return `<section id="section-profile-tasks" class="bg-card rounded-xl border border-border p-5">
          <h3 class="text-base font-700 text-dark mb-4">Complete Profile &amp; Earn</h3>
          <div class="mb-2">
            <div class="flex items-center justify-between text-xs text-muted mb-1"><span>Your profile is <span class="font-600 text-primary">60%</span> completed</span></div>
            <div class="h-2 bg-gray-200 rounded-full overflow-hidden"><div class="h-full bg-primary rounded-full" style="width: 60%"></div></div>
          </div>
          <div class="space-y-4 mt-5">${tasks}</div>
        </section>`;
}

// ---- MY BADGES ----
function buildBadges(s) {
  if (!s.badges || s.badges.length === 0) return '';
  const items = s.badges.map(b => {
    const c = b.color || 'amber';
    return `<div class="flex flex-col items-center gap-2">
              <div class="w-16 h-16 rounded-full bg-gradient-to-br from-${c}-400 to-${c}-600 flex items-center justify-center ring-2 ring-${c}-300 ring-offset-2"><span class="text-2xl">${b.emoji||'⭐'}</span></div>
              <span class="text-xs font-500 text-center text-dark">${(b.name||'Badge').replace(/ /g,'<br>')}</span>
            </div>`;
  }).join('');

  return `<section id="section-badges">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-700 text-dark">My Badges (${s.badges.length})</h3>
            <a href="#" class="text-sm font-600 text-primary hover:underline">View All</a>
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
    return `<div class="bg-card rounded-xl border border-border p-4 flex gap-3">
              <div class="w-14 h-14 rounded-lg bg-gradient-to-br from-${grad[0]} to-${grad[1]} flex items-center justify-center shrink-0 overflow-hidden">
                ${imgSrc ? `<img src="${imgSrc}" alt="${c.name}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><span class="text-2xl hidden">${c.emoji||'👥'}</span>` : `<span class="text-2xl">${c.emoji||'👥'}</span>`}
              </div>
              <div>
                <h4 class="text-sm font-700 text-dark">${c.name}</h4>
                <p class="text-xs text-muted mt-0.5">${c.description||''}</p>
                <p class="text-xs text-muted mt-1 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>${(c.memberCount||0).toLocaleString()} Members</p>
              </div>
            </div>`;
  }).join('');

  return `<section id="section-clubs">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-700 text-dark">My Social Clubs (${s.clubs.length})</h3>
            <a href="#" class="text-sm font-600 text-primary hover:underline">View All</a>
          </div>
          <div class="space-y-4">${items}</div>
        </section>`;
}

// ---- UPSELL BANNER ----
function buildUpsell(s) {
  if (!s.upsell || !s.upsell.title) return '';
  const u = s.upsell;
  return `<section id="section-upsell" class="bg-card rounded-xl border border-border overflow-hidden">
          <div class="bg-gradient-to-br from-red-800 to-red-900 p-6 text-center">
            <div class="text-accent text-2xl font-800 mb-1">${u.title}</div>
            <div class="text-light text-sm font-600 uppercase tracking-wider">${u.subtitle||''}</div>
            <div class="mt-3 text-light"><span class="text-5xl font-800">${u.price||'$29'}</span></div>
            <div class="text-light/80 text-xs mt-1 uppercase tracking-wider">${u.period||'Monthly'}</div>
          </div>
          <div class="p-5 text-center">
            <p class="text-sm text-dark font-500 mb-3">${u.tagline||''}</p>
            <button class="w-full py-3 bg-primary text-light text-sm font-600 rounded-full hover:bg-primary-light transition-colors">${u.cta||'Upgrade'}</button>
            <div class="flex items-center justify-center gap-2 mt-3"><div class="w-6 h-1.5 bg-primary rounded-full"></div><div class="w-1.5 h-1.5 bg-gray-300 rounded-full"></div></div>
          </div>
        </section>`;
}

// ---- FOOTER ----
function buildFooter(s, programName, brandAbbr) {
  const fl = s.footerLinks || {};
  const cols = [fl.col1, fl.col2, fl.col3].filter(Boolean);
  const colsHTML = cols.map(col => `
        <div>
          <h4 class="text-xs font-700 text-dark uppercase tracking-wider mb-3">${col.title||'Links'}</h4>
          <ul class="space-y-2">${(col.links||[]).map(l => `<li><a href="#" class="text-xs text-muted hover:text-primary transition-colors">${l}</a></li>`).join('')}</ul>
        </div>`).join('');

  return `<footer class="bg-card border-t border-border mt-12">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div class="text-center mb-8">
        <h3 class="text-sm font-700 text-dark uppercase tracking-widest mb-4">Follow Us</h3>
        <div class="flex items-center justify-center gap-5">
          <a href="#" class="w-10 h-10 rounded-full bg-dark text-light flex items-center justify-center hover:bg-primary transition-colors"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg></a>
          <a href="#" class="w-10 h-10 rounded-full bg-dark text-light flex items-center justify-center hover:bg-primary transition-colors"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>
          <a href="#" class="w-10 h-10 rounded-full bg-dark text-light flex items-center justify-center hover:bg-primary transition-colors"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg></a>
          <a href="#" class="w-10 h-10 rounded-full bg-dark text-light flex items-center justify-center hover:bg-primary transition-colors"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a>
          <a href="#" class="w-10 h-10 rounded-full bg-dark text-light flex items-center justify-center hover:bg-primary transition-colors"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8">
        ${colsHTML}
        <div class="flex items-center justify-center">
          <div class="w-24 h-24 rounded-full border-2 border-primary/20 flex items-center justify-center text-center">
            <div><span class="text-xs text-primary font-600">2 Year</span><br><span class="text-[10px] text-muted italic">Guarantee</span></div>
          </div>
        </div>
      </div>
      <div class="flex items-center justify-center gap-2 mb-6">
        <div class="w-10 h-6 bg-red-600 rounded text-light text-[8px] flex items-center justify-center font-700">MC</div>
        <div class="w-10 h-6 bg-blue-700 rounded text-light text-[8px] flex items-center justify-center font-700">VISA</div>
        <div class="w-10 h-6 bg-indigo-600 rounded text-light text-[8px] flex items-center justify-center font-700">V</div>
        <div class="w-10 h-6 bg-blue-500 rounded text-light text-[8px] flex items-center justify-center font-700">PP</div>
        <div class="w-10 h-6 bg-gray-800 rounded text-light text-[8px] flex items-center justify-center font-700">AMEX</div>
      </div>
      <div class="border-t border-border pt-4 text-center">
        <div class="flex flex-wrap items-center justify-center gap-3 text-[10px] text-muted uppercase tracking-wider">
          <a href="#" class="hover:text-primary transition-colors">${programName}</a><span>|</span>
          <a href="#" class="hover:text-primary transition-colors">Site Map</a><span>|</span>
          <a href="#" class="hover:text-primary transition-colors">Terms &amp; Conditions</a><span>|</span>
          <a href="#" class="hover:text-primary transition-colors">Privacy Policy</a>
        </div>
      </div>
      <div class="border-t border-border mt-4 pt-4 text-center">
        <p class="text-[11px] text-gray-400 font-500">Powered by <span class="font-600 text-gray-500">Imran Mansur</span> &amp; <span class="font-600 text-gray-500">Miles Toolin</span></p>
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
