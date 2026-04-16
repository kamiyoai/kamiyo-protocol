import type { Config } from './config';

type Commit = { sha: string; subject: string; body: string };

export async function recentMerges(cfg: Config, limit = 10): Promise<Commit[]> {
  const [owner, repo] = cfg.GITHUB_REPO.split('/');
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${limit}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${cfg.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );
  if (!res.ok) {
    throw new Error(`github commits fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as Array<{
    sha: string;
    commit: { message: string };
  }>;
  return data.map(c => {
    const [subject, ...rest] = c.commit.message.split('\n');
    return { sha: c.sha.slice(0, 7), subject, body: rest.join('\n').trim() };
  });
}
