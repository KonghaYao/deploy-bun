# deploy-bun

Build JS locally and deploy to your own cloud server with zero downtime.

A lightweight deployment system built with Bun, featuring automatic rollback support and container persistence.

## Features

-   🚀 **Simple Deployment** - Build locally, deploy remotely with a single command
-   🔄 **Zero Downtime** - Seamless application switching without service interruption
-   📦 **Version Control** - Timestamped deployment versions for easy tracking
-   🐳 **Docker Ready** - Pre-built Docker images with volume persistence
-   💾 **Auto Recovery** - Automatically restore last deployment on container restart
-   🔒 **Self-Hosted** - Deploy to your own infrastructure
-   ⚡ **Fast** - Built with Bun for maximum performance

## Architecture

The system consists of two components:

1. **CLI Tool** - Runs on your local machine to build and upload applications
2. **Server** - Runs on your deployment server to receive and manage applications

## Quick Start

### Server Setup (Docker)

```bash
# Using docker-compose (recommended)
docker-compose up -d

# Or using Docker directly
docker run -d \
  --name deploy-bun-server \
  -p 7899:7899 \
  -p 3000:3000 \
  -v deploy-data:/app/deployments \
  --restart unless-stopped \
  ghcr.io/konghayao/deploy-bun:latest
```

The server will:

-   Listen on port **7899** for deployments
-   Serve your application on port **3000** (configurable)
-   Persist deployments and state in `/app/deployments`
-   Auto-recover the last deployment on restart

### Client Setup

Install the CLI tool:

```bash
# Using npm
npm install -g deploy-bun

# Or use directly with npx
npx deploy-bun
```

Create a `deploy.json` configuration file in your project:

```json
{
    "name": "my-app",
    "build": "bun build src/index.ts --outdir dist",
    "deploy": {
        "dist": "./dist",
        "entrypoint": "./index.js",
        "port": 3000,
        "server": "http://your-server-ip:7899"
    }
}
```

Deploy your application:

```bash
npx deploy-bun
# or if installed globally
deploy-bun
```

## Configuration

### deploy.json

| Field               | Description                               | Required |
| ------------------- | ----------------------------------------- | -------- |
| `name`              | Application name                          | Yes      |
| `build`             | Build command to execute                  | Yes      |
| `deploy.dist`       | Build output directory                    | Yes      |
| `deploy.entrypoint` | Application entry file (relative to dist) | Yes      |
| `deploy.port`       | Port for your application                 | Yes      |
| `deploy.server`     | Deployment server URL                     | Yes      |

### Example Configurations

**Bun Application:**

```json
{
    "name": "bun-api",
    "build": "bun build src/index.ts --outdir dist",
    "deploy": {
        "dist": "./dist",
        "entrypoint": "./index.js",
        "port": 3000,
        "server": "http://localhost:7899"
    }
}
```

**Vite + React:**

```json
{
    "name": "react-app",
    "build": "npm run build",
    "deploy": {
        "dist": "./dist",
        "entrypoint": "./index.js",
        "port": 3000,
        "server": "http://localhost:7899"
    }
}
```

## Deployment Process

1. **Build** - Executes your build command locally
2. **Package** - Creates a tar.gz archive of the build output
3. **Upload** - Sends the archive to your deployment server
4. **Deploy** - Server extracts, stops old version, starts new version
5. **Persist** - Saves deployment state for auto-recovery

## Docker Deployment

### Using Docker Compose

Create a `docker-compose.yml`:

```yaml
version: "3.8"

services:
    deploy-server:
        image: ghcr.io/konghayao/deploy-bun:latest
        container_name: deploy-bun-server
        ports:
            - "7899:7899"
            - "3000:3000"
        volumes:
            - deploy-data:/app/deployments
        restart: unless-stopped
        environment:
            - NODE_ENV=production

volumes:
    deploy-data:
        driver: local
```

Start the server:

```bash
docker-compose up -d
```

### Using Docker CLI

```bash
# Create a named volume
docker volume create deploy-data

# Run the server
docker run -d \
  --name deploy-bun-server \
  -p 7899:7899 \
  -p 3000:3000 \
  -v deploy-data:/app/deployments \
  --restart unless-stopped \
  ghcr.io/konghayao/deploy-bun:latest
```

### Volume Persistence

All deployments and state are stored in `/app/deployments`:

-   Deployment files: `/app/deployments/<timestamp>_<hash>/`
-   State file: `/app/deployments/.state.json`

