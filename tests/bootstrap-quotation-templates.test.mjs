import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import http from "node:http"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function runScript(script, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    child.stdout.on("data", (chunk) => { output += chunk })
    child.stderr.on("data", (chunk) => { output += chunk })
    child.on("error", reject)
    child.on("close", (status) => resolve({ status, output }))
  })
}

test("defaults mode stages only selected template before setting explicit tenant default", async (t) => {
  const requests = []
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url })
    const missing = request.method === "GET" && request.url !== "/api/v1/quotation-templates/default"
    response.writeHead(missing ? 404 : 200, { "content-type": "application/json" })
    response.end(JSON.stringify(missing ? { error: { message: "missing" } } : { data: {} }))
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => server.close())

  const { port } = server.address()
  const result = await runScript("scripts/bootstrap-quotation-templates.mjs", ["defaults"], {
    CRM_API_BASE_URL: `http://127.0.0.1:${port}`,
    CRM_API_KEY: "test-api-key",
    QUOTATION_TEMPLATE_CODE: "qarmour",
  })

  assert.equal(result.status, 0, result.output)
  assert.deepEqual(requests.map(({ method, url }) => `${method} ${url}`), [
    "GET /api/v1/quotation-templates/qarmour",
    "POST /api/v1/quotation-templates",
    "PATCH /api/v1/quotation-templates/default",
  ])
})

test("defaults mode requires an explicit default code before making API requests", async (t) => {
  const requests = []
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url })
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ data: {} }))
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => server.close())

  const { port } = server.address()
  const result = await runScript("scripts/bootstrap-quotation-templates.mjs", ["defaults"], {
    CRM_API_BASE_URL: `http://127.0.0.1:${port}`,
    CRM_API_KEY: "test-api-key",
    QUOTATION_TEMPLATE_CODE: "",
  })

  assert.notEqual(result.status, 0)
  assert.match(result.output, /QUOTATION_TEMPLATE_CODE is required for defaults mode/)
  assert.deepEqual(requests, [])
})

test("defaults mode rejects an unknown code before making API requests", async (t) => {
  const requests = []
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url })
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ data: {} }))
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => server.close())

  const { port } = server.address()
  const result = await runScript("scripts/bootstrap-quotation-templates.mjs", ["defaults"], {
    CRM_API_BASE_URL: `http://127.0.0.1:${port}`,
    CRM_API_KEY: "test-api-key",
    QUOTATION_TEMPLATE_CODE: "unknown",
  })

  assert.notEqual(result.status, 0)
  assert.match(result.output, /QUOTATION_TEMPLATE_CODE must match a configured template code/)
  assert.deepEqual(requests, [])
})

test("verify compares the tenant default with explicit expected code", async (t) => {
  const requests = []
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url })
    const body = request.url === "/api/v1/quotation-templates/default"
      ? { data: { quotationTemplateCode: "qarmour" } }
      : { data: [{ code: "qarmour" }, { code: "citruscloud" }] }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify(body))
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => server.close())

  const { port } = server.address()
  const result = await runScript("scripts/verify-quotation-templates.mjs", [], {
    CRM_API_BASE_URL: `http://127.0.0.1:${port}`,
    CRM_API_KEY: "test-api-key",
    QUOTATION_TEMPLATE_CODE: "qarmour",
  })

  assert.equal(result.status, 0, result.output)
  assert.deepEqual(requests.map(({ method, url }) => `${method} ${url}`), [
    "GET /api/v1/quotation-templates",
    "GET /api/v1/quotation-templates/default",
  ])
})

test("verify fails when tenant default differs from explicit expected code", async (t) => {
  const server = http.createServer((request, response) => {
    const body = request.url === "/api/v1/quotation-templates/default"
      ? { data: { quotationTemplateCode: "citruscloud" } }
      : { data: [{ code: "qarmour" }, { code: "citruscloud" }] }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify(body))
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => server.close())

  const { port } = server.address()
  const result = await runScript("scripts/verify-quotation-templates.mjs", [], {
    CRM_API_BASE_URL: `http://127.0.0.1:${port}`,
    CRM_API_KEY: "test-api-key",
    QUOTATION_TEMPLATE_CODE: "qarmour",
  })

  assert.notEqual(result.status, 0)
  assert.match(result.output, /Default mismatch: expected qarmour \/ got citruscloud/)
})
