# Workers tests and port exhaustion

The API integration tests run in the Cloudflare Workers Vitest pool (see [testing.md](testing.md)). The pool loads modules into its `workerd` runtimes over local connections, so one full run of `pnpm --filter @wordinator/api test` opens roughly 15,000 sockets. Each one stays in `TIME_WAIT` for a while after it closes, and macOS has only about 16,000 ephemeral ports.

## Symptoms

When the ports run out, the run fails for reasons unrelated to the code under test:

- "Workers runtime failed to start" or "Fallback service failed to fetch module … Connection refused";
- `connect EADDRNOTAVAIL 127.0.0.1:<port>`;
- "No such module" (for example `…devalue`);
- many files failing at collection with 0 tests.

Interrupted runs can also leave orphaned `workerd` processes (parent PID 1).

Observed on 2026-10-16, when several agents ran the suite in parallel; every failure disappeared once the ports drained. Since 2026-10-20 a single full `vitest run` fails at runtime startup even from a drained start, on a clean `HEAD` too, while the same files pass in batches.

## Running the suite

- Run at most one API suite at a time. Parallel agents should run only targeted test files.
- Before a run, wait for the ports to drain:

  ```bash
  until [ "$(netstat -an | grep -c TIME_WAIT)" -lt 300 ]; do sleep 5; done
  ```

- Never retry a failed run immediately; drain first.
- Run the D1 files in batches of about six, draining before each batch, then the R2 configuration on its own:

  ```bash
  cd apps/api
  files=($(ls test/*.test.ts | grep -v -e phase-five-media -e course-media -e course-speech -e tutor-speech))
  for ((i = 0; i < ${#files[@]}; i += 6)); do
    until [ "$(netstat -an | grep -c TIME_WAIT)" -lt 300 ]; do sleep 5; done
    npx vitest run "${files[@]:i:6}" || echo "batch failed: ${files[*]:i:6}"
  done
  until [ "$(netstat -an | grep -c TIME_WAIT)" -lt 300 ]; do sleep 5; done
  npx vitest run --config vitest.r2.config.ts
  ```

  Run it with `bash`: zsh does not split the array the same way. The excluded files are the R2 suites listed in `vitest.r2.config.ts`.

- Kill orphaned runtimes, leaving your own `wrangler dev` alone:

  ```bash
  ps -eo pid,ppid,command | awk '$2==1 && /workerd/ {print $1}' | xargs kill
  ```

A batch that fails with one of the symptoms above says nothing about the code; drain and run it again. A batch that fails with an assertion or a timeout is a real failure.