When the container restarts, it automatically restores the last deployment.

## Version Tags

Docker images are tagged with:

-   `latest` - Latest stable version from main branch
-   `main` - Latest commit on main branch
-   `YYYYMMDD-HHMMSS` - Timestamp-based version
-   `main-YYYYMMDD-HHMMSS` - Branch with timestamp
-   `v1.0.0` - Semantic version tags

Pull a specific version:

```bash
docker pull ghcr.io/konghayao/deploy-bun:20250101-123456
```

## API Endpoints

### POST /upload

Upload and deploy a new application version.

**Headers:**

-   `Content-Type: application/gzip`
-   `X-Deploy-Hash: <version-hash>`
-   `X-Deploy-Port: <app-port>`
-   `X-Deploy-Entrypoint: <entry-file>`

**Response:**

```json
{
    "success": true,
    "hash": "2025-01-01T12-30-45_abc123456789",
    "port": 3000,
    "message": "Deployment successful",
    "duration": "2.34"
}
```

### GET /status

Check server status and current deployment.

**Response:**

```json
{
    "currentDeployment": "2025-01-01T12-30-45_abc123456789",
    "uploadPort": 7899,
    "deploymentsDir": "/app/deployments",
    "uptime": 123.45
}
```

## CLI Output

The CLI provides detailed logging for each deployment step:

```
[CLI] ========================================
[CLI] Starting deployment: 11/1/2025, 12:30:45 PM
[CLI] ========================================
[CLI] Reading config: /path/to/deploy.json
[CLI] Config loaded: my-app
[CLI] ==================== Build ====================
[CLI] Build command: bun build src/index.ts --outdir dist
[CLI] Build completed, time: 0.52s
[CLI] ==================== Package ====================
[CLI] Source folder: /path/to/dist
[CLI] Package completed, size: 0.15MB, time: 0.08s
[CLI] ==================== Upload ====================
[CLI] Server: http://localhost:7899
[CLI] Version: 2025-01-01T12-30-45_abc123456789
[CLI] Upload successful, time: 1.23s
[CLI] ========================================
[CLI] 🎉 Deployment successful! Total: 1.85s
[CLI] ========================================
```

## Server Logs

The server logs all deployment activities:

```
[SERVER] ========================================
[SERVER] Deployment request: 11/1/2025, 12:30:45 PM
[SERVER] ========================================
[SERVER] Version: 2025-01-01T12-30-45_abc123456789
[SERVER] File size: 0.15MB
[SERVER] ==================== Extract ====================
[SERVER] Extract completed, time: 0.12s
[SERVER] ==================== Start App ====================
[SERVER] Deployment path: /app/deployments/2025-01-01T12-30-45_abc123456789
[SERVER] ✅ Application started!
[SERVER] URL: http://localhost:3000
[SERVER] 🎉 Deployment successful! Total: 1.34s
[SERVER] ========================================
```

## Auto Recovery

On server restart, the system automatically checks for the last deployment:

```
[SERVER] ========================================
[SERVER] Checking for previous deployment...
[SERVER] Found previous deployment, restoring...
[SERVER] Version: 2025-01-01T12-30-45_abc123456789
[SERVER] Port: 3000
[SERVER] ✅ Previous deployment restored
[SERVER] ========================================
```

## Troubleshooting

### Port already in use

Change the application port in `deploy.json` and redeploy.

### Connection refused

Ensure the server is running and accessible:

```bash
curl http://your-server-ip:7899/status
```

### Deployment not restored after restart

Check if the volume is properly mounted:

```bash
docker inspect deploy-bun-server | grep Mounts
```

### Build fails

Verify your build command works locally:

```bash
bun build src/index.ts --outdir dist
```

## Requirements

-   **Server**: Docker or Bun runtime
-   **Client**: Node.js 18+ or Bun
-   **System**: tar command (usually pre-installed on Unix systems)

## Development

```bash
# Clone repository
git clone https://github.com/KonghaYao/deploy-bun.git
cd deploy-bun

# Start development server
bun src/server.ts

# Test deployment
bun src/cli.ts
```

## License

Apache-2.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

KonghaYao

## Links

-   [GitHub Repository](https://github.com/KonghaYao/deploy-bun)
-   [Docker Image](https://github.com/KonghaYao/deploy-bun/pkgs/container/deploy-bun)
-   [Issues](https://github.com/KonghaYao/deploy-bun/issues)
