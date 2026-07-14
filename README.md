# Edge Docker Sync

Tencent EdgeOne Pages Functions app for triggering a GitHub Actions workflow to sync Docker images to Aliyun Container Registry.

## Features

- Password-protected web UI.
- 30-minute signed login cookie.
- Server-side GitHub repository dispatch.
- Docker pull command generation after dispatch succeeds.
- Single-image sync form with reusable browser history and optional EdgeOne KV backup.
- `/healthy` health check endpoint.

## Project Structure

```text
functions/
  index.js       # Shared EdgeOne Pages Function entry
  login/index.js # /login route entry
  sync/index.js  # /sync route entry
  history/index.js # /history route entry
  healthy/index.js # /healthy route entry
.edgeone/
  meta.json      # EdgeOne project route metadata
  project.json   # EdgeOne project metadata
```

This project is implemented as an EdgeOne function instead of a static `index.html` because it needs server-side secrets and authentication. The GitHub token must stay on the server and must not be shipped to browser JavaScript.

## Required Environment Variables

Configure these variables in Tencent EdgeOne:

| Name | Required | Description |
| --- | --- | --- |
| `PASSWORD` | Yes | Login password for the web UI. |
| `GITHUB_TOKEN` | Yes | GitHub token used to call repository dispatch. |
| `REPO_OWNER` | Yes | GitHub repository owner. |
| `REPO_NAME` | Yes | GitHub repository name. |
| `SESSION_SECRET` | No | Secret used to sign login cookies. If omitted, `PASSWORD` is used. |
| `ALIYUN_REGISTRY` | No | Default registry, for example `registry.cn-shanghai.aliyuncs.com`. |
| `ALIYUN_NAME_SPACE` | No | Default Aliyun namespace. |
| `SYNC_HISTORY_KV` | No | EdgeOne KV binding used to store synced image history. Also supports `HISTORY_KV`, `DOCKER_SYNC_KV`, or `SYNC_HISTORY`. |

The local `.env` file is ignored by Git and should not be committed.

## GitHub Token Permissions

The token must be able to call:

```text
POST /repos/{owner}/{repo}/dispatches
```

For a fine-grained GitHub token, grant access to the target repository and allow Actions/workflow dispatch related write access as required by GitHub.

## Routes

| Path | Method | Description |
| --- | --- | --- |
| `/` | `GET` | Main Docker image sync UI. Requires login. |
| `/login` | `GET` | Login page. |
| `/login` | `POST` | Password verification and cookie creation. |
| `/sync` | `POST` | Sends the GitHub repository dispatch request. Requires login. |
| `/history` | `GET` | Returns previously submitted image sync history from KV. Requires login. |
| `/healthy` | `GET` | Health check endpoint. |

## Image History

After `/sync` successfully sends the GitHub dispatch request, the app writes the submitted image mapping to browser `localStorage` immediately and also tries to write it to KV when a KV binding exists. The history dropdown is deduplicated by source image without tag.

When KV is empty, `/history` seeds the store with the built-in historical sync list once, then returns the KV-backed list.

Example:

```text
source: mattermost/mattermost-team-edition:11.8.3
history key: mattermost/mattermost-team-edition
target name: mattermost-team-edition:11.8.3
```

If the same history key is synced again with a newer tag, the latest submitted value replaces the old one.

## Dispatch Payload

The function sends this event to GitHub:

```json
{
  "event_type": "sync_docker",
  "client_payload": {
    "images": [
      {
        "source": "vaultwarden/server:1.26.0",
        "target": "bitwarden:1.26.0",
        "region": "shanghai",
        "namespace": "mirco_service",
        "platform": "linux/amd64"
      }
    ],
    "message": "github action sync"
  }
}
```

Your GitHub Actions workflow should listen for:

```yaml
on:
  repository_dispatch:
    types: [sync_docker]
```

## Deployment Notes

1. Push the repository to GitHub.
2. Connect or deploy the project through Tencent EdgeOne Pages.
3. Configure the required environment variables in EdgeOne.
4. Visit `/login`, sign in, then use `/` to submit image sync jobs.

Recommended EdgeOne Pages build settings:

| Setting | Value |
| --- | --- |
| Framework preset | Other / None |
| Root directory | `/` |
| Install command | Empty |
| Build command | Empty, or `echo "no build"` if required |
| Output directory | `.` |

Do not set the output directory to `.edgeone`. The deployable source includes the root-level `functions/` directory; using `.edgeone` as the output directory can produce an artifact with only metadata files and cause every route to return 404.

## Security Notes

- Do not commit `.env`.
- Use a GitHub token scoped only to the required repository.
- Set `SESSION_SECRET` to a strong random value in production.
- Rotate `GITHUB_TOKEN` if it has ever been exposed in browser code or logs.
