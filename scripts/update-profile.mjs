import { mkdir, readFile, writeFile } from "node:fs/promises";

const OWNER = process.env.PROFILE_USERNAME || process.env.GITHUB_REPOSITORY_OWNER || "voyage-craft";
const TOKEN = process.env.GITHUB_TOKEN;
const MAX_REPOS = Number(process.env.MAX_REPOS || 6);
const README_PATH = new URL("../README.md", import.meta.url);
const DASHBOARD_PATH = new URL("../assets/generated/dashboard.svg", import.meta.url);
const START = "<!-- PROFILE_SYNC_START -->";
const END = "<!-- PROFILE_SYNC_END -->";

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

const [profile, repos] = await Promise.all([
  github(`/users/${OWNER}`),
  github(`/users/${OWNER}/repos?sort=updated&per_page=100`),
]);

await mkdir(new URL("../assets/generated/", import.meta.url), { recursive: true });
await writeFile(DASHBOARD_PATH, renderDashboardSvg(profile, repos));

const source = await readFile(README_PATH, "utf8");
await writeFile(README_PATH, replaceBetweenMarkers(source, renderProfileSection()));

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub API failed: ${response.status} ${response.statusText}`);
  return response.json();
}

function renderProfileSection() {
  return `<div align="center"><img src="./assets/generated/dashboard.svg" alt="${escapeHtml(OWNER)} live GitHub dashboard" width="100%" /></div>`;
}

function renderDashboardSvg(profile, repos) {
  const ownRepos = repos.filter((repo) => !repo.fork && !repo.archived);
  const featuredRepos = [...ownRepos].sort((a, b) => repoScore(b) - repoScore(a)).slice(0, MAX_REPOS);
  const recentRepos = [...ownRepos].sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at)).slice(0, 5);
  const languages = aggregateLanguages(ownRepos).slice(0, 6);
  const totalStars = ownRepos.reduce((total, repo) => total + repo.stargazers_count, 0);
  const totalForks = ownRepos.reduce((total, repo) => total + repo.forks_count, 0);
  const syncedAt = new Date().toISOString().replace("T", " ").slice(0, 16);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="980" viewBox="0 0 1200 980" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(OWNER)} live GitHub dashboard</title>
  <desc id="desc">Repository, language and activity dashboard generated from GitHub data.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="980" gradientUnits="userSpaceOnUse"><stop stop-color="#020617"/><stop offset="0.5" stop-color="#111827"/><stop offset="1" stop-color="#164E63"/></linearGradient>
    <radialGradient id="glowA" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(210 120) rotate(48) scale(560 300)"><stop stop-color="#22D3EE" stop-opacity="0.42"/><stop offset="1" stop-color="#22D3EE" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1040 720) rotate(155) scale(620 360)"><stop stop-color="#EC4899" stop-opacity="0.35"/><stop offset="1" stop-color="#EC4899" stop-opacity="0"/></radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.42"/></filter>
  </defs>
  <rect width="1200" height="980" rx="34" fill="url(#bg)"/>
  <rect width="1200" height="980" rx="34" fill="url(#glowA)"/>
  <rect width="1200" height="980" rx="34" fill="url(#glowB)"/>
  <g opacity="0.12">${gridLines()}</g>
  <text x="64" y="86" fill="#F8FAFC" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="38" font-weight="800">${escapeXml(OWNER)} live dashboard</text>
  <text x="64" y="126" fill="#A5F3FC" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="20" font-weight="650">auto synced · ${escapeXml(syncedAt)} UTC · unified local SVG surface</text>
  ${statCards([
    ["repositories", ownRepos.length, "#22D3EE"],
    ["stars", totalStars, "#EC4899"],
    ["forks", totalForks, "#8B5CF6"],
    ["followers", profile.followers, "#22C55E"],
  ])}
  ${languageBars(languages, 64, 292)}
  <text x="64" y="502" fill="#F8FAFC" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="28" font-weight="800">repository constellation</text>
  ${repoCards(featuredRepos, 64, 538)}
  <text x="64" y="846" fill="#F8FAFC" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="28" font-weight="800">recent signals</text>
  ${recentSignals(recentRepos, 64, 880)}
</svg>`;
}

function gridLines() {
  const lines = [];
  for (let x = 0; x <= 1200; x += 120) lines.push(`<path d="M${x} 0V980" stroke="#E5E7EB"/>`);
  for (let y = 0; y <= 980; y += 98) lines.push(`<path d="M0 ${y}H1200" stroke="#E5E7EB"/>`);
  return lines.join("");
}

