# Finance Tracker

A simple but powerful tool to keep track of your spendings. All data is end-to-end encrypted and requires no registration. Made for power users.
It is built as a Web application using Angular and the Material design library.

## User guide

Users can reach the tool at [money.bonauer.me](https://money.bonauer.me/).

Beware that there does not exist any proper user documentation yet, but if you are interested in using the tool and need help getting started, feel free to contact me.

## Developer setup

1. Clone the repository.
2. Run `npm install --legacy-peer-deps` to update dependencies. The legacy flag is needed because this is built with quite an old version of Angular with some dependency conflicts.
3. Run `npm run protoc` to compile the protocol buffer models. This step has to be repeated every time you change the proto definitions.
4. To enable API calls made from the development server, copy `src/proxy.conf.global.json` to `src/proxy.conf.local.json` and adjust the config of your backend server. To run the backend locally, see [`backend/README.md`](backend/README.md) and use `http://localhost:8000` as the target.
5. When on Node.js version >=17, set the following env var for all node operations: `NODE_OPTIONS=--openssl-legacy-provider`

### Development server

Run `npm start` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

### Build

Run `npm run build` to build the project. The build artifacts will be stored in the `dist/` directory. Use `npm run build -- --prod` for a production build.

## Deployment

Deployment to `money.bonauer.me` is performed automatically by CI.

### Docker

The `Dockerfile` builds the frontend and backend into a single image that serves everything on one port:

```bash
docker build -t finance-tracker .
docker run -d --name finance-tracker -p 8000:8000 -v finance-tracker-data:/data finance-tracker
```

How the container behaves:

- A single uvicorn process listens on port `8000` over plain HTTP. Put a TLS-terminating reverse proxy in front of it for anything beyond local use.
- `/api/` is handled by the backend (interactive docs at `/api/docs`). All other paths serve the frontend, falling back to `index.html` for client-side routes.
- Client databases (and backups of every overwritten version) are stored in `/data`. Mount a volume there, otherwise they are lost with the container.
- The process runs as the unprivileged user `app` (uid 1000). A bind-mounted `/data` must be writable by that uid.
- The image includes Chromium and Xvfb for DKB bank sync, which runs the browser invisibly inside the container. Build with `--build-arg WITH_DKB=false` to leave them out, which shrinks the image from ~1.3 GB to ~530 MB; DKB sync then fails, while Sparkasse sync still works.
- Configuration works via the environment variables described in [`backend/README.md`](backend/README.md), e.g. `-e FT_DEBUG=true`. The image sets `FT_STORAGE_DIR=/data` and `FT_FRONTEND_DIR=/app/frontend`. To serve a different frontend build, mount it into the container and point `FT_FRONTEND_DIR` at it. To serve only the API, set `FT_FRONTEND_DIR=` (empty).

### Manual

To set up your own deployment without Docker, consider the following tips:

- Deploy the `backend/` folder to your server and run it as a service, e.g. with `uv sync && uv run uvicorn app.main:app` (see [`backend/README.md`](backend/README.md)).
- Serve the frontend build artifacts from `dist/finance-tracker/` with a Web server and reverse-proxy all requests under `/api/` to the backend.
- The frontend uses client-side routing, so the Web server must serve `index.html` for all unknown paths outside of `/api/`.
- Database files sent by clients will be stored in a folder specified by the environment variable `FT_STORAGE_DIR`.

## Further help

To get more help on the Angular CLI, check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).
