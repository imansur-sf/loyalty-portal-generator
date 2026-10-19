// Stable presentation identity, safe asset ownership and deterministic AI edit scope.
(function (root) {
  'use strict';
  const collections = ['vouchers', 'offers', 'badges', 'clubs', 'benefits', 'earnMore', 'profileTasks'];
  const sections = [...collections, 'upsell', 'navLinks', 'footerLinks', 'cinematic'];
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const label = item => String(item?.name || item?.title || item?.description || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
  let sequence = 0;
  const freshId = prefix => `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  function match(item, previous) {
    if (validId(item?.id)) return previous.find(old => old.id === item.id) || null;
    for (const key of ['programRewardId', 'programRuleId']) if (item?.[key]) {
      const matches = previous.filter(old => old[key] === item[key]);
      return matches.length === 1 ? matches[0] : null;
    }
    const matches = previous.filter(old => label(old) === label(item));
    return label(item) && matches.length === 1 ? matches[0] : null;
  }
  function ensure(content, existing) {
    const data = clone(content || {});
    for (const key of collections) {
      if (!Array.isArray(data[key])) continue;
      const previous = Array.isArray(existing?.[key]) ? existing[key] : [];
      const used = new Set();
      data[key] = data[key].map(raw => {
        const item = { ...raw }, owner = match(item, previous);
        let id = validId(owner?.id) ? owner.id : validId(item.id) ? item.id : freshId(key);
        if (used.has(id)) id = freshId(key);
        used.add(id); item.id = id;
        // An asset's identity is namespaced by its owning content record and role.
        item.assetId = `${id}-image`;
        if (key === 'benefits') item.coverAssetId = `${id}-cover`;
        return item;
      });
    }
    return data;
  }
  function scope(proposed, existing, options = {}) {
    if (!existing) return ensure(proposed);
    const selected = new Set((options.sections || []).filter(key => sections.includes(key)));
    const mode = ['fill', 'add', 'replace'].includes(options.mode) ? options.mode : 'replace';
    const result = ensure(proposed, existing), base = ensure(existing);
    for (const key of sections) {
      if (!selected.has(key)) { if (Object.hasOwn(base, key)) result[key] = clone(base[key]); else delete result[key]; continue; }
      if (mode === 'fill') {
        const fill = (old, next) => {
          if (old === '' || old === null || old === undefined) return clone(next ?? old);
          if (Array.isArray(old)) return old.length ? old.map(item => { const nextItem = Array.isArray(next) && match(item, next); return nextItem ? fill(item, nextItem) : clone(item); }) : clone(next || old);
          if (typeof old === 'object') return { ...(next || {}), ...Object.fromEntries(Object.entries(old).map(([k,v]) => [k, fill(v, next?.[k])])) };
          return old;
        };
        result[key] = fill(base[key], result[key]);
      } else if (mode === 'add') {
        if (Array.isArray(base[key]) && Array.isArray(result[key])) result[key] = [...base[key], ...result[key].filter(item => !match(item, base[key]))].slice(0, 40);
        else result[key] = clone(base[key] ?? result[key]);
      }
    }
    // Scoped copy requests cannot change identity, palette or membership policy.
    for (const key of ['brand','brandName','programName','colors','tiers','member','program','programEnabled']) if (Object.hasOwn(base,key)) result[key] = clone(base[key]);
    return result;
  }
  // Builder cleaners may set defaults or clamp new AI text. They must never
  // truncate unchanged authored fields while applying a scoped suggestion.
  function restoreUnchanged(before, proposed, cleaned) {
    if (JSON.stringify(before) === JSON.stringify(proposed)) return clone(before);
    if (Array.isArray(proposed)) return proposed.map((item,index)=>{
      const previous=Array.isArray(before) && item && typeof item==='object' ? match(item,before) : undefined;
      const final=Array.isArray(cleaned) ? (item?.id ? cleaned.find(value=>value?.id===item.id) : cleaned[index]) : undefined;
      return previous ? restoreUnchanged(previous,item,final) : clone(final ?? item);
    });
    if (proposed && typeof proposed==='object' && !Array.isArray(proposed)) {
      const result={...(cleaned || {})};
      for(const key of Object.keys(proposed)) result[key]=restoreUnchanged(before?.[key],proposed[key],cleaned?.[key]);
      return result;
    }
    return clone(cleaned === undefined ? proposed : cleaned);
  }
  function describe(value, key) {
    if (value === undefined) return '(absent)';
    if (/image.*data|logoData/i.test(key) && typeof value === 'string' && value) return '(uploaded or generated image)';
    return (typeof value === 'string' ? value : JSON.stringify(value)).slice(0, 1200);
  }
  function fieldDiff(before, after, path = '', result = []) {
    if (result.length >= 200 || JSON.stringify(before) === JSON.stringify(after)) return result;
    if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) fieldDiff(before[key],after[key],path ? `${path}.${key}` : key,result);
    } else if (Array.isArray(before) && Array.isArray(after) && [...before,...after].every(item => item && typeof item === 'object' && item.id)) {
      for (const id of new Set([...before,...after].map(item=>item.id))) fieldDiff(before.find(item=>item.id===id),after.find(item=>item.id===id),`${path}[${id}]`,result);
      if (before.length === after.length && before.some((item,index)=>item.id!==after[index]?.id)) result.push({path:`${path} order`,before:'Previous order',after:'Reordered'});
    } else result.push({path,before:describe(before,path),after:describe(after,path)});
    return result;
  }
  function diff(before, after) {
    const result = [];
    for (const key of [...sections, 'program', 'brand', 'colors']) {
      if (JSON.stringify(before?.[key]) === JSON.stringify(after?.[key])) continue;
      const old = before?.[key], next = after?.[key];
      const beforeIds = new Set(Array.isArray(old) ? old.map(item => item.id) : []);
      const afterIds = new Set(Array.isArray(next) ? next.map(item => item.id) : []);
      result.push({ section: key, beforeCount: Array.isArray(old) ? old.length : null, afterCount: Array.isArray(next) ? next.length : null,
        added: Array.isArray(next) ? next.filter(item => !beforeIds.has(item.id)).length : 0,
        removed: Array.isArray(old) ? old.filter(item => !afterIds.has(item.id)).length : 0, edits:fieldDiff(old,next,key) });
    }
    return result;
  }
  root.LPGContentContract = { collections, sections, freshId, match, ensure, scope, restoreUnchanged, diff, fieldDiff };
  if (typeof module === 'object') module.exports = root.LPGContentContract;
})(typeof window === 'object' ? window : globalThis);