function statCards(items) {
  return items.map(([label, value, color], index) => {
    const x = 64 + index * 278;
    return `<g filter="url(#shadow)"><rect x="${x}" y="170" width="246" height="92" rx="22" fill="#020617" fill-opacity="0.62" stroke="${color}" stroke-opacity="0.42"/><text x="${x + 24}" y="212" fill="${color}" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="17" font-weight="800" letter-spacing="1.5">${escapeXml(label.toUpperCase())}</text><text x="${x + 24}" y="246" fill="#F8FAFC" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="34" font-weight="800">${escapeXml(formatNumber(value))}</text></g>`;
  }).join("");
}

function languageBars(languages, x, y) {
  if (!languages.length) return `<text x="${x}" y="${y}" fill="#CBD5E1" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="20">No language data yet.</text>`;
  const max = Math.max(...languages.map(({ count }) => count));
  const rows = languages.map(({ name, count }, index) => {
    const rowY = y + index * 30;
    const width = Math.max(44, Math.round((count / max) * 620));
    const color = ["#22D3EE", "#8B5CF6", "#EC4899", "#22C55E", "#F59E0B", "#38BDF8"][index % 6];
    return `<text x="${x}" y="${rowY}" fill="#CBD5E1" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="18" font-weight="700">${escapeXml(name)}</text><rect x="${x + 170}" y="${rowY - 17}" width="720" height="20" rx="10" fill="#0F172A"/><rect x="${x + 170}" y="${rowY - 17}" width="${width}" height="20" rx="10" fill="${color}" fill-opacity="0.82"/><text x="${x + 910}" y="${rowY}" fill="#F8FAFC" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="16" font-weight="700">${count} repos</text>`;
  }).join("");
  return `<text x="${x}" y="${y - 42}" fill="#F8FAFC" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="28" font-weight="800">language matrix</text>${rows}`;
}

function repoCards(repos, x, y) {
  if (!repos.length) return `<text x="${x}" y="${y + 40}" fill="#CBD5E1" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="20">No repositories to display yet.</text>`;
  return repos.map((repo, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const cardX = x + col * 552;
    const cardY = y + row * 96;
    const name = truncate(repo.name, 30);
    const desc = truncate(repo.description || "No description yet.", 72);
    return `<g filter="url(#shadow)"><rect x="${cardX}" y="${cardY}" width="520" height="78" rx="18" fill="#020617" fill-opacity="0.62" stroke="#22D3EE" stroke-opacity="0.28"/><text x="${cardX + 22}" y="${cardY + 31}" fill="#F8FAFC" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="20" font-weight="800">${escapeXml(name)}</text><text x="${cardX + 22}" y="${cardY + 56}" fill="#CBD5E1" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="15">${escapeXml(desc)}</text><text x="${cardX + 378}" y="${cardY + 31}" fill="#FBCFE8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="14" font-weight="800">★ ${repo.stargazers_count} · ⑂ ${repo.forks_count}</text></g>`;
  }).join("");
}

function recentSignals(repos, x, y) {
  if (!repos.length) return `<text x="${x}" y="${y}" fill="#CBD5E1" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="20">No recent updates yet.</text>`;
  return repos.map((repo, index) => {
    const rowY = y + index * 28;
    const pushedAt = new Date(repo.pushed_at).toISOString().slice(0, 10);
    return `<text x="${x}" y="${rowY}" fill="#A5F3FC" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="17" font-weight="700">${escapeXml(truncate(repo.name, 38))}</text><text x="${x + 360}" y="${rowY}" fill="#CBD5E1" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="16">${escapeXml(repo.language || "Code")} · ${escapeXml(pushedAt)}</text>`;
  }).join("");
}

function aggregateLanguages(repos) {
  const counts = new Map();
  for (const repo of repos) {
    if (!repo.language) continue;
    counts.set(repo.language, (counts.get(repo.language) || 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function repoScore(repo) {
  return repo.stargazers_count * 10 + repo.forks_count * 3 + freshnessScore(repo.pushed_at);
}

function freshnessScore(value) {
  const days = Math.max(1, (Date.now() - new Date(value).getTime()) / 86_400_000);
  return Math.max(0, 30 - days);
}

function replaceBetweenMarkers(source, content) {
  const startIndex = source.indexOf(START);
  const endIndex = source.indexOf(END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) throw new Error("README markers are missing or invalid.");
  return `${source.slice(0, startIndex + START.length)}\n${content}\n${source.slice(endIndex)}`;
}

function truncate(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char]);
}

function escapeXml(value) {
  return escapeHtml(value);
}
