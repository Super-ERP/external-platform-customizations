import assert from "node:assert/strict"
import test from "node:test"

import { createQuotationTemplateClient } from "../sdk/quotation-templates.mjs"

function createClient(payload) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: payload }),
    }
  }

  return {
    calls,
    client: createQuotationTemplateClient({
      baseUrl: "https://crm.example.test/",
      apiKey: "test-api-key",
      fetchImpl,
    }),
  }
}

function createErrorClient() {
  return createQuotationTemplateClient({
    baseUrl: "https://crm.example.test/",
    apiKey: "test-api-key",
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: "Default access denied" } }),
    }),
  })
}

test("getDefault reads the tenant quotation default", async () => {
  const { calls, client } = createClient({ quotationTemplateCode: "citruscloud" })

  assert.deepEqual(await client.getDefault(), { quotationTemplateCode: "citruscloud" })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, "https://crm.example.test/api/v1/quotation-templates/default")
  assert.equal(calls[0].init.method, "GET")
  assert.equal(calls[0].init.body, undefined)
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-api-key")
})

test("setDefault activates a tenant quotation default", async () => {
  const { calls, client } = createClient({ quotationTemplateCode: "qarmour" })

  assert.deepEqual(await client.setDefault("qarmour"), { quotationTemplateCode: "qarmour" })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, "https://crm.example.test/api/v1/quotation-templates/default")
  assert.equal(calls[0].init.method, "PATCH")
  assert.equal(calls[0].init.body, JSON.stringify({ quotationTemplateCode: "qarmour" }))
  assert.equal(calls[0].init.headers["content-type"], "application/json")
})

test("setDefault clears the tenant quotation default", async () => {
  const { calls, client } = createClient({ quotationTemplateCode: null })

  assert.deepEqual(await client.setDefault(null), { quotationTemplateCode: null })
  assert.equal(calls[0].init.body, JSON.stringify({ quotationTemplateCode: null }))
})

test("getDefault propagates default API errors", async () => {
  await assert.rejects(createErrorClient().getDefault(), (error) => {
    assert.equal(error.message, "Default access denied")
    assert.equal(error.status, 403)
    return true
  })
})

test("setDefault propagates default API errors", async () => {
  await assert.rejects(createErrorClient().setDefault("qarmour"), (error) => {
    assert.equal(error.message, "Default access denied")
    assert.equal(error.status, 403)
    return true
  })
})
