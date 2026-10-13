import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rates = { USD: 1, EUR: 1.12, INR: 0.011 };
const monthNames = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
let ordersPromise;

async function loadOrders() {
  if (!ordersPromise) {
    ordersPromise = (async () => {
      let source;
      if (process.env.LEDGER_EXPORT_URL) {
        const response = await fetch(process.env.LEDGER_EXPORT_URL);
        if (!response.ok) throw new Error(`Ledger API returned ${response.status}`);
        source = await response.text();
      } else {
        const path = fileURLToPath(new URL("../data/orders.ndjson", import.meta.url));
        source = readFileSync(path, "utf8");
      }
      const latest = new Map();
      for (const line of source.split(/\r?\n/)) {
        if (!line) continue;
        const order = JSON.parse(line);
        const previous = latest.get(order.id);
        if (!previous || Date.parse(order.updated_at) > Date.parse(previous.updated_at)) {
          latest.set(order.id, order);
        }
      }
      return [...latest.values()];
    })();
  }
  try {
    return await ordersPromise;
  } catch (error) {
    ordersPromise = undefined;
    throw error;
  }
}

function monthWindow(question) {
  const match = question.match(
    new RegExp(`\\b(${monthNames.join("|")})\\s+(20\\d{2})\\b`, "i"),
  );
  if (!match) return null;
  return { month: monthNames.indexOf(match[1].toLowerCase()), year: Number(match[2]) };
}

function businessMonth(iso) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "numeric",
  }).formatToParts(new Date(iso));
  return {
    year: Number(parts.find((part) => part.type === "year").value),
    month: Number(parts.find((part) => part.type === "month").value) - 1,
  };
}

function selectedStatus(question) {
  if (/\b(refund(?:ed|s)?|returns?)\b/i.test(question)) return "refunded";
  if (/\bvoid(?:ed)?\b/i.test(question)) return "void";
  return "paid";
}

async function filterOrders(question) {
  const month = monthWindow(question);
  const region = question.match(/\b(north|south|east|west|central)\b/i)?.[1]?.toLowerCase();
  const customer = question.match(/\bC\d{4}\b/i)?.[0]?.toUpperCase();
  const product = ["Air Fryer", "Rice Cooker", "Blender", "Grinder", "Kettle", "Juicer", "Toaster", "Mixer"]
    .find((name) => question.toLowerCase().includes(name.toLowerCase()));
  const status = selectedStatus(question);

  return (await loadOrders()).filter((order) => {
    if (order.status !== status) return false;
    if (region && order.region.toLowerCase() !== region) return false;
    if (customer && order.customer !== customer) return false;
    if (product && order.product.toLowerCase() !== product.toLowerCase()) return false;
    if (month) {
      const when = businessMonth(order.created_at);
      if (when.month !== month.month || when.year !== month.year) return false;
    }
    return true;
  });
}

function usd(order) {
  return order.amount * (rates[order.currency] ?? 1);
}

async function answerQuestion(input) {
  const question = input.trim();
  if (!question) throw new Error("question must be a non-empty string");
  const orders = await filterOrders(question);
  const lower = question.toLowerCase();

  if (/\b(?:top|most|highest|best|largest|leading)\b/.test(lower)) {
    const byUnits = /\b(?:units?|quantity|qty)\b/.test(lower);
    const byCount = /\b(?:number|count) of orders\b/.test(lower);
    const dimension = /\bcustomer/.test(lower) ? "customer"
      : /\bregion/.test(lower) ? "region" : "product";
    const totals = new Map();
    for (const order of orders) {
      const key = order[dimension];
      totals.set(key, (totals.get(key) ?? 0) + (byUnits ? order.qty : byCount ? 1 : usd(order)));
    }
    const winner = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return winner ? winner[0] : null;
  }

  if (/\b(?:how many|count|number of)\b/.test(lower)) return orders.length;
  if (/\b(?:units?|quantity|qty)\b/.test(lower)) {
    return orders.reduce((sum, order) => sum + order.qty, 0);
  }
  if (/\b(?:average|avg|mean)\b/.test(lower)) {
    return orders.length ? Number((orders.reduce((sum, order) => sum + usd(order), 0) / orders.length).toFixed(2)) : 0;
  }
  if (/\b(?:rate|percentage|percent|share)\b/.test(lower) && /refund/i.test(question)) {
    const all = (await loadOrders()).filter((order) => order.status !== "void");
    const refunded = all.filter((order) => order.status === "refunded").length;
    return all.length ? Number((100 * refunded / all.length).toFixed(2)) : 0;
  }
  const total = orders.reduce((sum, order) => sum + usd(order), 0);
  return Number(total.toFixed(2));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Invalid JSON" }));
    }
  }
  if (!body || typeof body.question !== "string") {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Expected JSON with a question string" }));
  }
  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ answer: await answerQuestion(body.question) }));
  } catch (error) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: error.message }));
  }
}
