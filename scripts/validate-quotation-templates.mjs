#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(process.cwd())
const maxBytes = 200_000
const templates = JSON.parse(fs.readFileSync(path.join(repoRoot, "modules/quotation/definitions/templates.json"), "utf8")).templates || []
const requiredTemplates = {
  citruscloud: {
    rootClass: "q-template--cc",
    labels: [
      "QUOTATION", "To:", "Attn:", "Project:", "Email:", "Ref. No", "Date", "Currency", "Delivery",
      "Payment Term", "Quote Validity", "Price", "Item", "SKU", "Description", "QTY", "UOM", "Unit Price",
      "Subtotal", "Total Price", "Total (excl. of SST)", "Total (Inclusive of SST)",
      "**Please Quote Our Reference Number When Placing An Order**",
      "This Quotation is computer generated and no signature is required.", "Prepared by,",
    ],
  },
  qarmour: {
    rootClass: "q-template--qar",
    labels: [
      "QUOTATION", "To:", "Attn:", "Tel :", "Email:", "Ref. No", "Date", "Currency", "Delivery",
      "Payment Term", "Quote Validity", "Price", "No", "Description", "QTY", "Unit Price", "Total Price",
      "Total (", "SST (", "Total with SST (", "**Please Quote Our Reference Number When Placing An Order**",
      "This Quotation is computer generated and no signature is required.",
    ],
  },
}
const allowedTokens = new Set([
  "logoUrl", "entityName", "entityRegistrationNo", "companyAddress", "companyPhone", "companyEmail", "companyWebsite",
  "quoteNumber", "quoteDate", "validUntil", "currency", "customerName", "customerCode", "customerContact", "customerEmail",
  "customerPhone", "projectName", "delivery", "paymentTerm", "quoteValidity", "price", "subtotal", "discountTotal",
  "taxLabel", "taxTotal", "total", "notes", "preparedBy", "preparedByEmail", "sku", "description", "quantity", "uom",
  "unitPrice", "lineSubtotal", "lineTotal", "@index",
])

function resolveRepoFile(file) {
  const absolute = path.resolve(repoRoot, file)
  const relative = path.relative(repoRoot, absolute)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${file}: path must stay inside the repository`)
  }
  return absolute
}

function read(file) {
  const value = fs.readFileSync(resolveRepoFile(file), "utf8")
  if (Buffer.byteLength(value, "utf8") > maxBytes) throw new Error(`${file} exceeds ${maxBytes} bytes`)
  return value
}

function tokensIn(value) {
  return [...value.matchAll(/{{\s*([^{}]+?)\s*}}/g)]
    .map((match) => match[1].trim())
    .filter((token) => token !== "#each lines" && token !== "/each")
    .map((token) => token.replace(/^this\./, ""))
}

function assertFixtureComplete(template, html) {
  if (!template.fixtureFile) throw new Error(`${template.code}: fixtureFile is required`)
  const fixture = JSON.parse(read(template.fixtureFile))
  if (fixture.quotationTemplateCode !== template.code) {
    throw new Error(`${template.code}: fixture quotationTemplateCode must equal ${template.code}`)
  }
  if (!fixture.context || typeof fixture.context !== "object" || Array.isArray(fixture.context)) {
    throw new Error(`${template.code}: fixture context is required`)
  }

  const lineBlocks = [...html.matchAll(/{{\s*#each\s+lines\s*}}([\s\S]*?){{\s*\/each\s*}}/g)]
  const lineTokens = new Set(lineBlocks.flatMap((match) => tokensIn(match[1])).filter((token) => token !== "@index"))
  const rootTokens = new Set(tokensIn(html.replace(/{{\s*#each\s+lines\s*}}[\s\S]*?{{\s*\/each\s*}}/g, "")))
  for (const token of rootTokens) {
    if (!Object.prototype.hasOwnProperty.call(fixture.context, token)) {
      throw new Error(`${template.code}: fixture context is missing ${token}`)
    }
  }
  if (!Array.isArray(fixture.context.lines)) throw new Error(`${template.code}: fixture lines must be an array`)
  if (lineTokens.size && !fixture.context.lines.length) throw new Error(`${template.code}: fixture requires at least one line`)
  for (const [index, line] of fixture.context.lines.entries()) {
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      throw new Error(`${template.code}: fixture line ${index + 1} must be an object`)
    }
    for (const token of lineTokens) {
      if (!Object.prototype.hasOwnProperty.call(line, token)) {
        throw new Error(`${template.code}: fixture line ${index + 1} is missing ${token}`)
      }
    }
  }
}

function assertScopedCss(code, rootClass, css) {
  for (const block of css.split("}")) {
    const brace = block.lastIndexOf("{")
    if (brace < 0) continue
    const selectors = block.slice(0, brace).trim()
    if (!selectors || selectors.startsWith("@")) continue
    for (const selector of selectors.split(",")) {
      if (!selector.trim().startsWith(`.${rootClass}`)) {
        throw new Error(`${code}: CSS selector must be scoped under .${rootClass}: ${selector.trim()}`)
      }
    }
  }
}

const codes = templates.map((template) => String(template.code || "").toLowerCase())
if (new Set(codes).size !== codes.length) throw new Error("quotation template codes must be unique")
for (const code of Object.keys(requiredTemplates)) {
  if (!codes.includes(code)) throw new Error(`required default template code is missing: ${code}`)
}

for (const template of templates) {
  if (template.renderMode !== "html") continue
  const requirement = requiredTemplates[template.code]
  if (!requirement) throw new Error(`${template.code}: unsupported default template code`)
  if (!template.templateFile) throw new Error(`${template.code}: templateFile is required`)
  const html = read(template.templateFile)
  const css = template.cssFile ? read(template.cssFile) : ""
  if (/<\/?(?:script|iframe|object|embed|form|link|meta|base)\b|\son[a-z]+\s*=|\sstyle\s*=|javascript:/i.test(html)) {
    throw new Error(`${template.code}: unsafe HTML detected`)
  }
  if (/@import|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding\s*:|<\/?style\b/i.test(css)) {
    throw new Error(`${template.code}: unsafe CSS detected`)
  }
  const rootPattern = new RegExp(`class=["'][^"']*\\b${requirement.rootClass}\\b[^"']*["']`)
  if (!rootPattern.test(html)) throw new Error(`${template.code}: required root class ${requirement.rootClass} is missing`)
  if (!css.includes(`.${requirement.rootClass}`)) throw new Error(`${template.code}: required root class .${requirement.rootClass} is missing from CSS`)
  assertScopedCss(template.code, requirement.rootClass, css)
  for (const label of requirement.labels) {
    if (!html.includes(label)) throw new Error(`${template.code}: required label is missing: ${label}`)
  }
  for (const name of tokensIn(html)) {
    if (!allowedTokens.has(name)) throw new Error(`${template.code}: unsupported token {{${name}}}`)
  }
  const opens = (html.match(/{{\s*#each\s+lines\s*}}/g) || []).length
  const closes = (html.match(/{{\s*\/each\s*}}/g) || []).length
  if (!opens || opens !== closes) {
    throw new Error(`${template.code}: lines loop is unbalanced`)
  }
  assertFixtureComplete(template, html)
}

console.log(`validated ${templates.length} quotation template definition(s)`)
