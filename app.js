(function () {

  "use strict";

  var express = require('express');
  var app = express();
  var path = require('path');
  var server = require('http').createServer(app);
  var io = require('socket.io')(server);
  var serverPort = process.env.PORT || 8000;

  // If this isn't production, add in the webpack middleware
  if(process.env.NODE_ENV !== "production") {
    var webpack = require("webpack");
    var webpackMiddleware = require("webpack-dev-middleware");
    var config = require("./webpack.config");
    config.output.filename = "app/js/timelinestoryteller.js";
    config.output.path = path.join(__dirname, 'public'),
    app.use(webpackMiddleware(webpack(config)));
  }

  app.use(express.static('public'));
  app.get('/', function(req, res) {
    res.sendFile(__dirname + 'public/index.html');
  });

  io.sockets.on('connection', function (socket) {
    io.set('transports', ['websocket']);
    console.log('new connection on socket.io');
    socket.emit('hello_from_server', { port: serverPort });

    socket.on('hello_from_client', function (data) {
      console.log(data);
    });

    socket.on('export_event', function (data) {
      console.log(data);
    });

  });

  server.listen(serverPort, function() {
    console.log('Server started on port %s', serverPort);
  });

})();
