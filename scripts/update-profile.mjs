import { readFile, writeFile } from "node:fs/promises";

const OWNER = process.env.PROFILE_USERNAME || process.env.GITHUB_REPOSITORY_OWNER;
const TOKEN = process.env.GITHUB_TOKEN;
const MAX_REPOS = Number(process.env.MAX_REPOS || 6);
const README_PATH = new URL("../README.md", import.meta.url);
const START = "<!-- PROFILE_SYNC_START -->";
const END = "<!-- PROFILE_SYNC_END -->";

if (!OWNER) throw new Error("Missing PROFILE_USERNAME or GITHUB_REPOSITORY_OWNER.");

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

const [profile, repos] = await Promise.all([
  github(`/users/${OWNER}`),
  github(`/users/${OWNER}/repos?sort=updated&per_page=100`),
]);

const source = await readFile(README_PATH, "utf8");
await writeFile(README_PATH, replaceBetweenMarkers(source, renderProfileSection(profile, repos)));

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub API failed: ${response.status} ${response.statusText}`);
  return response.json();
}

function renderProfileSection(profile, repos) {
  const ownRepos = repos.filter((repo) => !repo.fork && !repo.archived);
  const featuredRepos = [...ownRepos].sort((a, b) => repoScore(b) - repoScore(a)).slice(0, MAX_REPOS);
  const recentlyUpdated = [...ownRepos].sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at)).slice(0, 6);
  const languages = aggregateLanguages(ownRepos);
  const totalStars = ownRepos.reduce((total, repo) => total + repo.stargazers_count, 0);
  const totalForks = ownRepos.reduce((total, repo) => total + repo.forks_count, 0);

  return [
    renderHeroStats(profile, ownRepos.length, totalStars, totalForks),
    renderActivityGraph(),
    renderLanguageBadges(languages),
    "<h3>Repository Constellation</h3>",
    renderRepoGrid(featuredRepos),
    "<h3>Recent Signals</h3>",
    renderRecentSignals(recentlyUpdated),
    `<sub>Auto synced for ${escapeHtml(OWNER)} at ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC</sub>`,
  ].join("\n");
}

function renderHeroStats(profile, repoCount, totalStars, totalForks) {
  const encodedOwner = encodeURIComponent(OWNER);
  const profileViews = `https://komarev.com/ghpvc/?username=${encodedOwner}&style=for-the-badge&color=22d3ee&label=PROFILE+VIEWS`;
  const statsUrl = `https://github-readme-stats.vercel.app/api?username=${encodedOwner}&show_icons=true&theme=tokyonight&hide_border=true&bg_color=0d1117&title_color=22d3ee&icon_color=ec4899&text_color=c9d1d9`;
  const streakUrl = `https://github-readme-streak-stats.herokuapp.com?user=${encodedOwner}&theme=tokyonight&hide_border=true&background=0D1117&ring=22D3EE&fire=EC4899&currStreakLabel=8B5CF6`;
  const trophyUrl = `https://github-profile-trophy.vercel.app/?username=${encodedOwner}&theme=tokyonight&no-frame=true&no-bg=true&margin-w=8&column=4`;
  return [
    `<div align="center"><img src="${profileViews}" alt="${escapeHtml(OWNER)} profile views" /><br /><img src="${statsUrl}" alt="${escapeHtml(OWNER)} GitHub stats" height="165" /> <img src="${streakUrl}" alt="${escapeHtml(OWNER)} GitHub streak" height="165" /><br /><img src="${trophyUrl}" alt="${escapeHtml(OWNER)} GitHub trophies" width="100%" /></div>`,
    `<table><tr>${metricCell("Repositories", repoCount, "22d3ee")}${metricCell("Project Stars", totalStars, "ec4899")}${metricCell("Project Forks", totalForks, "8b5cf6")}${metricCell("Followers", profile.followers, "22c55e")}</tr></table>`,
  ].join("\n");
}

function metricCell(label, value, color) {
  return `<td align="center" width="25%"><img src="https://img.shields.io/badge/${encodeURIComponent(label)}-${encodeURIComponent(value)}-${color}?style=for-the-badge" alt="${escapeHtml(label)}" /></td>`;
}

function renderActivityGraph() {
  const encodedOwner = encodeURIComponent(OWNER);
  return `<h3>Activity Pulse</h3><img src="https://github-readme-activity-graph.vercel.app/graph?username=${encodedOwner}&theme=tokyo-night&hide_border=true&area=true&bg_color=0d1117&color=22d3ee&line=ec4899&point=ffffff" alt="${escapeHtml(OWNER)} activity graph" width="100%" />`;
}

function renderLanguageBadges(languages) {
  if (!languages.length) return "<h3>Language Matrix</h3><p>No language data yet.</p>";
  const badges = languages.slice(0, 10).map(({ name, count }, index) => {
    const palette = ["22d3ee", "8b5cf6", "ec4899", "22c55e", "f59e0b"];
    const color = palette[index % palette.length];
    return `<img src="https://img.shields.io/badge/${encodeURIComponent(name)}-${count}%20repos-${color}?style=for-the-badge" alt="${escapeHtml(name)}" />`;
  }).join(" ");
  return `<h3>Language Matrix</h3><p align="center">${badges}</p>`;
}

function renderRepoGrid(repos) {
  if (!repos.length) return "<p>No repositories to display yet.</p>";
  const cards = repos.map(renderRepoCard);
  const rows = [];
  for (let index = 0; index < cards.length; index += 2) {
    rows.push(`<tr>${cards.slice(index, index + 2).join("")}</tr>`);
  }
  return `<table>${rows.join("")}</table>`;
}

function renderRepoCard(repo) {
  const encodedOwner = encodeURIComponent(OWNER);
  const encodedRepo = encodeURIComponent(repo.name);
  const description = escapeHtml(repo.description || "No description yet.");
  const cardUrl = `https://github-readme-stats.vercel.app/api/pin/?username=${encodedOwner}&repo=${encodedRepo}&theme=tokyonight&hide_border=true&bg_color=0d1117&title_color=22d3ee&text_color=c9d1d9&icon_color=ec4899`;
  return `<td width="50%" valign="top"><a href="${repo.html_url}"><img src="${cardUrl}" alt="${escapeHtml(repo.name)}" width="100%" /></a><br /><sub>${description}</sub><br /><sub>Stars ${repo.stargazers_count} · Forks ${repo.forks_count} · ${repo.language || "Code"}</sub></td>`;
}

function renderRecentSignals(repos) {
  if (!repos.length) return "<p>No recent updates yet.</p>";
  return `<p align="center">${repos.map((repo) => {
    const pushedAt = new Date(repo.pushed_at).toISOString().slice(0, 10);
    const label = `${repo.name} · ${repo.language || "Code"} · ${pushedAt}`;
    return `<a href="${repo.html_url}"><img src="https://img.shields.io/badge/${encodeURIComponent(label)}-0d1117?style=for-the-badge&logo=github&logoColor=white&labelColor=161b22" alt="${escapeHtml(repo.name)}" /></a>`;
  }).join(" ")}</p>`;
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char]);
}
