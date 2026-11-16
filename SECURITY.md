# Security

SalesLore is a portfolio prototype that ships with fictional data only. Please do not load real customer or employee data into it without adding real authentication (SSO) and reviewing the security model in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#security-model).

## Reporting a problem

Open a GitHub issue without sensitive details and ask for a private contact, or use GitHub's private vulnerability reporting on this repository if it is enabled.

## What is already in place

- Secrets live only in `.env`, which is git-ignored. `.env.example` holds placeholders.
- The app's database user is least-privilege and cannot read raw tables.
- The web console binds to 127.0.0.1 by default.
- No code path sends email, messages or calls to customers.
- Personal (non-business) evidence is excluded from every view the app reads.

## Known gaps (by design for a demo)

- Identity in the web console is a demo picker (`X-SalesLore-User` header), not authentication.
- There is no rate limiting on the API.
