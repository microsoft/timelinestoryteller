(function () {

  "use strict";

  var express = require('express');
  var app = express();
  var path = require('path');
  var server = require('http').createServer(app);
  var io = require('socket.io')(server);
  var serverPort = process.env.PORT || 3000;
  var azure = require('azure-storage');
  var msRestAzure = require('ms-rest-azure');
  var KeyVault = require('azure-keyvault');
  var AuthenticationContext = require('adal-node').AuthenticationContext;

  // service principal details for running the sample
  var clientId = process.env['CLIENT_ID']; // service principal
  var domain = process.env['DOMAIN']; // tenant id
  var secret = process.env['APPLICATION_SECRET'];

  // service principal details that we have authorized to interact with key vault
  var keyVaultSp = process.env['SP_KEYVAULT_OPERATIONS'];
  var keyVaultSpSecret = process.env['APP_KEY'];

  var storageAccount = process.env['AZURE_STORAGE_ACCOUNT']

  // the secret's information in the key vault.
  var keyVaultName = process.env['KEYVAULT_NAME'];
  var keyVaultSecretName = process.env['KEYVAULT_SECRET_NAME'];

  var keyVaultClient;
  var blobSvc;

  var vaultUri = `https://${keyVaultName}.vault.azure.net/secrets/${keyVaultSecretName}`;

  // login to azure
  msRestAzure.loginWithServicePrincipalSecret(clientId, secret, domain, function (err, credentials) {
      if (err) {
        return console.log(err);
      }

      // authenticate with key vault with a service principal that we gave access in index.js
      var kvCredentials = new KeyVault.KeyVaultCredentials(authenticator);
      keyVaultClient = new KeyVault.KeyVaultClient(kvCredentials);

      // get the secret's value
      keyVaultClient.getSecret(vaultUri, (err, result) => {
        if (err) {
          io.sockets.emit('hello_from_server', { error: err });
          throw err;
        }
        blobSvc = azure.createBlobService(storageAccount,result.value);
        blobSvc.createContainerIfNotExists('timelinestories', function(error, result, response) {
          if(!error){
            io.sockets.emit('hello_from_server', { response: response });
            console.log(response);
            // Container exists and is private
          }
        });
      });
  });

  function authenticator(challenge, callback) {
    // Create a new authentication context.
    var context = new AuthenticationContext(challenge.authorization);

    // Use the context to acquire an authentication token.
    return context.acquireTokenWithClientCredentials(challenge.resource, keyVaultSp, keyVaultSpSecret, function (err, tokenResponse) {
        if (err) {
          io.sockets.emit('hello_from_server', { error: err });
          console.log(err);
          throw err;
        }
        // Calculate the value to be set in the request's Authorization header and resume the call.
        var authorizationValue = tokenResponse.tokenType + ' ' + tokenResponse.accessToken;

        return callback(null, authorizationValue);
    });
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
      // console.log(data);
      var story_id = "story_" + new Date().valueOf().toString();
      blobSvc.createBlockBlobFromText ('timelinestories', story_id, data, function(error, result, response){
        if(!error){
          // file uploaded
        }
      });
    });

  });

  server.listen(serverPort, function() {
    console.log('Server started on port %s', serverPort);
  });

})();
