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

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```
## run azure blob-local
```bash
$ docker run -p 10000:10000 mcr.microsoft.com/azure-storage/azurite
```
## run postgre local
```bash
$ docker compose up -d
```

## NSW Property Sales ingestion (KAN-241)

Weekly ingestion pipeline for the NSW Valuer General's bulk Property Sales
Information feed — `src/api/property-sales/`. One linear sweep per cron
tick: read `property_sales_raw` for the latest data already held → discover
every advertised weekly `.zip` (Puppeteer, headless + stealth) → download
whatever is newer, oldest-first → unzip the `.dat` entries → parse them
(record-type filtering plus an optional content-exclusion filter). Downloaded
archives live in an OS temp directory for the lifetime of one sweep and are
removed when it finishes, whether it succeeded or not — there is no ledger
table, no queue, and no persistent archive storage.

**Stops before any database write.** Nothing here inserts into
`property_sales_raw` — a later ticket (KAN-242) does that, plus a migration
fixing that table's `dealing_number` unique constraint (it silently drops
~2.3% of every week's sales; see the migration note in KAN-242). Until
KAN-242 lands, nothing advances the watermark this pipeline reads, so a
sweep re-downloads and re-parses the same archives every run — harmless
while the feature is disabled by default, but worth knowing if you enable it
for a soak test.

**Disabled by default everywhere.** Set `PSI_DOWNLOAD_ENABLED=true` to turn
it on — no other configuration is required. See
`src/api/property-sales/property-sales.config.ts` for the full list of
`PSI_*` env vars and their defaults (cron schedule, timeouts, size limits,
zip-bomb ceilings). `PSI_CRON_SCHEDULE` accepts any cron expression — use a
short interval like `*/10 * * * *` for local testing, then move to the
weekly default (`0 3 * * 1`).

The content-level exclusion filter (`PSI_EXCLUDE_SALE_CODES` /
`PSI_EXCLUDE_ZONINGS`, both comma-separated and empty by default) is a
seam, not a business rule: a full scan of the current real weekly archive
and all historical comparable-sales-data CSVs found no `sale_code` field
ever equal to `"B"`, so "exclude rows with value B" as literally described
does not match this field. Confirm the intended rule before setting either
var — doing so is then an env-var change, not a code change.

No admin REST surface and no BullMQ queue — this is a single cron-triggered
sweep per environment, and the service's own in-process flag is what stops
two ticks overlapping.

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

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
