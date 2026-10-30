/// <reference types="bun" />
import { expect, test } from "bun:test";
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const database = process.env.CA_TEST_DATABASE_URL;
const user = "00000000-0000-0000-0000-000000000001";
const division = "00000000-0000-0000-0000-000000000002";
const period = "00000000-0000-0000-0000-000000000003";
const category = "00000000-0000-0000-0000-000000000004";
function sql(query: string) {
  if (!database || !database.includes("localhost:55432")) throw new Error("Set CA_TEST_DATABASE_URL to an isolated localhost:55432 PostgreSQL database, never production.");
  return execFileSync("psql", [database, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", query], {encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]}).trim();
}
function submit(id: string) {
  return new Promise<boolean>((resolve) => {
    if (!database) throw new Error("Missing isolated test database");
    execFile("psql", [database, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", `SELECT public.submit_cash_advance('${id}');`], (error) => resolve(!error));
  });
}
test.skipIf(!database)("concurrent CA reservations cannot overspend; missing posts roll back every reservation", async () => {
  sql(`CREATE SCHEMA auth;
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${user}'::uuid $$;
    CREATE FUNCTION public.check_session_valid() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.can_access_division(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TYPE public.cash_advance_status AS ENUM('draft','submitted');
    CREATE TABLE profiles(id uuid, is_active boolean);
    CREATE TABLE budget_periods(id uuid PRIMARY KEY,is_active boolean,is_closed boolean);
    CREATE TABLE cost_categories(id uuid PRIMARY KEY,code text,name text,is_active boolean);
    CREATE TABLE division_budgets(id uuid PRIMARY KEY,division_id uuid,category_id uuid,period_id uuid,allocated_amount numeric,used_amount numeric);
    CREATE TABLE cash_advances(id uuid PRIMARY KEY,requester_id uuid,division_id uuid,status cash_advance_status,purpose text,total_amount numeric,ca_number text,period_id uuid,submitted_at timestamptz,updated_at timestamptz);
    CREATE TABLE cash_advance_items(id uuid DEFAULT gen_random_uuid(),cash_advance_id uuid,category_id uuid,description text,quantity int,unit_price numeric,amount numeric);
    CREATE TABLE budget_ledger(division_budget_id uuid,entry_type text,amount numeric,reference_type text,reference_id uuid,description text,performed_by uuid);
    CREATE TABLE cash_advance_events(cash_advance_id uuid,event_type text,description text,performed_by uuid);
    INSERT INTO profiles VALUES('${user}',true);
    INSERT INTO budget_periods VALUES('${period}',true,false);
    INSERT INTO cost_categories VALUES('${category}','TRAVEL','Travel',true);
    INSERT INTO division_budgets VALUES(gen_random_uuid(),'${division}','${category}','${period}',1000000,0);`);
  sql(readFileSync("drizzle/migrations/0000_ca_available_budget_submission_lock.sql", "utf8"));
  sql(readFileSync("drizzle/migrations/0001_preserve_admin_ca_deletion_guard.sql", "utf8"));
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  for (const id of ids) sql(`INSERT INTO cash_advances(id,requester_id,division_id,status,purpose,total_amount,ca_number) VALUES('${id}','${user}','${division}','draft','Test CA',700000,'TEST'); INSERT INTO cash_advance_items(cash_advance_id,category_id,description,quantity,unit_price,amount) VALUES('${id}','${category}','Travel',1,700000,700000);`);
  const outcomes = await Promise.all(ids.map(submit));
  expect(outcomes.filter(Boolean).length).toBe(1);
  expect(sql("SELECT SUM(amount) FROM budget_ledger")).toBe("700000");
  expect(sql("SELECT count(*) FROM cash_advances WHERE status='submitted'")).toBe("1");
  expect(sql(`SELECT remaining FROM get_ca_budget_options('${division}')`)).toBe("300000");
  expect(await submit(ids[outcomes.indexOf(true)] || "")).toBe(false);
  const missingCa = crypto.randomUUID();
  sql(`INSERT INTO cash_advances(id,requester_id,division_id,status,purpose,total_amount,ca_number) VALUES('${missingCa}','${user}','${division}','draft','Missing post',200,'TEST'); INSERT INTO cash_advance_items(cash_advance_id,category_id,description,quantity,unit_price,amount) VALUES('${missingCa}','${category}','First valid post',1,100,100),('${missingCa}','ffffffff-ffff-ffff-ffff-ffffffffffff','Missing post',1,100,100);`);
  expect(await submit(missingCa)).toBe(false);
  expect(sql(`SELECT count(*) FROM budget_ledger WHERE reference_id='${missingCa}'`)).toBe("0");
  expect(sql(`SELECT status FROM cash_advances WHERE id='${missingCa}'`)).toBe("draft");
  expect(sql("SELECT used_amount FROM division_budgets")).toBe("0");
});