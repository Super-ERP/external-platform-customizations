# Quotation template skeleton

Copy this folder to `modules/quotation/templates/<code>/` when creating a new PDF quotation pattern.

1. Replace the placeholder markup in `template.html`.
2. Keep `{{#each lines}}` and `{{/each}}` balanced.
3. Use only tokens listed in the root README.
4. Scope CSS below the root class.
5. Run `pnpm validate` before opening a PR.
6. Register the files in `modules/quotation/definitions/templates.json`.
