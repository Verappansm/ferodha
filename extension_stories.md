Extension Stories:

Work identified after the sprint stories in storeis.txt, written in the same
format, for the record. These are not assessed sprint deliverables - they're
follow-on improvements the team decided were worth tracking properly.

Team 2 - Pre-Commit Hooks on the Repository


Description

Acceptance Criteria:

 * A `pre-commit` config exists at the repo root and every hook in it runs
   locally on `git commit`, not only in CI.
 * Committing a file containing something that looks like a credential
   (an API key, a JWT secret, a `.env` file itself) is blocked before the
   commit is created, not caught after the fact in review.
 * Every `.sh` script in the repository passes `shellcheck` with no
   unaddressed warnings, enforced on commit.
 * Basic hygiene - trailing whitespace, missing final newline, an
   accidentally committed merge-conflict marker, a YAML file that doesn't
   parse - is caught before the commit lands, not discovered later by a
   teammate pulling it.

Tasks:

 Install the `pre-commit` framework (https://pre-commit.com) and commit a
 `.pre-commit-config.yaml` at the repo root, since it already covers every
 language in this repo (Java, Python, shell, YAML) with one tool rather than
 three.

 Add the standard `pre-commit-hooks` set: `trailing-whitespace`,
 `end-of-file-fixer`, `check-merge-conflict`, `check-added-large-files`,
 `check-yaml`.

 Add `detect-secrets` (or `gitleaks`) as a secret-scanning hook. This repo
 already states repeatedly, in `JwtService`, `.env.example`, and every
 sprint README, that `JWT_SECRET` and `FAUXNANCE_API_KEY` are read from the
 environment and must never appear in a committed file - a pre-commit hook
 is what actually enforces that instead of relying on everyone remembering.

 Add `shellcheck` against `database/apply.sh`, `database/scripts/check.sh`,
 `kafka_pipeline/create_topics.sh`, `kafka_pipeline/create_dlt_topics.sh`,
 and `SB_AND_KAFKA_DEMO.sh`.

 Document how to install it (`pip install pre-commit && pre-commit install`)
 in RUN.md so a fresh clone picks it up on the first commit, not silently
 never.

 Notes:

 * Keep it fast. A hook slow enough that people start passing `--no-verify`
   is worse than no hook, because now nobody trusts the ones that are left.
 * A Java-side hook (Spotless/Checkstyle run before commit) was considered
   and deliberately left out of this story's scope - `mvn` invocations are
   slow enough on a cold JVM that they belong in CI or a pre-push hook, not
   pre-commit. Worth its own story if the team wants it.
