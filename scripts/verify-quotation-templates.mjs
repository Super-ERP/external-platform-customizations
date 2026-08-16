#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(process.cwd())
const API = (process.env.CRM_API_BASE_URL || "").replace(/\/$/, "")
const API_KEY = process.env.CRM_API_KEY || ""
const expectedDefaultCode = process.env.QUOTATION_TEMPLATE_CODE || ""

if (!API || !API_KEY) {
  console.error("Missing CRM_API_BASE_URL and/or CRM_API_KEY")
  process.exit(1)
}

const localTemplates = new Set(
  JSON.parse(fs.readFileSync(path.join(repoRoot, "modules/quotation/definitions/templates.json"), "utf8"))
    .templates
    .map((row) => row.code.toLowerCase())
)

const assignments = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "modules/quotation/definitions/assignments.json"), "utf8")
).assignments || []

async function call(method, pathname, body = undefined) {
  const response = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

async function run() {
  const list = await call("GET", "/api/v1/quotation-templates")
  if (list.status !== 200 || !list.body?.data) {
    throw new Error(`GET templates failed: ${list.status} ${JSON.stringify(list.body)}`)
  }

  const remote = new Set(list.body.data.map((row) => String(row.code).toLowerCase()))
  const missing = [...localTemplates].filter((code) => !remote.has(code))

  console.log(`Remote templates: ${list.body.data.length}`)
  console.log(JSON.stringify(list.body.data, null, 2))

  if (missing.length) {
    console.error(`Missing from tenant: ${missing.join(", ")}`)
    process.exitCode = 1
  } else {
    console.log("Template definitions aligned.")
  }

  if (expectedDefaultCode) {
    const defaultCheck = await call("GET", "/api/v1/quotation-templates/default")
    if (defaultCheck.status !== 200) {
      console.error(`Default check failed: ${defaultCheck.status}`)
      process.exitCode = 1
    } else {
      const actualDefaultCode = defaultCheck.body?.data?.quotationTemplateCode ?? null
      if (actualDefaultCode !== expectedDefaultCode) {
        console.error(`Default mismatch: expected ${expectedDefaultCode} / got ${actualDefaultCode}`)
        process.exitCode = 1
      } else {
        console.log(`default ok: ${expectedDefaultCode}`)
      }
    }
  }

  for (const assignment of assignments.filter((row) => !row.accountId?.startsWith("REPLACE_WITH_"))) {
    const check = await call(
      "GET",
      `/api/v1/accounts/${encodeURIComponent(assignment.accountId)}/quotation-template-code`
    )
    if (check.status !== 200) {
      console.error(`Account check failed ${assignment.accountId}: ${check.status}`)
      process.exitCode = 1
      continue
    }
    const assigned = check.body?.data?.quotationTemplateCode ?? null
    if ((assigned || null) !== assignment.quotationTemplateCode) {
      console.warn(`Assignment mismatch ${assignment.accountId}: expected ${assignment.quotationTemplateCode} / got ${assigned}`)
      process.exitCode = 1
    } else {
      console.log(`assignment ok: ${assignment.accountId}`)
    }
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
