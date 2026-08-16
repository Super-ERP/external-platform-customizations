import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const validateScript = path.join(repoRoot, "scripts/validate-quotation-templates.mjs")
const renderScript = path.join(repoRoot, "scripts/render-quotation-fixtures.mjs")

async function copyPack() {
  const root = await mkdtemp(path.join(tmpdir(), "quotation-template-pack-"))
  await cp(path.join(repoRoot, "modules"), path.join(root, "modules"), { recursive: true })
  return root
}

function run(script, cwd, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CHROME_BIN: "" },
  })
}

function outputOf(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`
}

async function withPack(runTest) {
  const root = await copyPack()
  try {
    await runTest(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test("validator rejects a missing quotation fixture", async () => {
  await withPack(async (root) => {
    await rm(path.join(root, "modules/quotation/fixtures/qar.json"), { force: true })

    const result = run(validateScript, root)

    assert.notEqual(result.status, 0)
    assert.match(outputOf(result), /fixture/i)
  })
})

test("validator rejects a missing required default code", async () => {
  await withPack(async (root) => {
    const definitionsFile = path.join(root, "modules/quotation/definitions/templates.json")
    const definitions = JSON.parse(await readFile(definitionsFile, "utf8"))
    definitions.templates.find((template) => template.code === "citruscloud").code = "cc"
    await writeFile(definitionsFile, `${JSON.stringify(definitions, null, 2)}\n`)

    const result = run(validateScript, root)

    assert.notEqual(result.status, 0)
    assert.match(outputOf(result), /required default template code.*citruscloud/i)
  })
})

test("validator rejects a template without its required root class", async () => {
  await withPack(async (root) => {
    const templateFile = path.join(root, "modules/quotation/templates/cc/template.html")
    const template = await readFile(templateFile, "utf8")
    await writeFile(templateFile, template.replace("q-template--cc", "q-template--wrong"))

    const result = run(validateScript, root)

    assert.notEqual(result.status, 0)
    assert.match(outputOf(result), /required root class.*q-template--cc/i)
  })
})

test("validator rejects a template without a reference label", async () => {
  await withPack(async (root) => {
    const templateFile = path.join(root, "modules/quotation/templates/cc/template.html")
    const template = await readFile(templateFile, "utf8")
    await writeFile(templateFile, template.replace("QUOTATION", "QUOTE"))

    const result = run(validateScript, root)

    assert.notEqual(result.status, 0)
    assert.match(outputOf(result), /required label.*QUOTATION/i)
  })
})

test("validator rejects unsafe embedded content", async () => {
  await withPack(async (root) => {
    const templateFile = path.join(root, "modules/quotation/templates/qar/template.html")
    const template = await readFile(templateFile, "utf8")
    await writeFile(templateFile, `${template}\n<iframe src="https://example.test"></iframe>\n`)

    const result = run(validateScript, root)

    assert.notEqual(result.status, 0)
    assert.match(outputOf(result), /unsafe HTML/i)
  })
})

test("renderer writes escaped standalone A4 HTML for both default templates", async () => {
  await withPack(async (root) => {
    const outputDirectory = path.join(root, "rendered")

    const result = run(renderScript, root, ["--", "--out-dir", outputDirectory])

    assert.equal(result.status, 0, outputOf(result))
    for (const code of ["citruscloud", "qarmour"]) {
      const html = await readFile(path.join(outputDirectory, `${code}.html`), "utf8")
      assert.match(html, /@page\s*{\s*size:\s*A4;\s*margin:\s*0;\s*}/)
      assert.match(html, new RegExp(`q-template--${code === "citruscloud" ? "cc" : "qar"}`))
      assert.doesNotMatch(html, /{{|}}/)
    }
    const ccHtml = await readFile(path.join(outputDirectory, "citruscloud.html"), "utf8")
    assert.match(ccHtml, /S&amp;M:/)
    assert.doesNotMatch(ccHtml, /S&M:/)
  })
})
