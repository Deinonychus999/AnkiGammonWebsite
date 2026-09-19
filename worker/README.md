# Community decks API

Cloudflare Worker + R2 bucket behind the [Community Decks](https://ankigammon.com/decks/) page. Nothing is published until it is approved.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/catalog` | none | Published decks as `{ "decks": [...] }` |
| GET | `/decks/<id>/deck.apkg` | none | Download a published deck |
| GET | `/decks/<id>/pack.json` | none | Position pack for a published deck (see below) |
| POST | `/submit` | none | Multipart form: `meta` (JSON), `apkg` (file), `pack` (file). Stored under `pending/` |
| GET | `/admin/pending` | bearer | List pending submissions and storage totals |
| GET | `/admin/state` | bearer | Storage totals used by the cost guard |
| POST | `/admin/recount` | bearer | Rebuild the totals from a bucket listing |
| GET | `/admin/pending/<id>/deck.apkg` | bearer | Download a pending deck for review |
| POST | `/admin/approve/<id>` | bearer | Move to `public/`, add to catalog |
| POST | `/admin/reject/<id>` | bearer | Delete the pending submission |
| DELETE | `/admin/decks/<id>` | bearer | Remove a published deck |
| POST | `/admin/edit/<id>` | bearer | JSON `{ title?, description? }`: change a pending or published deck's text |

Admin calls send `Authorization: Bearer <ADMIN_TOKEN>`. The review page at `/decks/review.html` wraps these.

## License

Every published deck is CC BY 4.0. The Worker sets `license` itself and ignores the value a client sends; the field stays in the stored metadata so the policy can change later without a data migration.

## Intended app integration

AnkiGammon does not import `.apkg` files itself. The planned feature is an in-app community deck browser that reads `GET /catalog`, shows the decks, and installs the chosen one into the user's Anki through AnkiConnect. Two ways to do that, both served by this API:

- Download `deck.apkg` into Anki's media folder (`getMediaDirPath`) and call AnkiConnect's `importPackage`. Simplest; cards keep the author's board colors.
- Download `pack.json` and push the positions through AnkiGammon's normal card pipeline, so cards render with the user's own color scheme and settings and stay matched by XGID.

## Position pack

`pack.json` is the deck reduced to what AnkiGammon needs to rebuild cards with the reader's own settings: one entry per position with its XGID, tags, and the `AnalysisData` blob exactly as AnkiGammon wrote it.

```json
{
  "format": "ankigammon-position-pack",
  "version": 1,
  "deck": { "id": "...", "title": "...", "author": "...", "license": "CC-BY-4.0" },
  "positions": [
    { "xgid": "XGID=...", "tags": ["ankigammon", "backgammon", "checker_play", "match_7pt"],
      "analysis": { "version": 1, "decision": { "...": "full Decision as serialized by decision_serialize.py" } } }
  ]
}
```

## Deploy

One-time, in the Cloudflare dashboard:

1. Enable R2: https://dash.cloudflare.com/65b5a3c01259cd0e8c8bf4d5d043191c/r2/overview
2. Open the Workers & Pages page once so the account gets a `workers.dev` subdomain: https://dash.cloudflare.com/65b5a3c01259cd0e8c8bf4d5d043191c/workers-and-pages

The Worker `ankigammon-decks` and the bucket `ankigammon-decks` were first created through the Cloudflare API on 2026-09-19; the Worker is served at `https://ankigammon-decks.frankcool999.workers.dev`, which is the value of `window.ANKIGAMMON_DECKS_API` in `website/public/decks/index.html` and `review.html`.

### Admin token

Set once, in the dashboard, and paste the same value into the review page when moderating:

1. Open https://dash.cloudflare.com/65b5a3c01259cd0e8c8bf4d5d043191c/workers/services/view/ankigammon-decks/production/settings
2. Under **Variables and Secrets** choose **Add**, type **Secret**, name `ADMIN_TOKEN`, value: a long random string (a password manager's generated password is fine).
3. **Deploy**. Admin endpoints answer 401 until this exists.

### Review notifications (optional)

To get a Discord message whenever a deck is submitted: in your Discord server open Server Settings → Integrations → Webhooks → New Webhook, pick the channel, copy the webhook URL, and add it as a second secret named `DISCORD_WEBHOOK_URL` in the same Variables and Secrets screen as the admin token. Without the secret the Worker simply does not notify.

### Rebuild the site on approval (optional)

Deck pages and the prerendered list come from the site build. Without this secret they refresh at the daily run; with it, every approve or remove triggers a build right away. Create a fine-grained GitHub personal access token scoped to the `AnkiGammonWebsite` repository with **Contents: Read and write** (the repository-dispatch endpoint sits under Contents, not Actions; Settings → Developer settings → Fine-grained tokens), and add it as a secret named `GITHUB_DISPATCH_TOKEN` on the Worker.

### Redeploying after code changes

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

`wrangler.jsonc` carries the bindings, so a wrangler deploy keeps the existing bucket binding and the secret.

## Cost guard

Everything runs on the Workers Free plan and inside the R2 free tier (10 GB-month storage, 1M Class A ops, 10M Class B ops). Stay on the Free Workers plan: it has a hard daily request limit and cannot bill.

The Worker is the only writer to the bucket, so it enforces the storage side itself:

- Submissions stop at `STORAGE_BUDGET_BYTES` (5 GB total, half the free tier) and at `MAX_PENDING` (20 decks waiting for review). Both live at the top of `src/index.js`.
- Those checks read `state.json` (a Class B op), so refused requests never spend a Class A op.
- Deck files up to 50 MB, packs up to 20 MB.
- `GET /admin/state` shows the running totals; `POST /admin/recount` rebuilds them from a listing if they ever drift.

The Worker re-checks the pack's shape (format, XGIDs, position arrays) but trusts the browser-side validation for note-type checks; the review step is the real gate.
