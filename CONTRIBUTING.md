# Contributing

Thanks for taking a look. This is a portfolio prototype, so small, focused changes are easiest to review.

1. Fork and clone, then `npm ci`.
2. Run `npm test` before and after your change.
3. Changing data? Edit `data/generate_data.py`, then run `npm run generate:data && npm run build:fixtures` and commit the regenerated files. CI fails if they drift.
4. Changing SQL? Run `npm run build:fixtures` so offline mode matches, and `npm test`.
5. Keep every claim evidence-backed: new facts need an `evidence_id`.
6. Keep all data fictional and use the `.example` domain for emails and sites.
7. Open a pull request describing what changed and why.
