import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma } from '../src/lib/prisma.js';

/**
 * Backfill recipe photos from Pexels for rows seeded without one (the curated
 * Indian set and anything AI-generated; MealDB rows already ship a photo).
 *
 * Stores the Pexels CDN URL in Recipe.imageUrl — the app renders remote URLs
 * already, so nothing needs hosting. Pass --save <dir> to also keep JPEG
 * copies on disk. Idempotent: only rows with a null/empty imageUrl are touched.
 *
 *   npm run db:backfill-images -w apps/api
 *   npm run db:backfill-images -w apps/api -- --save ./recipe-photos
 *   npm run db:backfill-images -w apps/api -- --only in- --save ./recipe-photos
 *
 * --only <prefix> limits the run to recipes whose externalId starts with it
 * (in- = the curated Indian set), so the hourly quota isn't spent elsewhere.
 */

const KEY = process.env.PEXELS_API_KEY;
const SEARCH = 'https://api.pexels.com/v1/search';
// Free tier allows 200 requests/hour; one search per recipe stays well inside it.
const THROTTLE_MS = 250;

interface PexelsPhoto {
  id: number;
  photographer: string;
  alt: string;
  src: { large: string; large2x: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Query ladder: most specific first, so a miss still lands on a sane photo. */
function queriesFor(recipe: { name: string; cuisine: string; category: string }): string[] {
  return [
    `${recipe.name} dish`,
    recipe.name,
    `${recipe.cuisine} ${recipe.category} food`,
    `${recipe.category} food`,
  ];
}

async function search(query: string): Promise<PexelsPhoto[]> {
  const url = `${SEARCH}?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: KEY as string } });
  if (res.status === 429) throw new Error('RATE_LIMIT');
  if (!res.ok) return [];
  const body = (await res.json()) as { photos?: PexelsPhoto[] };
  return body.photos ?? [];
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main() {
  if (!KEY) {
    console.error('[images] PEXELS_API_KEY is not set. Add it to .env and re-run.');
    process.exit(1);
  }

  const saveFlag = process.argv.indexOf('--save');
  const saveDir = saveFlag !== -1 ? process.argv[saveFlag + 1] : null;
  if (saveDir) await mkdir(saveDir, { recursive: true });

  const onlyFlag = process.argv.indexOf('--only');
  const only = onlyFlag !== -1 ? process.argv[onlyFlag + 1] : null;

  const missing = await prisma.recipe.findMany({
    where: {
      OR: [{ imageUrl: null }, { imageUrl: '' }],
      ...(only ? { externalId: { startsWith: only } } : {}),
    },
    select: { id: true, name: true, cuisine: true, category: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`[images] ${missing.length} recipes missing a photo`);

  // Reusing one photo across recipes makes the grid look broken, so each
  // picked photo id is retired — including those earlier runs already gave
  // to other recipes.
  const taken = await prisma.recipe.findMany({
    where: { imageUrl: { contains: 'pexels.com/photos/' } },
    select: { imageUrl: true },
  });
  const used = new Set<number>(
    taken.map((r) => Number(r.imageUrl!.match(/photos\/(\d+)\//)?.[1])).filter(Boolean),
  );
  let filled = 0;
  const failed: string[] = [];

  for (const recipe of missing) {
    let picked: PexelsPhoto | undefined;
    try {
      for (const query of queriesFor(recipe)) {
        const photos = await search(query);
        picked = photos.find((p) => !used.has(p.id));
        if (picked) break;
        await sleep(THROTTLE_MS);
      }
    } catch (err) {
      if ((err as Error).message === 'RATE_LIMIT') {
        console.error(`[images] hit the Pexels hourly limit after ${filled} photos — stopping.`);
        break;
      }
      failed.push(`${recipe.name} (${(err as Error).message})`);
      continue;
    }

    if (!picked) {
      failed.push(recipe.name);
      continue;
    }

    used.add(picked.id);
    await prisma.recipe.update({ where: { id: recipe.id }, data: { imageUrl: picked.src.large } });
    filled++;
    console.log(`[images] ${recipe.name} <- ${picked.photographer} (#${picked.id})`);

    if (saveDir) {
      const res = await fetch(picked.src.large2x);
      if (res.ok) {
        const bytes = Buffer.from(await res.arrayBuffer());
        await writeFile(join(saveDir, `${slug(recipe.name)}.jpg`), bytes);
      }
    }
    await sleep(THROTTLE_MS);
  }

  console.log(`[images] filled ${filled}/${missing.length}`);
  if (failed.length) console.log(`[images] no match for: ${failed.join(', ')}`);
  console.log('[images] photos courtesy of Pexels - free to use, credit appreciated.');
  await prisma.$disconnect();
}

main();
