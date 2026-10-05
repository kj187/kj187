import { writeFileSync } from 'node:fs';

const login = process.env.STATS_USER || 'kj187';
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN is required');

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data;
}

async function totalStars() {
  let stars = 0;
  let after = null;
  do {
    const { user } = await gql(
      `query($login:String!,$after:String){user(login:$login){repositories(ownerAffiliations:OWNER,isFork:false,first:100,after:$after){nodes{stargazerCount}pageInfo{hasNextPage endCursor}}}}`,
      { login, after },
    );
    const repos = user.repositories;
    stars += repos.nodes.reduce((sum, r) => sum + r.stargazerCount, 0);
    after = repos.pageInfo.hasNextPage ? repos.pageInfo.endCursor : null;
  } while (after);
  return stars;
}

async function totalCommits() {
  const { user } = await gql(`query($login:String!){user(login:$login){createdAt}}`, { login });
  const first = new Date(user.createdAt).getUTCFullYear();
  const last = new Date().getUTCFullYear();
  const years = [];
  for (let y = first; y <= last; y++) years.push(y);
  const fields = years
    .map((y) => `y${y}:contributionsCollection(from:"${y}-01-01T00:00:00Z",to:"${y}-12-31T23:59:59Z"){totalCommitContributions restrictedContributionsCount}`)
    .join('\n');
  const data = await gql(`query($login:String!){user(login:$login){${fields}}}`, { login });
  return years.reduce((sum, y) => {
    const c = data.user[`y${y}`];
    return sum + c.totalCommitContributions + c.restrictedContributionsCount;
  }, 0);
}

const fmt = (n) => n.toLocaleString('en-US');

function svg(stars, commits) {
  const col = (x, label, value, sub, icon) => `
<g transform="translate(${x} 0)">
  ${icon}
  <text x="76" y="76" font-family="Menlo, Courier New, monospace" font-size="16" letter-spacing="3" fill="#4c9dff">${label}</text>
  <text x="76" y="140" font-size="64" font-weight="700" letter-spacing="-1.5" fill="#ffffff">${value}</text>
  <text x="76" y="170" font-size="20" fill="#a7afc0">${sub}</text>
</g>`;
  const starIcon = `<polygon points="28,52 34.2,66.5 50,67.9 38,78.4 41.6,93.8 28,85.6 14.4,93.8 18,78.4 6,67.9 21.8,66.5" transform="translate(0 22)" fill="none" stroke="#4c9dff" stroke-width="3" stroke-linejoin="round"/>`;
  const commitIcon = `<g transform="translate(0 22)" fill="none" stroke="#4c9dff" stroke-width="3" stroke-linecap="round"><circle cx="28" cy="72" r="13"/><line x1="0" y1="72" x2="15" y2="72"/><line x1="41" y1="72" x2="56" y2="72"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="240" viewBox="0 0 1280 240">
<defs>
<radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1280 0) scale(700 300)"><stop offset="0" stop-color="#4c9dff" stop-opacity=".22"/><stop offset="1" stop-color="#4c9dff" stop-opacity="0"/></radialGradient>
<pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#fff" stroke-opacity=".04"/></pattern>
</defs>
<rect width="1280" height="240" fill="#0d121d"/>
<rect width="1280" height="240" fill="url(#grid)"/>
<rect width="1280" height="240" fill="url(#glow)"/>
<g font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
${col(140, 'TOTAL STARS', fmt(stars), 'across my public repositories', starIcon)}
<line x1="640" y1="48" x2="640" y2="192" stroke="#fff" stroke-opacity=".12"/>
${col(740, 'TOTAL COMMITS', fmt(commits), 'since I joined GitHub', commitIcon)}
</g>
<rect x="0" y="236" width="1280" height="4" fill="#4c9dff"/>
</svg>
`;
}

const [stars, commits] = await Promise.all([totalStars(), totalCommits()]);
writeFileSync('assets/stats.svg', svg(stars, commits));
console.log(`stars=${stars} commits=${commits}`);
