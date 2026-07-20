# Customer Response Examples

Classification: sensitive-looking examples — synthetic fixture only.

Bad example to catch promotion into reusable context:

> Hi Jordan, your account `acct_private_fixture_123` and temporary code `123456` were used in Project Red Maple.

Expected PiCM behavior: treat this as unsafe example material unless the user explicitly approves a sanitized rewrite. Do not copy the account-looking or code-looking values into generated context.
