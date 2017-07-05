var webpackConfig = require("./webpack.config");

// Karma configuration
module.exports = function(config) {
  var configuration = {
    frameworks: ['mocha'],
    // ... normal karma configuration
    files: [

      // The externals
      "https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.5/d3.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.10.6/moment.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/intro.js/2.3.0/intro.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/socket.io/1.7.2/socket.io.min.js",

      // all files ending in ".spec"
      {pattern: '{test,src}/**/*.spec.js', watched: false}
      // each file acts as entry point for the webpack configuration
    ],

    preprocessors: {
      // add webpack as preprocessor
      '{test,src}/**/*.spec.js': ['webpack']
    },

    browsers: ['Chrome'],
    singleRun: true,
    browserConsoleLogOptions: {
      terminal: true,
      level: ""
    },
    customLaunchers: {
        Chrome_travis_ci: {
            base: 'Chrome',
            flags: ['--no-sandbox']
        }
    },
    webpack: webpackConfig,
    webpackMiddleware: {
      stats: 'errors-only'
    }
  };

  if (process.env.TRAVIS) {
    configuration.browsers = ['Chrome_travis_ci'];
  }

  config.set(configuration);
};