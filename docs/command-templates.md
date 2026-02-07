# Command Templates

Command templates are the foundation of Seksbot's secure execution model.

---

## Why Templates?

Traditional shell execution is dangerous:

```bash
# User input goes directly into shell
curl -H "Authorization: Bearer $TOKEN" "$USER_PROVIDED_URL"
```

If `USER_PROVIDED_URL` contains `; rm -rf /`, you have a problem.

Templates separate **structure** from **data**:

```typescript
// Template defines structure
template: "http_get"
pattern: "curl -s {url}"
params:
  url: { type: "url", validate: true }
  
// Agent provides data
{ template: "http_get", params: { url: "https://api.example.com" } }
```

The broker validates the URL, substitutes it safely, and executes.

---

## Built-in Templates

### Git Operations

| Template | Pattern | Parameters |
|----------|---------|------------|
| `git_clone` | `git clone {url} {dest}` | url (github/gitlab), dest (path) |
| `git_pull` | `git pull {remote} {branch}` | remote, branch |
| `git_push` | `git push {remote} {branch}` | remote, branch |
| `git_status` | `git status` | — |
| `git_log` | `git log --oneline -n {count}` | count (1-100) |

### File Operations

| Template | Pattern | Parameters |
|----------|---------|------------|
| `file_read` | `cat {path}` | path (validated) |
| `file_write` | `echo {content} > {path}` | content, path |
| `file_list` | `ls -la {dir}` | dir (no traversal) |
| `file_find` | `find {dir} -name {pattern}` | dir, pattern |

### NPM/Node

| Template | Pattern | Parameters |
|----------|---------|------------|
| `npm_install` | `npm install` | — |
| `npm_run` | `npm run {script}` | script (from package.json) |
| `npm_test` | `npm test` | — |

### HTTP (via broker)

| Template | Pattern | Parameters |
|----------|---------|------------|
| `http_get` | Broker handles | url, headers (optional) |
| `http_post` | Broker handles | url, body, headers |
| `http_auth` | Broker handles | url, auth_secret |

---

## Defining Custom Templates

Add to your Seksbot config:

```yaml
exec:
  templates:
    - name: my_api_call
      pattern: "curl -s -X {method} {url}"
      params:
        method:
          type: string
          allowlist: ["GET", "POST", "PUT", "DELETE"]
        url:
          type: url
          allowlist: ["api.myservice.com"]
      classification: sensitive
      
    - name: docker_logs
      pattern: "docker logs {container} --tail {lines}"
      params:
        container:
          type: string
          pattern: "^[a-z0-9_-]+$"
          maxLength: 64
        lines:
          type: number
          min: 1
          max: 1000
      classification: safe
```

---

## Parameter Types

### `string`
Basic string with optional constraints:

```yaml
param:
  type: string
  pattern: "^[a-zA-Z0-9_-]+$"  # Regex validation
  maxLength: 128
  allowlist: ["option1", "option2"]  # Explicit allowed values
```

### `url`
URL with domain allowlisting:

```yaml
param:
  type: url
  allowlist: ["github.com", "api.example.com"]
  protocols: ["https"]  # Default: https only
```

### `path`
File path with traversal protection:

```yaml
param:
  type: path
  basedir: "/home/user/projects"  # Must be under this
  allowTraversal: false  # Block ../
```

### `number`
Numeric with range:

```yaml
param:
  type: number
  min: 1
  max: 100
```

---

## Template Classification

| Level | Meaning | Approval |
|-------|---------|----------|
| `safe` | Read-only, no secrets | Auto-approved |
| `sensitive` | Uses credentials or network | Requires config allowlist |
| `dangerous` | System modification | Blocked unless explicit override |

---

## Using Templates from Agents

Agents invoke templates via the exec tool:

```json
{
  "tool": "exec",
  "template": "git_clone",
  "params": {
    "url": "https://github.com/user/repo.git",
    "dest": "./my-repo"
  }
}
```

The broker:
1. Validates template exists
2. Validates all parameters against schema
3. Substitutes parameters safely (no shell interpolation)
4. Executes the command
5. Scrubs output for credential leaks
6. Returns sanitized result

---

## Escape Hatch: Raw Commands

For migration or edge cases, you can allowlist specific raw commands:

```yaml
exec:
  mode: moderate  # Not strict
  raw_allowlist:
    - pattern: "^docker ps"
    - pattern: "^kubectl get pods"
```

⚠️ **Use sparingly** — raw commands bypass template safety.

---

## Next Steps

- [Security Model](./security-model.md)
- [Credential Broker Setup](./credential-broker.md)
- [Migration from OpenClaw](./migration.md)
