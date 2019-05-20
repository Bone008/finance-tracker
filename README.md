# Finance Tracker

A simple but powerful tool to keep track of your spendings. Made for power users.
It is built as a Web application using Angular and the Material design library.

## User guide

Users can reach the tool under [money.bonauer.me](https://money.bonauer.me/), but it is currently invite-only until it has matured further. If you are interested in testing it out early, write me a message.

Beware that there does not exist any proper user documentation yet.

## Developer setup

1. Clone the repository.
2. Run `npm install` to update dependencies.
3. Run `npm run protoc` to compile the protocol buffer models. This step has to be repeated every time you change the proto definitions.
4. To enable API calls made from the development server, copy `src/proxy.conf.global.json` to `src/proxy.conf.local.json` and adjust the config of your backend server.

### Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

### API backend server

Upload the files under `api/` to a PHP-capable Web server. `api/public/` should be the root directory that is served to clients.

Databases sent by clients will be stored at `api/storage/`.

### Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `--prod` flag for a production build.

To run without any path adjustments, deploy the build package to the same server as the API backend.

### Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).
