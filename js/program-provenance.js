// Evidence is validated locally against supplied text. AI citations alone are not proof.
(function (root) {
  'use strict';
  const norm = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  const at = (value, path) => path.split('.').reduce((object, key) => object?.[key], value);
  function facts(program) {
    const paths = ['currencies.qualifyingName','currencies.redeemableName','currencies.pointsPerUnit','freeContentMonthlyCap','qualification.basis','qualification.period','qualification.description'];
    for (const [key, fields] of [['tiers',['name','threshold','multiplier']], ['earnRules',['name','kind','qualifyingRate','redeemableRate','qualifyingPoints','redeemablePoints','monthlyCap']], ['rewards',['name','cost']], ['metrics',['name','value','unit','period']]]) {
      (program[key] || []).forEach((_, i) => fields.forEach(field => paths.push(`${key}.${i}.${field}`)));
    }
    return paths.map(path => ({ path, value: at(program,path) }));
  }
  function pages({ brief = {}, website } = {}) {
    const result = [{source:'Author brief', page:1,text:[brief.text,brief.objective,brief.roles].filter(Boolean).join('\n')}];
    for (const source of brief.sources || []) (source.pages || []).forEach((page,i) => result.push({source:String(source.name || 'Document'),page:i+1,text:String(page.text || '')}));
    if (website?.bodyText) result.push({source:'Website',page:1,text:String(website.bodyText),url:String(website.url || '')});
    return result;
  }
  function containsValue(quote, value) {
    if (value === null) return false; // Absence of a cap cannot be proved by a numberless quote.
    const needle = norm(value), haystack = norm(quote);
    if (typeof value === 'number') {
      const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      return new RegExp(`(^|[^0-9.])${escaped}(?=$|[^0-9.])`).test(haystack.replace(/(\d),(?=\d{3}\b)/g,'$1'));
    }
    return needle.length > 1 && haystack.includes(needle);
  }
  function audit(program, proposed, context) {
    const sources = pages(context), entries = Array.isArray(proposed) ? proposed.slice(0,500) : [];
    const records = facts(program).map(fact => {
      const evidence = entries.filter(item => item?.path === fact.path);
      const valid = evidence.find(item => {
        const quote = norm(item.quote);
        return quote.length >= 4 && quote.length <= 3000 && containsValue(quote,fact.value) &&
          sources.filter(source => source.source === item.source && source.page === Number(item.page)).length === 1 &&
          sources.some(source => source.source === item.source && source.page === Number(item.page) && norm(source.text).includes(quote));
      });
      return { ...fact, status:valid ? 'source-quoted' : evidence.length ? 'unresolved' : 'illustrative',
        source:valid ? String(valid.source).slice(0,180) : '',page:valid ? Number(valid.page) : null,
        quote:valid ? String(valid.quote).slice(0,3000) : '',
        reason:valid ? 'Quote and value occur in the supplied source; review whether the quote establishes this policy.' : evidence.length ? 'The citation or value could not be verified in the supplied page.' : 'No verified source quote was supplied; treat as an illustrative proposal.' };
    });
    return {version:1,records,requiresReview:records.some(item => item.status !== 'source-quoted'),
      summary:{quoted:records.filter(r=>r.status==='source-quoted').length,illustrative:records.filter(r=>r.status==='illustrative').length,unresolved:records.filter(r=>r.status==='unresolved').length}};
  }
  function invalidate(evidence, program) {
    if (!evidence?.records) return evidence;
    return {...evidence,records:evidence.records.map(record => JSON.stringify(at(program,record.path)) === JSON.stringify(record.value) ? record : {...record,value:at(program,record.path),status:'author-edited',source:'',page:null,quote:'',reason:'Changed by the author after evidence review.'})};
  }
  root.LPGProvenance = {facts,pages,audit,invalidate};
  if (typeof module === 'object') module.exports = root.LPGProvenance;
})(typeof window === 'object' ? window : globalThis);
