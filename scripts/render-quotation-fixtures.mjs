#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const repoRoot = path.resolve(process.cwd())

function parseArguments(argv) {
  let outputDirectory = path.join(repoRoot, "artifacts/quotation-fixtures")
  const codes = []
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--") {
      continue
    } else if (argv[index] === "--out-dir") {
      const value = argv[index + 1]
      if (!value) throw new Error("--out-dir requires a path")
      outputDirectory = path.resolve(repoRoot, value)
      index += 1
    } else {
      codes.push(argv[index].toLowerCase())
    }
  }
  return { codes: new Set(codes), outputDirectory }
}

function resolveRepoFile(file) {
  const absolute = path.resolve(repoRoot, file)
  const relative = path.relative(repoRoot, absolute)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`path must stay inside the repository: ${file}`)
  }
  return absolute
}

function read(file) {
  return fs.readFileSync(resolveRepoFile(file), "utf8")
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function resolveToken(token, context) {
  const pathParts = token.trim().replace(/^this\./, "").split(".")
  return pathParts.reduce((value, key) => {
    if (value && typeof value === "object") return value[key]
    return undefined
  }, context)
}

function renderTokens(template, context) {
  return template.replace(/{{\s*([^{}]+?)\s*}}/g, (_match, token) =>
    escapeHtml(resolveToken(token, context))
  )
}

function renderTemplate(template, context) {
  const withLines = template.replace(
    /{{\s*#each\s+lines\s*}}([\s\S]*?){{\s*\/each\s*}}/g,
    (_match, body) =>
      (context.lines || [])
        .map((line, index) => renderTokens(body, { ...context, ...line, "@index": index + 1 }))
        .join("")
  )
  return renderTokens(withLines, context)
}

function standaloneDocument({ code, html, css }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(code)} quotation fixture</title>
  <style>
    @page { size: A4; margin: 0; }
    html, body { width: 210mm; min-height: 297mm; margin: 0; padding: 0; background: #fff; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
${css}
  </style>
</head>
<body>
${html}
</body>
</html>
`
}

function printPdf(chrome, htmlFile, pdfFile) {
  const result = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-background-networking",
      "--disable-extensions",
      "--disable-gpu",
      "--no-pdf-header-footer",
      "--run-all-compositor-stages-before-draw",
      `--print-to-pdf=${pdfFile}`,
      pathToFileURL(htmlFile).href,
    ],
    { stdio: "inherit" }
  )
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Chrome PDF render failed for ${path.basename(htmlFile)}`)
}

function main() {
  const { codes, outputDirectory } = parseArguments(process.argv.slice(2))
  const definitions = JSON.parse(read("modules/quotation/definitions/templates.json")).templates || []
  const selected = definitions.filter((template) => template.renderMode === "html" && (!codes.size || codes.has(template.code)))
  if (!selected.length) throw new Error("no matching HTML quotation templates")

  fs.mkdirSync(outputDirectory, { recursive: true })
  for (const template of selected) {
    if (!template.fixtureFile) throw new Error(`${template.code}: fixtureFile is required`)
    const fixture = JSON.parse(read(template.fixtureFile))
    if (fixture.quotationTemplateCode !== template.code) {
      throw new Error(`${template.code}: fixture quotationTemplateCode does not match`)
    }
    const html = renderTemplate(read(template.templateFile), fixture.context || {})
    const css = template.cssFile ? read(template.cssFile) : ""
    const htmlFile = path.join(outputDirectory, `${template.code}.html`)
    fs.writeFileSync(htmlFile, standaloneDocument({ code: template.code, html, css }))
    console.log(`rendered HTML: ${htmlFile}`)

    if (process.env.CHROME_BIN) {
      const pdfFile = path.join(outputDirectory, `${template.code}.pdf`)
      printPdf(process.env.CHROME_BIN, htmlFile, pdfFile)
      console.log(`rendered PDF: ${pdfFile}`)
    }
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
