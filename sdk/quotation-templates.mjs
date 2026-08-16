export function createQuotationTemplateClient({ baseUrl, apiKey, fetchImpl = fetch }) {
  const api = String(baseUrl || "").replace(/\/$/, "")
  if (!api || !apiKey) throw new Error("baseUrl and apiKey are required")

  async function request(method, pathname, body) {
    const response = await fetchImpl(`${api}${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = payload?.error?.message || `CRM API request failed (${response.status})`
      const error = new Error(message)
      error.status = response.status
      throw error
    }
    return payload?.data ?? payload
  }

  return {
    list: () => request("GET", "/api/v1/quotation-templates"),
    get: async (code) => {
      try {
        return await request("GET", `/api/v1/quotation-templates/${encodeURIComponent(code)}`)
      } catch (error) {
        if (error?.status === 404) return null
        throw error
      }
    },
    create: (template) => request("POST", "/api/v1/quotation-templates", template),
    update: (code, template) =>
      request("PATCH", `/api/v1/quotation-templates/${encodeURIComponent(code)}`, template),
    upsert: async (template) => {
      const existing = await (async () => {
        try {
          return await request("GET", `/api/v1/quotation-templates/${encodeURIComponent(template.code)}`)
        } catch (error) {
          if (error?.status === 404) return null
          throw error
        }
      })()
      return existing
        ? { action: "updated", data: await request("PATCH", `/api/v1/quotation-templates/${encodeURIComponent(template.code)}`, template) }
        : { action: "created", data: await request("POST", "/api/v1/quotation-templates", template) }
    },
    assign: (accountId, quotationTemplateCode) =>
      request("PATCH", `/api/v1/accounts/${encodeURIComponent(accountId)}/quotation-template-code`, {
        quotationTemplateCode,
      }),
  }
}
