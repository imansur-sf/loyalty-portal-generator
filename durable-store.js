// LPG-owned tables only. A configured store must be available before paid work;
// there is deliberately no process-memory fallback after a database failure.
const { createHash, randomBytes } = require('node:crypto');
const hash = value => createHash('sha256').update(String(value)).digest('hex');
function createDurableStore({ pool, connectionString = process.env.LPG_DATABASE_URL, now = Date.now } = {}) {
  if (!pool) {
    const { Pool } = require('pg');
    const local = /(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/)/.test(connectionString || '');
    pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 30000, ...(local ? {} : { ssl: { rejectUnauthorized: false } }) });
    pool.on('error', () => console.error('[Storage] connection_error'));
  }
  let healthy = false;
  const ready = pool.query(`
    SELECT pg_advisory_xact_lock(1279413328,1);
    CREATE TABLE IF NOT EXISTS lpg_generation_guard (id integer PRIMARY KEY CHECK(id=1));
    INSERT INTO lpg_generation_guard(id) VALUES (1) ON CONFLICT DO NOTHING;
    CREATE TABLE IF NOT EXISTS lpg_generation_usage (
      owner text PRIMARY KEY, expires_at timestamptz NOT NULL, issued integer NOT NULL DEFAULT 0,
      calls integer NOT NULL DEFAULT 0, tokens bigint NOT NULL DEFAULT 0,
      images integer NOT NULL DEFAULT 0, scrapes integer NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS lpg_generation_active (
      id text PRIMARY KEY, images integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL);
    CREATE TABLE IF NOT EXISTS lpg_generation_jobs (
      id text PRIMARY KEY, owner text NOT NULL, token_hash text NOT NULL,
      idempotency_key text NOT NULL, request_hash text NOT NULL, kind text NOT NULL,
      input jsonb, result_expires_at timestamptz, status text NOT NULL DEFAULT 'queued', result jsonb,
      lease_id text, lease_expires_at timestamptz, cancel_requested boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
      UNIQUE(owner,idempotency_key));
    ALTER TABLE lpg_generation_jobs ADD COLUMN IF NOT EXISTS result_expires_at timestamptz;
    CREATE INDEX IF NOT EXISTS lpg_generation_jobs_expiry ON lpg_generation_jobs(expires_at);
  `).then(() => { healthy = true; }).catch(() => { healthy = false; throw new Error('generation_storage_unavailable'); });
  // A readiness failure is visible to routes; prevent an unhandled rejection at startup.
  ready.catch(() => {});
  const cleanup=setInterval(()=>{ready.then(()=>pool.query(`UPDATE lpg_generation_jobs SET result=NULL,status='expired' WHERE status='complete' AND result_expires_at<=clock_timestamp(); DELETE FROM lpg_generation_jobs WHERE expires_at<=clock_timestamp(); DELETE FROM lpg_generation_usage WHERE expires_at<=clock_timestamp(); DELETE FROM lpg_generation_active WHERE expires_at<=clock_timestamp()`)).catch(()=>console.error('[Storage] retention_cleanup_failed'));},60000);
  cleanup.unref();
  async function transaction(action) {
    await ready;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM lpg_generation_guard WHERE id=1 FOR UPDATE');
      const result = await action(client);
      await client.query('COMMIT'); healthy = true; return result;
    } catch (error) { healthy = false; try { await client.query('ROLLBACK'); } catch {} throw error; }
    finally { client.release(); }
  }
  async function usage(client, owner, windowMs, maxIdentities) {
    await client.query('DELETE FROM lpg_generation_usage WHERE expires_at <= clock_timestamp()');
    const count = await client.query('SELECT count(*)::integer AS count FROM lpg_generation_usage');
    const exists = await client.query('SELECT * FROM lpg_generation_usage WHERE owner=$1', [hash(owner)]);
    if (exists.rows[0]) return exists.rows[0];
    if (count.rows[0].count >= maxIdentities) return null;
    const result = await client.query(`INSERT INTO lpg_generation_usage(owner,expires_at) VALUES($1,clock_timestamp()+($2 * interval '1 millisecond')) RETURNING *`, [hash(owner),windowMs]);
    return result.rows[0];
  }
  async function issue(owner, limits) {
    return transaction(async c => {
      const b = await usage(c,owner,limits.windowMs,limits.maxIdentities);
      if (!b || b.issued >= 12) return { error:'capability_limit', retryAfterMs:b?Math.max(0,new Date(b.expires_at)-now()):limits.windowMs };
      await c.query('UPDATE lpg_generation_usage SET issued=issued+1 WHERE owner=$1',[hash(owner)]);
      return {expiresAt:new Date(b.expires_at).getTime()};
    });
  }
  async function reserve(owner, cost, limits) {
    return transaction(async c => {
      await c.query('DELETE FROM lpg_generation_active WHERE expires_at <= clock_timestamp()');
      const b = await usage(c,owner,limits.windowMs,limits.maxIdentities);
      if (!b || b.calls>=limits.maxCalls || Number(b.tokens)+cost.tokens>limits.maxTokens || b.images+cost.images>limits.maxImages || (cost.scrape && b.scrapes>=limits.maxScrapes)) return {error:'generation_budget_exceeded',retryAfterMs:b?Math.max(0,new Date(b.expires_at)-now()):limits.windowMs};
      const active = await c.query('SELECT count(*)::integer AS count,coalesce(sum(images),0)::integer AS images FROM lpg_generation_active');
      if (active.rows[0].count>=limits.maxActive || active.rows[0].images+cost.images>limits.maxImageActive) return {error:'generation_busy',retryAfterMs:5000};
      const id=randomBytes(18).toString('hex');
      await c.query(`INSERT INTO lpg_generation_active(id,images,expires_at) VALUES($1,$2,clock_timestamp()+interval '3 minutes')`,[id,cost.images]);
      await c.query('UPDATE lpg_generation_usage SET calls=calls+1,tokens=tokens+$2,images=images+$3,scrapes=scrapes+$4 WHERE owner=$1',[hash(owner),cost.tokens,cost.images,cost.scrape?1:0]);
      return {id};
    });
  }
  async function release(id) {await ready;await pool.query('DELETE FROM lpg_generation_active WHERE id=$1',[id]);}
  async function createJob(job,{maxJobs=1000,maxBytes=128*1024*1024}={}) {
    return transaction(async c => {
      await c.query('DELETE FROM lpg_generation_jobs WHERE expires_at<=clock_timestamp()');
      const existing = await c.query('SELECT * FROM lpg_generation_jobs WHERE owner=$1 AND idempotency_key=$2',[job.owner,job.idempotency_key]);
      if(existing.rows[0]) return {job:existing.rows[0],created:false,conflict:existing.rows[0].request_hash!==job.request_hash};
      const size = await c.query('SELECT count(*)::integer AS count,coalesce(sum(coalesce(pg_column_size(input),0)+coalesce(pg_column_size(result),0)),0)::bigint AS bytes FROM lpg_generation_jobs');
      if(size.rows[0].count>=maxJobs || Number(size.rows[0].bytes)>=maxBytes)return {busy:true};
      const result=await c.query(`INSERT INTO lpg_generation_jobs(id,owner,token_hash,idempotency_key,request_hash,kind,input,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+interval '24 hours') RETURNING *`,[job.id,job.owner,job.token_hash,job.idempotency_key,job.request_hash,job.kind,job.input]);
      return {job:result.rows[0],created:true};
    });
  }
  async function getJob(id,tokenHash) {await ready;const r=await pool.query(`SELECT *,CASE WHEN status='complete' AND result_expires_at<=clock_timestamp() THEN 'expired' ELSE status END AS status,clock_timestamp() AS server_now FROM lpg_generation_jobs WHERE id=$1 AND token_hash=$2 AND expires_at>clock_timestamp()`,[id,tokenHash]);return r.rows[0];}
  async function claimJob(id,lease) {await ready;const r=await pool.query(`UPDATE lpg_generation_jobs SET status='running',lease_id=$2,lease_expires_at=clock_timestamp()+interval '3 minutes' WHERE id=$1 AND status='queued' AND NOT cancel_requested AND expires_at>clock_timestamp() RETURNING *`,[id,lease]);return r.rows[0];}
  async function completeJob(id,lease,result) {return transaction(async c=>{const size=await c.query('SELECT coalesce(sum(coalesce(pg_column_size(input),0)+coalesce(pg_column_size(result),0)),0)::bigint AS bytes FROM lpg_generation_jobs');if(Number(size.rows[0].bytes)+Buffer.byteLength(JSON.stringify(result))>128*1024*1024)result={status:503,body:{error:'generation_result_too_large'}};await c.query(`UPDATE lpg_generation_jobs SET status=CASE WHEN cancel_requested THEN 'cancelled' ELSE 'complete' END,result=CASE WHEN cancel_requested THEN NULL ELSE $3::jsonb END,input=NULL,lease_expires_at=NULL,result_expires_at=clock_timestamp()+CASE WHEN kind='llm' THEN interval '24 hours' ELSE interval '1 hour' END WHERE id=$1 AND lease_id=$2 AND status='running'`,[id,lease,JSON.stringify(result)]);});}
  async function cancelJob(id,tokenHash) {await ready;const r=await pool.query(`UPDATE lpg_generation_jobs SET cancel_requested=true,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,input=CASE WHEN status='queued' THEN NULL ELSE input END WHERE id=$1 AND token_hash=$2 RETURNING id`,[id,tokenHash]);return Boolean(r.rows[0]);}
  async function metrics() {await ready;const r=await pool.query('SELECT status,count(*)::integer AS count FROM lpg_generation_jobs WHERE expires_at>clock_timestamp() GROUP BY status');return Object.fromEntries(r.rows.map(x=>[x.status,x.count]));}
  async function check() {await ready;await pool.query('SELECT 1');healthy=true;return true;}
  return {ready,issue,reserve,release,createJob,getJob,claimJob,completeJob,cancelJob,metrics,check,get healthy(){return healthy;},close:()=>{clearInterval(cleanup);return pool.end();}};
}
module.exports={createDurableStore,hash};
