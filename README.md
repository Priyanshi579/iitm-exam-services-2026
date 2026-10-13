# Exam service endpoints

This project is prepared for Vercel's Node.js functions.

## MCP challenge endpoint

Deploy this directory as a Vercel project. The MCP endpoint will be:

`https://<deployment>.vercel.app/api/mcp`

It supports stateless Streamable HTTP JSON-RPC requests for `initialize`,
`notifications/initialized`, `tools/list`, `tools/call`, and `ping`. The sole
tool is `solve_challenge`; each call reads `X-Exam-Challenge` from that HTTP
request and returns the required 16-character SHA-256 prefix.

## Ledger endpoint

Deploy this directory as a Vercel project and set `LEDGER_EXPORT_URL` to the
private URL for the personalized `/export` API endpoint in Project Settings.
Do not commit that URL; it contains the exam signature. The JSON question endpoint will be:

`https://<deployment>.vercel.app/api/ledger`

Send `POST` with `{"question":"..."}`. The handler caches the upstream export
in each warm function instance, keeps the latest `updated_at` row for each order id,
applies Asia/Kolkata business dates, counts only paid orders as revenue, and
converts EUR and INR using the API's published USD rates. It supports filters
for month, region, product, and customer ID, plus revenue, refund, count, unit,
average, and top-item questions.
