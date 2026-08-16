# external-platform-customizations

Repository scope (initially): **quotation-template customization pack** for crm-v2.

This repo keeps company-specific quotation templates outside core CRM code so external teams can update templates safely through the CRM API only. The CRM renders only approved HTML/CSS templates with escaped values, repeated line blocks, and no JavaScript.

It is intentionally limited to quotation templates for now (not invoices).  
Future modules (invoice docs, contracts, etc.) can be added under `modules/` as separate subfolders with the same pattern.

## Quick start

1. Export credentials:

```bash
export CRM_API_BASE_URL="https://app.quandatics.com"
export CRM_API_KEY="qdk_..."
```

2. Add templates in `modules/quotation/definitions/templates.json` and, if needed, assignments in `modules/quotation/definitions/assignments.json`.

3. Push changes to a tenant:

```bash
./scripts/bootstrap-quotation-templates.sh apply
```

4. Verify what is stored:

```bash
./scripts/verify-quotation-templates.sh
```

For production (`app.quandatics.com`), use a tenant API key from a secret manager or a local shell only:

```bash
export CRM_API_BASE_URL="https://app.quandatics.com"
export CRM_API_KEY="qdk_..."
pnpm bootstrap
pnpm verify
```

The API key is tenant-scoped and is never committed. Bootstrap stores the template in the production database; assignment is a separate account-scoped API call, so a template can be staged before it is enabled for an account.

## Layout

- `modules/quotation/manifest.json` - package/module metadata.
- `modules/quotation/definitions/templates.json` - template registry payloads.
- `modules/quotation/definitions/assignments.json` - optional account-level template overrides.
- `modules/quotation/templates/` - reusable HTML/CSS source files.
- `scripts/` - deployment + verification helpers.

## Supported template tokens

Scalar tokens include:

`{{logoUrl}}`, `{{entityName}}`, `{{entityRegistrationNo}}`, `{{companyAddress}}`, `{{companyPhone}}`, `{{companyEmail}}`, `{{companyWebsite}}`, `{{quoteNumber}}`, `{{quoteDate}}`, `{{validUntil}}`, `{{currency}}`, `{{customerName}}`, `{{customerCode}}`, `{{customerContact}}`, `{{customerEmail}}`, `{{customerPhone}}`, `{{projectName}}`, `{{delivery}}`, `{{paymentTerm}}`, `{{quoteValidity}}`, `{{price}}`, `{{subtotal}}`, `{{discountTotal}}`, `{{taxLabel}}`, `{{taxTotal}}`, `{{total}}`, `{{notes}}`, `{{preparedBy}}`, and `{{preparedByEmail}}`.

Repeat line items with:

```html
{{#each lines}}
  <span>{{@index}}</span>
  <span>{{description}}</span>
  <span>{{quantity}}</span>
  <span>{{uom}}</span>
  <span>{{unitPrice}}</span>
  <span>{{lineSubtotal}}</span>
  <span>{{lineTotal}}</span>
{{/each}}
```

Values are HTML-escaped by the CRM. JavaScript, event handlers, external CSS imports, CSS URLs, and unsafe CSS behaviors are removed. Keep styles scoped under the template root class.

## How to add a new template

1. Add files under `modules/quotation/templates/{code}/`.
2. Add an entry in `modules/quotation/definitions/templates.json`:
   - `code`: unique short code used in account/tenant settings.
   - `renderMode`: `html` (required for custom files) or `builtin`.
   - `templateFile`: path to the HTML file (when `html` mode).
   - `cssFile`: optional CSS file path.
3. Run `./scripts/bootstrap-quotation-templates.sh apply`.
4. Assign template to account(s) via `assignments.json` or CRM admin tools.

## Adding new module types later

Add a new folder under `modules/` (for example `modules/invoice/`) with:

- `manifest.json`
- `definitions/`
- `templates/`
- Optional dedicated scripts (or extend `scripts/bootstrap-quotation-templates.sh` only if needed).

Keep each module contract isolated so one package can be promoted without affecting others.
