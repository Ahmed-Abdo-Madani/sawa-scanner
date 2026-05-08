<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

### Database Setup (Required)

Before starting the server, you **must** run all pending database migrations. The application performs a schema compatibility check on startup and will fail to start if required migrations have not been applied.

```bash
# Run pending migrations
$ npm run migration:run

# Verify migrations were applied successfully
$ npm run migration:show
```

The application expects the following columns to exist in the `product` table:
- `brand_normalized`
- `name_normalized`
- `gtin_prefix`

If the schema compatibility check fails, you will see an error like:
```
[FATAL] Schema compatibility check FAILED. Migration 1717000000000-AddProductNormalizedColumns has not been applied. Missing columns: brand_normalized, name_normalized, gtin_prefix. Please run migrations before starting the server: npm run migration:run
```

After pulling new changes, always run `npm run migration:run` to apply pending database migrations.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## GTIN Backfill & OpenFoodFacts Integration

### Setup

The GTIN backfill process enriches product data by matching local scan products against OpenFoodFacts (OFF) records. Two sources are supported:

1. **Local JSONL Dump** (Recommended) — Download the nightly OFF bulk dump and stream it locally
2. **Live API** (Fallback) — Query the live OFF API (rate-limited, may be blocked for anonymous bots)

#### Using the Local Dump (Recommended)

1. Download the JSONL gzip dump from:
   ```
   https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz
   ```
   (~1 GB compressed, ~10 GB raw)

2. Place it in your configured location (default: `./uploads/openfoodfacts-products.jsonl.gz`)

3. Set the path in your `.env`:
   ```
   OFF_DUMP_PATH=./uploads/openfoodfacts-products.jsonl.gz
   ```

4. Trigger a backfill job with `useDump: true`:
   ```bash
   curl -X POST http://localhost:3000/api/ingestion/enqueue \
     -H "Content-Type: application/json" \
     -d '{
       "name": "gtin-backfill-off",
       "data": {
         "mode": "gtin-backfill-off",
         "useDump": true,
         "maxProducts": 100000
       }
     }'
   ```

#### Using the Live API (Fallback)

If `OFF_DUMP_PATH` is not set or the file is missing, the backfill falls back to the live API:
```bash
curl -X POST http://localhost:3000/api/ingestion/enqueue \
  -H "Content-Type: application/json" \
  -d '{
    "name": "gtin-backfill-off",
    "data": {
      "mode": "gtin-backfill-off",
      "useDump": false,
      "maxProducts": 100000
    }
  }'
```

### How It Works

- **Country Filter** — Matches products tagged with `countries_tags: ["en:saudi-arabia", ...]`
- **Brand Filter** — Matches products from the configured brand whitelist (see `OFF_BACKFILL_BRANDS` in `.env`)
- **Single Pass** — When using the dump, both filters are applied in one stream pass over the file
- **Matching Logic** — Fuzzy matches SCAN products to OFF records by brand + product name + weight
- **Enrichment** — Overlays missing fields (description, nutrition, ingredients, allergens, images)

### Configuration

| Env Var | Default | Purpose |
|---------|---------|---------|
| `OFF_DUMP_PATH` | `./uploads/openfoodfacts-products.jsonl.gz` | Path to local JSONL gzip dump |
| `OFF_BACKFILL_USER_AGENT` | `SawaScanner/1.0` | User-Agent header for OFF API requests |
| `OFF_BACKFILL_BRANDS` | Global brand whitelist | Comma-separated brands to seed from OFF |

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
