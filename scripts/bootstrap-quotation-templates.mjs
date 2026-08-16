#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { createQuotationTemplateClient } from "../sdk/quotation-templates.mjs"

const repoRoot = path.resolve(process.cwd())
const API = (process.env.CRM_API_BASE_URL || "").replace(/\/$/, "")
const API_KEY = process.env.CRM_API_KEY || ""

if (!API || !API_KEY) {
  console.error("Missing CRM_API_BASE_URL and/or CRM_API_KEY")
  console.error("Example:")
  console.error("  export CRM_API_BASE_URL=https://app.quandatics.com")
  console.error("  export CRM_API_KEY=qdk_...")
  process.exit(1)
}

const mode = process.argv[2] || "apply"
const applyTemplates = mode === "apply" || mode === "templates"
const applyAssignments = mode === "apply" || mode === "assignments"
const client = createQuotationTemplateClient({ baseUrl: API, apiKey: API_KEY })

const templates = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "modules/quotation/definitions/templates.json"), "utf8")
).templates || []
const assignments = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "modules/quotation/definitions/assignments.json"), "utf8")
).assignments || []

function abs(filePath) {
  return path.resolve(repoRoot, filePath)
}

async function upsertTemplate(def) {
  const templatePayload = {
    code: def.code,
    label: def.label,
    legacyTemplateCode: def.legacyTemplateCode ?? null,
    renderMode: def.renderMode || "html",
    notes: def.notes ?? null,
    isActive: Boolean(def.isActive ?? true),
  }

  if (templatePayload.renderMode === "html") {
    const htmlPath = def.templateFile
    const cssPath = def.cssFile
    if (!htmlPath) throw new Error(`templateFile missing for ${def.code}`)
    templatePayload.htmlTemplate = fs.readFileSync(abs(htmlPath), "utf8")
    templatePayload.cssTemplate = cssPath ? fs.readFileSync(abs(cssPath), "utf8") : null
  }

  const result = await client.upsert(templatePayload)
  console.log(`${result.action}: ${templatePayload.code}`)
}

async function assignTemplate({ accountId, quotationTemplateCode }) {
  await client.assign(accountId, quotationTemplateCode)
  console.log(`assigned ${accountId} -> ${quotationTemplateCode}`)
}

async function main() {
  if (applyTemplates) {
    for (const def of templates) await upsertTemplate(def)
  }

  if (applyAssignments) {
    for (const assign of assignments) {
      if (assign.accountId?.startsWith("REPLACE_WITH_")) {
        console.log(`skip placeholder assignment: ${JSON.stringify(assign)}`)
        continue
      }
      await assignTemplate(assign)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
