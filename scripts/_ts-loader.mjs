// Loader עזר להרצת בדיקות המנוע עם Node native type-stripping,
// שמאפשר ייבוא ללא סיומת (extensionless) כמו ב-Next.js.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/i.test(specifier)) {
    const parentPath = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : process.cwd();
    for (const cand of [specifier + '.ts', specifier + '.tsx', specifier + '/index.ts']) {
      const abs = pathResolve(parentPath, cand);
      if (existsSync(abs)) return next(pathToFileURL(abs).href, context);
    }
  }
  return next(specifier, context);
}
