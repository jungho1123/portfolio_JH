import { db } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
export type ContributionDay = { date: string; count: number };
export type GithubActivity = {
  days: ContributionDay[];
  fetchedAt: string | null;
  unavailable: boolean;
};
const refreshMs = 6 * 60 * 60_000;
type Node = {
  occurredAt: string;
  repository?: { isPrivate: boolean };
  issue?: { repository: { isPrivate: boolean } };
  pullRequest?: { repository: { isPrivate: boolean } };
  pullRequestReview?: { pullRequest: { repository: { isPrivate: boolean } } };
};
type Connection = {
  nodes: Node[];
  pageInfo: { hasNextPage: boolean; endCursor: string };
};
type Collection = {
  totalRepositoriesWithContributedCommits: number;
  commitContributionsByRepository: {
    repository: { isPrivate: boolean };
    contributions: {
      nodes: { occurredAt: string; commitCount: number }[];
      pageInfo: { hasNextPage: boolean };
    };
  }[];
} & Record<
  | "issueContributions"
  | "pullRequestContributions"
  | "pullRequestReviewContributions"
  | "repositoryContributions",
  Connection
>;
const fields = [
  "issueContributions",
  "pullRequestContributions",
  "pullRequestReviewContributions",
  "repositoryContributions",
] as const;
const selections = {
  issueContributions: "issue { repository { isPrivate } }",
  pullRequestContributions: "pullRequest { repository { isPrivate } }",
  pullRequestReviewContributions:
    "pullRequestReview { pullRequest { repository { isPrivate } } }",
  repositoryContributions: "repository { isPrivate }",
};
async function graphql(query: string, variables: Record<string, unknown>) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("GitHub unavailable");
  const result = await response.json();
  if (result.errors?.length || !result.data?.user)
    throw new Error("GitHub query failed");
  return result.data.user.contributionsCollection as Collection;
}
export async function refreshGithub(username: string): Promise<void> {
  if (!process.env.GITHUB_TOKEN) return;
  const cached = await db.githubCache.findUnique({ where: { username } });
  if (cached && Date.now() - cached.checkedAt.getTime() < refreshMs) return;
  if (cached) {
    const claim = await db.githubCache.updateMany({
      where: { username, checkedAt: cached.checkedAt },
      data: { checkedAt: new Date() },
    });
    if (!claim.count) return;
  }
  if (!cached) {
    try {
      await db.githubCache.create({
        data: {
          username,
          data: [],
          fetchedAt: new Date(0),
          checkedAt: new Date(),
        },
      });
    } catch {
      return;
    }
  }
  try {
    const koreaDate = (date: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
    const today = new Date(`${koreaDate(new Date())}T23:59:59.999+09:00`);
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 364);
    start.setTime(start.getTime() - 86_399_999);
    const counts = new Map<string, number>();
    for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1))
      counts.set(koreaDate(d), 0);
    const add = (date: string, count = 1) => {
      const key = koreaDate(new Date(date));
      if (counts.has(key)) counts.set(key, counts.get(key)! + count);
    };
    // Monthly ranges bound daily commit connections. Inspect individual repository visibility;
    // contributionCalendar is intentionally not used because it can include restricted counts.
    for (let from = new Date(start); from <= today;) {
      const to = new Date(
        Date.UTC(
          from.getUTCFullYear(),
          from.getUTCMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        ),
      );
      if (to > today) to.setTime(today.getTime());
      const connections = fields
        .map(
          (f) =>
            `${f}(first:100) { nodes { occurredAt ${selections[f]} } pageInfo { hasNextPage endCursor } }`,
        )
        .join("\n");
      const query = `query($login:String!,$from:DateTime!,$to:DateTime!) { user(login:$login) { contributionsCollection(from:$from,to:$to) { totalRepositoriesWithContributedCommits commitContributionsByRepository(maxRepositories:100) { repository { isPrivate } contributions(first:100) { nodes { occurredAt commitCount } pageInfo { hasNextPage } } } ${connections} } } }`;
      const variables = {
        login: username,
        from: from.toISOString(),
        to: to.toISOString(),
      };
      const collection = await graphql(query, variables);
      if (collection.totalRepositoriesWithContributedCommits > 100)
        throw new Error("GitHub repository range exceeded");
      for (const repo of collection.commitContributionsByRepository) {
        if (repo.contributions.pageInfo.hasNextPage)
          throw new Error("GitHub commit range exceeded");
        if (!repo.repository.isPrivate)
          for (const n of repo.contributions.nodes)
            add(n.occurredAt, n.commitCount);
      }
      for (const field of fields) {
        let connection = collection[field];
        let pages = 0;
        while (true) {
          for (const node of connection.nodes) {
            const repo =
              node.repository ??
              node.issue?.repository ??
              node.pullRequest?.repository ??
              node.pullRequestReview?.pullRequest.repository;
            if (repo && !repo.isPrivate) add(node.occurredAt);
          }
          if (!connection.pageInfo.hasNextPage) break;
          if (++pages > 100) throw new Error("GitHub range exceeded");
          const query = `query($login:String!,$from:DateTime!,$to:DateTime!,$after:String) { user(login:$login) { contributionsCollection(from:$from,to:$to) { ${field}(first:100,after:$after) { nodes { occurredAt ${selections[field]} } pageInfo { hasNextPage endCursor } } } } }`;
          connection = (
            await graphql(query, {
              ...variables,
              after: connection.pageInfo.endCursor,
            })
          )[field];
        }
      }
      from = new Date(to.getTime() + 1);
    }
    const days = [...counts].map(([date, count]) => ({ date, count }));
    await db.githubCache.upsert({
      where: { username },
      create: {
        username,
        data: days as Prisma.InputJsonValue,
        fetchedAt: new Date(),
        checkedAt: new Date(),
      },
      update: {
        data: days as Prisma.InputJsonValue,
        fetchedAt: new Date(),
        checkedAt: new Date(),
      },
    });
  } catch {
    // Back off even on the first failed request. fetchedAt=epoch means no successful snapshot.
    await db.githubCache
      .upsert({
        where: { username },
        create: {
          username,
          data: [],
          fetchedAt: new Date(0),
          checkedAt: new Date(),
        },
        update: { checkedAt: new Date() },
      })
      .catch(() => {});
  }
}
export async function githubActivity(
  username: string,
): Promise<GithubActivity> {
  const cache = await db.githubCache.findUnique({ where: { username } });
  return {
    days: (cache?.data as ContributionDay[]) ?? [],
    fetchedAt:
      cache && cache.fetchedAt.getTime() > 0
        ? cache.fetchedAt.toISOString()
        : null,
    unavailable:
      !cache || Date.now() - cache.fetchedAt.getTime() > refreshMs * 2,
  };
}
