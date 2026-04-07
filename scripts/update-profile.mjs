import { readFile, writeFile } from "node:fs/promises";

const OWNER = process.env.PROFILE_USERNAME || process.env.GITHUB_REPOSITORY_OWNER;
const TOKEN = process.env.GITHUB_TOKEN;
const MAX_REPOS = Number(process.env.MAX_REPOS || 6);
const README_PATH = new URL("../README.md", import.meta.url);
const START = "<!-- PROFILE_SYNC_START -->";
const END = "<!-- PROFILE_SYNC_END -->";

if (!OWNER) {
  throw new Error("Missing PROFILE_USERNAME or GITHUB_REPOSITORY_OWNER.");
}

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (TOKEN) {
  headers.Authorization = `Bearer ${TOKEN}`;
}

const [profile, repos] = await Promise.all([
  github(`/users/${OWNER}`),
  github(`/users/${OWNER}/repos?sort=updated&per_page=100`),
]);

const source = await readFile(README_PATH, "utf8");
const next = replaceBetweenMarkers(source, renderProfileSection(profile, repos));
await writeFile(README_PATH, next);

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function renderProfileSection(profile, repos) {
  const ownRepos = repos.filter((repo) => !repo.fork && !repo.archived);
  const featuredRepos = [...ownRepos]
    .sort((a, b) => {
      const scoreA = a.stargazers_count * 10 + a.forks_count * 3 + freshnessScore(a.pushed_at);
      const scoreB = b.stargazers_count * 10 + b.forks_count * 3 + freshnessScore(b.pushed_at);
      return scoreB - scoreA;
    })
    .slice(0, MAX_REPOS);

  const recentlyUpdated = [...ownRepos]
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, 5);

  const languages = aggregateLanguages(ownRepos);
  const totalStars = ownRepos.reduce((total, repo) => total + repo.stargazers_count, 0);
  const totalForks = ownRepos.reduce((total, repo) => total + repo.forks_count, 0);

  return [
    renderStats(profile, ownRepos.length, totalStars, totalForks),
    renderLanguageBar(languages),
    "### 精选仓库",
    "",
    renderRepoTable(featuredRepos),
    "",
    "### 最近更新",
    "",
    renderRecentList(recentlyUpdated),
    "",
    `<sub>最后自动同步：${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC</sub>`,
  ].join("\n");
}

function renderStats(profile, repoCount, totalStars, totalForks) {
  return [
    "<div align=\"center\">",
    "",
    `| 公开仓库 | 项目 Stars | 项目 Forks | Followers | Following |`,
    `| ---: | ---: | ---: | ---: | ---: |`,
    `| ${repoCount} | ${totalStars} | ${totalForks} | ${profile.followers} | ${profile.following} |`,
    "",
    "</div>",
    "",
  ].join("\n");
}

function renderLanguageBar(languages) {
  if (!languages.length) {
    return "### 语言概览\n\n> 暂无可统计语言数据。\n";
  }

  const badges = languages
    .slice(0, 8)
    .map(({ name, count }) => {
      const label = encodeURIComponent(`${name} ${count}`);
      return `<img src="https://img.shields.io/badge/${label}-0d1117?style=flat-square&labelColor=161b22" alt="${escapeHtml(name)}" />`;
    })
    .join("\n");

  return ["### 语言概览", "", "<p>", badges, "</p>", ""].join("\n");
}

function renderRepoTable(repos) {
  if (!repos.length) {
    return "> 暂无可展示仓库。";
  }

  return repos
    .map((repo) => {
      const description = repo.description || "No description yet.";
      return [
        `<a href="${repo.html_url}">`,
        `  <img align="center" src="https://github-readme-stats.vercel.app/api/pin/?username=${OWNER}&repo=${encodeURIComponent(repo.name)}&theme=tokyonight&hide_border=true&bg_color=0d1117&title_color=22d3ee&text_color=c9d1d9&icon_color=ec4899" alt="${escapeHtml(repo.name)}" />`,
        `</a>`,
        "",
        `<sub>${escapeHtml(description)} · ⭐ ${repo.stargazers_count} · 🍴 ${repo.forks_count} · ${repo.language || "Code"}</sub>`,
        "",
      ].join("\n");
    })
    .join("\n");
}

function renderRecentList(repos) {
  if (!repos.length) {
    return "> 暂无最近更新仓库。";
  }

  return repos
    .map((repo) => {
      const pushedAt = new Date(repo.pushed_at).toISOString().slice(0, 10);
      return `- [${escapeMarkdown(repo.name)}](${repo.html_url}) · ${repo.language || "Code"} · 更新于 ${pushedAt}`;
    })
    .join("\n");
}

function aggregateLanguages(repos) {
  const counts = new Map();
  for (const repo of repos) {
    if (!repo.language) continue;
    counts.set(repo.language, (counts.get(repo.language) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function freshnessScore(value) {
  const days = Math.max(1, (Date.now() - new Date(value).getTime()) / 86_400_000);
  return Math.max(0, 30 - days);
}

function replaceBetweenMarkers(source, content) {
  const startIndex = source.indexOf(START);
  const endIndex = source.indexOf(END);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error("README markers are missing or invalid.");
  }

  return `${source.slice(0, startIndex + START.length)}\n${content}\n${source.slice(endIndex)}`;
}

function escapeMarkdown(value) {
  return String(value).replace(/([\\`*_{}[\]()#+\-.!|])/g, "\\$1");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char];
  });
}
