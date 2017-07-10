var webpackConfig = require("./webpack.config");

// Karma configuration
module.exports = function(config) {
  config.set({
    frameworks: ['mocha'],
    // ... normal karma configuration
    files: [

      // The externals
      "https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.5/d3.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.18.1/moment.min.js",
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

    browsers: ['PhantomJS'],
    singleRun: true,
    browserConsoleLogOptions: {
      terminal: true,
      level: ""
    },

    webpack: webpackConfig,
    webpackMiddleware: {
      stats: 'errors-only'
    }

  });
};