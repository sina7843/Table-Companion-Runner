---
paths:
  - "**/Dockerfile*"
  - "**/docker-compose*.yml"
  - "**/docker-compose*.yaml"
  - "**/compose.yml"
  - "**/compose.yaml"
  - "**/.dockerignore"
---
# Docker rules
- Apply these rules only when the repository uses Docker or the user requests it.
- Prefer reproducible images, a non-root runtime user, and multi-stage production builds where useful.
- Bind application servers appropriately for container use and use service DNS for cross-container traffic.
- Keep development and production behavior explicit; do not ship development-only mounts or dependencies in production images.
- Never use privileged containers, Docker-socket mounts, host PID/IPC/network namespaces, or unrestricted capabilities.
- Destructive cleanup such as `docker compose down -v` or prune commands requires explicit user authorization.
- Do not impose fixed service names, databases, ports, or Compose layouts on an existing project.
