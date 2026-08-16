#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(process.cwd())
const maxBytes = 200_000
const templates = JSON.parse(fs.readFileSync(path.join(repoRoot, "modules/quotation/definitions/templates.json"), "utf8")).templates || []
const allowedTokens = new Set([
  "logoUrl", "entityName", "entityRegistrationNo", "companyAddress", "companyPhone", "companyEmail", "companyWebsite",
  "quoteNumber", "quoteDate", "validUntil", "currency", "customerName", "customerCode", "customerContact", "customerEmail",
  "customerPhone", "projectName", "delivery", "paymentTerm", "quoteValidity", "price", "subtotal", "discountTotal",
  "taxLabel", "taxTotal", "total", "notes", "preparedBy", "preparedByEmail", "sku", "description", "quantity", "uom",
  "unitPrice", "lineSubtotal", "lineTotal", "@index",
])

function read(file) {
  const value = fs.readFileSync(path.resolve(repoRoot, file), "utf8")
  if (Buffer.byteLength(value, "utf8") > maxBytes) throw new Error(`${file} exceeds ${maxBytes} bytes`)
  return value
}

for (const template of templates) {
  if (template.renderMode !== "html") continue
  if (!template.templateFile) throw new Error(`${template.code}: templateFile is required`)
  const html = read(template.templateFile)
  const css = template.cssFile ? read(template.cssFile) : ""
  if (/<\/?script\b|\son[a-z]+\s*=|javascript:/i.test(html)) throw new Error(`${template.code}: unsafe HTML detected`)
  if (/@import|url\s*\(|expression\s*\(|behavior\s*:/i.test(css)) throw new Error(`${template.code}: unsafe CSS detected`)
  for (const token of html.matchAll(/{{\s*([^{}#/@][^{}]*)\s*}}/g)) {
    const name = token[1].trim().replace(/^this\./, "")
    if (!allowedTokens.has(name)) throw new Error(`${template.code}: unsupported token {{${name}}}`)
  }
  if ((html.match(/{{\s*#each\s+lines\s*}}/g) || []).length !== (html.match(/{{\s*\/each\s*}}/g) || []).length) {
    throw new Error(`${template.code}: lines loop is unbalanced`)
  }
}

console.log(`validated ${templates.length} quotation template definition(s)`)
