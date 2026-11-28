/// <reference types="bun" />
import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";

// Read the installed policies and exercise them using transaction-local fixtures.
// No persistent data, users, sessions or stored files are changed.
const enabled = process.env.SECURITY_READ_TESTS === "1";
function sql(query: string): string {
  return execFileSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", query], {
    encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
function caller() {
  const row = sql(`SELECT p.id || '|' || p.division_id FROM public.profiles p
    WHERE p.is_active AND p.division_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role='user')
      AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role<>'user')
    LIMIT 1`).split("|");
  if (!row[0] || !row[1]) throw new Error("An active ordinary staff fixture is required");
  return { id: row[0], division: row[1] };
}
function forCaller(predicate: string, id: string) {
  // The managed test connection cannot impersonate client roles. Evaluate the
  // installed SQL predicate with a concrete caller; browser tests cover real auth.
  return predicate.split("auth.uid()").join(`'${id}'::uuid`)
    .split("check_session_valid()").join("true")
    .split("storage.foldername(name)").join("string_to_array(name, '/')")
    .split("can_access_division(").join("pg_temp.test_division(")
    .split("has_role(").join("pg_temp.test_role(")
    .split("get_user_division_id(").join("pg_temp.test_user_division(");
}
for (const [table, policy] of [
  ["budget_release_settings", "Authenticated can view budget release settings"],
  ["ca_policy_settings", "Authenticated can read CA policy settings"],
]) {
  test.skipIf(!enabled)(`${table}: active staff read settings; missing identity is denied`, () => {
    const { id } = caller();
    const predicate = sql(`SELECT qual FROM pg_policies WHERE policyname='${policy}'`);
    expect(predicate).not.toBe("true");
    expect(sql(`SELECT count(*) FROM public.${table} WHERE ${forCaller(predicate,id)};`)).toBe("1");
    expect(sql(`SELECT count(*) FROM public.${table} WHERE ${forCaller(predicate,"00000000-0000-0000-0000-000000000000")};`)).toBe("0");
  });
}

for (const [bucket, policy] of [
  ["ca-settlement-attachments", "CA settlement attachments: view"],
  ["entertainment-nominatives", "Entertainment nominative files: view"],
  ["medical-attachments", "Users can view referenced medical attachments"],
]) {
  test.skipIf(!enabled)(`${bucket}: owner and authorized document allowed; unrelated file denied`, () => {
    const { id, division } = caller();
    const otherDivision = sql(`SELECT id FROM public.divisions WHERE id<>'${division}' LIMIT 1`);
    if (!otherDivision) throw new Error("A second division is required");
    const predicate = sql(`SELECT qual FROM pg_policies WHERE schemaname='storage' AND policyname='${policy}'`);
    const fixture = `
      CREATE TEMP TABLE objects(bucket_id text, name text);
      CREATE TEMP TABLE cash_advances(id integer, division_id uuid);
      CREATE TEMP TABLE cash_advance_settlement_attachments(file_path text,cash_advance_id integer);
      CREATE TEMP TABLE cash_advance_settlements(id integer,cash_advance_id integer);
      CREATE TEMP TABLE requests(id integer,division_id uuid);
      CREATE TEMP TABLE entertainment_nominatives(signed_file_path text,request_id integer,settlement_id integer);
      CREATE TEMP TABLE medical_claims(id integer,employee_id uuid);
      CREATE TEMP TABLE medical_claim_attachments(file_path text,claim_id integer);
      INSERT INTO objects VALUES ('${bucket}','${id}/owned.pdf'),('${bucket}','other/allowed.pdf'),('${bucket}','other/denied.pdf');
      INSERT INTO cash_advances VALUES (1,'${division}'),(2,'${otherDivision}');
      INSERT INTO cash_advance_settlement_attachments VALUES ('other/allowed.pdf',1),('other/denied.pdf',2);
      INSERT INTO requests VALUES (1,'${division}'),(2,'${otherDivision}');
      INSERT INTO entertainment_nominatives VALUES ('other/allowed.pdf',1,NULL),('other/denied.pdf',2,NULL);
      INSERT INTO medical_claims VALUES (1,'${id}'),(2,'00000000-0000-0000-0000-000000000000');
      INSERT INTO medical_claim_attachments VALUES ('other/allowed.pdf',1),('other/denied.pdf',2);
      CREATE FUNCTION pg_temp.test_division(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $2='${division}'::uuid $$;
      CREATE FUNCTION pg_temp.test_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE FUNCTION pg_temp.test_user_division(uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT '${division}'::uuid $$;`;
    const result = sql(`BEGIN; SET LOCAL search_path=pg_temp,public,storage; ${fixture}
      SELECT string_agg(name,',' ORDER BY name) FROM objects WHERE ${forCaller(predicate,id)}; ROLLBACK;`);
    expect(result.split(",").sort()).toEqual([`${id}/owned.pdf`, "other/allowed.pdf"].sort());
  });
}