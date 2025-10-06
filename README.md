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
4. To enable API calls made from the development server, copy `src/proxy.conf.global.json` to `src/proxy.conf.local.json` and adjust the config of your backend server.
5. When on Node.js version >=17, set the following env var for all node operations: `NODE_OPTIONS=--openssl-legacy-provider`

### Development server

Run `npm start` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

### Build

Run `npm run build` to build the project. The build artifacts will be stored in the `dist/` directory. Use `npm run build -- --prod` for a production build.

## Deployment

Deployment to `money.bonauer.me` is performed automatically by CI.

To set up your own deployment, consider the following tips:

- Deploy the entire `api/` folder to a PHP-capable Web server.
- Place the frontend build artifacts from `dist/finance-tracker/` into `api/public/`.
- Ensure that `api/public/` is the document root of the Web server.
- When using Apache, make sure `.htaccess` files get deployed and respected.
  Otherwise, replicate the routing rules declared in those files.
- Database files sent by clients will be stored in a folder specified by the environment variable `FT_STORAGE_DIR`.

## Further help

To get more help on the Angular CLI, check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).
