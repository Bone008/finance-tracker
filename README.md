# Finance Tracker

*Note:* This project is very much work in progress.

A simple but powerful tool to keep track of your spendings. Made for power users.
It is built as a Web application using Angular and the Material design library.

## Setup

1. Clone the repository.
2. Run `npm install` to update dependencies.
3. Run `npm run protoc` to compile the protocol buffer models. This step has to be repeated every time you change the proto definitions.
4. To enable API calls made from the development server, copy `src/proxy.conf.global.json` to `src/proxy.conf.local.json` and adjust the config of your backend server.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## API backend server

Upload the files under `api/` to a PHP-capable Web server. `api/public/` should be the root directory that is served to clients.

Databases sent by clients will be stored at `api/storage/`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `--prod` flag for a production build.

To run without any path adjustments, deploy the build package to the same server as the API backend.

## Running tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

Run `ng e2e` to execute the end-to-end tests via [Protractor](http://www.protractortest.org/).

*Note:* The tests are currently not really up to date ...

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).
